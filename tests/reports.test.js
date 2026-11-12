import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateInventory } from '../server/inventory/schema.js'
import { migrateRequisitions } from '../server/requisitions/schema.js'
import { createStockService } from '../server/inventory/stock.js'
import { createWorkflowService } from '../server/requisitions/workflow.js'
import { createRequisitionService } from '../server/requisitions/service.js'
import { createReportService } from '../server/requisitions/reports.js'

const TODAY = '2026-11-11'
let db, stock, svc, reports, clock

function seed() {
  clock = Date.parse('2026-11-11T03:00:00Z')
  const now = () => new Date(clock).toISOString()
  db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, employee_code TEXT, role TEXT, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE employee_directory (employee_code TEXT PRIMARY KEY, name_th TEXT, position_th TEXT NOT NULL DEFAULT '', department_th TEXT NOT NULL DEFAULT '', department_en TEXT NOT NULL DEFAULT '');
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL DEFAULT '');
  `)
  migrateInventory(db)
  migrateRequisitions(db)
  const user = (id, role, dept) => {
    db.prepare('INSERT INTO users (id, username, display_name, employee_code, role, is_active) VALUES (?, ?, ?, ?, ?, 1)').run(id, id, `ชื่อ ${id}`, `E-${id}`, role)
    db.prepare('INSERT INTO employee_directory (employee_code, name_th, department_th) VALUES (?, ?, ?)').run(`E-${id}`, `ชื่อ ${id}`, dept)
  }
  user('emp', 'employee', 'ผลิต'); user('emp-qa', 'employee', 'คุณภาพ'); user('lead', 'leader', 'ผลิต'); user('lead-qa', 'leader', 'คุณภาพ')
  user('admin1', 'admin', 'สำนักงาน'); user('keeper', 'storekeeper', 'คลัง')
  db.prepare("INSERT INTO item_categories (id, name, type, sort_order) VALUES ('c-ppe', 'ถุงมือ', 'ppe', 0)").run()
  db.exec(`
    INSERT INTO items (id, sku, name, type, category_id, unit, track_lot, track_expiry, is_active, created_at) VALUES
      ('i-ppe', 'PPE-1', 'ถุงมือ', 'ppe', 'c-ppe', 'คู่', 0, 0, 1, 'x'),
      ('i-ppe2', 'PPE-2', 'หมวกนิรภัย', 'ppe', 'c-ppe', 'ใบ', 0, 0, 1, 'x');
    INSERT INTO item_variants (id, item_id, label, is_active) VALUES ('v-ppe', 'i-ppe', 'M', 1), ('v-ppe2', 'i-ppe2', '', 1);
    INSERT INTO warehouses (id, code, name, is_active) VALUES ('w1', 'W1', 'คลัง 1', 1), ('w2', 'W2', 'คลัง 2', 1);
    INSERT INTO warehouse_staff (warehouse_id, user_id) VALUES ('w1', 'keeper');
  `)
  stock = createStockService(db, { today: () => TODAY, now })
  const wf = createWorkflowService(db, { today: () => TODAY, now })
  svc = createRequisitionService(db, { stock, workflow: wf, today: () => TODAY, now })
  reports = createReportService(db, { stock, now })
  for (const w of ['w1', 'w2']) {
    stock.receive({ variantId: 'v-ppe', warehouseId: w, qty: 100, userId: 'admin1' })
    stock.receive({ variantId: 'v-ppe2', warehouseId: w, qty: 100, userId: 'admin1' })
  }
  wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }])
  wf.setDepartmentSupervisors('คุณภาพ', [{ userId: 'lead-qa', isBackup: false }])
}
beforeEach(seed)

/** Request, approve and issue everything; `hoursToApprove`/`hoursToIssue` move the clock between the stages. */
function flow(userId, approver, lines, { warehouseId = 'w1', hoursToApprove = 2, hoursToIssue = 3 } = {}) {
  for (const [variantId, qty] of lines) svc.setCartLine(userId, 'ppe', variantId, qty)
  const id = svc.checkout({ userId, type: 'ppe', warehouseId, reason: 'ของชำรุด', neededBy: '' }).id
  clock += hoursToApprove * 3_600_000
  svc.approve({ id, userId: approver })
  clock += hoursToIssue * 3_600_000
  const req = svc.get(id, 'admin1')
  svc.issue({ id, userId: 'admin1', lines: req.lines.map((line) => ({ lineId: line.id, qty: line.qtyApproved })) })
  return id
}

describe('usage report', () => {
  test('groups issued quantity by department, person and item', () => {
    flow('emp', 'lead', [['v-ppe', 10], ['v-ppe2', 2]])
    flow('emp-qa', 'lead-qa', [['v-ppe', 5]])
    const range = { from: '2026-11-01', to: '2026-11-30' }
    const byDept = reports.usage({ ...range, groupBy: 'department' })
    assert.deepEqual(byDept.rows.map((row) => [row.label, row.issued]).sort(), [['คุณภาพ', 5], ['ผลิต', 12]])
    const byPerson = reports.usage({ ...range, groupBy: 'person' })
    assert.deepEqual(byPerson.rows.map((row) => [row.label, row.issued]).sort(), [['ชื่อ emp', 12], ['ชื่อ emp-qa', 5]])
    const byItem = reports.usage({ ...range, groupBy: 'item' })
    assert.equal(byItem.rows.find((row) => row.label.startsWith('ถุงมือ')).issued, 15)
    assert.equal(byItem.totals.issued, 17)
  })

  test('returned stock reduces the net figure', () => {
    const id = flow('emp', 'lead', [['v-ppe', 10]])
    const req = svc.get(id, 'admin1')
    const lotId = db.prepare("SELECT lot_id FROM stock_movements WHERE ref_type = 'requisition' AND ref_id = ? AND type = 'issue'").get(id).lot_id
    svc.recordReturn({ id, userId: 'keeper', lines: [{ lineId: req.lines[0].id, qty: 4, lotId }], reason: 'ไม่ได้ใช้' })
    const result = reports.usage({ from: '2026-11-01', to: '2026-11-30', groupBy: 'department' })
    assert.deepEqual([result.totals.issued, result.totals.returned, result.totals.net], [10, 4, 6])
  })

  test('filters by date range, warehouse, department and requester', () => {
    flow('emp', 'lead', [['v-ppe', 10]], { warehouseId: 'w1' })
    flow('emp-qa', 'lead-qa', [['v-ppe', 5]], { warehouseId: 'w2' })
    const all = { from: '2026-11-01', to: '2026-11-30', groupBy: 'item' }
    assert.equal(reports.usage({ ...all, warehouseIds: ['w2'] }).totals.issued, 5)
    assert.equal(reports.usage({ ...all, department: 'ผลิต' }).totals.issued, 10)
    assert.equal(reports.usage({ ...all, requesterId: 'emp-qa' }).totals.issued, 5)
    assert.equal(reports.usage({ ...all, from: '2026-12-01', to: '2026-12-31' }).totals.issued, 0)
    assert.equal(reports.usage({ ...all, warehouseIds: [] }).totals.issued, 0)
  })

  test('rejects bad dates and unknown grouping', () => {
    assert.throws(() => reports.usage({ from: '2026-13-01', to: '2026-11-30', groupBy: 'item' }), { code: 'INVALID' })
    assert.throws(() => reports.usage({ from: '2026-11-30', to: '2026-11-01', groupBy: 'item' }), { code: 'INVALID' })
    assert.throws(() => reports.usage({ from: '2026-11-01', to: '2026-11-30', groupBy: 'colour' }), { code: 'INVALID' })
  })
})

describe('cycle time report', () => {
  test('averages approval and issue time and counts requests by status', () => {
    flow('emp', 'lead', [['v-ppe', 1]], { hoursToApprove: 2, hoursToIssue: 4 })
    flow('emp', 'lead', [['v-ppe', 1]], { hoursToApprove: 4, hoursToIssue: 2 })
    for (const [variantId, qty] of [['v-ppe', 1]]) svc.setCartLine('emp', 'ppe', variantId, qty)
    svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w1', reason: 'รอ', neededBy: '' })
    const result = reports.cycleTime({ from: '2026-11-01', to: '2026-11-30' })
    assert.equal(result.total, 3)
    assert.equal(result.avgApprovalHours, 3)
    assert.equal(result.avgIssueHours, 3)
    assert.equal(result.byStatus.issued, 2)
    assert.equal(result.byStatus.in_approval, 1)
  })

  test('counts steps resolved after their SLA as breaches', () => {
    db.prepare("UPDATE workflow_steps SET sla_hours = 1").run()
    flow('emp', 'lead', [['v-ppe', 1]], { hoursToApprove: 5 })
    flow('emp', 'lead', [['v-ppe', 1]], { hoursToApprove: 0 })
    const result = reports.cycleTime({ from: '2026-11-01', to: '2026-11-30' })
    assert.equal(result.slaBreaches, 1)
  })

  test('is empty-safe', () => {
    const result = reports.cycleTime({ from: '2026-11-01', to: '2026-11-30' })
    assert.deepEqual([result.total, result.avgApprovalHours, result.avgIssueHours, result.slaBreaches], [0, 0, 0, 0])
  })
})

describe('integrity check', () => {
  test('stores the latest result and reports a clean ledger', () => {
    assert.equal(reports.lastIntegrity(), null)
    const run = reports.runIntegrityCheck()
    assert.equal(run.ok, true)
    assert.deepEqual(reports.lastIntegrity(), { at: new Date(clock).toISOString(), ok: true, mismatchCount: 0 })
  })

  test('detects a balance that disagrees with the ledger', () => {
    db.prepare("UPDATE stock_balances SET on_hand = on_hand + 3 WHERE variant_id = 'v-ppe' AND warehouse_id = 'w1'").run()
    const run = reports.runIntegrityCheck()
    assert.equal(run.ok, false)
    assert.equal(reports.lastIntegrity().mismatchCount, 1)
    assert.equal(reports.lastIntegrity().ok, false)
  })
})
