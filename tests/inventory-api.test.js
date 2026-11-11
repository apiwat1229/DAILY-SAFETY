import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
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

let fixtureCounter = 0
const bangkokDate = (offsetDays = 0) => {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)
}

/** A fresh warehouse + PPE item (one default variant) + medicine item, so tests never share stock. */
async function stockFixture(adminClient) {
  const n = ++fixtureCounter
  const warehouse = (await inv(adminClient, 'POST', '/warehouses', { code: `ST-${n}`, name: `คลังทดสอบ ${n}` })).json.warehouse
  const ppe = (await inv(adminClient, 'POST', '/items', { sku: `ST-PPE-${n}`, name: `หน้ากาก ${n}`, type: 'ppe', unit: 'ชิ้น', minStock: 10 })).json.item
  const med = (await inv(adminClient, 'POST', '/items', { sku: `ST-MED-${n}`, name: `ยาแก้ปวด ${n}`, type: 'medicine', unit: 'แผง', minStock: 5 })).json.item
  return { warehouse, ppe, med, ppeVariant: ppe.variants[0].id, medVariant: med.variants[0].id }
}
const assign = async (adminClient, warehouse, userId) => assert.equal((await inv(adminClient, 'PUT', `/warehouses/${warehouse.id}/staff`, { userIds: [userId] })).status, 200)

