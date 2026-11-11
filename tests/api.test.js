// Integration tests: boots the real server against a throwaway data directory.
// Run with `pnpm test` (Node 24+, uses node:test).
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ADMIN_PASSWORD = 'Admin-test-1'
const LEADER_PASSWORD = 'Leader-test-1'

let server
let dataDir
let baseUrl

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
    probe.on('error', reject)
  })
}

class Client {
  cookie = ''
  async call(method, url, body, headers = {}) {
    const isForm = body instanceof FormData
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    return { status: response.status, json }
  }
  login(username, password) { return this.call('POST', '/api/auth/login', { username, password }) }
}

async function loggedIn(username, password) {
  const client = new Client()
  const result = await client.login(username, password)
  assert.equal(result.status, 200, `login ${username}`)
  return client
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'daily-safety-test-'))
  const port = await freePort()
  baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_PASSWORD, LEADER_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return } catch { /* still starting */ }
    if (server.exitCode !== null) throw new Error(`Server exited early:\n${output}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Server did not start:\n${output}`)
})

after(async () => {
  server?.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined)
})

describe('authentication and roles', () => {
  test('rejects bad credentials and accepts good ones', async () => {
    assert.equal((await new Client().login('admin', 'wrong')).status, 401)
    assert.equal((await new Client().login('admin', ADMIN_PASSWORD)).status, 200)
  })

  test('leader cannot read the audit log or admin lists', async () => {
    const leader = await loggedIn('leader', LEADER_PASSWORD)
    assert.equal((await leader.call('GET', '/api/admin/audit-log')).status, 403)
    assert.equal((await leader.call('GET', '/api/admin/users')).status, 403)
  })

  test('anonymous requests are rejected', async () => {
    assert.equal((await new Client().call('GET', '/api/admin/audit-log')).status, 401)
  })
})

describe('change own password', () => {
  test('validates current password, length and reuse, then applies the change', async () => {
    const leader = await loggedIn('leader', LEADER_PASSWORD)
    assert.equal((await leader.call('POST', '/api/auth/password', { currentPassword: 'nope', newPassword: 'Another-1' })).status, 400)
    assert.equal((await leader.call('POST', '/api/auth/password', { currentPassword: LEADER_PASSWORD, newPassword: 'abc' })).status, 400)
    assert.equal((await leader.call('POST', '/api/auth/password', { currentPassword: LEADER_PASSWORD, newPassword: LEADER_PASSWORD })).status, 400)
    assert.equal((await leader.call('POST', '/api/auth/password', { currentPassword: LEADER_PASSWORD, newPassword: 'Changed-Pass-1' })).status, 200)
    assert.equal((await new Client().login('leader', LEADER_PASSWORD)).status, 401)
    assert.equal((await new Client().login('leader', 'Changed-Pass-1')).status, 200)
  })

  test('requires a session', async () => {
    assert.equal((await new Client().call('POST', '/api/auth/password', { currentPassword: 'a', newPassword: 'bcdefg' })).status, 401)
  })
})

describe('audit log', () => {
  test('records the password change and supports filtering and paging', async () => {
    const admin = await loggedIn('admin', ADMIN_PASSWORD)
    const all = await admin.call('GET', '/api/admin/audit-log')
    assert.equal(all.status, 200)
    assert.ok(all.json.total >= 1)
    assert.ok(all.json.entries.some((entry) => entry.action === 'เปลี่ยนรหัสผ่านของตนเอง' && entry.username === 'leader'))
    assert.ok(all.json.targetTypes.includes('user'))

    const filtered = await admin.call('GET', '/api/admin/audit-log?targetType=user&q=leader&limit=1')
    assert.equal(filtered.status, 200)
    assert.equal(filtered.json.entries.length, 1)
    assert.equal(filtered.json.entries[0].targetType, 'user')

    const none = await admin.call('GET', '/api/admin/audit-log?q=%25zzz-no-such-entry')
    assert.equal(none.json.total, 0)
  })
})

