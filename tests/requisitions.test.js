import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateInventory } from '../server/inventory/schema.js'
import { migrateRequisitions } from '../server/requisitions/schema.js'
import { createStockService } from '../server/inventory/stock.js'
import { createWorkflowService } from '../server/requisitions/workflow.js'
import { RequisitionError, createRequisitionService } from '../server/requisitions/service.js'

const TODAY = '2026-11-11'
let db
let stock
let wf
let svc
let clock

const step = (over = {}) => ({ name: 'หัวหน้างานอนุมัติ', approverType: 'dept_supervisor', approverRef: '', mode: 'any', slaHours: 0, escalateType: 'none', escalateRef: '', allowEditQty: false, condition: {}, ...over })
const rejects = (fn, code) => assert.throws(fn, (error) => error instanceof RequisitionError && error.code === code, `expected ${code}`)
const advanceHours = (hours) => { clock += hours * 3_600_000 }
const events = (id) => db.prepare('SELECT action, actor_id, comment FROM requisition_events WHERE requisition_id = ? ORDER BY rowid').all(id).map((row) => ({ ...row }))
const balance = (variantId = 'v-ppe') => stock.balance({ variantId, warehouseId: 'w1' })

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
  user('emp', 'employee', 'ผลิต'); user('emp-qa', 'employee', 'คุณภาพ'); user('lead', 'leader', 'ผลิต'); user('lead2', 'leader', 'ผลิต')
  user('admin1', 'admin', 'สำนักงาน'); user('admin2', 'admin', 'สำนักงาน'); user('keeper', 'storekeeper', 'คลัง'); user('keeper2', 'storekeeper', 'คลัง')
  user('stranger', 'employee', 'ผลิต')
  db.prepare("INSERT INTO item_categories (id, name, type, sort_order) VALUES ('c-ppe', 'ถุงมือ', 'ppe', 0), ('c-med', 'ยาสามัญ', 'medicine', 0)").run()
  db.exec(`
    INSERT INTO items (id, sku, name, type, category_id, unit, track_lot, track_expiry, is_active, created_at) VALUES
      ('i-ppe', 'PPE-1', 'ถุงมือ', 'ppe', 'c-ppe', 'คู่', 0, 0, 1, 'x'),
      ('i-ppe2', 'PPE-2', 'หมวกนิรภัย', 'ppe', 'c-ppe', 'ใบ', 0, 0, 1, 'x'),
      ('i-med', 'MED-1', 'พาราเซตามอล', 'medicine', 'c-med', 'แผง', 1, 1, 1, 'x'),
      ('i-off', 'PPE-OFF', 'เลิกขาย', 'ppe', 'c-ppe', 'ชิ้น', 0, 0, 0, 'x');
    INSERT INTO item_variants (id, item_id, label, is_active) VALUES ('v-ppe', 'i-ppe', 'M', 1), ('v-ppe2', 'i-ppe2', '', 1), ('v-med', 'i-med', '', 1), ('v-off', 'i-off', '', 1);
    INSERT INTO warehouses (id, code, name, is_active) VALUES ('w1', 'W1', 'คลัง 1', 1), ('w2', 'W2', 'คลัง 2', 1), ('w-off', 'WX', 'ปิด', 0);
    INSERT INTO warehouse_staff (warehouse_id, user_id) VALUES ('w1', 'keeper');
  `)
  stock = createStockService(db, { today: () => TODAY, now })
  wf = createWorkflowService(db, { today: () => TODAY, now })
  svc = createRequisitionService(db, { stock, workflow: wf, today: () => TODAY, now })
  stock.receive({ variantId: 'v-ppe', warehouseId: 'w1', qty: 100, userId: 'admin1' })
  stock.receive({ variantId: 'v-ppe2', warehouseId: 'w1', qty: 4, userId: 'admin1' })
  stock.receive({ variantId: 'v-med', warehouseId: 'w1', qty: 20, lotNo: 'L1', expiryDate: '2027-01-01', userId: 'admin1' })
  wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }, { userId: 'lead2', isBackup: true }])
}
beforeEach(seed)

/** Cart → checkout for `userId`; lines are [variantId, qty] pairs. */
function request(userId, lines, over = {}) {
  const type = over.type ?? 'ppe'
  for (const [variantId, qty] of lines) svc.setCartLine(userId, type, variantId, qty)
  return svc.checkout({ userId, type, warehouseId: 'w1', reason: 'ของเดิมชำรุด', neededBy: '', ...over }).id
}

