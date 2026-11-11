import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ADMIN_PASSWORD, Client, employeeBody, loginAs, startServer } from './helpers.js'

let server
let baseUrl
const admin = () => loginAs(baseUrl, 'admin', ADMIN_PASSWORD)
const leader = () => loginAs(baseUrl, 'leader', 'Leader-test-1')
const openDb = () => new DatabaseSync(path.join(server.dataDir, 'daily-safety.sqlite'))
const wf = (client, method, url, body) => client.call(method, `/api/workflow${url}`, body)
const rq = (client, method, url, body) => client.call(method, `/api/requisitions${url}`, body)

before(async () => {
  server = await startServer()
  baseUrl = server.baseUrl
})
after(() => server?.stop())

let counter = 0
/** Creates an employee record plus a user of `role`; returns a signed-in client and the user id. */
async function makeUser(role, department = 'ผลิต') {
  const adminClient = await admin()
  const code = `RQ${role.slice(0, 2).toUpperCase()}${++counter}`
  const body = { ...employeeBody(code, `ผู้ใช้ ${code}`), departmentTh: department }
  assert.equal((await adminClient.call('POST', '/api/admin/employees', body)).status, 201)
  const created = await adminClient.call('POST', '/api/admin/users', { name: `ผู้ใช้ ${code}`, employeeCode: code, password: 'Req-pass-12', role })
  assert.equal(created.status, 201, JSON.stringify(created.json))
  return { client: await loginAs(baseUrl, code.toLowerCase(), 'Req-pass-12'), userId: created.json.user.id, code }
}
const stepBody = (over = {}) => ({ name: 'หัวหน้างานอนุมัติ', approverType: 'dept_supervisor', approverRef: '', mode: 'any', slaHours: 0, escalateType: 'none', escalateRef: '', allowEditQty: false, condition: {}, ...over })
const leaderId = async () => (await (await admin()).call('GET', '/api/admin/users')).json.users.find((user) => user.username === 'leader').id

