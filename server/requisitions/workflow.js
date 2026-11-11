import { randomUUID } from 'node:crypto'

export class WorkflowError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

const APPROVER_TYPES = ['dept_supervisor', 'role', 'user', 'warehouse_staff']
const ROLES = ['admin', 'leader', 'storekeeper']
const MODES = ['any', 'all']
const ESCALATE_TYPES = ['none', 'role', 'user']
const TEMPLATE_TYPES = ['ppe', 'medicine', 'any']
const NON_FINAL = ['in_approval', 'returned_for_edit', 'ready_to_issue', 'partially_issued']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EXPIRE_KEY = 'requisition.expire_days'
const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const invalid = (message) => new WorkflowError('INVALID', message)

/** Templates, approver resolution (with the no-self-approval and fallback rules), department mapping and delegation. */
export function createWorkflowService(db, opts = {}) {
  const now = opts.now || (() => new Date().toISOString())
  const today = opts.today || bangkokToday

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }

  const activeUser = (id) => db.prepare('SELECT id, role, display_name FROM users WHERE id = ? AND is_active = 1').get(id)

  // ---- templates ----
  function normalizeStep(raw, index) {
    const label = `ขั้นที่ ${index + 1}`
    const name = String(raw?.name ?? '').trim().slice(0, 80)
    if (!name) throw invalid(`${label}: กรุณาระบุชื่อขั้นตอน`)
    const approverType = String(raw?.approverType ?? '')
    if (!APPROVER_TYPES.includes(approverType)) throw invalid(`${label}: ประเภทผู้อนุมัติไม่ถูกต้อง`)
    let approverRef = ''
    if (approverType === 'role') {
      approverRef = String(raw.approverRef ?? '')
      if (!ROLES.includes(approverRef)) throw invalid(`${label}: บทบาทผู้อนุมัติไม่ถูกต้อง`)
    } else if (approverType === 'user') {
      approverRef = String(raw.approverRef ?? '')
      const user = activeUser(approverRef)
      if (!user || !ROLES.includes(user.role)) throw invalid(`${label}: เลือกได้เฉพาะแอดมิน หัวหน้างาน หรือเจ้าหน้าที่คลังที่เปิดใช้งาน`)
    }
    const mode = String(raw?.mode ?? 'any')
    if (!MODES.includes(mode)) throw invalid(`${label}: รูปแบบการอนุมัติไม่ถูกต้อง`)
    const slaHours = raw?.slaHours === undefined || raw.slaHours === null ? 0 : raw.slaHours
    if (!Number.isInteger(slaHours) || slaHours < 0 || slaHours > 720) throw invalid(`${label}: เวลาตอบสนองต้องเป็นจำนวนเต็ม 0–720 ชั่วโมง`)
    const escalateType = String(raw?.escalateType ?? 'none')
    if (!ESCALATE_TYPES.includes(escalateType)) throw invalid(`${label}: ประเภทการส่งต่อไม่ถูกต้อง`)
    let escalateRef = ''
    if (escalateType === 'role') {
      escalateRef = String(raw.escalateRef ?? '')
      if (!ROLES.includes(escalateRef)) throw invalid(`${label}: บทบาทที่ส่งต่อไม่ถูกต้อง`)
    } else if (escalateType === 'user') {
      escalateRef = String(raw.escalateRef ?? '')
      const user = activeUser(escalateRef)
      if (!user || !ROLES.includes(user.role)) throw invalid(`${label}: ผู้รับเรื่องที่ส่งต่อไม่ถูกต้อง`)
    }
    const condition = raw?.condition ?? {}
    if (typeof condition !== 'object' || Array.isArray(condition)) throw invalid(`${label}: เงื่อนไขไม่ถูกต้อง`)
    const cleanCondition = {}
    if (condition.minTotalQty !== undefined && condition.minTotalQty !== null && condition.minTotalQty !== '') {
      if (!Number.isInteger(condition.minTotalQty) || condition.minTotalQty < 1 || condition.minTotalQty > 1_000_000_000) throw invalid(`${label}: จำนวนขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 1`)
      cleanCondition.minTotalQty = condition.minTotalQty
    }
    if (condition.categoryIds !== undefined) {
      if (!Array.isArray(condition.categoryIds) || condition.categoryIds.length > 50 || condition.categoryIds.some((id) => typeof id !== 'string')) throw invalid(`${label}: หมวดสินค้าในเงื่อนไขไม่ถูกต้อง`)
      if (condition.categoryIds.length) cleanCondition.categoryIds = [...new Set(condition.categoryIds)]
    }
    return { name, approverType, approverRef, mode, slaHours, escalateType, escalateRef, allowEditQty: raw?.allowEditQty ? 1 : 0, conditionJson: JSON.stringify(cleanCondition) }
  }

  function stepDto(row) {
    return {
      position: row.position, name: row.name, approverType: row.approver_type, approverRef: row.approver_ref, condition: JSON.parse(row.condition_json || '{}'),
      mode: row.mode, slaHours: row.sla_hours, escalateType: row.escalate_type, escalateRef: row.escalate_ref, allowEditQty: Boolean(row.allow_edit_qty),
    }
  }

  function templateDto(row) {
    const steps = db.prepare('SELECT * FROM workflow_steps WHERE template_id = ? ORDER BY position').all(row.id).map(stepDto)
    const marks = NON_FINAL.map(() => '?').join(',')
    const inFlight = db.prepare(`SELECT COUNT(*) AS n FROM requisitions WHERE template_id = ? AND status IN (${marks})`).get(row.id, ...NON_FINAL).n
    return { id: row.id, name: row.name, appliesType: row.applies_type, warehouseId: row.warehouse_id, version: row.version, isActive: Boolean(row.is_active), steps, inFlight }
  }

  function getTemplate(id) {
    const row = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id)
    if (!row) throw new WorkflowError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนอนุมัติ')
    return templateDto(row)
  }

  const listTemplates = () => db.prepare('SELECT * FROM workflow_templates ORDER BY name COLLATE NOCASE').all().map(templateDto)

  function saveTemplate(input) {
    const name = String(input?.name ?? '').trim().slice(0, 80)
    if (!name) throw invalid('กรุณาระบุชื่อแม่แบบ')
    const appliesType = String(input?.appliesType ?? '')
    if (!TEMPLATE_TYPES.includes(appliesType)) throw invalid('ประเภทที่ใช้กับแม่แบบไม่ถูกต้อง')
    const warehouseId = String(input?.warehouseId ?? '')
    if (warehouseId && !db.prepare('SELECT id FROM warehouses WHERE id = ?').get(warehouseId)) throw invalid('ไม่พบคลังที่ระบุ')
    if (!Array.isArray(input?.steps) || input.steps.length < 1 || input.steps.length > 10) throw invalid('แม่แบบต้องมี 1–10 ขั้นตอน')
    const steps = input.steps.map(normalizeStep)
    const isActive = input.isActive === undefined ? 1 : input.isActive ? 1 : 0
    return tx(() => {
      let id = input.id
      if (id) {
        const existing = db.prepare('SELECT version FROM workflow_templates WHERE id = ?').get(id)
        if (!existing) throw new WorkflowError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนอนุมัติ')
        db.prepare('UPDATE workflow_templates SET name = ?, applies_type = ?, warehouse_id = ?, is_active = ?, version = version + 1 WHERE id = ?').run(name, appliesType, warehouseId, isActive, id)
        db.prepare('DELETE FROM workflow_steps WHERE template_id = ?').run(id)
      } else {
        id = randomUUID()
        db.prepare('INSERT INTO workflow_templates (id, name, applies_type, warehouse_id, version, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)').run(id, name, appliesType, warehouseId, isActive, now())
      }
      const insert = db.prepare(`INSERT INTO workflow_steps (template_id, position, name, approver_type, approver_ref, condition_json, mode, sla_hours, escalate_type, escalate_ref, allow_edit_qty)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      steps.forEach((step, index) => insert.run(id, index + 1, step.name, step.approverType, step.approverRef, step.conditionJson, step.mode, step.slaHours, step.escalateType, step.escalateRef, step.allowEditQty))
      return getTemplate(id)
    })
  }

  function deleteTemplate(id) {
    getTemplate(id)
    const marks = NON_FINAL.map(() => '?').join(',')
    if (db.prepare(`SELECT 1 FROM requisitions WHERE template_id = ? AND status IN (${marks}) LIMIT 1`).get(id, ...NON_FINAL)) throw new WorkflowError('IN_USE', 'มีใบเบิกที่กำลังดำเนินการตามแม่แบบนี้ ลบไม่ได้ กรุณาปิดใช้งานแทน')
    tx(() => {
      db.prepare('DELETE FROM workflow_steps WHERE template_id = ?').run(id)
      db.prepare('DELETE FROM workflow_templates WHERE id = ?').run(id)
    })
  }

  /** Warehouse-specific beats type-specific beats "any"; inactive templates are ignored. */
  function pickTemplate({ type, warehouseId }) {
    const rows = db.prepare('SELECT * FROM workflow_templates WHERE is_active = 1 AND applies_type IN (?, \'any\') AND warehouse_id IN (?, \'\')').all(type, warehouseId || '')
    const rank = (row) => (row.warehouse_id ? 0 : 2) + (row.applies_type === type ? 0 : 1)
    rows.sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at))
    return rows[0] ? templateDto(rows[0]) : null
  }

  function stepApplies(condition, { totalQty, categoryIds }) {
    if (condition?.minTotalQty && totalQty < condition.minTotalQty) return false
    if (condition?.categoryIds?.length && !condition.categoryIds.some((id) => categoryIds.includes(id))) return false
    return true
  }

  // ---- approver resolution ----
  const activeAdmins = () => db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id").all().map((row) => row.id)

  function baseApprovers(step, { department, warehouseId }) {
    if (step.approverType === 'role') return db.prepare('SELECT id FROM users WHERE role = ? AND is_active = 1 ORDER BY id').all(step.approverRef).map((row) => row.id)
    if (step.approverType === 'user') return activeUser(step.approverRef) ? [step.approverRef] : []
    if (step.approverType === 'warehouse_staff') {
      return db.prepare('SELECT u.id FROM warehouse_staff s JOIN users u ON u.id = s.user_id WHERE s.warehouse_id = ? AND u.is_active = 1 ORDER BY u.id').all(warehouseId).map((row) => row.id)
    }
    const dept = String(department ?? '').trim()
    if (!dept) return []
    const rows = db.prepare('SELECT d.user_id, d.is_backup FROM department_supervisors d JOIN users u ON u.id = d.user_id WHERE d.department = ? AND u.is_active = 1 ORDER BY d.user_id').all(dept)
    const primary = rows.filter((row) => !row.is_backup)
    return (primary.length ? primary : rows).map((row) => row.user_id)
  }

  /**
   * Who must approve this step. The requester is never an approver:
   * only approver was the requester → skipped_self; nobody configured/available → all active admins (fallback_admin), or skipped_no_approver if none remain.
   */
  function resolveApprovers(step, { requesterId, department, warehouseId }) {
    const base = baseApprovers(step, { department, warehouseId })
    if (base.length === 0) {
      const admins = activeAdmins().filter((id) => id !== requesterId)
      return admins.length ? { approvers: admins, note: 'fallback_admin' } : { approvers: [], note: 'skipped_no_approver' }
    }
    const approvers = base.filter((id) => id !== requesterId)
    return approvers.length ? { approvers, note: '' } : { approvers: [], note: 'skipped_self' }
  }

  // ---- department supervisors ----
  function setDepartmentSupervisors(department, entries) {
    const dept = String(department ?? '').trim()
    if (!dept) throw invalid('กรุณาระบุแผนก')
    if (!Array.isArray(entries) || entries.length > 10) throw invalid('กำหนดหัวหน้าได้ไม่เกิน 10 คน')
    const unique = new Map()
    for (const entry of entries) {
      const user = activeUser(String(entry?.userId ?? ''))
      if (!user) throw invalid('เลือกได้เฉพาะผู้ใช้ที่เปิดใช้งาน')
      unique.set(user.id, entry?.isBackup ? 1 : 0)
    }
    tx(() => {
      db.prepare('DELETE FROM department_supervisors WHERE department = ?').run(dept)
      for (const [userId, isBackup] of unique) db.prepare('INSERT INTO department_supervisors (department, user_id, is_backup) VALUES (?, ?, ?)').run(dept, userId, isBackup)
    })
  }

  function listDepartmentSupervisors() {
    const rows = db.prepare(`SELECT d.department, d.user_id, d.is_backup, u.display_name FROM department_supervisors d LEFT JOIN users u ON u.id = d.user_id
                             ORDER BY d.department COLLATE NOCASE, d.is_backup, u.display_name COLLATE NOCASE`).all()
    const map = new Map()
    for (const row of rows) {
      if (!map.has(row.department)) map.set(row.department, [])
      map.get(row.department).push({ userId: row.user_id, name: row.display_name || '', isBackup: Boolean(row.is_backup) })
    }
    return [...map].map(([department, entries]) => ({ department, entries }))
  }

  function listDepartments() {
    const mapped = new Map(listDepartmentSupervisors().map((row) => [row.department, row.entries]))
    const names = db.prepare("SELECT DISTINCT CASE WHEN department_th != '' THEN department_th ELSE department_en END AS name FROM employee_directory").all().map((row) => row.name).filter(Boolean)
    for (const name of mapped.keys()) if (!names.includes(name)) names.push(name)
    return names.sort((a, b) => a.localeCompare(b, 'th')).map((department) => ({ department, entries: mapped.get(department) ?? [] }))
  }

  // ---- delegation ----
  function addDelegation({ fromUser, toUser, fromDate, toDate }) {
    if (!activeUser(String(fromUser ?? ''))) throw invalid('ไม่พบผู้มอบสิทธิ์')
    if (!activeUser(String(toUser ?? ''))) throw invalid('เลือกผู้รับมอบสิทธิ์ที่เปิดใช้งาน')
    if (fromUser === toUser) throw invalid('มอบสิทธิ์ให้ตัวเองไม่ได้')
    if (!isCalendarDate(fromDate) || !isCalendarDate(toDate) || fromDate > toDate) throw invalid('ช่วงวันที่ไม่ถูกต้อง')
    const id = randomUUID()
    db.prepare('INSERT INTO delegations (id, from_user, to_user, from_date, to_date, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, fromUser, toUser, fromDate, toDate, now())
    return { id, fromUser, toUser, fromDate, toDate }
  }

  function listDelegations({ userId } = {}) {
    const rows = db.prepare(`SELECT g.*, f.display_name AS from_name, t.display_name AS to_name FROM delegations g
                             LEFT JOIN users f ON f.id = g.from_user LEFT JOIN users t ON t.id = g.to_user
                             ${userId ? 'WHERE g.from_user = ? OR g.to_user = ?' : ''} ORDER BY g.from_date DESC, g.created_at DESC`).all(...(userId ? [userId, userId] : []))
    return rows.map((row) => ({ id: row.id, fromUser: row.from_user, fromName: row.from_name || '', toUser: row.to_user, toName: row.to_name || '', fromDate: row.from_date, toDate: row.to_date }))
  }

  function removeDelegation(id) {
    if (db.prepare('DELETE FROM delegations WHERE id = ?').run(id).changes === 0) throw new WorkflowError('NOT_FOUND', 'ไม่พบการมอบสิทธิ์')
  }

  /** Approvers plus anyone they have delegated to today. */
  function effectiveActors(approverIds) {
    if (!approverIds.length) return []
    const marks = approverIds.map(() => '?').join(',')
    const delegates = db.prepare(`SELECT DISTINCT g.to_user FROM delegations g JOIN users u ON u.id = g.to_user AND u.is_active = 1
                                  WHERE g.from_user IN (${marks}) AND g.from_date <= ? AND g.to_date >= ?`).all(...approverIds, today(), today()).map((row) => row.to_user)
    return [...new Set([...approverIds, ...delegates])]
  }

  // ---- settings ----
  const getExpireDays = () => {
    const value = Number(db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(EXPIRE_KEY)?.setting_value)
    return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 14
  }
  function setExpireDays(days) {
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) throw invalid('จำนวนวันต้องเป็นจำนวนเต็ม 1–365')
    db.prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value').run(EXPIRE_KEY, String(days))
  }

  return {
    saveTemplate, getTemplate, listTemplates, deleteTemplate, pickTemplate, stepApplies, resolveApprovers,
    setDepartmentSupervisors, listDepartmentSupervisors, listDepartments, addDelegation, listDelegations, removeDelegation, effectiveActors,
    getExpireDays, setExpireDays,
  }
}