describe('cart', () => {
  test('set, change and remove lines; the cart is per user and type', () => {
    svc.setCartLine('emp', 'ppe', 'v-ppe', 3)
    svc.setCartLine('emp', 'ppe', 'v-ppe', 5)
    svc.setCartLine('emp', 'ppe', 'v-ppe2', 1)
    svc.setCartLine('emp', 'medicine', 'v-med', 2)
    const cart = svc.getCart('emp', 'ppe')
    assert.deepEqual(cart.lines.map((line) => [line.variantId, line.qty]).sort(), [['v-ppe', 5], ['v-ppe2', 1]])
    assert.equal(cart.lines.find((line) => line.variantId === 'v-ppe').name, 'ถุงมือ')
    assert.equal(cart.lines.find((line) => line.variantId === 'v-ppe').available, 100)
    assert.equal(svc.getCart('emp', 'medicine').lines.length, 1)
    assert.equal(svc.getCart('stranger', 'ppe').lines.length, 0)
    svc.setCartLine('emp', 'ppe', 'v-ppe', 0)
    assert.deepEqual(svc.getCart('emp', 'ppe').lines.map((line) => line.variantId), ['v-ppe2'])
    svc.clearCart('emp', 'ppe')
    assert.equal(svc.getCart('emp', 'ppe').lines.length, 0)
  })

  test('refuses bad quantities, inactive items and items of the other type', () => {
    for (const qty of [-1, 1.5, '2', 2e9, null]) rejects(() => svc.setCartLine('emp', 'ppe', 'v-ppe', qty), 'INVALID')
    rejects(() => svc.setCartLine('emp', 'ppe', 'v-off', 1), 'INVALID')
    rejects(() => svc.setCartLine('emp', 'ppe', 'v-med', 1), 'INVALID')
    rejects(() => svc.setCartLine('emp', 'ppe', 'missing', 1), 'INVALID')
    rejects(() => svc.setCartLine('emp', 'food', 'v-ppe', 1), 'INVALID')
  })
})

