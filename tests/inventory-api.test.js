import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { readdir } from 'node:fs/promises'
import { ADMIN_PASSWORD, employeeBody, imageBlob, loginAs, startServer } from './helpers.js'

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

describe('stock count API', () => {
  async function stocked(adminClient) {
    const f = await stockFixture(adminClient)
    const receipt = await inv(adminClient, 'POST', '/receipts', { warehouseId: f.warehouse.id, lines: [{ variantId: f.ppeVariant, qty: 10 }, { variantId: f.medVariant, qty: 6, lotNo: 'C-1', expiryDate: bangkokDate(120) }] })
    return { ...f, lots: Object.fromEntries(receipt.json.movements.map((movement) => [movement.variantId, movement.lotId])) }
  }

  test('count create → set lines → post adjusts stock and writes audit', async () => {
    const adminClient = await admin()
    const f = await stocked(adminClient)
    const created = await inv(adminClient, 'POST', '/counts', { warehouseId: f.warehouse.id })
    assert.equal(created.status, 201)
    const sheet = (await inv(adminClient, 'GET', `/counts/${created.json.id}`)).json.count
    assert.equal(sheet.status, 'draft')
    assert.deepEqual(sheet.lines.map((line) => line.systemQty).sort((a, b) => a - b), [6, 10])
    assert.ok(sheet.lines.every((line) => line.itemName && line.countedQty === null))
    const saved = await inv(adminClient, 'PUT', `/counts/${created.json.id}/lines`, { lines: [{ variantId: f.ppeVariant, lotId: f.lots[f.ppeVariant], countedQty: 9 }, { variantId: f.medVariant, lotId: f.lots[f.medVariant], countedQty: 6 }] })
    assert.equal(saved.status, 200)
    assert.equal((await inv(adminClient, 'GET', `/counts/${created.json.id}`)).json.count.status, 'counting')
    const posted = await inv(adminClient, 'POST', `/counts/${created.json.id}/post`)
    assert.equal(posted.status, 200)
    assert.equal(posted.json.adjustments, 1)
    const row = (await inv(adminClient, 'GET', `/stock?warehouseId=${f.warehouse.id}`)).json.rows.find((entry) => entry.variantId === f.ppeVariant)
    assert.equal(row.onHand, 9)
    const db = openDb()
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE target_type = 'inventory_count' AND target_id = ?").get(created.json.id).n, 2)
    db.close()
    const list = await inv(adminClient, 'GET', `/counts?warehouseId=${f.warehouse.id}`)
    assert.deepEqual(list.json.counts.map((count) => count.status), ['posted'])
  })

  test('posting twice is 409 and invalid counts are 400', async () => {
    const adminClient = await admin()
    const f = await stocked(adminClient)
    const { id } = (await inv(adminClient, 'POST', '/counts', { warehouseId: f.warehouse.id })).json
    assert.equal((await inv(adminClient, 'PUT', `/counts/${id}/lines`, { lines: [{ variantId: f.ppeVariant, lotId: f.lots[f.ppeVariant], countedQty: -1 }] })).status, 400)
    assert.equal((await inv(adminClient, 'PUT', `/counts/${id}/lines`, { lines: [{ variantId: f.ppeVariant, lotId: 'missing', countedQty: 1 }] })).status, 404)
    assert.equal((await inv(adminClient, 'POST', `/counts/${id}/post`)).status, 200)
    assert.equal((await inv(adminClient, 'POST', `/counts/${id}/post`)).status, 409)
    assert.equal((await inv(adminClient, 'PUT', `/counts/${id}/lines`, { lines: [] })).status, 409)
  })

  test('storekeeper cannot open or read a count for an unassigned warehouse', async () => {
    const adminClient = await admin()
    const mine = await stocked(adminClient)
    const other = await stocked(adminClient)
    const { client, userId } = await makeStorekeeper(`SK5${fixtureCounter}`)
    await assign(adminClient, mine.warehouse, userId)
    assert.equal((await inv(client, 'POST', '/counts', { warehouseId: other.warehouse.id })).status, 403)
    assert.equal((await inv(client, 'POST', '/counts', { warehouseId: mine.warehouse.id })).status, 201)
    const foreign = (await inv(adminClient, 'POST', '/counts', { warehouseId: other.warehouse.id })).json.id
    assert.equal((await inv(client, 'GET', `/counts/${foreign}`)).status, 403)
    assert.equal((await inv(client, 'PUT', `/counts/${foreign}/lines`, { lines: [] })).status, 403)
    assert.equal((await inv(client, 'POST', `/counts/${foreign}/post`)).status, 403)
    assert.equal((await inv(client, 'GET', '/counts')).json.counts.every((count) => count.warehouseId === mine.warehouse.id), true)
  })

  test('count lines from another warehouse sheet are rejected', async () => {
    const adminClient = await admin()
    const a = await stocked(adminClient)
    const b = await stocked(adminClient)
    const { id } = (await inv(adminClient, 'POST', '/counts', { warehouseId: a.warehouse.id })).json
    const result = await inv(adminClient, 'PUT', `/counts/${id}/lines`, { lines: [{ variantId: b.ppeVariant, lotId: b.lots[b.ppeVariant], countedQty: 1 }] })
    assert.equal(result.status, 404)
    assert.match(result.json.error, /ใบนับสต็อก/)
  })
})

