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

const inv = (client, method, url, body) => client.call(method, `/api/inventory${url}`, body)
const openDb = () => new DatabaseSync(path.join(server.dataDir, 'daily-safety.sqlite'))

async function makeCatalog(client, suffix) {
  const category = await inv(client, 'POST', '/categories', { name: `หมวด ${suffix}`, type: 'ppe' })
  assert.equal(category.status, 201, JSON.stringify(category.json))
  const item = await inv(client, 'POST', '/items', { sku: `PPE-${suffix}`, name: `ถุงมือ ${suffix}`, type: 'ppe', categoryId: category.json.category.id, unit: 'คู่', minStock: 10, variants: ['S', 'M', 'L'] })
  assert.equal(item.status, 201, JSON.stringify(item.json))
  return { category: category.json.category, item: item.json.item }
}

describe('catalog and warehouse API', () => {
  test('anonymous and employee users cannot reach inventory', async () => {
    const anonymous = await fetch(`${baseUrl}/api/inventory/items`)
    assert.equal(anonymous.status, 401)
    const adminClient = await admin()
    assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody('EM900', 'พนักงาน ทดสอบ'))).status, 201)
    assert.equal((await adminClient.call('POST', '/api/admin/users', { name: 'พนักงาน ทดสอบ', employeeCode: 'EM900', password: 'Emp-pass-9', role: 'employee' })).status, 201)
    const employee = await loginAs(baseUrl, 'em900', 'Emp-pass-9')
    for (const url of ['/items', '/categories', '/warehouses']) assert.equal((await inv(employee, 'GET', url)).status, 403, url)
    const leader = await loginAs(baseUrl, 'leader', 'Leader-test-1')
    assert.equal((await inv(leader, 'GET', '/items')).status, 403)
  })

  test('admin creates a PPE item with variants and lists it', async () => {
    const adminClient = await admin()
    const { item } = await makeCatalog(adminClient, 'A1')
    assert.deepEqual(item.variants.map((variant) => variant.label), ['S', 'M', 'L'])
    assert.equal(item.trackLot, false)
    const list = await inv(adminClient, 'GET', '/items?type=ppe&q=A1')
    assert.equal(list.json.items.length, 1)
    assert.equal(list.json.items[0].categoryName, 'หมวด A1')
  })

  test('an item without variants gets one default variant', async () => {
    const adminClient = await admin()
    const created = await inv(adminClient, 'POST', '/items', { sku: 'PPE-DEF', name: 'หมวกนิรภัย', type: 'ppe', unit: 'ใบ' })
    assert.equal(created.status, 201)
    assert.deepEqual(created.json.item.variants.map((variant) => variant.label), [''])
  })

  test('medicine items force lot and expiry tracking', async () => {
    const adminClient = await admin()
    const created = await inv(adminClient, 'POST', '/items', { sku: 'MED-1', name: 'พาราเซตามอล', type: 'medicine', unit: 'แผง', trackLot: false, trackExpiry: false })
    assert.equal(created.status, 201)
    assert.equal(created.json.item.trackLot, true)
    assert.equal(created.json.item.trackExpiry, true)
    const patched = await inv(adminClient, 'PATCH', `/items/${created.json.item.id}`, { trackLot: false })
    assert.equal(patched.json.item.trackLot, true)
  })

  test('validation: duplicate sku is 409, bad type or empty name is 400', async () => {
    const adminClient = await admin()
    await makeCatalog(adminClient, 'DUP')
    assert.equal((await inv(adminClient, 'POST', '/items', { sku: 'PPE-DUP', name: 'ซ้ำ', type: 'ppe', unit: 'ชิ้น' })).status, 409)
    assert.equal((await inv(adminClient, 'POST', '/items', { sku: 'X1', name: 'x', type: 'food', unit: 'ชิ้น' })).status, 400)
    assert.equal((await inv(adminClient, 'POST', '/items', { sku: 'X2', name: '  ', type: 'ppe', unit: 'ชิ้น' })).status, 400)
    assert.equal((await inv(adminClient, 'POST', '/items', { sku: 'X3', name: 'x', type: 'ppe', unit: 'ชิ้น', minStock: -1 })).status, 400)
  })

  test('variants can be added, renamed, deactivated; duplicate label is 409', async () => {
    const adminClient = await admin()
    const { item } = await makeCatalog(adminClient, 'VAR')
    const added = await inv(adminClient, 'POST', `/items/${item.id}/variants`, { label: 'XL' })
    assert.equal(added.status, 201)
    assert.equal((await inv(adminClient, 'POST', `/items/${item.id}/variants`, { label: 'XL' })).status, 409)
    const renamed = await inv(adminClient, 'PATCH', `/variants/${added.json.variant.id}`, { label: 'XXL', isActive: false })
    assert.equal(renamed.json.variant.label, 'XXL')
    assert.equal(renamed.json.variant.isActive, false)
  })

  test('storekeeper can list the catalog but not change it', async () => {
    const { client } = await makeStorekeeper('SK010')
    assert.equal((await inv(client, 'GET', '/items')).status, 200)
    assert.equal((await inv(client, 'GET', '/categories')).status, 200)
    assert.equal((await inv(client, 'POST', '/items', { sku: 'NOPE', name: 'x', type: 'ppe', unit: 'ชิ้น' })).status, 403)
    assert.equal((await inv(client, 'POST', '/warehouses', { code: 'NOPE', name: 'x' })).status, 403)
  })

  test('storekeeper sees only assigned warehouses; staff must be storekeepers or admins', async () => {
    const adminClient = await admin()
    const { client, userId } = await makeStorekeeper('SK011')
    const w1 = await inv(adminClient, 'POST', '/warehouses', { code: 'WH-A', name: 'คลัง A' })
    const w2 = await inv(adminClient, 'POST', '/warehouses', { code: 'WH-B', name: 'คลัง B' })
    assert.equal(w1.status, 201)
    assert.equal((await inv(adminClient, 'POST', '/warehouses', { code: 'WH-A', name: 'ซ้ำ' })).status, 409)
    assert.equal((await inv(adminClient, 'PUT', `/warehouses/${w1.json.warehouse.id}/staff`, { userIds: [userId] })).status, 200)
    const mine = await inv(client, 'GET', '/warehouses')
    assert.deepEqual(mine.json.warehouses.map((warehouse) => warehouse.code), ['WH-A'])
    const all = await inv(adminClient, 'GET', '/warehouses')
    assert.ok(all.json.warehouses.some((warehouse) => warehouse.code === 'WH-B'))
    assert.equal(all.json.warehouses.find((warehouse) => warehouse.code === 'WH-A').staff[0].userId, userId)
    const employeeUser = (await adminClient.call('GET', '/api/admin/users')).json.users.find((user) => user.role === 'employee')
    assert.equal((await inv(adminClient, 'PUT', `/warehouses/${w2.json.warehouse.id}/staff`, { userIds: [employeeUser.id] })).status, 400)
    assert.equal((await inv(adminClient, 'PUT', `/warehouses/${w2.json.warehouse.id}/staff`, { userIds: ['missing'] })).status, 400)
  })

  test('delete is blocked when stock movements exist and allowed otherwise', async () => {
    const adminClient = await admin()
    const used = await makeCatalog(adminClient, 'USED')
    const free = await makeCatalog(adminClient, 'FREE')
    const warehouse = (await inv(adminClient, 'POST', '/warehouses', { code: 'WH-DEL', name: 'คลังลบ' })).json.warehouse
    const db = openDb()
    db.prepare("INSERT INTO stock_movements (id, type, variant_id, warehouse_id, lot_id, qty, created_at) VALUES ('mv-del', 'receive', ?, ?, '', 1, '2026-01-01T00:00:00Z')").run(used.item.variants[0].id, warehouse.id)
    db.close()
    assert.equal((await inv(adminClient, 'DELETE', `/items/${used.item.id}`)).status, 409)
    assert.equal((await inv(adminClient, 'DELETE', `/variants/${used.item.variants[0].id}`)).status, 409)
    assert.equal((await inv(adminClient, 'DELETE', `/warehouses/${warehouse.id}`)).status, 409)
    assert.equal((await inv(adminClient, 'DELETE', `/categories/${used.category.id}`)).status, 409)
    assert.equal((await inv(adminClient, 'DELETE', `/items/${free.item.id}`)).status, 200)
    assert.equal((await inv(adminClient, 'DELETE', `/categories/${free.category.id}`)).status, 200)
    assert.equal((await inv(adminClient, 'GET', '/items?q=FREE')).json.items.length, 0)
  })

  test('create, update and delete write audit entries', async () => {
    const adminClient = await admin()
    const { item } = await makeCatalog(adminClient, 'AUD')
    await inv(adminClient, 'PATCH', `/items/${item.id}`, { name: 'ถุงมือใหม่' })
    await inv(adminClient, 'DELETE', `/items/${item.id}`)
    const db = openDb()
    const rows = db.prepare("SELECT action FROM audit_log WHERE target_type = 'inventory_item' AND target_id = ? ORDER BY created_at").all(item.id)
    db.close()
    assert.equal(rows.length, 3)
  })
})