describe('checkout and approval', () => {
  test('checkout creates REQ-<BE year>-00001, snapshots steps and activates the supervisor step', () => {
    const id = request('emp', [['v-ppe', 5], ['v-ppe2', 1]])
    const detail = svc.get(id)
    assert.equal(detail.number, 'REQ-2569-00001')
    assert.equal(detail.status, 'in_approval')
    assert.equal(detail.department, 'ผลิต')
    assert.deepEqual(detail.steps.map((entry) => [entry.name, entry.status, entry.approvers.map((approver) => approver.userId)]), [['หัวหน้างานอนุมัติ', 'active', ['lead']]])
    assert.deepEqual(detail.lines.map((line) => [line.variantId, line.qtyRequested, line.qtyApproved]).sort(), [['v-ppe', 5, 5], ['v-ppe2', 1, 1]])
    assert.equal(svc.getCart('emp', 'ppe').lines.length, 0)
    assert.equal(request('emp-qa', [['v-ppe', 1]]) !== id, true)
    assert.equal(db.prepare('SELECT number FROM requisitions ORDER BY number DESC LIMIT 1').get().number, 'REQ-2569-00002')
    assert.deepEqual(events(id).map((event) => event.action), ['submitted'])
  })

  test('an empty cart, an empty reason, a closed warehouse or a past date is refused', () => {
    rejects(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w1', reason: 'x', neededBy: '' }), 'INVALID')
    svc.setCartLine('emp', 'ppe', 'v-ppe', 1)
    rejects(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w1', reason: '   ', neededBy: '' }), 'INVALID')
    rejects(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w-off', reason: 'x', neededBy: '' }), 'INVALID')
    rejects(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'nope', reason: 'x', neededBy: '' }), 'INVALID')
    rejects(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w1', reason: 'x', neededBy: '2026-11-10' }), 'INVALID')
    rejects(() => svc.checkout({ userId: 'emp', type: 'ppe', warehouseId: 'w1', reason: 'x', neededBy: '2026-02-30' }), 'INVALID')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM requisitions').get().n, 0)
    assert.equal(svc.getCart('emp', 'ppe').lines.length, 1)
  })

  test('supervisor approval reserves stock and moves to ready_to_issue', () => {
    const id = request('emp', [['v-ppe', 5]])
    const detail = svc.approve({ id, userId: 'lead', comment: 'ok' })
    assert.equal(detail.status, 'ready_to_issue')
    assert.equal(detail.steps[0].status, 'approved')
    assert.deepEqual(balance(), { onHand: 100, reserved: 5, available: 95 })
    assert.ok(detail.approvedAt)
    assert.deepEqual(events(id).map((event) => event.action), ['submitted', 'approved', 'approved_all'])
  })

  test('final approval with short stock throws SHORTAGE naming the item and reserves nothing', () => {
    const id = request('emp', [['v-ppe', 5], ['v-ppe2', 9]])
    let caught
    try { svc.approve({ id, userId: 'lead' }) } catch (error) { caught = error }
    assert.ok(caught instanceof RequisitionError)
    assert.equal(caught.code, 'SHORTAGE')
    assert.deepEqual(caught.details.map((entry) => [entry.name, entry.short]), [['หมวกนิรภัย', 5]])
    assert.deepEqual(balance(), { onHand: 100, reserved: 0, available: 100 })
    assert.equal(svc.get(id).status, 'in_approval')
    assert.equal(svc.get(id).steps[0].status, 'active')
    assert.equal(events(id).length, 1)
  })

  test('approver lowers quantities only when the step allows it and a comment is given', () => {
    const strict = request('emp', [['v-ppe', 5]])
    const lineId = svc.get(strict).lines[0].id
    rejects(() => svc.approve({ id: strict, userId: 'lead', comment: 'ลด', lines: [{ lineId, qty: 3 }] }), 'FORBIDDEN')
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step({ allowEditQty: true })] })
    const id = request('emp', [['v-ppe', 5]])
    const line = svc.get(id).lines[0].id
    rejects(() => svc.approve({ id, userId: 'lead', lines: [{ lineId: line, qty: 3 }] }), 'INVALID')
    rejects(() => svc.approve({ id, userId: 'lead', comment: 'x', lines: [{ lineId: line, qty: 6 }] }), 'INVALID')
    rejects(() => svc.approve({ id, userId: 'lead', comment: 'x', lines: [{ lineId: 'nope', qty: 1 }] }), 'INVALID')
    rejects(() => svc.approve({ id, userId: 'lead', comment: 'x', lines: [{ lineId: line, qty: 0 }] }), 'INVALID')
    const detail = svc.approve({ id, userId: 'lead', comment: 'ลดตามโควตา', lines: [{ lineId: line, qty: 3 }] })
    assert.equal(detail.lines[0].qtyApproved, 3)
    assert.equal(detail.lines[0].qtyRequested, 5)
    assert.equal(balance().reserved, 3)
    assert.ok(events(id).some((event) => event.action === 'qty_changed'))
  })

  test('admins may lower quantities even when the step does not allow it', () => {
    const id = request('emp', [['v-ppe', 5]])
    const line = svc.get(id).lines[0].id
    const detail = svc.approve({ id, userId: 'admin1', comment: 'ลดจำนวน', lines: [{ lineId: line, qty: 2 }] })
    assert.equal(detail.lines[0].qtyApproved, 2)
    assert.equal(detail.status, 'ready_to_issue')
  })

  test('the requester who is the only approver is skipped and the request goes on', () => {
    wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }])
    const id = request('lead', [['v-ppe', 2]])
    const detail = svc.get(id)
    assert.equal(detail.status, 'ready_to_issue')
    assert.equal(detail.steps[0].status, 'skipped')
    assert.ok(events(id).some((event) => event.action === 'step_skipped' && /skipped_self/.test(event.comment)))
    assert.equal(balance().reserved, 2)
  })

  test('an unmapped department falls back to admins and records the event', () => {
    const id = request('emp-qa', [['v-ppe', 1]])
    const detail = svc.get(id)
    assert.equal(detail.status, 'in_approval')
    assert.deepEqual(detail.steps[0].approvers.map((approver) => approver.userId).sort(), ['admin1', 'admin2'])
    assert.ok(events(id).some((event) => event.action === 'fallback_admin'))
    assert.equal(svc.approve({ id, userId: 'admin2' }).status, 'ready_to_issue')
  })

  test('only an active-step approver or an admin can approve; the requester never can', () => {
    const id = request('emp', [['v-ppe', 1]])
    for (const userId of ['stranger', 'emp', 'keeper', 'lead2']) rejects(() => svc.approve({ id, userId }), 'FORBIDDEN')
    const adminOwn = request('admin1', [['v-ppe', 1]], { type: 'ppe' })
    assert.equal(svc.get(adminOwn).status === 'in_approval' || svc.get(adminOwn).status === 'ready_to_issue', true)
    if (svc.get(adminOwn).status === 'in_approval') rejects(() => svc.approve({ id: adminOwn, userId: 'admin1' }), 'FORBIDDEN')
    assert.equal(svc.approve({ id, userId: 'admin2' }).status, 'ready_to_issue')
  })

  test('mode all needs every approver', () => {
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step({ approverType: 'role', approverRef: 'admin', mode: 'all' })] })
    const id = request('emp', [['v-ppe', 1]])
    const first = svc.approve({ id, userId: 'admin1' })
    assert.equal(first.status, 'in_approval')
    rejects(() => svc.approve({ id, userId: 'admin1' }), 'BAD_STATE')
    assert.equal(svc.approve({ id, userId: 'admin2' }).status, 'ready_to_issue')
  })

  test('a second approval of the same step is BAD_STATE and reserves once', () => {
    const id = request('emp', [['v-ppe', 5]])
    svc.approve({ id, userId: 'lead' })
    rejects(() => svc.approve({ id, userId: 'lead' }), 'BAD_STATE')
    rejects(() => svc.approve({ id, userId: 'admin1' }), 'BAD_STATE')
    assert.equal(balance().reserved, 5)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_reservations').get().n, 1)
  })

  test('a two-step template with a quantity condition adds the extra step only for big requests', () => {
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step(), step({ name: 'ผู้จัดการอนุมัติ', approverType: 'role', approverRef: 'admin', condition: { minTotalQty: 10 } })] })
    const small = request('emp', [['v-ppe', 3]])
    assert.equal(svc.approve({ id: small, userId: 'lead' }).status, 'ready_to_issue')
    assert.equal(svc.get(small).steps[1].status, 'skipped')
    const big = request('emp', [['v-ppe', 12]])
    const afterFirst = svc.approve({ id: big, userId: 'lead' })
    assert.equal(afterFirst.status, 'in_approval')
    assert.equal(afterFirst.steps[1].status, 'active')
    assert.equal(balance().reserved, 3)
    assert.equal(svc.approve({ id: big, userId: 'admin2' }).status, 'ready_to_issue')
    assert.equal(balance().reserved, 15)
  })

  test('a delegate can approve while the delegation is active', () => {
    wf.addDelegation({ fromUser: 'lead', toUser: 'lead2', fromDate: '2026-11-10', toDate: '2026-11-12' })
    const id = request('emp', [['v-ppe', 1]])
    assert.equal(svc.inbox('lead2').length, 1)
    assert.equal(svc.approve({ id, userId: 'lead2' }).status, 'ready_to_issue')
    wf.removeDelegation(wf.listDelegations()[0].id)
    const second = request('emp', [['v-ppe', 1]])
    assert.equal(svc.inbox('lead2').length, 0)
    rejects(() => svc.approve({ id: second, userId: 'lead2' }), 'FORBIDDEN')
  })

  test('editing a template does not change a requisition in flight', () => {
    const id = request('emp', [['v-ppe', 1]])
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step({ name: 'ขั้นใหม่', approverType: 'role', approverRef: 'admin' }), step({ name: 'ขั้นสอง' })] })
    const detail = svc.get(id)
    assert.deepEqual(detail.steps.map((entry) => entry.name), ['หัวหน้างานอนุมัติ'])
    assert.equal(svc.approve({ id, userId: 'lead' }).status, 'ready_to_issue')
    assert.equal(request('emp', [['v-ppe', 1]]) !== id, true)
  })
})

