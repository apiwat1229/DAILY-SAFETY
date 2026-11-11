import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readdir } from 'node:fs/promises'
import { ADMIN_PASSWORD, employeeBody, imageBlob, loginAs, startServer } from './helpers.js'

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

let sceneCounter = 0
const futureDate = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const stockRow = async (adminClient, warehouseId, variantId) => (await adminClient.call('GET', `/api/inventory/stock?warehouseId=${warehouseId}`)).json.rows.find((row) => row.variantId === variantId)

/** A warehouse with stock, its storekeeper, an employee in a fresh department and the seeded leader as that department's supervisor. */
async function scene({ type = 'ppe', stockQty = 50 } = {}) {
  const adminClient = await admin()
  const n = ++sceneCounter
  const department = `แผนกทดสอบ ${n}`
  const warehouse = (await adminClient.call('POST', '/api/inventory/warehouses', { code: `RQW-${n}`, name: `คลังใบเบิก ${n}` })).json.warehouse
  const item = (await adminClient.call('POST', '/api/inventory/items', { sku: `RQ-${type}-${n}`, name: `สินค้าใบเบิก ${n}`, type, unit: 'ชิ้น', minStock: 0 })).json.item
  const variantId = item.variants[0].id
  const line = type === 'medicine' ? { variantId, qty: stockQty, lotNo: `LOT-${n}`, expiryDate: futureDate(200) } : { variantId, qty: stockQty }
  assert.equal((await adminClient.call('POST', '/api/inventory/receipts', { warehouseId: warehouse.id, lines: [line] })).status, 201)
  const keeper = await makeUser('storekeeper', 'คลัง')
  assert.equal((await adminClient.call('PUT', `/api/inventory/warehouses/${warehouse.id}/staff`, { userIds: [keeper.userId] })).status, 200)
  const employee = await makeUser('employee', department)
  const lead = await leaderId()
  assert.equal((await wf(adminClient, 'PUT', '/departments/supervisors', { department, entries: [{ userId: lead, isBackup: false }] })).status, 200)
  return { adminClient, department, warehouse, item, variantId, keeper, employee, lead, leaderClient: await leader(), type }
}

async function submit(s, qty = 5, over = {}) {
  const put = await rq(s.employee.client, 'PUT', '/cart/lines', { type: s.type, variantId: s.variantId, qty })
  assert.equal(put.status, 200, JSON.stringify(put.json))
  const result = await rq(s.employee.client, 'POST', '/checkout', { type: s.type, warehouseId: s.warehouse.id, reason: 'ของเดิมชำรุด', neededBy: '', ...over })
  assert.equal(result.status, 201, JSON.stringify(result.json))
  return result.json.requisition
}

