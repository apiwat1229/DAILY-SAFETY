import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ADMIN_PASSWORD, employeeBody, loginAs, startServer } from './helpers.js'

let server
let baseUrl
const admin = () => loginAs(baseUrl, 'admin', ADMIN_PASSWORD)

before(async () => {
  server = await startServer()
  baseUrl = server.baseUrl
})
after(() => server?.stop())

async function makeStorekeeper(code, password = 'Store-pass-1') {
  const adminClient = await admin()
  assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody(code, `คลัง ${code}`))).status, 201)
  const created = await adminClient.call('POST', '/api/admin/users', { name: `คลัง ${code}`, employeeCode: code, password, role: 'storekeeper' })
  assert.equal(created.status, 201, JSON.stringify(created.json))
  return { client: await loginAs(baseUrl, code.toLowerCase(), password), userId: created.json?.id ?? created.json?.user?.id }
}

describe('schema and storekeeper role', () => {
  test('storekeeper role can be created and logs in', async () => {
    const { client } = await makeStorekeeper('SK001')
    const me = await client.call('GET', '/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.json.user.role, 'storekeeper')
  })

  test('invalid role is still rejected', async () => {
    const adminClient = await admin()
    assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody('SK002', 'คลัง สอง'))).status, 201)
    const result = await adminClient.call('POST', '/api/admin/users', { name: 'คลัง สอง', employeeCode: 'SK002', password: 'Store-pass-1', role: 'warehouse' })
    assert.equal(result.status, 400)
  })

  test('stock_movements rejects UPDATE and DELETE', () => {
    const db = new DatabaseSync(path.join(server.dataDir, 'daily-safety.sqlite'))
    db.exec("INSERT INTO stock_movements (id, type, variant_id, warehouse_id, lot_id, qty, ref_type, ref_id, reason, user_id, created_at) VALUES ('m1','receive','v','w','',1,'','','','u','2026-01-01T00:00:00Z')")
    assert.throws(() => db.exec("UPDATE stock_movements SET qty = 5 WHERE id = 'm1'"), /append-only/)
    assert.throws(() => db.exec("DELETE FROM stock_movements WHERE id = 'm1'"), /append-only/)
    db.close()
  })
})