describe('reject, return, cancel', () => {
  test('reject and requestChanges need a reason and release nothing they do not hold', () => {
    const id = request('emp', [['v-ppe', 1]])
    rejects(() => svc.reject({ id, userId: 'lead', reason: '  ' }), 'INVALID')
    rejects(() => svc.requestChanges({ id, userId: 'lead', reason: '' }), 'INVALID')
    rejects(() => svc.reject({ id, userId: 'stranger', reason: 'x' }), 'FORBIDDEN')
    assert.equal(svc.reject({ id, userId: 'lead', reason: 'ไม่จำเป็น' }).status, 'rejected')
    rejects(() => svc.approve({ id, userId: 'lead' }), 'BAD_STATE')
    const second = request('emp', [['v-ppe', 1]])
    assert.equal(svc.requestChanges({ id: second, userId: 'lead', reason: 'แก้จำนวน' }).status, 'returned_for_edit')
    assert.equal(events(second).at(-1).comment, 'แก้จำนวน')
  })

  test('resubmit restarts the workflow with edited lines and clears earlier approvals', () => {
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step(), step({ name: 'ผู้จัดการ', approverType: 'role', approverRef: 'admin' })] })
    const id = request('emp', [['v-ppe', 5], ['v-ppe2', 1]])
    svc.approve({ id, userId: 'lead' })
    const lines = svc.get(id).lines
    assert.equal(svc.requestChanges({ id, userId: 'admin1', reason: 'ลดของ' }).status, 'returned_for_edit')
    rejects(() => svc.resubmit({ id, userId: 'stranger', lines: [] }), 'FORBIDDEN')
    rejects(() => svc.resubmit({ id, userId: 'emp', lines: [{ lineId: lines[0].id, qty: 0 }, { lineId: lines[1].id, qty: 0 }] }), 'INVALID')
    const bigLine = lines.find((line) => line.variantId === 'v-ppe')
    const smallLine = lines.find((line) => line.variantId === 'v-ppe2')
    const detail = svc.resubmit({ id, userId: 'emp', reason: 'แก้แล้ว', lines: [{ lineId: bigLine.id, qty: 2 }, { lineId: smallLine.id, qty: 0 }] })
    assert.equal(detail.status, 'in_approval')
    assert.deepEqual(detail.lines.map((line) => [line.variantId, line.qtyRequested, line.qtyApproved]), [['v-ppe', 2, 2]])
    assert.equal(detail.reason, 'แก้แล้ว')
    assert.deepEqual(detail.steps.map((entry) => entry.status), ['active', 'waiting'])
    assert.equal(svc.approve({ id, userId: 'lead' }).status, 'in_approval')
    assert.equal(svc.approve({ id, userId: 'admin2' }).status, 'ready_to_issue')
    rejects(() => svc.resubmit({ id, userId: 'emp', lines: [] }), 'BAD_STATE')
  })

  test('cancel by the requester releases reservations and is refused after an issue', () => {
    const id = request('emp', [['v-ppe', 5]])
    svc.approve({ id, userId: 'lead' })
    rejects(() => svc.cancel({ id, userId: 'stranger' }), 'FORBIDDEN')
    assert.equal(svc.cancel({ id, userId: 'emp', reason: 'ไม่ใช้แล้ว' }).status, 'cancelled')
    assert.deepEqual(balance(), { onHand: 100, reserved: 0, available: 100 })
    const second = request('emp', [['v-ppe', 5]])
    svc.approve({ id: second, userId: 'lead' })
    const lineId = svc.get(second).lines[0].id
    svc.issue({ id: second, userId: 'keeper', lines: [{ lineId, qty: 1 }] })
    rejects(() => svc.cancel({ id: second, userId: 'emp' }), 'BAD_STATE')
    rejects(() => svc.cancel({ id, userId: 'emp' }), 'BAD_STATE')
  })

  test('admin force-cancel needs a reason; the requester need not give one', () => {
    const id = request('emp', [['v-ppe', 5]])
    rejects(() => svc.cancel({ id, userId: 'admin1', asAdmin: true, reason: '' }), 'INVALID')
    rejects(() => svc.cancel({ id, userId: 'lead', asAdmin: true, reason: 'x' }), 'FORBIDDEN')
    assert.equal(svc.cancel({ id, userId: 'admin1', asAdmin: true, reason: 'ซ้ำซ้อน' }).status, 'cancelled')
    assert.equal(events(id).at(-1).comment, 'ซ้ำซ้อน')
  })
})

