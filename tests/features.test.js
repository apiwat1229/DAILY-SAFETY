import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import { ADMIN_PASSWORD, Client, employeeBody, imageBlob, loginAs, startServer } from './helpers.js'

let server
let baseUrl
const admin = () => loginAs(baseUrl, 'admin', ADMIN_PASSWORD)

before(async () => {
  server = await startServer()
  baseUrl = server.baseUrl
})
after(() => server?.stop())

describe('security headers and CSRF', () => {
  test('sets hardening headers', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/)
  })

  test('rejects cross-origin writes but accepts same-origin ones', async () => {
    const body = JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD })
    const evil = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body })
    assert.equal(evil.status, 403)
    const ok = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body })
    assert.equal(ok.status, 200)
  })
})

describe('leader role, result edits and photo deletion', () => {
  let adminClient
  let leader
  let assigneeId
  let inspection
  let ngItem

  before(async () => {
    adminClient = await admin()
    for (const [code, name] of [['L001', 'หัวหน้า ทดสอบ'], ['L002', 'ผู้ตรวจ ทดสอบ']]) {
      assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody(code, name))).status, 201)
    }
    const created = await adminClient.call('POST', '/api/admin/users', { name: 'หัวหน้า ทดสอบ', employeeCode: 'L001', password: 'Leader-pass-1', role: 'leader' })
    assert.equal(created.status, 201)
    assigneeId = created.json.user.id
    leader = await loginAs(baseUrl, 'l001', 'Leader-pass-1')

    const { json: checklist } = await adminClient.call('GET', '/api/checklist')
    const [first, ...rest] = checklist.items
    ngItem = first
    const form = new FormData()
    form.set('payload', JSON.stringify({
      date: '2026-02-01', time: '10:00', area: 'คลัง', shift: 'เช้า', inspectorName: 'ผู้ตรวจ ทดสอบ', employeeCode: 'L002',
      responses: [{ key: first.key, result: 'NG', issueDetails: 'ของวางขวางทาง', responsibleUserId: assigneeId }, ...rest.map((item) => ({ key: item.key, result: 'OK' }))],
    }))
    form.set('photoMetadata', JSON.stringify([{ key: first.key, type: 'before' }]))
    form.append('photos', await imageBlob(), 'before.png')
    const result = await adminClient.call('POST', '/api/inspections', form)
    assert.equal(result.status, 201, JSON.stringify(result.json))
    inspection = result.json.inspection
  })

  test('leader can open the dashboard and see every inspection, but not admin data', async () => {
    assert.equal((await leader.call('GET', '/api/dashboard')).status, 200)
    const list = await leader.call('GET', '/api/inspections')
    assert.ok(list.json.inspections.some((row) => row.id === inspection.id))
    assert.equal((await leader.call('GET', `/api/inspections/${inspection.id}`)).status, 200)
    assert.equal((await leader.call('GET', '/api/admin/audit-log')).status, 403)
    assert.equal((await leader.call('DELETE', `/api/inspections/${inspection.id}`)).status, 403)
  })

  test('a plain employee still only sees their own work and no dashboard', async () => {
    assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody('E901', 'พนักงาน ทั่วไป'))).status, 201)
    assert.equal((await adminClient.call('POST', '/api/admin/users', { name: 'พนักงาน ทั่วไป', employeeCode: 'E901', password: 'Emp-pass-1', role: 'employee' })).status, 201)
    const employee = await loginAs(baseUrl, 'e901', 'Emp-pass-1')
    assert.equal((await employee.call('GET', '/api/dashboard')).status, 403)
    assert.equal((await employee.call('GET', `/api/inspections/${inspection.id}`)).status, 403)
  })

  test('leader can reschedule a follow-up task', async () => {
    const row = inspection.items.find((item) => item.key === ngItem.key)
    const form = new FormData()
    form.set('followUpStatus', 'กำลังแก้ไข')
    form.set('dueDate', '2026-03-01')
    form.set('responsibleUserId', assigneeId)
    const result = await leader.call('PATCH', `/api/responses/${row.id}`, form)
    assert.equal(result.status, 200, JSON.stringify(result.json))
    assert.equal(result.json.inspection.items.find((item) => item.id === row.id).dueDate, '2026-03-01')
  })

  test('admin can change NG to OK (clearing photos) and back to NG only with a before photo', async () => {
    const row = inspection.items.find((item) => item.key === ngItem.key)
    const toOk = new FormData()
    toOk.set('result', 'OK')
    const ok = await adminClient.call('PATCH', `/api/admin/responses/${row.id}/result`, toOk)
    assert.equal(ok.status, 200, JSON.stringify(ok.json))
    const okRow = ok.json.inspection.items.find((item) => item.id === row.id)
    assert.equal(okRow.result, 'OK')
    assert.equal(okRow.photos.length, 0)
    assert.equal(okRow.responsible, '')

    const withoutPhoto = new FormData()
    withoutPhoto.set('result', 'NG'); withoutPhoto.set('issueDetails', 'พบอีกครั้ง'); withoutPhoto.set('responsibleUserId', assigneeId)
    assert.equal((await adminClient.call('PATCH', `/api/admin/responses/${row.id}/result`, withoutPhoto)).status, 400)

    const withPhoto = new FormData()
    withPhoto.set('result', 'NG'); withPhoto.set('issueDetails', 'พบอีกครั้ง'); withPhoto.set('responsibleUserId', assigneeId)
    withPhoto.append('photos', await imageBlob(), 'again.png')
    const back = await adminClient.call('PATCH', `/api/admin/responses/${row.id}/result`, withPhoto)
    assert.equal(back.status, 200, JSON.stringify(back.json))
    assert.equal(back.json.inspection.items.find((item) => item.id === row.id).photos.length, 1)
    inspection = back.json.inspection
  })

  test('the last before-photo of an NG item cannot be deleted, but an extra one can', async () => {
    const row = inspection.items.find((item) => item.key === ngItem.key)
    const only = row.photos[0]
    assert.equal((await adminClient.call('DELETE', `/api/photos/${only.id}`)).status, 400)
    const extra = new FormData()
    extra.set('result', 'NG'); extra.set('responsibleUserId', assigneeId)
    extra.append('photos', await imageBlob(), 'second.png')
    const added = await adminClient.call('PATCH', `/api/admin/responses/${row.id}/result`, extra)
    assert.equal(added.status, 200, JSON.stringify(added.json))
    assert.equal(added.json.inspection.items.find((item) => item.id === row.id).photos.length, 2)
    const removed = await adminClient.call('DELETE', `/api/photos/${only.id}`)
    assert.equal(removed.status, 200)
    assert.equal(removed.json.inspection.items.find((item) => item.id === row.id).photos.length, 1)
    assert.equal((await new Client(baseUrl).call('DELETE', `/api/photos/${only.id}`)).status, 401)
  })
})