describe('workflow admin API', () => {
  test('only admin writes templates; managers read; employees and anonymous are refused', async () => {
    const adminClient = await admin()
    const list = await wf(adminClient, 'GET', '/templates')
    assert.equal(list.status, 200)
    assert.ok(list.json.templates.length >= 2)
    assert.equal((await wf(await leader(), 'GET', '/templates')).status, 200)
    const storekeeper = await makeUser('storekeeper')
    assert.equal((await wf(storekeeper.client, 'GET', '/templates')).status, 200)
    const employee = await makeUser('employee')
    assert.equal((await wf(employee.client, 'GET', '/templates')).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/workflow/templates`)).status, 401)
    const body = { name: 'ใหม่', appliesType: 'ppe', steps: [stepBody()] }
    assert.equal((await wf(await leader(), 'POST', '/templates', body)).status, 403)
    assert.equal((await wf(employee.client, 'POST', '/templates', body)).status, 403)
    assert.equal((await wf(adminClient, 'POST', '/templates', body)).status, 201)
  })

  test('template validation errors are 400 and unknown templates are 404', async () => {
    const adminClient = await admin()
    assert.equal((await wf(adminClient, 'POST', '/templates', { name: '', appliesType: 'ppe', steps: [stepBody()] })).status, 400)
    assert.equal((await wf(adminClient, 'POST', '/templates', { name: 'x', appliesType: 'ppe', steps: [] })).status, 400)
    assert.equal((await wf(adminClient, 'POST', '/templates', { name: 'x', appliesType: 'ppe', steps: [stepBody({ approverType: 'role', approverRef: 'employee' })] })).status, 400)
    assert.equal((await wf(adminClient, 'GET', '/templates/missing')).status, 404)
    assert.equal((await wf(adminClient, 'PUT', '/templates/missing', { name: 'x', appliesType: 'ppe', steps: [stepBody()] })).status, 404)
    assert.equal((await wf(adminClient, 'DELETE', '/templates/missing')).status, 404)
  })

  test('templates round-trip: create, read, update bumps the version, delete', async () => {
    const adminClient = await admin()
    const created = await wf(adminClient, 'POST', '/templates', { name: 'สองขั้น', appliesType: 'any', steps: [stepBody(), stepBody({ name: 'ผู้จัดการ', approverType: 'role', approverRef: 'admin', condition: { minTotalQty: 10 }, slaHours: 24, escalateType: 'role', escalateRef: 'admin' })] })
    assert.equal(created.status, 201)
    const id = created.json.template.id
    const read = (await wf(adminClient, 'GET', `/templates/${id}`)).json.template
    assert.deepEqual(read.steps.map((entry) => entry.name), ['หัวหน้างานอนุมัติ', 'ผู้จัดการ'])
    assert.deepEqual(read.steps[1].condition, { minTotalQty: 10 })
    const updated = await wf(adminClient, 'PUT', `/templates/${id}`, { name: 'หนึ่งขั้น', appliesType: 'any', isActive: false, steps: [stepBody()] })
    assert.equal(updated.json.template.version, 2)
    assert.equal(updated.json.template.isActive, false)
    assert.equal((await wf(adminClient, 'DELETE', `/templates/${id}`)).status, 200)
    assert.equal((await wf(adminClient, 'GET', `/templates/${id}`)).status, 404)
  })

  test('deleting a template in use is 409', async () => {
    const adminClient = await admin()
    const created = (await wf(adminClient, 'POST', '/templates', { name: 'กำลังใช้', appliesType: 'any', steps: [stepBody()] })).json.template
    const db = openDb()
    db.prepare("INSERT INTO requisitions (id, number, type, requester_id, warehouse_id, template_id, template_version, status, created_at, submitted_at) VALUES ('inuse-1', 'REQ-X-1', 'ppe', 'u', 'w', ?, 1, 'in_approval', 'x', 'x')").run(created.id)
    db.close()
    assert.equal((await wf(adminClient, 'DELETE', `/templates/${created.id}`)).status, 409)
  })

  test('department supervisors can be set and read back; only admin writes', async () => {
    const adminClient = await admin()
    const lead = await leaderId()
    const set = await wf(adminClient, 'PUT', '/departments/supervisors', { department: 'แผนกทดสอบ API', entries: [{ userId: lead, isBackup: false }] })
    assert.equal(set.status, 200, JSON.stringify(set.json))
    const read = (await wf(adminClient, 'GET', '/departments')).json.departments.find((row) => row.department === 'แผนกทดสอบ API')
    assert.deepEqual(read.entries.map((entry) => [entry.userId, entry.isBackup]), [[lead, false]])
    assert.equal((await wf(await leader(), 'PUT', '/departments/supervisors', { department: 'แผนกทดสอบ API', entries: [] })).status, 403)
    assert.equal((await wf(adminClient, 'PUT', '/departments/supervisors', { department: 'แผนกทดสอบ API', entries: [{ userId: 'missing', isBackup: false }] })).status, 400)
    assert.equal((await wf(adminClient, 'PUT', '/departments/supervisors', { department: '', entries: [] })).status, 400)
  })

  test('delegations: users manage their own, cannot create for others, admin can; bad ranges are 400', async () => {
    const adminClient = await admin()
    const leaderClient = await leader()
    const other = await makeUser('leader')
    const lead = await leaderId()
    const own = await wf(leaderClient, 'POST', '/delegations', { toUser: other.userId, fromDate: '2030-01-01', toDate: '2030-01-05' })
    assert.equal(own.status, 201, JSON.stringify(own.json))
    assert.equal(own.json.delegation.fromUser, lead)
    const adminId = (await adminClient.call('GET', '/api/admin/users')).json.users.find((user) => user.username === 'admin').id
    const forged = await wf(leaderClient, 'POST', '/delegations', { fromUser: adminId, toUser: other.userId, fromDate: '2030-02-01', toDate: '2030-02-05' })
    assert.equal(forged.json.delegation.fromUser, lead, 'fromUser is forced to the caller')
    assert.equal((await wf(adminClient, 'POST', '/delegations', { fromUser: other.userId, toUser: lead, fromDate: '2030-03-01', toDate: '2030-03-05' })).json.delegation.fromUser, other.userId)
    assert.equal((await wf(leaderClient, 'POST', '/delegations', { toUser: other.userId, fromDate: '2030-01-05', toDate: '2030-01-01' })).status, 400)
    assert.equal((await wf(leaderClient, 'POST', '/delegations', { toUser: lead, fromDate: '2030-01-01', toDate: '2030-01-05' })).status, 400)
    const mine = (await wf(leaderClient, 'GET', '/delegations')).json.delegations
    assert.ok(mine.every((row) => row.fromUser === lead || row.toUser === lead))
    assert.ok((await wf(adminClient, 'GET', '/delegations')).json.delegations.length >= mine.length)
    assert.equal((await wf(other.client, 'DELETE', `/delegations/${own.json.delegation.id}`)).status, 403)
    assert.equal((await wf(leaderClient, 'DELETE', `/delegations/${own.json.delegation.id}`)).status, 200)
    assert.equal((await wf(leaderClient, 'DELETE', '/delegations/missing')).status, 404)
  })

  test('preview resolves approvers for a requester and shows which steps apply', async () => {
    const adminClient = await admin()
    const lead = await leaderId()
    const employee = await makeUser('employee', 'แผนกพรีวิว')
    await wf(adminClient, 'PUT', '/departments/supervisors', { department: 'แผนกพรีวิว', entries: [{ userId: lead, isBackup: false }] })
    const template = (await wf(adminClient, 'POST', '/templates', { name: 'พรีวิว', appliesType: 'any', steps: [stepBody(), stepBody({ name: 'ผู้จัดการ', approverType: 'role', approverRef: 'admin', condition: { minTotalQty: 10 } })] })).json.template
    const small = await wf(adminClient, 'POST', '/preview', { templateId: template.id, requesterId: employee.userId, totalQty: 3, categoryIds: [] })
    assert.equal(small.status, 200, JSON.stringify(small.json))
    assert.deepEqual(small.json.steps.map((row) => [row.name, row.applies]), [['หัวหน้างานอนุมัติ', true], ['ผู้จัดการ', false]])
    assert.deepEqual(small.json.steps[0].approvers.map((row) => row.userId), [lead])
    const big = await wf(adminClient, 'POST', '/preview', { templateId: template.id, requesterId: employee.userId, totalQty: 12, categoryIds: [] })
    assert.equal(big.json.steps[1].applies, true)
    assert.ok(big.json.steps[1].approvers.length >= 1)
    assert.equal((await wf(await leader(), 'POST', '/preview', { templateId: template.id, requesterId: employee.userId, totalQty: 1, categoryIds: [] })).status, 403)
    assert.equal((await wf(adminClient, 'POST', '/preview', { templateId: 'missing', requesterId: employee.userId, totalQty: 1, categoryIds: [] })).status, 404)
  })

  test('approver list and settings: managers read, only admin writes, values validated', async () => {
    const adminClient = await admin()
    const approvers = (await wf(await leader(), 'GET', '/approvers')).json.users
    assert.ok(approvers.length >= 2 && approvers.every((user) => ['admin', 'leader', 'storekeeper'].includes(user.role)))
    assert.equal((await wf((await makeUser('employee')).client, 'GET', '/approvers')).status, 403)
    assert.equal((await wf(await leader(), 'GET', '/settings')).json.expireDays, 14)
    assert.equal((await wf(await leader(), 'PUT', '/settings', { expireDays: 7 })).status, 403)
    for (const value of [0, 366, 1.5, '7', null]) assert.equal((await wf(adminClient, 'PUT', '/settings', { expireDays: value })).status, 400, String(value))
    assert.equal((await wf(adminClient, 'PUT', '/settings', { expireDays: 21 })).json.expireDays, 21)
    assert.equal((await wf(adminClient, 'GET', '/settings')).json.expireDays, 21)
    await wf(adminClient, 'PUT', '/settings', { expireDays: 14 })
  })

  test('workflow writes create audit rows', async () => {
    const adminClient = await admin()
    const created = (await wf(adminClient, 'POST', '/templates', { name: 'ตรวจ audit', appliesType: 'any', steps: [stepBody()] })).json.template
    await wf(adminClient, 'PUT', `/templates/${created.id}`, { name: 'ตรวจ audit 2', appliesType: 'any', steps: [stepBody()] })
    await wf(adminClient, 'DELETE', `/templates/${created.id}`)
    const db = openDb()
    const rows = db.prepare("SELECT action FROM audit_log WHERE target_type = 'workflow_template' AND target_id = ?").all(created.id)
    db.close()
    assert.equal(rows.length, 3)
  })
})