describe('issue, close, return, receive', () => {
  const approved = (lines = [['v-ppe', 5]], over = {}) => {
    const id = request('emp', lines, over)
    svc.approve({ id, userId: 'lead' })
    return id
  }
  const lineOf = (id, variantId) => svc.get(id).lines.find((line) => line.variantId === variantId)

  test('issue consumes reservations, rejects more than approved, status partially_issued then issued', () => {
    const id = approved()
    const line = lineOf(id, 'v-ppe')
    rejects(() => svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 6 }] }), 'INVALID')
    rejects(() => svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 0 }] }), 'INVALID')
    rejects(() => svc.issue({ id, userId: 'keeper', lines: [] }), 'INVALID')
    rejects(() => svc.issue({ id, userId: 'keeper2', lines: [{ lineId: line.id, qty: 1 }] }), 'FORBIDDEN')
    rejects(() => svc.issue({ id, userId: 'emp', lines: [{ lineId: line.id, qty: 1 }] }), 'FORBIDDEN')
    const partial = svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 2 }] })
    assert.equal(partial.status, 'partially_issued')
    assert.equal(partial.lines[0].qtyIssued, 2)
    assert.deepEqual(balance(), { onHand: 98, reserved: 3, available: 95 })
    rejects(() => svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 4 }] }), 'INVALID')
    const done = svc.issue({ id, userId: 'admin1', lines: [{ lineId: line.id, qty: 3 }] })
    assert.equal(done.status, 'issued')
    assert.deepEqual(balance(), { onHand: 95, reserved: 0, available: 95 })
    assert.deepEqual(db.prepare("SELECT qty, ref_type, ref_id FROM stock_movements WHERE type = 'issue' ORDER BY rowid").all().map((row) => [row.qty, row.ref_type, row.ref_id]), [[-2, 'requisition', id], [-3, 'requisition', id]])
    rejects(() => svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 1 }] }), 'BAD_STATE')
    assert.deepEqual(stock.verifyIntegrity(), { ok: true, mismatches: [] })
  })

  test('issue after the reserved lot expired re-reserves or fails without partial writes', () => {
    stock.receive({ variantId: 'v-med', warehouseId: 'w1', qty: 8, lotNo: 'L2', expiryDate: '2027-06-01', userId: 'admin1' })
    const id = approved([['v-med', 6]], { type: 'medicine' })
    const line = lineOf(id, 'v-med')
    const later = createRequisitionService(db, { stock: createStockService(db, { today: () => '2027-02-01' }), workflow: wf, today: () => '2027-02-01', now: () => new Date(clock).toISOString() })
    const detail = later.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 6 }] })
    assert.equal(detail.status, 'issued')
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE type = 'issue' AND lot_id = (SELECT id FROM stock_lots WHERE lot_no = 'L1')").get().n, 0)
    const second = approved([['v-med', 4]], { type: 'medicine' })
    const secondLine = lineOf(second, 'v-med')
    db.exec("UPDATE stock_lots SET expiry_date = '2027-01-15'")
    const failing = createRequisitionService(db, { stock: createStockService(db, { today: () => '2027-02-01' }), workflow: wf, today: () => '2027-02-01', now: () => new Date(clock).toISOString() })
    const before = db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n
    rejects(() => failing.issue({ id: second, userId: 'keeper', lines: [{ lineId: secondLine.id, qty: 4 }] }), 'SHORTAGE')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n, before)
    assert.equal(svc.get(second).lines[0].qtyIssued, 0)
    assert.equal(svc.get(second).status, 'ready_to_issue')
  })

  test('closeRemainder releases the rest; a closed request with issued items can be received', () => {
    const id = approved()
    const line = lineOf(id, 'v-ppe')
    svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 2 }] })
    rejects(() => svc.closeRemainder({ id, userId: 'keeper', reason: '' }), 'INVALID')
    rejects(() => svc.closeRemainder({ id, userId: 'emp', reason: 'x' }), 'FORBIDDEN')
    assert.equal(svc.closeRemainder({ id, userId: 'keeper', reason: 'ของหมด' }).status, 'closed')
    assert.deepEqual(balance(), { onHand: 98, reserved: 0, available: 98 })
    assert.equal(svc.confirmReceipt({ id, userId: 'emp' }).status, 'received')
    const none = approved([['v-ppe', 3]])
    assert.equal(svc.closeRemainder({ id: none, userId: 'keeper', reason: 'ไม่จ่ายแล้ว' }).status, 'cancelled')
    assert.equal(balance().reserved, 0)
  })

  test('recordReturn cannot exceed issued and needs a real lot', () => {
    const id = approved()
    const line = lineOf(id, 'v-ppe')
    svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 5 }] })
    const lot = db.prepare("SELECT id FROM stock_lots WHERE variant_id = 'v-ppe'").get().id
    rejects(() => svc.recordReturn({ id, userId: 'keeper', lines: [{ lineId: line.id, lotId: lot, qty: 6 }] }), 'INVALID')
    rejects(() => svc.recordReturn({ id, userId: 'keeper', lines: [{ lineId: line.id, lotId: 'missing', qty: 1 }] }), 'INVALID')
    rejects(() => svc.recordReturn({ id, userId: 'emp', lines: [{ lineId: line.id, lotId: lot, qty: 1 }] }), 'FORBIDDEN')
    const detail = svc.recordReturn({ id, userId: 'keeper', lines: [{ lineId: line.id, lotId: lot, qty: 2 }], reason: 'ไม่พอดีมือ' })
    assert.equal(detail.lines[0].qtyReturned, 2)
    assert.equal(balance().onHand, 97)
    rejects(() => svc.recordReturn({ id, userId: 'keeper', lines: [{ lineId: line.id, lotId: lot, qty: 4 }] }), 'INVALID')
    assert.ok(events(id).some((event) => event.action === 'returned'))
  })

  test('confirmReceipt only by the requester and only once issued or closed', () => {
    const id = approved()
    rejects(() => svc.confirmReceipt({ id, userId: 'emp' }), 'BAD_STATE')
    const line = lineOf(id, 'v-ppe')
    svc.issue({ id, userId: 'keeper', lines: [{ lineId: line.id, qty: 5 }] })
    rejects(() => svc.confirmReceipt({ id, userId: 'lead' }), 'FORBIDDEN')
    rejects(() => svc.confirmReceipt({ id, userId: 'admin1' }), 'FORBIDDEN')
    assert.equal(svc.confirmReceipt({ id, userId: 'emp' }).status, 'received')
    rejects(() => svc.confirmReceipt({ id, userId: 'emp' }), 'BAD_STATE')
  })

  test('expireStale releases reservations of old ready_to_issue requisitions', () => {
    const id = approved()
    assert.equal(svc.expireStale(), 0)
    advanceHours(13 * 24)
    assert.equal(svc.expireStale(), 0)
    advanceHours(2 * 24)
    assert.equal(svc.expireStale(), 1)
    assert.equal(svc.get(id).status, 'expired')
    assert.deepEqual(balance(), { onHand: 100, reserved: 0, available: 100 })
    assert.equal(svc.expireStale(), 0)
    wf.setExpireDays(1)
    const second = approved([['v-ppe', 2]])
    advanceHours(30)
    assert.equal(svc.expireStale(), 1)
    assert.equal(svc.get(second).status, 'expired')
  })
})