describe('hiyari follow-up status', () => {
  test('admin can move a report through received, in progress and closed', async () => {
    const adminClient = await admin()
    assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody('H001', 'ผู้แจ้ง ฮิยาริ'))).status, 201)
    const form = await adminClient.call('POST', '/api/admin/hiyari-forms', { title: 'ฟอร์มทดสอบ', description: '' })
    assert.equal(form.status, 201)
    const submit = new FormData()
    for (const [key, value] of Object.entries({ employeeCode: 'H001', employeeName: 'ผู้แจ้ง ฮิยาริ', language: 'th', reportDate: '2026-02-02', whenText: 'เช้า', whereText: 'โรงงาน', whatHappened: 'เกือบสะดุด', suggestions: '', note: '' })) submit.set(key, value)
    const sent = await new Client(baseUrl).call('POST', `/api/public/hiyari/${form.json.form.token}/submissions`, submit)
    assert.equal(sent.status, 201, JSON.stringify(sent.json))
    const { json } = await adminClient.call('GET', `/api/admin/hiyari-submissions?formId=${form.json.form.id}`)
    const report = json.submissions[0]
    assert.equal(report.status, 'received')
    const url = `/api/admin/hiyari-submissions/${report.id}/status`
    assert.equal((await adminClient.call('PATCH', url, { status: 'closed', responsible: 'ช่าง', followUpNote: '' })).status, 400)
    assert.equal((await adminClient.call('PATCH', url, { status: 'bogus' })).status, 400)
    assert.equal((await adminClient.call('PATCH', url, { status: 'in_progress', responsible: 'ช่าง' })).json.submission.status, 'in_progress')
    const closed = await adminClient.call('PATCH', url, { status: 'closed', followUpNote: 'ซ่อมพื้นแล้ว' })
    assert.equal(closed.json.submission.status, 'closed')
    assert.equal(closed.json.submission.followUpNote, 'ซ่อมพื้นแล้ว')
  })
})