describe('stock operations API', () => {
  test('receipt with a bad line writes nothing', async () => {
    const adminClient = await admin()
    const f = await stockFixture(adminClient)
    const result = await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, lines: [{ variantId: f.ppeVariant, qty: 5 }, { variantId: f.ppeVariant, qty: 0 }] })
    assert.equal(result.status, 400)
    assert.equal((await inv(adminClient, 'GET', `/movements?warehouseId=${f.warehouse.id}`)).json.total, 0)
    assert.equal((await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, lines: [] })).status, 400)
  })

  test('receipt, stock list, lots and movements agree', async () => {
    const adminClient = await admin()
    const f = await stockFixture(adminClient)
    const receipt = await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, note: 'รับเข้าใหม่', lines: [
      { variantId: f.ppeVariant, qty: 20 },
      { variantId: f.medVariant, qty: 8, lotNo: 'L-1', expiryDate: bangkokDate(200) },
    ] })
    assert.equal(receipt.status, 201, JSON.stringify(receipt.json))
    const stockList = await inv(adminClient, 'GET', `/stock?warehouseId=${f.warehouse.id}`)
    const rows = Object.fromEntries(stockList.json.rows.map((row) => [row.variantId, row]))
    assert.equal(rows[f.ppeVariant].onHand, 20)
    assert.equal(rows[f.medVariant].onHand, 8)
    assert.equal(rows[f.medVariant].nearestExpiry, bangkokDate(200))
    assert.equal(rows[f.medVariant].available, 8)
    const lots = await inv(adminClient, 'GET', `/stock/lots?warehouseId=${f.warehouse.id}&variantId=${f.medVariant}`)
    assert.deepEqual(lots.json.lots.map((lot) => [lot.lotNo, lot.onHand]), [['L-1', 8]])
    const movements = await inv(adminClient, 'GET', `/movements?warehouseId=${f.warehouse.id}`)
    assert.equal(movements.json.total, 2)
    assert.deepEqual(movements.json.rows.map((row) => [row.type, row.qty]).sort(), [['receive', 20], ['receive', 8]].sort())
    assert.ok(movements.json.rows[0].warehouseName && movements.json.rows[0].userName)
  })

  test('storekeeper cannot receive into an unassigned warehouse and sees only assigned stock', async () => {
    const adminClient = await admin()
    const mine = await stockFixture(adminClient)
    const other = await stockFixture(adminClient)
    const { client, userId } = await makeStorekeeper(`SK2${fixtureCounter}`)
    await assign(adminClient, mine.warehouse, userId)
    assert.equal((await inv(client, 'POST', '/receipts', { warehouseId: other.warehouse.id, lines: [{ variantId: other.ppeVariant, qty: 1 }] })).status, 403)
    assert.equal((await inv(client, 'POST', '/receipts', { warehouseId: mine.warehouse.id, lines: [{ variantId: mine.ppeVariant, qty: 3 }] })).status, 201)
    assert.equal((await inv(client, 'GET', `/stock?warehouseId=${other.warehouse.id}`)).status, 403)
    assert.equal((await inv(client, 'GET', `/movements?warehouseId=${other.warehouse.id}`)).status, 403)
    const all = await inv(client, 'GET', '/stock')
    assert.ok(all.json.rows.length > 0)
    assert.ok(all.json.rows.every((row) => row.warehouseId === mine.warehouse.id))
  })

  test('adjustments and write-offs need a reason and cannot go below zero', async () => {
    const adminClient = await admin()
    const f = await stockFixture(adminClient)
    const lot = (await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, lines: [{ variantId: f.medVariant, qty: 5, lotNo: 'L-1', expiryDate: bangkokDate(100) }] })).json.movements[0]
    const base = { warehouseId: f.warehouse.id, variantId: f.medVariant, lotId: lot.lotId }
    assert.equal((await inv(adminClient, 'POST', '/adjustments', { ...base, delta: -1 })).status, 400)
    assert.equal((await inv(adminClient, 'POST', '/adjustments', { ...base, delta: -1, reason: 'นับขาด' })).status, 201)
    assert.equal((await inv(adminClient, 'POST', '/adjustments', { ...base, delta: -99, reason: 'x' })).status, 409)
    assert.equal((await inv(adminClient, 'POST', '/write-offs', { ...base, qty: 1, reason: 'stolen' })).status, 400)
    assert.equal((await inv(adminClient, 'POST', '/write-offs', { ...base, qty: 2, reason: 'damaged', note: 'แตก' })).status, 201)
    const row = (await inv(adminClient, 'GET', `/stock?warehouseId=${f.warehouse.id}`)).json.rows.find((entry) => entry.variantId === f.medVariant)
    assert.equal(row.onHand, 2)
  })

  test('transfer needs both warehouses and moves the lot', async () => {
    const adminClient = await admin()
    const from = await stockFixture(adminClient)
    const to = await stockFixture(adminClient)
    const { client, userId } = await makeStorekeeper(`SK3${fixtureCounter}`)
    await assign(adminClient, from.warehouse, userId)
    const lot = (await inv(adminClient, 'POST', '/receipts', { warehouseId: from.warehouse.id, lines: [{ variantId: from.medVariant, qty: 6, lotNo: 'L-T', expiryDate: bangkokDate(90) }] })).json.movements[0]
    const body = { fromWarehouseId: from.warehouse.id, toWarehouseId: to.warehouse.id, lines: [{ variantId: from.medVariant, lotId: lot.lotId, qty: 4 }] }
    assert.equal((await inv(client, 'POST', '/transfers', body)).status, 403)
    assert.equal((await inv(adminClient, 'POST', '/transfers', { ...body, toWarehouseId: from.warehouse.id })).status, 400)
    assert.equal((await inv(adminClient, 'POST', '/transfers', body)).status, 201)
    const destination = (await inv(adminClient, 'GET', `/stock?warehouseId=${to.warehouse.id}`)).json.rows.find((row) => row.variantId === from.medVariant)
    assert.equal(destination.onHand, 4)
  })

  test('alerts list low stock and expiring lots (expired ones with negative daysLeft)', async () => {
    const adminClient = await admin()
    const f = await stockFixture(adminClient)
    await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, lines: [
      { variantId: f.ppeVariant, qty: 3 },
      { variantId: f.medVariant, qty: 4, lotNo: 'SOON', expiryDate: bangkokDate(20) },
      { variantId: f.medVariant, qty: 2, lotNo: 'GONE', expiryDate: bangkokDate(-5) },
      { variantId: f.medVariant, qty: 9, lotNo: 'FAR', expiryDate: bangkokDate(400) },
    ] })
    const alerts = (await inv(adminClient, 'GET', `/alerts?warehouseId=${f.warehouse.id}`)).json
    const low = alerts.lowStock.find((row) => row.itemId === f.ppe.id)
    assert.deepEqual([low.onHand, low.minStock], [3, 10])
    assert.ok(!alerts.lowStock.some((row) => row.itemId === f.med.id), 'medicine total 15 is above its minimum of 5')
    const expiring = Object.fromEntries(alerts.expiring.filter((row) => row.warehouseId === f.warehouse.id).map((row) => [row.lotNo, row]))
    assert.equal(expiring.SOON.daysLeft, 20)
    assert.equal(expiring.GONE.daysLeft, -5)
    assert.equal(expiring.FAR, undefined)
    const filtered = await inv(adminClient, 'GET', `/stock?warehouseId=${f.warehouse.id}&filter=low`)
    assert.deepEqual(filtered.json.rows.map((row) => row.variantId), [f.ppeVariant])
    const expiringRows = await inv(adminClient, 'GET', `/stock?warehouseId=${f.warehouse.id}&filter=expiring`)
    assert.deepEqual(expiringRows.json.rows.map((row) => row.variantId), [f.medVariant])
  })

  test('movements export returns an xlsx with a header row', async () => {
    const adminClient = await admin()
    const f = await stockFixture(adminClient)
    await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, lines: [{ variantId: f.ppeVariant, qty: 2 }] })
    const response = await fetch(`${baseUrl}/api/inventory/movements/export?warehouseId=${f.warehouse.id}`, { headers: { Cookie: adminClient.cookie } })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /spreadsheetml/)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()))
    const sheet = workbook.worksheets[0]
    assert.ok(sheet.getRow(1).getCell(1).value)
    assert.equal(sheet.rowCount, 2)
  })

  test('settings: storekeeper can read, only admin can write, values are validated', async () => {
    const adminClient = await admin()
    const { client } = await makeStorekeeper('SK400')
    assert.deepEqual((await inv(client, 'GET', '/settings')).json.expiryWarnDays, [30, 60, 90])
    assert.equal((await inv(client, 'PUT', '/settings', { expiryWarnDays: [10] })).status, 403)
    for (const bad of [[], [0], [-5], [1.5], ['x'], [1, 2, 3, 4, 5, 6], 'abc']) assert.equal((await inv(adminClient, 'PUT', '/settings', { expiryWarnDays: bad })).status, 400, JSON.stringify(bad))
    const saved = await inv(adminClient, 'PUT', '/settings', { expiryWarnDays: [45, 15] })
    assert.deepEqual(saved.json.expiryWarnDays, [15, 45])
    assert.deepEqual((await inv(adminClient, 'GET', '/settings')).json.expiryWarnDays, [15, 45])
    await inv(adminClient, 'PUT', '/settings', { expiryWarnDays: [30, 60, 90] })
  })
})