describe('escalation, queues and views', () => {
  test('escalateOverdue adds the escalate approver once, only after the due time', () => {
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step({ slaHours: 24, escalateType: 'role', escalateRef: 'admin' })] })
    const id = request('emp', [['v-ppe', 1]])
    assert.equal(svc.get(id).steps[0].overdue, false)
    advanceHours(23)
    assert.equal(svc.escalateOverdue(), 0)
    advanceHours(2)
    assert.equal(svc.get(id).steps[0].overdue, true)
    assert.equal(svc.escalateOverdue(), 1)
    assert.equal(svc.escalateOverdue(), 0)
    assert.deepEqual(svc.get(id).steps[0].approvers.map((approver) => approver.userId).sort(), ['admin1', 'admin2', 'lead'])
    assert.ok(events(id).some((event) => event.action === 'escalated'))
    assert.equal(svc.inbox('admin1')[0].overdue, true)
  })

  test('inbox lists only what the user can act on, never their own requests', () => {
    const mine = request('emp', [['v-ppe', 1]])
    request('emp-qa', [['v-ppe', 2]])
    assert.deepEqual(svc.inbox('lead').map((item) => item.id), [mine])
    assert.deepEqual(svc.inbox('lead')[0].requesterName, 'ชื่อ emp')
    assert.equal(svc.inbox('stranger').length, 0)
    assert.equal(svc.inbox('admin1').length, 1)
    assert.deepEqual(svc.badges({ id: 'lead', role: 'leader' }), { approvals: 1, issue: 0 })
  })

  test('issueQueue shows the pick list for the storekeeper warehouses only', () => {
    const id = request('emp', [['v-ppe', 5]])
    svc.approve({ id, userId: 'lead' })
    const queue = svc.issueQueue('keeper', 'storekeeper')
    assert.equal(queue.length, 1)
    assert.equal(queue[0].lines[0].remaining, 5)
    assert.deepEqual(queue[0].lines[0].picks.map((pick) => pick.qty), [5])
    assert.equal(svc.issueQueue('keeper2', 'storekeeper').length, 0)
    assert.equal(svc.issueQueue('admin1', 'admin').length, 1)
    assert.deepEqual(svc.badges({ id: 'keeper', role: 'storekeeper' }), { approvals: 0, issue: 1 })
  })

  test('listMine and listAll filter by status and search', () => {
    const a = request('emp', [['v-ppe', 1]])
    request('emp-qa', [['v-ppe', 1]])
    svc.reject({ id: a, userId: 'lead', reason: 'x' })
    assert.equal(svc.listMine('emp').length, 1)
    assert.equal(svc.listMine('emp', { status: 'in_approval' }).length, 0)
    assert.equal(svc.listMine('emp', { status: 'rejected' }).length, 1)
    assert.equal(svc.listAll({ page: 1, pageSize: 10 }).total, 2)
    assert.equal(svc.listAll({ status: 'rejected', page: 1, pageSize: 10 }).rows.length, 1)
    assert.equal(svc.listAll({ q: 'REQ-2569-00002', page: 1, pageSize: 10 }).rows.length, 1)
    assert.equal(svc.listAll({ q: 'ชื่อ emp-qa', page: 1, pageSize: 10 }).rows.length, 1)
    assert.equal(svc.listAll({ page: 1, pageSize: 1 }).rows.length, 1)
  })

  test('reassign adds an approver to the active step (admin only)', () => {
    const id = request('emp', [['v-ppe', 1]])
    rejects(() => svc.reassign({ id, userId: 'lead', toUserId: 'stranger', reason: 'x' }), 'FORBIDDEN')
    rejects(() => svc.reassign({ id, userId: 'admin1', toUserId: 'stranger', reason: 'x' }), 'INVALID')
    rejects(() => svc.reassign({ id, userId: 'admin1', toUserId: 'keeper', reason: '' }), 'INVALID')
    const detail = svc.reassign({ id, userId: 'admin1', toUserId: 'keeper', reason: 'หัวหน้าลาป่วย' })
    assert.deepEqual(detail.steps[0].approvers.map((approver) => approver.userId).sort(), ['keeper', 'lead'])
    assert.equal(svc.approve({ id, userId: 'keeper' }).status, 'ready_to_issue')
  })

  test('canView: requester, approvers, storekeeper of the warehouse and admins only', () => {
    const id = request('emp', [['v-ppe', 1]])
    const view = (userId, role) => svc.canView({ id: userId, role }, svc.get(id))
    assert.deepEqual([view('emp', 'employee'), view('lead', 'leader'), view('admin1', 'admin'), view('keeper', 'storekeeper')], [true, true, true, true])
    assert.deepEqual([view('stranger', 'employee'), view('keeper2', 'storekeeper'), view('lead2', 'leader')], [false, false, false])
    svc.approve({ id, userId: 'lead' })
    assert.equal(view('lead', 'leader'), true)
  })

  test('requisition events are append-only', () => {
    const id = request('emp', [['v-ppe', 1]])
    assert.throws(() => db.exec('UPDATE requisition_events SET comment = \'x\''), /append-only/)
    assert.throws(() => db.exec('DELETE FROM requisition_events'), /append-only/)
    assert.equal(events(id).length, 1)
  })

  test('catalog lists active items with availability and hides inactive ones', () => {
    const result = svc.catalog({ type: 'ppe' })
    const names = result.map((item) => item.name).sort()
    assert.deepEqual(names, ['ถุงมือ', 'หมวกนิรภัย'])
    assert.equal(result.find((item) => item.name === 'ถุงมือ').variants[0].available, 100)
    assert.equal(svc.catalog({ type: 'ppe', q: 'หมวก' }).length, 1)
    assert.equal(svc.catalog({ type: 'medicine' })[0].variants[0].available, 20)
    const id = request('emp', [['v-ppe', 40]])
    svc.approve({ id, userId: 'lead' })
    assert.equal(svc.catalog({ type: 'ppe' }).find((item) => item.name === 'ถุงมือ').variants[0].available, 60)
  })
})

