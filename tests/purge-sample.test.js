import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { migrateInventory } from '../server/inventory/schema.js'
import { migrateRequisitions } from '../server/requisitions/schema.js'
import { createStockService } from '../server/inventory/stock.js'
import { createWorkflowService } from '../server/requisitions/workflow.js'
import { createRequisitionService } from '../server/requisitions/service.js'
import { purgeSampleData } from '../scripts/purge-sample-data.mjs'

let db, stock, svc, dir

async function seed() {
  dir = await mkdtemp(path.join(tmpdir(), 'purge-'))
  await mkdir(path.join(dir, 'inventory'), { recursive: true })
  db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, employee_code TEXT, role TEXT, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE employee_directory (employee_code TEXT PRIMARY KEY, name_th TEXT, position_th TEXT NOT NULL DEFAULT '', department_th TEXT NOT NULL DEFAULT '', department_en TEXT NOT NULL DEFAULT '');
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL DEFAULT '');
  `)
  migrateInventory(db); migrateRequisitions(db)
  const user = (id, username, code, role) => { db.prepare('INSERT INTO users (id, username, display_name, employee_code, role) VALUES (?, ?, ?, ?, ?)').run(id, username, username, code, role); db.prepare('INSERT INTO employee_directory (employee_code, name_th, department_th) VALUES (?, ?, ?)').run(code, username, 'ผลิต') }
  user('u-demo', 'demo-e01', 'DEMO-E01', 'employee'); user('u-real', 'somsri', 'E-100', 'employee'); user('u-admin', 'admin', 'A-1', 'admin')
  db.prepare("INSERT INTO item_categories (id, name, type, sort_order) VALUES ('c-sample', 'ปฐมพยาบาล', 'medicine', 0), ('c-real', 'ยาจริง', 'medicine', 1)").run()
  db.exec(`
    INSERT INTO items (id, sku, name, type, category_id, unit, track_lot, track_expiry, image, is_active, created_at) VALUES
      ('i-demo', 'DEMO-MED-001', 'ตัวอย่าง', 'medicine', 'c-sample', 'แผง', 1, 1, 'demo.jpg', 1, 'x'),
      ('i-real', 'MED-001', 'ของจริง', 'medicine', 'c-real', 'ขวด', 1, 1, 'real.jpg', 1, 'x');
    INSERT INTO item_variants (id, item_id, label, is_active) VALUES ('v-demo', 'i-demo', '', 1), ('v-real', 'i-real', '', 1);
    INSERT INTO warehouses (id, code, name, is_active, type) VALUES ('w-sample', 'MED-SAMPLE', 'ตัวอย่าง', 1, 'medicine'), ('w-real', 'MED', 'คลังจริง', 1, 'medicine');
    INSERT INTO warehouse_staff (warehouse_id, user_id) VALUES ('w-sample', 'u-admin'), ('w-real', 'u-admin');
  `)
  for (const name of ['demo.jpg', 'demo.thumb.jpg', 'real.jpg', 'real.thumb.jpg']) await writeFile(path.join(dir, 'inventory', name), 'x')
  stock = createStockService(db, { today: () => '2026-11-11' })
  const wf = createWorkflowService(db, { today: () => '2026-11-11' })
  svc = createRequisitionService(db, { stock, workflow: wf, today: () => '2026-11-11' })
  stock.receive({ variantId: 'v-demo', warehouseId: 'w-sample', qty: 10, lotNo: 'L', expiryDate: '2028-01-01', userId: 'u-admin' })
  stock.receive({ variantId: 'v-real', warehouseId: 'w-real', qty: 7, lotNo: 'R', expiryDate: '2028-01-01', userId: 'u-admin' })
  svc.setCartLine('u-demo', 'medicine', 'v-demo', 2)
  svc.checkout({ userId: 'u-demo', type: 'medicine', warehouseId: 'w-sample', reason: '[ตัวอย่าง] ทดสอบ', neededBy: '' })
  svc.setCartLine('u-demo', 'medicine', 'v-demo', 1)
  db.prepare("INSERT INTO stock_counts (id, warehouse_id, status, created_by, created_at) VALUES ('sc1', 'w-sample', 'draft', 'u-admin', 'x')").run()
  db.prepare("INSERT INTO stock_count_lines (count_id, variant_id, lot_id, system_qty) VALUES ('sc1', 'v-demo', '', 10)").run()
}
beforeEach(seed)

const count = (sql) => db.prepare(sql).get().n

describe('purgeSampleData', () => {
  test('dry run reports what would be removed and changes nothing', async () => {
    const report = await purgeSampleData(db, { uploadDir: dir, dryRun: true })
    assert.equal(report.items, 1)
    assert.equal(report.warehouses, 1)
    assert.equal(report.requisitions, 1)
    assert.equal(count("SELECT COUNT(*) AS n FROM items WHERE sku LIKE 'DEMO-%'"), 1)
    assert.equal(count('SELECT COUNT(*) AS n FROM requisitions'), 1)
  })

  test('removes every trace of the sample data, including append-only history and photo files', async () => {
    const report = await purgeSampleData(db, { uploadDir: dir })
    assert.equal(report.items, 1)
    for (const sql of [
      "SELECT COUNT(*) AS n FROM items WHERE sku LIKE 'DEMO-%'", "SELECT COUNT(*) AS n FROM item_variants WHERE id = 'v-demo'",
      "SELECT COUNT(*) AS n FROM warehouses WHERE code = 'MED-SAMPLE'", "SELECT COUNT(*) AS n FROM stock_movements WHERE variant_id = 'v-demo' OR warehouse_id = 'w-sample'",
      "SELECT COUNT(*) AS n FROM stock_balances WHERE variant_id = 'v-demo'", "SELECT COUNT(*) AS n FROM stock_lots WHERE variant_id = 'v-demo'", 'SELECT COUNT(*) AS n FROM stock_reservations',
      'SELECT COUNT(*) AS n FROM requisitions', 'SELECT COUNT(*) AS n FROM requisition_lines', 'SELECT COUNT(*) AS n FROM requisition_steps', 'SELECT COUNT(*) AS n FROM requisition_events',
      'SELECT COUNT(*) AS n FROM carts', 'SELECT COUNT(*) AS n FROM cart_lines', 'SELECT COUNT(*) AS n FROM stock_counts', 'SELECT COUNT(*) AS n FROM stock_count_lines',
      "SELECT COUNT(*) AS n FROM users WHERE username = 'demo-e01'", "SELECT COUNT(*) AS n FROM employee_directory WHERE employee_code = 'DEMO-E01'",
      "SELECT COUNT(*) AS n FROM warehouse_staff WHERE warehouse_id = 'w-sample'", "SELECT COUNT(*) AS n FROM item_categories WHERE id = 'c-sample'",
    ]) assert.equal(count(sql), 0, sql)
    assert.deepEqual((await readdir(path.join(dir, 'inventory'))).sort(), ['real.jpg', 'real.thumb.jpg'])
  })

  test('real data, history and the ledger check survive; the append-only guards are put back', async () => {
    await purgeSampleData(db, { uploadDir: dir })
    assert.equal(count("SELECT COUNT(*) AS n FROM items WHERE sku = 'MED-001'"), 1)
    assert.equal(count("SELECT COUNT(*) AS n FROM warehouses WHERE code = 'MED'"), 1)
    assert.equal(count("SELECT COUNT(*) AS n FROM users WHERE username IN ('somsri', 'admin')"), 2)
    assert.equal(count("SELECT COUNT(*) AS n FROM item_categories WHERE id = 'c-real'"), 1)
    assert.equal(stock.balance({ variantId: 'v-real', warehouseId: 'w-real' }).onHand, 7)
    assert.equal(stock.verifyIntegrity().ok, true)
    assert.throws(() => db.prepare('DELETE FROM stock_movements').run(), /append-only/)
    const guards = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map((row) => row.name)
    assert.deepEqual(guards, ['requisition_events_no_delete', 'requisition_events_no_update', 'stock_movements_no_delete', 'stock_movements_no_update'])
  })

  test('requisition numbering starts again from 1 once every requisition is gone', async () => {
    await purgeSampleData(db, { uploadDir: dir })
    assert.equal(count('SELECT COALESCE(SUM(last), 0) AS n FROM requisition_counters'), 0)
  })

  test('refuses to run when a requisition is not a sample one, and changes nothing', async () => {
    db.prepare("INSERT INTO stock_balances (variant_id, warehouse_id, lot_id, on_hand) VALUES ('v-real', 'w-real', 'tmp', 0)").run()
    db.prepare("DELETE FROM stock_balances WHERE lot_id = 'tmp'").run()
    svc.setCartLine('u-real', 'medicine', 'v-real', 1)
    svc.checkout({ userId: 'u-real', type: 'medicine', warehouseId: 'w-real', reason: 'เบิกจริง', neededBy: '' })
    await assert.rejects(() => purgeSampleData(db, { uploadDir: dir }), /not a sample/i)
    assert.equal(count("SELECT COUNT(*) AS n FROM items WHERE sku LIKE 'DEMO-%'"), 1)
    assert.equal(count('SELECT COUNT(*) AS n FROM requisitions'), 2)
  })
})