describe('training readers, link rotation and guarded deletes', () => {
  let adminClient
  let material

  before(async () => {
    adminClient = await admin()
    for (const [code, name] of [['R001', 'ผู้อ่าน หนึ่ง'], ['R002', 'ผู้อ่าน สอง']]) {
      assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody(code, name))).status, 201)
    }
    const form = new FormData()
    form.set('title', 'สื่อทดสอบ'); form.set('description', '')
    form.append('file', await imageBlob(), 'material.png')
    const created = await adminClient.call('POST', '/api/admin/training-materials', form)
    assert.equal(created.status, 201, JSON.stringify(created.json))
    material = created.json.material
  })

  test('reports who has and has not read the material', async () => {
    const view = await new Client(baseUrl).call('POST', `/api/public/training-materials/${material.token}/views`, { employeeCode: 'R001', employeeName: 'ผู้อ่าน หนึ่ง' })
    assert.equal(view.status, 201, JSON.stringify(view.json))
    const report = await adminClient.call('GET', `/api/admin/training-materials/${material.id}/views`)
    assert.equal(report.status, 200)
    assert.ok(report.json.viewed.some((row) => row.employeeCode === 'R001'))
    assert.ok(report.json.notViewed.some((row) => row.employeeCode === 'R002'))
    assert.ok(!report.json.notViewed.some((row) => row.employeeCode === 'R001'))
  })

  test('rotating the token invalidates the old public link', async () => {
    const before = material.token
    assert.equal((await new Client(baseUrl).call('GET', `/api/public/training-materials/${before}`)).status, 200)
    const rotated = await adminClient.call('POST', `/api/admin/training-materials/${material.id}/rotate-token`)
    assert.equal(rotated.status, 200)
    assert.notEqual(rotated.json.token, before)
    assert.equal((await new Client(baseUrl).call('GET', `/api/public/training-materials/${before}`)).status, 404)
    assert.equal((await new Client(baseUrl).call('GET', `/api/public/training-materials/${rotated.json.token}`)).status, 200)
    assert.equal((await new Client(baseUrl).call('POST', `/api/admin/training-materials/${material.id}/rotate-token`)).status, 401)
    assert.equal((await adminClient.call('POST', '/api/admin/unknown-things/abc/rotate-token')).status, 404)
  })

  test('deleting material with read history needs explicit confirmation', async () => {
    const blocked = await adminClient.call('DELETE', `/api/admin/training-materials/${material.id}`)
    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.viewCount, 1)
    assert.equal((await adminClient.call('DELETE', `/api/admin/training-materials/${material.id}?force=1`)).status, 200)
  })

  test('deleting an assessment that has answers needs explicit confirmation', async () => {
    const { json } = await adminClient.call('GET', '/api/admin/assessments')
    const assessment = json.assessments[0]
    assert.ok(assessment, 'seeded assessment available')
    const db = new DatabaseSync(path.join(server.dataDir, 'daily-safety.sqlite'))
    try {
      db.prepare("INSERT INTO assessment_submissions (id, assessment_id, employee_code, employee_name, answers_json, score, max_score, submitted_at) VALUES ('sub-test', ?, 'R002', 'ผู้อ่าน สอง', '[]', 0, 0, '2026-01-01T00:00:00.000Z')").run(assessment.id)
    } finally { db.close() }
    const blocked = await adminClient.call('DELETE', `/api/admin/assessments/${assessment.id}`)
    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.submissionCount, 1)
    assert.equal((await adminClient.call('DELETE', `/api/admin/assessments/${assessment.id}?force=1`)).status, 200)
  })
})