describe('checkout helpers', () => {
  test('warehouseOptions lists active warehouses with how many cart lines they can cover', () => {
    svc.setCartLine('emp', 'ppe', 'v-ppe', 10)
    svc.setCartLine('emp', 'ppe', 'v-ppe2', 6)
    const options = svc.warehouseOptions('emp', 'ppe')
    assert.deepEqual(options.map((option) => [option.id, option.covered, option.total]), [['w1', 1, 2], ['w2', 0, 2]])
    assert.equal(options.some((option) => option.id === 'w-off'), false)
    stock.receive({ variantId: 'v-ppe', warehouseId: 'w2', qty: 20, userId: 'admin1' })
    stock.receive({ variantId: 'v-ppe2', warehouseId: 'w2', qty: 6, userId: 'admin1' })
    assert.deepEqual(svc.warehouseOptions('emp', 'ppe').map((option) => [option.id, option.covered]), [['w2', 2], ['w1', 1]])
    assert.deepEqual(svc.warehouseOptions('stranger', 'ppe').map((option) => option.total), [0, 0])
    rejects(() => svc.warehouseOptions('emp', 'food'), 'INVALID')
  })

  test('previewRoute shows the approvers the cart would go to, honouring conditions and fallbacks', () => {
    wf.saveTemplate({ id: 'default-ppe', name: 'เบิก PPE', appliesType: 'ppe', steps: [step(), step({ name: 'ผู้จัดการ', approverType: 'role', approverRef: 'admin', condition: { minTotalQty: 10 } })] })
    svc.setCartLine('emp', 'ppe', 'v-ppe', 3)
    const small = svc.previewRoute({ userId: 'emp', type: 'ppe', warehouseId: 'w1' })
    assert.deepEqual(small.steps.map((entry) => [entry.name, entry.applies, entry.approvers.map((approver) => approver.userId)]), [['หัวหน้างานอนุมัติ', true, ['lead']], ['ผู้จัดการ', false, ['admin1', 'admin2']]])
    assert.equal(small.templateName, 'เบิก PPE')
    svc.setCartLine('emp', 'ppe', 'v-ppe', 12)
    assert.equal(svc.previewRoute({ userId: 'emp', type: 'ppe', warehouseId: 'w1' }).steps[1].applies, true)
    svc.setCartLine('emp-qa', 'ppe', 'v-ppe', 1)
    const fallback = svc.previewRoute({ userId: 'emp-qa', type: 'ppe', warehouseId: 'w1' })
    assert.equal(fallback.steps[0].note, 'fallback_admin')
    assert.deepEqual(fallback.steps[0].approvers.map((approver) => approver.userId).sort(), ['admin1', 'admin2'])
    assert.deepEqual(svc.previewRoute({ userId: 'stranger', type: 'ppe', warehouseId: 'w1' }).steps, [])
    rejects(() => svc.previewRoute({ userId: 'emp', type: 'ppe', warehouseId: 'nope' }), 'INVALID')
  })
})

