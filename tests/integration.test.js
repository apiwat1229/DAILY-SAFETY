// MRP (Safety tab) reaches the API at /api/integration/* with a token, acting as the "mrp-integration" admin account.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_PASSWORD, loginAs, startServer } from './helpers.js'

const TOKEN = 'integration-test-token-0123456789'
let app

async function mrp(method, url, body, token = TOKEN) {
  const headers = { Authorization: `Bearer ${token}`, 'X-Acting-User': encodeURIComponent('อภิวัฒน์') }
  if (body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${app.baseUrl}/api/integration${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: response.status, json, cookie: response.headers.get('set-cookie') }
}

describe('MRP integration', () => {
  before(async () => { app = await startServer({ INTEGRATION_TOKEN: TOKEN }) })
  after(async () => { await app?.stop() })

  test('without the token, or with a wrong one, nothing is answered', async () => {
    assert.equal((await mrp('GET', '/dashboard', null, '')).status, 401)
    assert.equal((await mrp('GET', '/dashboard', null, 'wrong')).status, 401)
  })

  test('with the token MRP reads the admin pages and gets no session cookie', async () => {
    const dashboard = await mrp('GET', '/dashboard')
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.json))
    assert.equal(dashboard.cookie, null)
    assert.equal((await mrp('GET', '/admin/users')).status, 200)
    assert.equal((await mrp('GET', '/admin/checklist')).status, 200)
    assert.equal((await mrp('GET', '/inventory/stock')).status, 200)
  })

  test('sign-in and the public links are not reachable through the integration', async () => {
    assert.equal((await mrp('POST', '/auth/login', { username: 'admin', password: ADMIN_PASSWORD })).status, 404)
    assert.equal((await mrp('GET', '/public/daily-inspection')).status, 404)
  })

  test('a change from MRP is in the audit log with the MRP user', async () => {
    const created = await mrp('POST', '/admin/checklist', { title: 'ตรวจจาก MRP', description: '' })
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.json))
    const admin = await loginAs(app.baseUrl, 'admin', ADMIN_PASSWORD)
    const log = await admin.call('GET', '/api/admin/audit-log?pageSize=20')
    const rows = log.json.entries ?? log.json.rows ?? log.json.items ?? []
    const entry = rows.find((row) => String(row.action).includes('เพิ่มหัวข้อตรวจ'))
    assert.ok(entry, JSON.stringify(log.json).slice(0, 400))
    assert.match(JSON.stringify(entry), /อภิวัฒน์/)
  })
})

describe('MRP integration turned off', () => {
  let off
  before(async () => { off = await startServer() })
  after(async () => { await off?.stop() })

  test('without INTEGRATION_TOKEN every integration call is refused', async () => {
    const response = await fetch(`${off.baseUrl}/api/integration/dashboard`, { headers: { Authorization: 'Bearer anything' } })
    assert.equal(response.status, 401)
  })
})