describe('requisition API', () => {
  test('anonymous is 401 everywhere', async () => {
    for (const url of ['/catalog?type=ppe', '/cart?type=ppe', '/mine', '/inbox', '/issue-queue', '/badges', '/admin/all']) assert.equal((await fetch(`${baseUrl}/api/requisitions${url}`)).status, 401, url)
  })

  test('catalog shows availability, hides inactive items and supports search', async () => {
    const s = await scene()
    const found = (await rq(s.employee.client, 'GET', `/catalog?type=ppe&q=${encodeURIComponent(s.item.name)}`)).json.items
    assert.equal(found.length, 1)
    assert.equal(found[0].variants[0].available, 50)
    assert.equal(found[0].imageUrl, null)
    await s.adminClient.call('PATCH', `/api/inventory/items/${s.item.id}`, { isActive: false })
    assert.equal((await rq(s.employee.client, 'GET', `/catalog?type=ppe&q=${encodeURIComponent(s.item.name)}`)).json.items.length, 0)
    assert.equal((await rq(s.employee.client, 'GET', '/catalog?type=food')).json.items.length >= 0, true)
  })

  test('cart: per user and type, validated, persistent across requests', async () => {
    const s = await scene()
    assert.equal((await rq(s.employee.client, 'PUT', '/cart/lines', { type: 'ppe', variantId: s.variantId, qty: 3 })).json.cart.lines[0].qty, 3)
    assert.equal((await rq(s.employee.client, 'GET', '/cart?type=ppe')).json.cart.lines.length, 1)
    assert.equal((await rq(s.keeper.client, 'GET', '/cart?type=ppe')).json.cart.lines.length, 0)
    for (const body of [{ type: 'ppe', variantId: s.variantId, qty: -1 }, { type: 'ppe', variantId: s.variantId, qty: 1.5 }, { type: 'medicine', variantId: s.variantId, qty: 1 }, { type: 'ppe', variantId: 'nope', qty: 1 }, { type: 'food', variantId: s.variantId, qty: 1 }]) {
      assert.equal((await rq(s.employee.client, 'PUT', '/cart/lines', body)).status, 400, JSON.stringify(body))
    }
    assert.equal((await rq(s.employee.client, 'DELETE', '/cart?type=ppe')).status, 200)
    assert.equal((await rq(s.employee.client, 'GET', '/cart?type=ppe')).json.cart.lines.length, 0)
    assert.equal((await rq(s.employee.client, 'GET', '/cart?type=food')).status, 400)
  })

  test('checkout validates reason and cart', async () => {
    const s = await scene()
    assert.equal((await rq(s.employee.client, 'POST', '/checkout', { type: 'ppe', warehouseId: s.warehouse.id, reason: 'x' })).status, 400)
    await rq(s.employee.client, 'PUT', '/cart/lines', { type: 'ppe', variantId: s.variantId, qty: 1 })
    assert.equal((await rq(s.employee.client, 'POST', '/checkout', { type: 'ppe', warehouseId: s.warehouse.id, reason: '  ' })).status, 400)
    assert.equal((await rq(s.employee.client, 'POST', '/checkout', { type: 'ppe', warehouseId: 'nope', reason: 'x' })).status, 400)
    assert.equal((await rq(s.employee.client, 'GET', '/cart?type=ppe')).json.cart.lines.length, 1)
  })

  test('happy path: employee → supervisor approves → storekeeper issues → employee confirms, stock agrees at each step', async () => {
    const s = await scene()
    const created = await submit(s, 5)
    assert.match(created.number, /^REQ-\d{4}-\d{5}$/)
    assert.equal(created.status, 'in_approval')
    assert.equal((await stockRow(s.adminClient, s.warehouse.id, s.variantId)).reserved, 0)
    assert.deepEqual((await rq(s.leaderClient, 'GET', '/inbox')).json.requisitions.filter((row) => row.id === created.id).map((row) => row.status), ['in_approval'])
    const approved = await rq(s.leaderClient, 'POST', `/${created.id}/approve`, { comment: 'ตกลง' })
    assert.equal(approved.status, 200, JSON.stringify(approved.json))
    assert.equal(approved.json.requisition.status, 'ready_to_issue')
    assert.deepEqual(await stockRow(s.adminClient, s.warehouse.id, s.variantId).then((row) => [row.onHand, row.reserved, row.available]), [50, 5, 45])
    const queue = (await rq(s.keeper.client, 'GET', '/issue-queue')).json.requisitions.find((row) => row.id === created.id)
    assert.equal(queue.lines[0].remaining, 5)
    const lineId = queue.lines[0].id
    const first = await rq(s.keeper.client, 'POST', `/${created.id}/issue`, { lines: [{ lineId, qty: 2 }] })
    assert.equal(first.json.requisition.status, 'partially_issued')
    const second = await rq(s.keeper.client, 'POST', `/${created.id}/issue`, { lines: [{ lineId, qty: 3 }] })
    assert.equal(second.json.requisition.status, 'issued')
    assert.deepEqual(await stockRow(s.adminClient, s.warehouse.id, s.variantId).then((row) => [row.onHand, row.reserved]), [45, 0])
    const moves = (await s.adminClient.call('GET', `/api/inventory/movements?warehouseId=${s.warehouse.id}&type=issue`)).json.rows
    assert.deepEqual(moves.map((row) => [row.qty, row.refType, row.refId]).sort(), [[-2, 'requisition', created.id], [-3, 'requisition', created.id]].sort())
    assert.equal((await rq(s.leaderClient, 'POST', `/${created.id}/receive`)).status, 403)
    const received = await rq(s.employee.client, 'POST', `/${created.id}/receive`)
    assert.equal(received.json.requisition.status, 'received')
    const detail = (await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition
    assert.deepEqual(detail.events.map((event) => event.action), ['submitted', 'approved', 'approved_all', 'issued', 'issued', 'received'])
    assert.equal((await rq(s.employee.client, 'GET', '/mine?status=received')).json.requisitions.some((row) => row.id === created.id), true)
  })

  test('short stock at final approval is 409 with details and reserves nothing', async () => {
    const s = await scene({ stockQty: 3 })
    const created = await submit(s, 5)
    const result = await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})
    assert.equal(result.status, 409)
    assert.deepEqual(result.json.details.map((entry) => entry.short), [2])
    assert.equal((await stockRow(s.adminClient, s.warehouse.id, s.variantId)).reserved, 0)
    assert.equal((await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition.status, 'in_approval')
  })

  test('a second approve is 409 and reserves once', async () => {
    const s = await scene()
    const created = await submit(s, 4)
    assert.equal((await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})).status, 200)
    assert.equal((await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})).status, 409)
    assert.equal((await stockRow(s.adminClient, s.warehouse.id, s.variantId)).reserved, 4)
  })

  test('strangers and the wrong roles are refused', async () => {
    const s = await scene()
    const created = await submit(s, 2)
    const stranger = await makeUser('employee', 'แผนกอื่น')
    assert.equal((await rq(stranger.client, 'GET', `/${created.id}`)).status, 403)
    assert.equal((await rq(stranger.client, 'POST', `/${created.id}/cancel`, {})).status, 403)
    for (const [method, url, body] of [['GET', '/inbox'], ['GET', '/issue-queue'], ['GET', '/admin/all'], ['POST', `/${created.id}/approve`, {}], ['POST', `/${created.id}/reject`, { reason: 'x' }], ['POST', `/${created.id}/issue`, { lines: [] }], ['POST', `/${created.id}/admin/reassign`, { toUserId: s.lead, reason: 'x' }], ['POST', `/${created.id}/admin/force-cancel`, { reason: 'x' }]]) {
      assert.equal((await rq(stranger.client, method, url, body)).status, 403, `${method} ${url}`)
    }
    assert.equal((await rq(s.keeper.client, 'POST', `/${created.id}/approve`, {})).status, 403)
    assert.equal((await rq(s.leaderClient, 'POST', `/${created.id}/admin/force-cancel`, { reason: 'x' })).status, 403)
    assert.equal((await rq(s.employee.client, 'GET', `/missing-id`)).status, 404)
  })

  test('a storekeeper only sees the queue of their own warehouses', async () => {
    const a = await scene()
    const b = await scene()
    const reqA = await submit(a, 1)
    const reqB = await submit(b, 1)
    await rq(a.leaderClient, 'POST', `/${reqA.id}/approve`, {})
    await rq(b.leaderClient, 'POST', `/${reqB.id}/approve`, {})
    const idsOf = async (client) => (await rq(client, 'GET', '/issue-queue')).json.requisitions.map((row) => row.id)
    assert.deepEqual((await idsOf(a.keeper.client)).filter((id) => [reqA.id, reqB.id].includes(id)), [reqA.id])
    assert.deepEqual((await idsOf(b.keeper.client)).filter((id) => [reqA.id, reqB.id].includes(id)), [reqB.id])
    assert.equal((await idsOf(a.adminClient)).includes(reqB.id), true)
    assert.equal((await rq(a.keeper.client, 'GET', `/${reqB.id}`)).status, 403)
    const lineB = (await rq(b.keeper.client, 'GET', '/issue-queue')).json.requisitions.find((row) => row.id === reqB.id).lines[0].id
    assert.equal((await rq(a.keeper.client, 'POST', `/${reqB.id}/issue`, { lines: [{ lineId: lineB, qty: 1 }] })).status, 403)
  })

  test('bulk approve reports a result per id', async () => {
    const s = await scene()
    const ok = await submit(s, 2)
    const second = await submit(s, 1)
    const result = await rq(s.leaderClient, 'POST', '/bulk-approve', { ids: [ok.id, second.id, 'missing', ok.id] })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.results.map((row) => [row.ok, row.code ?? null]), [[true, null], [true, null], [false, 'NOT_FOUND'], [false, 'BAD_STATE']])
    assert.equal((await rq(s.leaderClient, 'POST', '/bulk-approve', { ids: [] })).status, 400)
    assert.equal((await rq(s.leaderClient, 'POST', '/bulk-approve', { ids: Array.from({ length: 51 }, (_, i) => `x${i}`) })).status, 400)
    assert.equal((await rq(s.employee.client, 'POST', '/bulk-approve', { ids: [ok.id] })).status, 403)
  })

  test('badges count pending approvals, the issue queue and the cart', async () => {
    const s = await scene()
    const before = (await rq(s.leaderClient, 'GET', '/badges')).json.approvals
    const created = await submit(s, 1)
    assert.equal((await rq(s.leaderClient, 'GET', '/badges')).json.approvals, before + 1)
    await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})
    assert.equal((await rq(s.keeper.client, 'GET', '/badges')).json.issue, 1)
    await rq(s.employee.client, 'PUT', '/cart/lines', { type: 'ppe', variantId: s.variantId, qty: 2 })
    assert.deepEqual(await rq(s.employee.client, 'GET', '/badges').then((res) => res.json), { approvals: 0, issue: 0, cart: 1 })
  })

  test('reject, request changes, resubmit and cancel work end to end and release stock', async () => {
    const s = await scene()
    const first = await submit(s, 3)
    assert.equal((await rq(s.leaderClient, 'POST', `/${first.id}/reject`, { reason: '' })).status, 400)
    assert.equal((await rq(s.leaderClient, 'POST', `/${first.id}/reject`, { reason: 'ไม่จำเป็น' })).json.requisition.status, 'rejected')
    const second = await submit(s, 3)
    assert.equal((await rq(s.leaderClient, 'POST', `/${second.id}/request-changes`, { reason: 'ลดจำนวน' })).json.requisition.status, 'returned_for_edit')
    const lineId = (await rq(s.employee.client, 'GET', `/${second.id}`)).json.requisition.lines[0].id
    assert.equal((await rq(s.leaderClient, 'POST', `/${second.id}/resubmit`, { lines: [] })).status, 403)
    const resubmitted = await rq(s.employee.client, 'POST', `/${second.id}/resubmit`, { lines: [{ lineId, qty: 2 }], reason: 'แก้แล้ว' })
    assert.equal(resubmitted.json.requisition.status, 'in_approval')
    assert.equal(resubmitted.json.requisition.lines[0].qtyRequested, 2)
    await rq(s.leaderClient, 'POST', `/${second.id}/approve`, {})
    assert.equal((await stockRow(s.adminClient, s.warehouse.id, s.variantId)).reserved, 2)
    assert.equal((await rq(s.employee.client, 'POST', `/${second.id}/cancel`, { reason: 'ไม่ใช้แล้ว' })).json.requisition.status, 'cancelled')
    assert.equal((await stockRow(s.adminClient, s.warehouse.id, s.variantId)).reserved, 0)
    assert.equal((await rq(s.employee.client, 'POST', `/${second.id}/cancel`, {})).status, 409)
  })

  test('close remainder and returns update stock and status', async () => {
    const s = await scene()
    const created = await submit(s, 5)
    await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})
    const lineId = (await rq(s.keeper.client, 'GET', '/issue-queue')).json.requisitions.find((row) => row.id === created.id).lines[0].id
    await rq(s.keeper.client, 'POST', `/${created.id}/issue`, { lines: [{ lineId, qty: 2 }] })
    assert.equal((await rq(s.keeper.client, 'POST', `/${created.id}/close`, { reason: '' })).status, 400)
    assert.equal((await rq(s.keeper.client, 'POST', `/${created.id}/close`, { reason: 'ของหมด' })).json.requisition.status, 'closed')
    assert.deepEqual(await stockRow(s.adminClient, s.warehouse.id, s.variantId).then((row) => [row.onHand, row.reserved]), [48, 0])
    const lot = (await s.adminClient.call('GET', `/api/inventory/stock/lots?warehouseId=${s.warehouse.id}&variantId=${s.variantId}`)).json.lots[0].lotId
    assert.equal((await rq(s.keeper.client, 'POST', `/${created.id}/returns`, { lines: [{ lineId, lotId: lot, qty: 3 }] })).status, 400)
    const returned = await rq(s.keeper.client, 'POST', `/${created.id}/returns`, { lines: [{ lineId, lotId: lot, qty: 1 }], reason: 'ไม่พอดี' })
    assert.equal(returned.json.requisition.lines[0].qtyReturned, 1)
    assert.equal((await stockRow(s.adminClient, s.warehouse.id, s.variantId)).onHand, 49)
  })

  test('admin overview, reassign and force-cancel', async () => {
    const s = await scene()
    const created = await submit(s, 2)
    const all = await rq(s.adminClient, 'GET', `/admin/all?q=${encodeURIComponent(created.number)}&status=in_approval&page=1&pageSize=10`)
    assert.equal(all.status, 200)
    assert.deepEqual(all.json.requisitions.map((row) => row.id), [created.id])
    assert.equal(all.json.total, 1)
    assert.equal((await rq(s.adminClient, 'POST', `/${created.id}/admin/reassign`, { toUserId: s.keeper.userId, reason: '' })).status, 400)
    const reassigned = await rq(s.adminClient, 'POST', `/${created.id}/admin/reassign`, { toUserId: s.keeper.userId, reason: 'หัวหน้าลา' })
    assert.deepEqual(reassigned.json.requisition.steps[0].approvers.map((entry) => entry.userId).sort(), [s.keeper.userId, s.lead].sort())
    assert.equal((await rq(s.adminClient, 'POST', `/${created.id}/admin/force-cancel`, { reason: '' })).status, 400)
    assert.equal((await rq(s.adminClient, 'POST', `/${created.id}/admin/force-cancel`, { reason: 'ซ้ำซ้อน' })).json.requisition.status, 'cancelled')
  })

  test('mutations are audited', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})
    await rq(s.employee.client, 'POST', `/${created.id}/cancel`, {})
    const db = openDb()
    const rows = db.prepare("SELECT action FROM audit_log WHERE target_type = 'requisition' AND target_id = ?").all(created.id)
    db.close()
    assert.equal(rows.length, 3)
  })

  test('medicine requisition reserves the lot with the nearest expiry', async () => {
    const s = await scene({ type: 'medicine', stockQty: 10 })
    const created = await submit(s, 4)
    await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})
    const queue = (await rq(s.keeper.client, 'GET', '/issue-queue')).json.requisitions.find((row) => row.id === created.id)
    assert.equal(queue.lines[0].picks.length, 1)
    assert.match(queue.lines[0].picks[0].lotNo, /^LOT-/)
    assert.equal(queue.lines[0].picks[0].qty, 4)
  })
})