describe('employee roster import', () => {
  async function roster(rows) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.addRow(['Code', 'Name', 'Position', 'Department'])
    rows.forEach((row) => sheet.addRow(row))
    return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }

  test('imports matching Thai and English rosters and reports created/updated counts', async () => {
    const adminClient = await admin()
    const body = new FormData()
    body.set('thai', await roster([['I001', 'สมชาย ใจดี', 'ช่าง', 'ซ่อมบำรุง'], ['I002', 'สมหญิง ดีใจ', 'หัวหน้า', 'ผลิต']]), 'th.xlsx')
    body.set('english', await roster([['I001', 'Somchai Jaidee', 'Technician', 'Maintenance'], ['I002', 'Somying Deejai', 'Leader', 'Production']]), 'en.xlsx')
    const first = await adminClient.call('POST', '/api/admin/employees/import', body)
    assert.equal(first.status, 200, JSON.stringify(first.json))
    assert.deepEqual(first.json, { imported: 2, created: 2, updated: 0 })
    const again = new FormData()
    again.set('thai', await roster([['I001', 'สมชาย ใจดี', 'ช่าง', 'ซ่อมบำรุง']]), 'th.xlsx')
    assert.deepEqual((await adminClient.call('POST', '/api/admin/employees/import', again)).json, { imported: 1, created: 0, updated: 1 })
    const list = await adminClient.call('GET', '/api/admin/employees')
    assert.equal(list.json.employees.find((row) => row.employeeCode === 'I001').nameEn, 'Somchai Jaidee')
  })

  test('rejects mismatched codes, missing files and non-admins', async () => {
    const adminClient = await admin()
    const mismatch = new FormData()
    mismatch.set('thai', await roster([['I010', 'ก', 'x', 'y']]), 'th.xlsx')
    mismatch.set('english', await roster([['I011', 'A', 'x', 'y']]), 'en.xlsx')
    assert.equal((await adminClient.call('POST', '/api/admin/employees/import', mismatch)).status, 400)
    assert.equal((await adminClient.call('POST', '/api/admin/employees/import', new FormData())).status, 400)
    const leader = await loginAs(baseUrl, 'leader', 'Leader-test-1')
    assert.equal((await leader.call('POST', '/api/admin/employees/import', new FormData())).status, 403)
  })
})

describe('persistent rate limits', () => {
  test('public hiyari submissions are throttled per client and the counter is stored in SQLite', async () => {
    const statuses = []
    for (let index = 0; index < 22; index += 1) {
      statuses.push((await new Client(baseUrl).call('POST', '/api/public/hiyari/no-such-token/submissions', new FormData())).status)
    }
    assert.notEqual(statuses[0], 429)
    assert.equal(statuses.at(-1), 429)
    const db = new DatabaseSync(path.join(server.dataDir, 'daily-safety.sqlite'))
    try {
      const row = db.prepare("SELECT count FROM rate_limits WHERE bucket = 'public-hiyari'").get()
      assert.ok(row && row.count >= 20)
    } finally { db.close() }
  })
})