describe('issue history', () => {
  test('issueHistory lists issued requisitions with the lots stock came from, for the right warehouses', () => {
    stock.receive({ variantId: 'v-med', warehouseId: 'w1', qty: 8, lotNo: 'L2', expiryDate: '2027-06-01', userId: 'admin1' })
    const id = request('emp', [['v-med', 25]], { type: 'medicine' })
    svc.approve({ id, userId: 'lead' })
    const lineId = svc.get(id).lines[0].id
    assert.equal(svc.issueHistory('keeper', 'storekeeper').length, 0)
    svc.issue({ id, userId: 'keeper', lines: [{ lineId, qty: 25 }] })
    const history = svc.issueHistory('keeper', 'storekeeper')
    assert.equal(history.length, 1)
    assert.deepEqual(history[0].lines[0].issuedLots.map((lot) => [lot.lotNo, lot.qty]), [['L1', 20], ['L2', 5]])
    assert.equal(history[0].lines[0].qtyIssued, 25)
    assert.equal(svc.issueHistory('keeper2', 'storekeeper').length, 0)
    assert.equal(svc.issueHistory('admin1', 'admin').length, 1)
    assert.equal(svc.issueHistory('emp', 'employee').length, 0)
    svc.confirmReceipt({ id, userId: 'emp' })
    assert.equal(svc.issueHistory('keeper', 'storekeeper')[0].status, 'received')
  })
})