describe('item images', () => {
  const imageDir = () => path.join(server.dataDir, 'uploads', 'inventory')
  const files = async () => (await readdir(imageDir()).catch(() => [])).sort()
  const bigPng = () => sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#336699', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer()
  const upload = async (client, itemId, blob = null, name = 'photo.png') => {
    const form = new FormData()
    form.append('image', blob ?? await imageBlob(), name)
    return client.call('POST', `/api/inventory/items/${itemId}/image`, form)
  }
  const rawGet = (client, url) => fetch(`${baseUrl}${url}`, { headers: { Cookie: client.cookie } })
  const newItem = async (adminClient, suffix) => (await inv(adminClient, 'POST', '/items', { sku: `IMG-${suffix}`, name: `สินค้ารูป ${suffix}`, type: 'ppe', unit: 'ชิ้น' })).json.item

  test('admin uploads an item image and imageUrl appears on the item', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'A')
    assert.equal(item.imageUrl, null)
    const result = await upload(adminClient, item.id)
    assert.equal(result.status, 200, JSON.stringify(result.json))
    assert.match(result.json.item.imageUrl, new RegExp(`^/api/inventory/items/${item.id}/image\\?v=`))
    const listed = (await inv(adminClient, 'GET', '/items?q=IMG-A')).json.items[0]
    assert.equal(listed.imageUrl, result.json.item.imageUrl)
  })

  test('any signed-in user can fetch the image and the thumbnail is smaller than the full image', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'B')
    const big = await bigPng()
    assert.equal((await upload(adminClient, item.id, new Blob([big], { type: 'image/png' }))).status, 200)
    assert.equal((await adminClient.call('POST', '/api/admin/employees', employeeBody('EMIMG', 'พนักงาน รูป'))).status, 201)
    assert.equal((await adminClient.call('POST', '/api/admin/users', { name: 'พนักงาน รูป', employeeCode: 'EMIMG', password: 'Emp-pass-9', role: 'employee' })).status, 201)
    const employee = await loginAs(baseUrl, 'emimg', 'Emp-pass-9')
    const full = await rawGet(employee, `/api/inventory/items/${item.id}/image`)
    const thumb = await rawGet(employee, `/api/inventory/items/${item.id}/image?size=thumb`)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('content-type'), 'image/jpeg')
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff')
    assert.match(full.headers.get('cache-control') || '', /private/)
    const [fullSize, thumbSize] = [(await full.arrayBuffer()).byteLength, (await thumb.arrayBuffer()).byteLength]
    assert.ok(thumbSize > 0 && thumbSize < fullSize, `thumb ${thumbSize} < full ${fullSize}`)
    const meta = await sharp(Buffer.from(await (await rawGet(employee, `/api/inventory/items/${item.id}/image`)).arrayBuffer())).metadata()
    assert.ok(meta.width <= 1280 && meta.height <= 1280)
  })

  test('anonymous gets 401 and an item without an image gets 404', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'C')
    assert.equal((await fetch(`${baseUrl}/api/inventory/items/${item.id}/image`)).status, 401)
    assert.equal((await rawGet(adminClient, `/api/inventory/items/${item.id}/image`)).status, 404)
    assert.equal((await rawGet(adminClient, '/api/inventory/items/nope/image')).status, 404)
  })

  test('storekeeper and employee cannot upload or delete (403)', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'D')
    const { client } = await makeStorekeeper('SKIMG')
    assert.equal((await upload(client, item.id)).status, 403)
    assert.equal((await client.call('DELETE', `/api/inventory/items/${item.id}/image`)).status, 403)
  })

  test('non-image and oversize files are 400 and nothing is stored', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'E')
    const before = (await files()).length
    assert.equal((await upload(adminClient, item.id, new Blob(['not an image'], { type: 'image/png' }))).status, 400)
    assert.equal((await upload(adminClient, item.id, new Blob([Buffer.alloc(9 * 1024 * 1024)], { type: 'image/png' }))).status, 400)
    assert.equal((await upload(adminClient, item.id, new Blob([Buffer.from('GIF89a')], { type: 'image/gif' }))).status, 400)
    assert.equal((await upload(adminClient, 'missing-item')).status, 404)
    assert.equal((await files()).length, before)
    assert.equal((await inv(adminClient, 'GET', '/items?q=IMG-E')).json.items[0].imageUrl, null)
  })

  test('replacing removes the old files; deleting the image or the item removes the rest', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'F')
    const start = (await files()).length
    await upload(adminClient, item.id)
    assert.equal((await files()).length, start + 2)
    const first = (await inv(adminClient, 'GET', '/items?q=IMG-F')).json.items[0].imageUrl
    await upload(adminClient, item.id)
    assert.equal((await files()).length, start + 2)
    assert.notEqual((await inv(adminClient, 'GET', '/items?q=IMG-F')).json.items[0].imageUrl, first)
    assert.equal((await inv(adminClient, 'DELETE', `/items/${item.id}/image`)).status, 200)
    assert.equal((await files()).length, start)
    assert.equal((await rawGet(adminClient, `/api/inventory/items/${item.id}/image`)).status, 404)
    await upload(adminClient, item.id)
    assert.equal((await inv(adminClient, 'DELETE', `/items/${item.id}`)).status, 200)
    assert.equal((await files()).length, start)
  })

  test('image changes are audited', async () => {
    const adminClient = await admin()
    const item = await newItem(adminClient, 'G')
    await upload(adminClient, item.id)
    await inv(adminClient, 'DELETE', `/items/${item.id}/image`)
    const db = openDb()
    const rows = db.prepare("SELECT action FROM audit_log WHERE target_type = 'inventory_item' AND target_id = ? ORDER BY created_at").all(item.id)
    db.close()
    assert.ok(rows.length >= 3)
  })
})