describe('requisition photos', () => {
  const photoDir = () => path.join(server.dataDir, 'uploads', 'requisitions')
  const fileCount = async () => (await readdir(photoDir()).catch(() => [])).length
  const form = async (count = 1, blob = null) => {
    const data = new FormData()
    for (let i = 0; i < count; i += 1) data.append('photos', blob ?? await imageBlob(), `photo-${i}.png`)
    return data
  }
  const upload = async (client, id, count = 1, blob = null) => client.call('POST', `/api/requisitions/${id}/photos`, await form(count, blob))
  const rawGet = (client, url) => fetch(`${baseUrl}${url}`, { headers: { Cookie: client.cookie } })

  test('the requester uploads photos and they appear on the detail with urls', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    const result = await upload(s.employee.client, created.id, 2)
    assert.equal(result.status, 201, JSON.stringify(result.json))
    const detail = (await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition
    assert.equal(detail.photos.length, 2)
    assert.match(detail.photos[0].url, /^\/api\/requisitions\/photos\//)
    assert.match(detail.photos[0].thumbUrl, /size=thumb$/)
    const full = await rawGet(s.employee.client, detail.photos[0].url)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('content-type'), 'image/jpeg')
    assert.equal((await rawGet(s.employee.client, detail.photos[0].thumbUrl)).status, 200)
    assert.ok(detail.events.some((event) => event.action === 'photo_added'))
  })

  test('strangers cannot upload or view; approvers and storekeepers of the warehouse can view', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    await upload(s.employee.client, created.id)
    const photo = (await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition.photos[0]
    const stranger = await makeUser('employee', 'แผนกอื่น')
    assert.equal((await upload(stranger.client, created.id)).status, 403)
    assert.equal((await rawGet(stranger.client, photo.url)).status, 403)
    assert.equal((await rawGet(s.leaderClient, photo.url)).status, 200)
    assert.equal((await rawGet(s.keeper.client, photo.url)).status, 200)
    assert.equal((await rawGet(s.adminClient, photo.thumbUrl)).status, 200)
    assert.equal((await fetch(`${baseUrl}${photo.url}`)).status, 401)
    assert.equal((await rawGet(s.adminClient, '/api/requisitions/photos/missing')).status, 404)
    assert.equal((await upload(s.employee.client, 'missing')).status, 404)
  })

  test('at most six photos per requisition, and only images are accepted', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    assert.equal((await upload(s.employee.client, created.id, 6)).status, 201)
    assert.equal((await upload(s.employee.client, created.id, 1)).status, 400)
    const other = await submit(s, 1)
    const before = await fileCount()
    assert.equal((await upload(s.employee.client, other.id, 1, new Blob(['not an image'], { type: 'image/png' }))).status, 400)
    assert.equal((await upload(s.employee.client, other.id, 1, new Blob([Buffer.from('GIF89a')], { type: 'image/gif' }))).status, 400)
    assert.equal(await fileCount(), before)
    assert.equal((await rq(s.employee.client, 'GET', `/${other.id}`)).json.requisition.photos.length, 0)
  })

  test('uploads and deletes are only possible while the requisition is editable', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    await upload(s.employee.client, created.id)
    const photo = (await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition.photos[0]
    await rq(s.leaderClient, 'POST', `/${created.id}/approve`, {})
    assert.equal((await upload(s.employee.client, created.id)).status, 409)
    assert.equal((await rq(s.employee.client, 'DELETE', `/${created.id}/photos/${photo.id}`)).status, 409)
    assert.equal((await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition.photos.length, 1)
  })

  test('the requester can delete their own photo; others cannot; files are removed', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    const start = await fileCount()
    await upload(s.employee.client, created.id)
    assert.equal(await fileCount(), start + 2)
    const photo = (await rq(s.employee.client, 'GET', `/${created.id}`)).json.requisition.photos[0]
    const stranger = await makeUser('employee', 'แผนกอื่น')
    assert.equal((await rq(stranger.client, 'DELETE', `/${created.id}/photos/${photo.id}`)).status, 403)
    assert.equal((await rq(s.leaderClient, 'DELETE', `/${created.id}/photos/${photo.id}`)).status, 403)
    assert.equal((await rq(s.employee.client, 'DELETE', `/${created.id}/photos/missing`)).status, 404)
    assert.equal((await rq(s.employee.client, 'DELETE', `/${created.id}/photos/${photo.id}`)).status, 200)
    assert.equal(await fileCount(), start)
    assert.equal((await rawGet(s.employee.client, photo.url)).status, 404)
  })

  test('returned-for-edit requisitions accept new photos before resubmitting', async () => {
    const s = await scene()
    const created = await submit(s, 1)
    await rq(s.leaderClient, 'POST', `/${created.id}/request-changes`, { reason: 'แนบรูปของที่ชำรุด' })
    assert.equal((await upload(s.employee.client, created.id)).status, 201)
    assert.equal((await rq(s.employee.client, 'POST', `/${created.id}/resubmit`, { lines: [] })).json.requisition.photos.length, 1)
  })
})

describe('checkout helper endpoints', () => {
  test('warehouses and route preview work for any signed-in user and validate input', async () => {
    const s = await scene()
    await rq(s.employee.client, 'PUT', '/cart/lines', { type: 'ppe', variantId: s.variantId, qty: 4 })
    const options = (await rq(s.employee.client, 'GET', '/warehouses?type=ppe')).json.warehouses
    const mine = options.find((option) => option.id === s.warehouse.id)
    assert.deepEqual([mine.covered, mine.total], [1, 1])
    assert.equal((await rq(s.employee.client, 'GET', '/warehouses?type=food')).status, 400)
    const route = await rq(s.employee.client, 'GET', `/route-preview?type=ppe&warehouseId=${s.warehouse.id}`)
    assert.equal(route.status, 200, JSON.stringify(route.json))
    assert.deepEqual(route.json.route.steps[0].approvers.map((approver) => approver.userId), [s.lead])
    assert.equal((await rq(s.employee.client, 'GET', '/route-preview?type=ppe&warehouseId=nope')).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/requisitions/warehouses?type=ppe`)).status, 401)
  })
})