describe('employee directory deletion guard and NG follow-up', () => {
  const employee = (code, nameTh) => ({ employeeCode: code, nameTh, nameEn: '', positionTh: 'พนักงาน', positionEn: '', departmentTh: 'ผลิต', departmentEn: '' })
  let admin
  let assigneeId
  let closedResponseId

  before(async () => {
    admin = await loggedIn('admin', ADMIN_PASSWORD)
    for (const [code, name] of [['T001', 'ทดสอบ หนึ่ง'], ['T002', 'ทดสอบ สอง'], ['T003', 'ทดสอบ สาม']]) {
      assert.equal((await admin.call('POST', '/api/admin/employees', employee(code, name))).status, 201)
    }
    const created = await admin.call('POST', '/api/admin/users', { name: 'ทดสอบ หนึ่ง', employeeCode: 'T001', password: 'Worker-pass-1', role: 'employee' })
    assert.equal(created.status, 201)
    assigneeId = created.json.user.id
  })

  test('deleting an unreferenced employee works', async () => {
    assert.equal((await admin.call('DELETE', '/api/admin/employees/T003')).status, 200)
  })

  test('an employee with a user account cannot be deleted', async () => {
    const result = await admin.call('DELETE', '/api/admin/employees/T001')
    assert.equal(result.status, 409)
    assert.equal(result.json.references.users, 1)
  })

  test('an NG inspection cannot be closed without an after photo, and then blocks employee deletion', async () => {
    const { json: checklist } = await admin.call('GET', '/api/checklist')
    assert.ok(checklist.items.length > 0)
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ff0000' } }).png().toBuffer()
    const [ngItem, ...rest] = checklist.items
    const payload = {
      date: '2026-01-15', time: '09:30', area: 'โรงงาน A', shift: 'เช้า', inspectorName: 'ทดสอบ สอง', employeeCode: 'T002',
      responses: [
        { key: ngItem.key, result: 'NG', issueDetails: 'พื้นลื่น', responsibleUserId: assigneeId, dueDate: '2026-02-01' },
        ...rest.map((item) => ({ key: item.key, result: 'OK' })),
      ],
    }
    const form = new FormData()
    form.set('payload', JSON.stringify(payload))
    form.set('photoMetadata', JSON.stringify([{ key: ngItem.key, type: 'before' }]))
    form.append('photos', new Blob([png], { type: 'image/png' }), 'before.png')
    const created = await admin.call('POST', '/api/inspections', form)
    assert.equal(created.status, 201, JSON.stringify(created.json))

    const response = created.json.inspection.items.find((row) => row.result === 'NG')
    assert.ok(response, 'NG response present')

    closedResponseId = response.id
    const close = new FormData()
    close.set('followUpStatus', 'แก้ไขแล้ว')
    close.set('resolutionNote', 'แก้ไขเรียบร้อย')
    const rejected = await admin.call('PATCH', `/api/responses/${response.id}`, close)
    assert.equal(rejected.status, 400)

    const closeWithPhoto = new FormData()
    closeWithPhoto.set('followUpStatus', 'แก้ไขแล้ว')
    closeWithPhoto.set('resolutionNote', 'แก้ไขเรียบร้อย')
    closeWithPhoto.append('photos', new Blob([png], { type: 'image/png' }), 'after.png')
    const accepted = await admin.call('PATCH', `/api/responses/${response.id}`, closeWithPhoto)
    assert.equal(accepted.status, 200, JSON.stringify(accepted.json))

    const blocked = await admin.call('DELETE', '/api/admin/employees/T002')
    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.references.inspections, 1)
  })

  test('the assignee cannot reassign or reopen a closed task', async () => {
    const worker = await loggedIn('t001', 'Worker-pass-1')
    const form = new FormData()
    form.set('followUpStatus', 'กำลังแก้ไข')
    const result = await worker.call('PATCH', `/api/responses/${closedResponseId}`, form)
    assert.equal(result.status, 403)
  })
})

describe('backup script', () => {
  test('creates a consistent snapshot and prunes old backups', async () => {
    const { createBackup } = await import('../server/backup.js')
    const outDir = path.join(dataDir, 'backups-test')
    const first = await createBackup({ dataDir, outDir, keep: 1 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await createBackup({ dataDir, outDir, keep: 1 })
    assert.ok((await stat(path.join(second.target, 'daily-safety.sqlite'))).size > 0)
    assert.equal(second.removed, 1)
    assert.deepEqual(await readdir(outDir), [path.basename(second.target)])
    assert.notEqual(first.target, second.target)
  })
})
