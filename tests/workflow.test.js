import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateInventory } from '../server/inventory/schema.js'
import { migrateRequisitions } from '../server/requisitions/schema.js'
import { WorkflowError, createWorkflowService } from '../server/requisitions/workflow.js'

let db
let wf
const TODAY = '2026-11-11'
const step = (over = {}) => ({ name: 'หัวหน้างานอนุมัติ', approverType: 'dept_supervisor', approverRef: '', mode: 'any', slaHours: 0, escalateType: 'none', escalateRef: '', allowEditQty: false, condition: {}, ...over })
const rejects = (fn, code) => assert.throws(fn, (error) => error instanceof WorkflowError && error.code === code, `expected ${code}`)

function seed() {
  db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT, employee_code TEXT, role TEXT, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE employee_directory (employee_code TEXT PRIMARY KEY, name_th TEXT, department_th TEXT NOT NULL DEFAULT '', department_en TEXT NOT NULL DEFAULT '');
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL DEFAULT '');
  `)
  migrateInventory(db)
  migrateRequisitions(db)
  const user = (id, role, dept, active = 1) => {
    db.prepare('INSERT INTO users (id, username, display_name, employee_code, role, is_active) VALUES (?, ?, ?, ?, ?, ?)').run(id, id, `ชื่อ ${id}`, `E-${id}`, role, active)
    db.prepare('INSERT INTO employee_directory (employee_code, name_th, department_th) VALUES (?, ?, ?)').run(`E-${id}`, `ชื่อ ${id}`, dept)
  }
  user('emp', 'employee', 'ผลิต'); user('lead', 'leader', 'ผลิต'); user('lead2', 'leader', 'ผลิต'); user('lead-qa', 'leader', 'คุณภาพ')
  user('admin1', 'admin', 'สำนักงาน'); user('admin2', 'admin', 'สำนักงาน'); user('keeper', 'storekeeper', 'คลัง'); user('off', 'leader', 'ผลิต', 0)
  db.prepare("INSERT INTO warehouses (id, code, name, is_active) VALUES ('w1', 'W1', 'คลัง 1', 1), ('w2', 'W2', 'คลัง 2', 1)").run()
  db.prepare("INSERT INTO warehouse_staff (warehouse_id, user_id) VALUES ('w1', 'keeper')").run()
  wf = createWorkflowService(db, { today: () => TODAY })
}
beforeEach(seed)

const ctx = (over = {}) => ({ requesterId: 'emp', department: 'ผลิต', warehouseId: 'w1', ...over })

describe('templates', () => {
  test('default templates exist after migration, one supervisor step each', () => {
    const list = wf.listTemplates()
    assert.deepEqual(list.map((template) => [template.appliesType, template.steps.length]).sort(), [['medicine', 1], ['ppe', 1]])
    assert.equal(wf.getTemplate('default-ppe').steps[0].approverType, 'dept_supervisor')
  })

  test('saveTemplate validates its input', () => {
    const base = { name: 'ทดสอบ', appliesType: 'ppe', steps: [step()] }
    rejects(() => wf.saveTemplate({ ...base, name: '  ' }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, appliesType: 'food' }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: Array.from({ length: 11 }, () => step()) }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ approverType: 'boss' })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ approverType: 'role', approverRef: 'employee' })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ approverType: 'user', approverRef: 'emp' })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ approverType: 'user', approverRef: 'off' })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ mode: 'most' })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ slaHours: -1 })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ escalateType: 'role', escalateRef: 'employee' })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ condition: { minTotalQty: 0 } })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, steps: [step({ condition: { categoryIds: 'x' } })] }), 'INVALID')
    rejects(() => wf.saveTemplate({ ...base, warehouseId: 'nope' }), 'INVALID')
    assert.equal(wf.listTemplates().length, 2)
  })

  test('update bumps the version and replaces the steps', () => {
    const created = wf.saveTemplate({ name: 'สองขั้น', appliesType: 'any', steps: [step(), step({ name: 'ผู้ดูแลระบบ', approverType: 'role', approverRef: 'admin' })] })
    assert.equal(created.version, 1)
    assert.deepEqual(created.steps.map((entry) => entry.position), [1, 2])
    const updated = wf.saveTemplate({ id: created.id, name: 'หนึ่งขั้น', appliesType: 'any', isActive: false, steps: [step()] })
    assert.equal(updated.version, 2)
    assert.equal(updated.steps.length, 1)
    assert.equal(updated.isActive, false)
    rejects(() => wf.saveTemplate({ id: 'missing', name: 'x', appliesType: 'any', steps: [step()] }), 'NOT_FOUND')
  })

  test('pickTemplate prefers warehouse-specific, then type, then any', () => {
    const any = wf.saveTemplate({ name: 'ทั่วไป', appliesType: 'any', steps: [step()] })
    const anyWh = wf.saveTemplate({ name: 'ทั่วไปคลัง 2', appliesType: 'any', warehouseId: 'w2', steps: [step()] })
    const ppeWh = wf.saveTemplate({ name: 'PPE คลัง 2', appliesType: 'ppe', warehouseId: 'w2', steps: [step()] })
    assert.equal(wf.pickTemplate({ type: 'ppe', warehouseId: 'w2' }).id, ppeWh.id)
    assert.equal(wf.pickTemplate({ type: 'ppe', warehouseId: 'w1' }).id, 'default-ppe')
    assert.equal(wf.pickTemplate({ type: 'medicine', warehouseId: 'w2' }).id, anyWh.id)
    wf.saveTemplate({ id: 'default-medicine', name: 'เบิกยา', appliesType: 'medicine', isActive: false, steps: [step()] })
    assert.equal(wf.pickTemplate({ type: 'medicine', warehouseId: 'w1' }).id, any.id)
    wf.saveTemplate({ id: any.id, name: 'ทั่วไป', appliesType: 'any', isActive: false, steps: [step()] })
    assert.equal(wf.pickTemplate({ type: 'medicine', warehouseId: 'w1' }), null)
  })

  test('deleteTemplate refuses when a non-final requisition uses it', () => {
    const template = wf.saveTemplate({ name: 'ลบได้', appliesType: 'any', steps: [step()] })
    db.prepare("INSERT INTO requisitions (id, number, type, requester_id, warehouse_id, template_id, template_version, status, created_at, submitted_at) VALUES ('r1', 'REQ-1', 'ppe', 'emp', 'w1', ?, 1, 'in_approval', 'x', 'x')").run(template.id)
    rejects(() => wf.deleteTemplate(template.id), 'IN_USE')
    db.prepare("UPDATE requisitions SET status = 'received' WHERE id = 'r1'").run()
    wf.deleteTemplate(template.id)
    rejects(() => wf.getTemplate(template.id), 'NOT_FOUND')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workflow_steps WHERE template_id = ?').get(template.id).n, 0)
  })
})

describe('conditions', () => {
  test('stepApplies honours minTotalQty and categoryIds', () => {
    assert.equal(wf.stepApplies({}, { totalQty: 1, categoryIds: [] }), true)
    assert.equal(wf.stepApplies({ minTotalQty: 10 }, { totalQty: 9, categoryIds: [] }), false)
    assert.equal(wf.stepApplies({ minTotalQty: 10 }, { totalQty: 10, categoryIds: [] }), true)
    assert.equal(wf.stepApplies({ categoryIds: ['c1', 'c2'] }, { totalQty: 1, categoryIds: ['c3'] }), false)
    assert.equal(wf.stepApplies({ categoryIds: ['c1', 'c2'] }, { totalQty: 1, categoryIds: ['c3', 'c2'] }), true)
    assert.equal(wf.stepApplies({ minTotalQty: 5, categoryIds: ['c1'] }, { totalQty: 5, categoryIds: ['c9'] }), false)
  })
})

describe('approver resolution', () => {
  test('dept_supervisor resolves primary, backup only when no primary is available', () => {
    wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }, { userId: 'lead2', isBackup: true }])
    assert.deepEqual(wf.resolveApprovers(step(), ctx()), { approvers: ['lead'], note: '' })
    db.prepare("UPDATE users SET is_active = 0 WHERE id = 'lead'").run()
    assert.deepEqual(wf.resolveApprovers(step(), ctx()), { approvers: ['lead2'], note: '' })
  })

  test('role, user and warehouse_staff types resolve active users only', () => {
    assert.deepEqual(wf.resolveApprovers(step({ approverType: 'role', approverRef: 'admin' }), ctx()).approvers.sort(), ['admin1', 'admin2'])
    assert.deepEqual(wf.resolveApprovers(step({ approverType: 'user', approverRef: 'lead-qa' }), ctx()).approvers, ['lead-qa'])
    assert.deepEqual(wf.resolveApprovers(step({ approverType: 'warehouse_staff' }), ctx()).approvers, ['keeper'])
    assert.deepEqual(wf.resolveApprovers(step({ approverType: 'role', approverRef: 'leader' }), ctx()).approvers.sort(), ['lead', 'lead-qa', 'lead2'])
  })

  test('the requester is removed from the approvers', () => {
    const result = wf.resolveApprovers(step({ approverType: 'role', approverRef: 'leader' }), ctx({ requesterId: 'lead' }))
    assert.deepEqual(result.approvers.sort(), ['lead-qa', 'lead2'])
    assert.equal(result.note, '')
  })

  test('requester as the sole approver is skipped, never self-approved', () => {
    wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }])
    assert.deepEqual(wf.resolveApprovers(step(), ctx({ requesterId: 'lead' })), { approvers: [], note: 'skipped_self' })
  })

  test('an unmapped department falls back to all active admins', () => {
    assert.deepEqual(wf.resolveApprovers(step(), ctx({ department: 'ไม่มีหัวหน้า' })).note, 'fallback_admin')
    assert.deepEqual(wf.resolveApprovers(step(), ctx({ department: 'ไม่มีหัวหน้า' })).approvers.sort(), ['admin1', 'admin2'])
    assert.deepEqual(wf.resolveApprovers(step(), ctx({ department: '' })).note, 'fallback_admin')
  })

  test('the requester is never an approver even in the admin fallback; sole admin means skipped_no_approver', () => {
    const asAdmin = wf.resolveApprovers(step(), ctx({ department: 'ไม่มีหัวหน้า', requesterId: 'admin1' }))
    assert.deepEqual([asAdmin.approvers, asAdmin.note], [['admin2'], 'fallback_admin'])
    db.prepare("UPDATE users SET is_active = 0 WHERE id = 'admin2'").run()
    const sole = wf.resolveApprovers(step(), ctx({ department: 'ไม่มีหัวหน้า', requesterId: 'admin1' }))
    assert.deepEqual([sole.approvers, sole.note], [[], 'skipped_no_approver'])
  })
})

describe('department supervisors', () => {
  test('can be set, replaced and listed with names; invalid users are refused', () => {
    wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }, { userId: 'lead2', isBackup: true }])
    wf.setDepartmentSupervisors('คุณภาพ', [{ userId: 'lead-qa', isBackup: false }])
    wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead2', isBackup: false }])
    const listed = Object.fromEntries(wf.listDepartmentSupervisors().map((row) => [row.department, row.entries.map((entry) => [entry.userId, entry.isBackup, entry.name])]))
    assert.deepEqual(listed['ผลิต'], [['lead2', false, 'ชื่อ lead2']])
    assert.deepEqual(listed['คุณภาพ'], [['lead-qa', false, 'ชื่อ lead-qa']])
    rejects(() => wf.setDepartmentSupervisors('ผลิต', [{ userId: 'nobody', isBackup: false }]), 'INVALID')
    rejects(() => wf.setDepartmentSupervisors('ผลิต', [{ userId: 'off', isBackup: false }]), 'INVALID')
    rejects(() => wf.setDepartmentSupervisors('  ', [{ userId: 'lead', isBackup: false }]), 'INVALID')
    wf.setDepartmentSupervisors('ผลิต', [])
    assert.equal(wf.listDepartmentSupervisors().some((row) => row.department === 'ผลิต'), false)
  })

  test('listDepartments merges directory departments with their supervisors', () => {
    wf.setDepartmentSupervisors('ผลิต', [{ userId: 'lead', isBackup: false }])
    const departments = Object.fromEntries(wf.listDepartments().map((row) => [row.department, row.entries.length]))
    assert.equal(departments['ผลิต'], 1)
    assert.equal(departments['คุณภาพ'], 0)
  })
})

describe('delegation', () => {
  test('a delegate acts for the delegator only inside the date range', () => {
    wf.addDelegation({ fromUser: 'lead', toUser: 'lead2', fromDate: '2026-11-10', toDate: '2026-11-12' })
    assert.deepEqual(wf.effectiveActors(['lead']).sort(), ['lead', 'lead2'])
    assert.deepEqual(wf.effectiveActors(['lead-qa']), ['lead-qa'])
    const later = createWorkflowService(db, { today: () => '2026-11-13' })
    assert.deepEqual(later.effectiveActors(['lead']), ['lead'])
    const before = createWorkflowService(db, { today: () => '2026-11-09' })
    assert.deepEqual(before.effectiveActors(['lead']), ['lead'])
  })

  test('addDelegation validates users, dates and self-delegation', () => {
    rejects(() => wf.addDelegation({ fromUser: 'lead', toUser: 'lead', fromDate: '2026-11-10', toDate: '2026-11-12' }), 'INVALID')
    rejects(() => wf.addDelegation({ fromUser: 'lead', toUser: 'nobody', fromDate: '2026-11-10', toDate: '2026-11-12' }), 'INVALID')
    rejects(() => wf.addDelegation({ fromUser: 'lead', toUser: 'off', fromDate: '2026-11-10', toDate: '2026-11-12' }), 'INVALID')
    rejects(() => wf.addDelegation({ fromUser: 'lead', toUser: 'lead2', fromDate: '2026-11-12', toDate: '2026-11-10' }), 'INVALID')
    rejects(() => wf.addDelegation({ fromUser: 'lead', toUser: 'lead2', fromDate: '2026-02-30', toDate: '2026-03-01' }), 'INVALID')
  })

  test('delegations can be listed per user and removed', () => {
    const one = wf.addDelegation({ fromUser: 'lead', toUser: 'lead2', fromDate: '2026-11-10', toDate: '2026-11-12' })
    wf.addDelegation({ fromUser: 'lead-qa', toUser: 'admin1', fromDate: '2026-11-10', toDate: '2026-11-12' })
    assert.equal(wf.listDelegations({ userId: 'lead' }).length, 1)
    assert.equal(wf.listDelegations().length, 2)
    wf.removeDelegation(one.id)
    assert.equal(wf.listDelegations({ userId: 'lead' }).length, 0)
    rejects(() => wf.removeDelegation('missing'), 'NOT_FOUND')
  })
})

describe('settings', () => {
  test('expire days default to 14 and validate 1..365', () => {
    assert.equal(wf.getExpireDays(), 14)
    wf.setExpireDays(30)
    assert.equal(wf.getExpireDays(), 30)
    for (const value of [0, 366, 1.5, '7', null]) rejects(() => wf.setExpireDays(value), 'INVALID')
  })
})