describe('stock rows and images', () => {
  test('stock rows carry the item image url (null without an image)', async () => {
    const adminClient = await admin()
    const warehouse = (await inv(adminClient, 'POST', '/warehouses', { code: 'IMGW', name: 'คลังรูป' })).json.warehouse
    const withImage = (await inv(adminClient, 'POST', '/items', { sku: 'IMG-STK-1', name: 'มีรูป', type: 'ppe', unit: 'ชิ้น' })).json.item
    const without = (await inv(adminClient, 'POST', '/items', { sku: 'IMG-STK-2', name: 'ไม่มีรูป', type: 'ppe', unit: 'ชิ้น' })).json.item
    const form = new FormData()
    form.append('image', await imageBlob(), 'x.png')
    const uploaded = await adminClient.call('POST', `/api/inventory/items/${withImage.id}/image`, form)
    assert.equal(uploaded.status, 200)
    await inv(adminClient, 'POST', '/receipts', { warehouseId: warehouse.id, lines: [{ variantId: withImage.variants[0].id, qty: 2 }, { variantId: without.variants[0].id, qty: 2 }] })
    const rows = (await inv(adminClient, 'GET', `/stock?warehouseId=${warehouse.id}`)).json.rows
    assert.equal(rows.find((row) => row.itemId === withImage.id).imageUrl, uploaded.json.item.imageUrl)
    assert.equal(rows.find((row) => row.itemId === without.id).imageUrl, null)
  })
})
