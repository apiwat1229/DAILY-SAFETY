import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateInventory } from '../server/inventory/schema.js'
import { migrateRequisitions } from '../server/requisitions/schema.js'
import { StockError, createStockService } from '../server/inventory/stock.js'
import { createWorkflowService } from '../server/requisitions/workflow.js'
import { RequisitionError, createRequisitionService } from '../server/requisitions/service.js'

const TODAY = '2026-11-11'
let db, stock, svc

function seed() {
  db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, employee_code TEXT, role TEXT, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE employee_directory (employee_code TEXT PRIMARY KEY, name_th TEXT, department_th TEXT NOT NULL DEFAULT '', department_en TEXT NOT NULL DEFAULT '');
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL DEFAULT '');
  `)
  migrateInventory(db)
  migrateRequisitions(db)
  db.prepare("INSERT INTO users (id, username, display_name, employee_code, role, is_active) VALUES ('emp', 'emp', 'พนักงาน', 'E1', 'employee', 1)").run()
  db.exec(`
    INSERT INTO items (id, sku, name, type, unit, min_stock, track_lot, track_expiry, is_active, created_at) VALUES
      ('i-ppe', 'PPE-1', 'ถุงมือ', 'ppe', 'คู่', 0, 0, 0, 1, 'x'),
      ('i-med', 'MED-1', 'พาราเซตามอล', 'medicine', 'แผง', 0, 1, 1, 1, 'x');
    INSERT INTO item_variants (id, item_id, label, is_active) VALUES ('v-ppe', 'i-ppe', '', 1), ('v-med', 'i-med', '', 1);
    INSERT INTO warehouses (id, code, name, is_active, type) VALUES ('w-ppe', 'PPE', 'คลัง PPE', 1, 'ppe'), ('w-med', 'MED', 'คลังยา', 1, 'medicine'), ('w-any', 'ANY', 'คลังรวม', 1, 'any');
  `)
  stock = createStockService(db, { today: () => TODAY })
  const wf = createWorkflowService(db, { today: () => TODAY })
  svc = createRequisitionService(db, { stock, workflow: wf, today: () => TODAY })
}
beforeEach(seed)

const wrongWarehouse = (fn) => assert.throws(fn, (error) => error instanceof StockError && error.code === 'WRONG_WAREHOUSE')

describe('warehouse types', () => {
  test('the type column exists and defaults to "any" for warehouses created without one', () => {
    db.prepare("INSERT INTO warehouses (id, code, name, is_active) VALUES ('w-old', 'OLD', 'คลังเก่า', 1)").run()
    assert.equal(db.prepare("SELECT type FROM warehouses WHERE id = 'w-old'").get().type, 'any')
  })

  test('migrating a database that predates the column adds it with the default', () => {
    const old = new DatabaseSync(':memory:')
    old.exec("CREATE TABLE warehouses (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1); INSERT INTO warehouses VALUES ('w1', 'W1', 'เก่า', 1);")
    migrateInventory(old)
    assert.equal(old.prepare("SELECT type FROM warehouses WHERE id = 'w1'").get().type, 'any')
  })

  test('receiving refuses stock of the other type, accepts matching type and any', () => {
    wrongWarehouse(() => stock.receive({ variantId: 'v-med', warehouseId: 'w-ppe', qty: 5, lotNo: 'L1', expiryDate: '2028-01-01' }))
    wrongWarehouse(() => stock.receive({ variantId: 'v-ppe', warehouseId: 'w-med', qty: 5 }))
    stock.receive({ variantId: 'v-ppe', warehouseId: 'w-ppe', qty: 5 })
    stock.receive({ variantId: 'v-med', warehouseId: 'w-med', qty: 5, lotNo: 'L1', expiryDate: '2028-01-01' })
    stock.receive({ variantId: 'v-ppe', warehouseId: 'w-any', qty: 5 })
    stock.receive({ variantId: 'v-med', warehouseId: 'w-any', qty: 5, lotNo: 'L1', expiryDate: '2028-01-01' })
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n, 4)
  })

  test('transfers into a warehouse of the other type are refused', () => {
    stock.receive({ variantId: 'v-ppe', warehouseId: 'w-any', qty: 5 })
    wrongWarehouse(() => stock.transfer({ variantId: 'v-ppe', fromWarehouseId: 'w-any', toWarehouseId: 'w-med', lotId: db.prepare("SELECT id FROM stock_lots WHERE warehouse_id = 'w-any'").get().id, qty: 1 }))
  })
})

describe('requisitions follow warehouse types', () => {
  test('the warehouse choice lists only warehouses that hold the requested type', () => {
    svc.setCartLine('emp', 'ppe', 'v-ppe', 1)
    assert.deepEqual(svc.warehouseOptions('emp', 'ppe').map((row) => row.code).sort(), ['ANY', 'PPE'])
    assert.deepEqual(svc.warehouseOptions('emp', 'medicine').map((row) => row.code).sort(), ['ANY', 'MED'])
  })

  test('checkout and route preview refuse a warehouse of the other type', () => {
    stock.receive({ variantId: 'v-ppe', warehouseId: 'w-ppe', qty: 5 })
    svc.setCartLine('emp', 'ppe', 'v-ppe', 1)
    const refused = (fn) => assert.throws(fn, (error) => error instanceof RequisitionError && error.code === 'INVALID')
    refused(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w-med', reason: 'ทดสอบ', neededBy: '' }))
    refused(() => svc.previewRoute({ userId: 'emp', type: 'ppe', warehouseId: 'w-med' }))
    assert.ok(svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w-ppe', reason: 'ทดสอบ', neededBy: '' }).id)
  })
})
