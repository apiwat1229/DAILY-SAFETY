import { randomUUID } from 'node:crypto'
import { StockError } from '../inventory/stock.js'

export class RequisitionError extends Error {
  constructor(code, message, details) {
    super(message || code)
    this.code = code
    this.details = details
  }
}

const TYPES = ['ppe', 'medicine']
const MAX_QTY = 1_000_000_000
const ACTIVE_ISSUE = ['ready_to_issue', 'partially_issued']
const RETURNABLE = ['issued', 'partially_issued', 'closed', 'received']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())

const invalid = (message) => new RequisitionError('INVALID', message)
const forbidden = (message = 'ไม่มีสิทธิ์ดำเนินการนี้') => new RequisitionError('FORBIDDEN', message)
const badState = (message) => new RequisitionError('BAD_STATE', message)
const isWhole = (value, min, max = MAX_QTY) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const imageUrl = (itemId, image) => (image ? `/api/inventory/items/${itemId}/image?v=${image.slice(0, 8)}` : null)

/** Cart, requisition lifecycle (approval, reservation, issue, return, receipt) and the views around it. */
export function createRequisitionService(db, { stock, workflow, now = () => new Date().toISOString(), today = bangkokToday }) {
  const run = (fn) => stock.transaction(fn)

  /** Stock failures surface as requisition errors. */
  function guardStock(fn) {
    try { return fn() } catch (error) {
      if (!(error instanceof StockError)) throw error
      if (error.code === 'INSUFFICIENT_STOCK') throw new RequisitionError('SHORTAGE', error.message, [])
      throw invalid(error.message)
    }
  }

  const userRow = (id) => db.prepare('SELECT id, role, display_name FROM users WHERE id = ? AND is_active = 1').get(id)
  const userName = (id) => db.prepare('SELECT display_name FROM users WHERE id = ?').get(id)?.display_name || ''
  const isStaffOf = (userId, warehouseId) => Boolean(db.prepare('SELECT 1 FROM warehouse_staff WHERE warehouse_id = ? AND user_id = ?').get(warehouseId, userId))

  function addEvent(requisitionId, step, actorId, action, comment = '') {
    db.prepare('INSERT INTO requisition_events (id, requisition_id, step, actor_id, action, comment, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), requisitionId, step, actorId, action, comment, now())
  }

  /** Stock that can still be reserved (not expired, not already held) across active warehouses, per variant. */
  function availabilityByVariant() {
    const rows = db.prepare(`SELECT b.variant_id, SUM(b.on_hand - b.reserved) AS n FROM stock_balances b
                             JOIN stock_lots l ON l.id = b.lot_id JOIN warehouses w ON w.id = b.warehouse_id AND w.is_active = 1
                             WHERE b.on_hand - b.reserved > 0 AND (l.expiry_date = '' OR l.expiry_date >= ?) GROUP BY b.variant_id`).all(today())
    return new Map(rows.map((row) => [row.variant_id, row.n]))
  }

  // ---- cart ----
  function variantInfo(variantId) {
    return db.prepare(`SELECT v.id AS variant_id, v.label, v.is_active AS variant_active, i.id AS item_id, i.sku, i.name, i.type, i.unit, i.image, i.is_active AS item_active, i.category_id
                       FROM item_variants v JOIN items i ON i.id = v.item_id WHERE v.id = ?`).get(variantId)
  }

  function assertType(type) {
    if (!TYPES.includes(type)) throw invalid('ประเภทสินค้าไม่ถูกต้อง')
  }

  function cartRow(userId, type) {
    return db.prepare('SELECT id FROM carts WHERE user_id = ? AND type = ?').get(userId, type)
  }

  function getCart(userId, type) {
    assertType(type)
    const cart = cartRow(userId, type)
    if (!cart) return { type, lines: [] }
    const availability = availabilityByVariant()
    const rows = db.prepare('SELECT variant_id, qty FROM cart_lines WHERE cart_id = ? ORDER BY rowid').all(cart.id)
    const lines = rows.map((row) => {
      const info = variantInfo(row.variant_id)
      return {
        variantId: row.variant_id, qty: row.qty, itemId: info.item_id, sku: info.sku, name: info.name, variantLabel: info.label, unit: info.unit,
        imageUrl: imageUrl(info.item_id, info.image), available: availability.get(row.variant_id) ?? 0, active: Boolean(info.variant_active && info.item_active),
      }
    })
    return { type, lines }
  }

  function setCartLine(userId, type, variantId, qty) {
    assertType(type)
    if (!isWhole(qty, 0)) throw invalid('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0')
    const info = variantInfo(variantId)
    if (!info || !info.variant_active || !info.item_active) throw invalid('ไม่พบสินค้านี้หรือสินค้าถูกปิดใช้งาน')
    if (info.type !== type) throw invalid('สินค้านี้ไม่ใช่ประเภทเดียวกับตะกร้า')
    run(() => {
      let cart = cartRow(userId, type)
      if (!cart) {
        if (qty === 0) return
        cart = { id: randomUUID() }
        db.prepare('INSERT INTO carts (id, user_id, type, updated_at) VALUES (?, ?, ?, ?)').run(cart.id, userId, type, now())
      } else db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(now(), cart.id)
      if (qty === 0) db.prepare('DELETE FROM cart_lines WHERE cart_id = ? AND variant_id = ?').run(cart.id, variantId)
      else {
        db.prepare('INSERT OR IGNORE INTO cart_lines (cart_id, variant_id, qty) VALUES (?, ?, 1)').run(cart.id, variantId)
        db.prepare('UPDATE cart_lines SET qty = ? WHERE cart_id = ? AND variant_id = ?').run(qty, cart.id, variantId)
      }
    })
    return getCart(userId, type)
  }

  function clearCart(userId, type) {
    assertType(type)
    run(() => {
      const cart = cartRow(userId, type)
      if (!cart) return
      db.prepare('DELETE FROM cart_lines WHERE cart_id = ?').run(cart.id)
      db.prepare('DELETE FROM carts WHERE id = ?').run(cart.id)
    })
  }

  function catalog({ type, q } = {}) {
    const where = ['i.is_active = 1']
    const params = []
    if (TYPES.includes(type)) { where.push('i.type = ?'); params.push(type) }
    const term = String(q ?? '').trim().slice(0, 60)
    if (term) {
      const like = `%${term.replace(/[!%_]/g, (char) => `!${char}`)}%`
      where.push("(i.name LIKE ? ESCAPE '!' OR i.sku LIKE ? ESCAPE '!')")
      params.push(like, like)
    }
    const items = db.prepare(`SELECT i.id, i.sku, i.name, i.type, i.unit, i.image, i.category_id, COALESCE(c.name, '') AS category_name FROM items i
                              LEFT JOIN item_categories c ON c.id = i.category_id WHERE ${where.join(' AND ')} ORDER BY i.type, i.name COLLATE NOCASE`).all(...params)
    const availability = availabilityByVariant()
    return items.map((item) => ({
      itemId: item.id, sku: item.sku, name: item.name, type: item.type, unit: item.unit, categoryId: item.category_id, categoryName: item.category_name, imageUrl: imageUrl(item.id, item.image),
      variants: db.prepare('SELECT id, label FROM item_variants WHERE item_id = ? AND is_active = 1 ORDER BY rowid').all(item.id).map((variant) => ({ variantId: variant.id, label: variant.label, available: availability.get(variant.id) ?? 0 })),
    })).filter((item) => item.variants.length > 0)
  }

  // ---- loading ----
  function load(id) {
    const row = db.prepare('SELECT * FROM requisitions WHERE id = ?').get(id)
    if (!row) throw new RequisitionError('NOT_FOUND', 'ไม่พบใบเบิก')
    return row
  }

  const activeStep = (id) => db.prepare("SELECT * FROM requisition_steps WHERE requisition_id = ? AND status = 'active'").get(id)

  function lineRows(id) {
    return db.prepare(`SELECT l.*, i.id AS item_id, i.sku, i.name, i.unit, i.image, i.category_id, v.label FROM requisition_lines l
                       JOIN item_variants v ON v.id = l.variant_id JOIN items i ON i.id = v.item_id WHERE l.requisition_id = ? ORDER BY l.rowid`).all(id)
  }

  function get(id) {
    const req = load(id)
    const warehouse = db.prepare('SELECT name FROM warehouses WHERE id = ?').get(req.warehouse_id)
    const stamp = now()
    const steps = db.prepare('SELECT * FROM requisition_steps WHERE requisition_id = ? ORDER BY position').all(id).map((step) => ({
      position: step.position, name: step.name, approverType: step.approver_type, mode: step.mode, status: step.status, allowEditQty: Boolean(step.allow_edit_qty),
      approvers: JSON.parse(step.approvers_json).map((userId) => ({ userId, name: userName(userId) })), approvals: JSON.parse(step.approvals_json),
      dueAt: step.due_at, overdue: step.status === 'active' && Boolean(step.due_at) && step.due_at < stamp, escalated: Boolean(step.escalated), slaHours: step.sla_hours,
    }))
    const events = db.prepare('SELECT * FROM requisition_events WHERE requisition_id = ? ORDER BY at, rowid').all(id).map((event) => ({
      id: event.id, step: event.step, actorId: event.actor_id, actorName: event.actor_id ? userName(event.actor_id) : '', action: event.action, comment: event.comment, at: event.at,
    }))
    const photos = db.prepare('SELECT id, original_name FROM requisition_photos WHERE requisition_id = ? ORDER BY uploaded_at, rowid').all(id).map((photo) => ({
      id: photo.id, originalName: photo.original_name, url: `/api/requisitions/photos/${photo.id}`, thumbUrl: `/api/requisitions/photos/${photo.id}?size=thumb`,
    }))
    return {
      id: req.id, number: req.number, type: req.type, status: req.status, requesterId: req.requester_id, requesterName: userName(req.requester_id), department: req.department,
      warehouseId: req.warehouse_id, warehouseName: warehouse?.name || '', reason: req.reason, neededBy: req.needed_by, currentStep: req.current_step,
      createdAt: req.created_at, submittedAt: req.submitted_at, approvedAt: req.approved_at,
      lines: lineRows(id).map((line) => ({
        id: line.id, variantId: line.variant_id, itemId: line.item_id, sku: line.sku, name: line.name, variantLabel: line.label, unit: line.unit, imageUrl: imageUrl(line.item_id, line.image),
        qtyRequested: line.qty_requested, qtyApproved: line.qty_approved, qtyIssued: line.qty_issued, qtyReturned: line.qty_returned, note: line.note,
      })),
      steps, events, photos,
    }
  }

  function summary(req) {
    const totals = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(qty_requested), 0) AS qty FROM requisition_lines WHERE requisition_id = ?').get(req.id)
    const step = activeStep(req.id)
    return {
      id: req.id, number: req.number, type: req.type, status: req.status, requesterId: req.requester_id, requesterName: userName(req.requester_id), department: req.department,
      warehouseId: req.warehouse_id, warehouseName: db.prepare('SELECT name FROM warehouses WHERE id = ?').get(req.warehouse_id)?.name || '',
      reason: req.reason, neededBy: req.needed_by, createdAt: req.created_at, submittedAt: req.submitted_at, approvedAt: req.approved_at,
      lineCount: totals.n, totalQty: totals.qty, stepName: step?.name || '', dueAt: step?.due_at || '', overdue: Boolean(step && step.due_at && step.due_at < now()),
    }
  }

  // ---- workflow progression ----
  function departmentOf(userId) {
    const row = db.prepare(`SELECT CASE WHEN d.department_th != '' THEN d.department_th ELSE d.department_en END AS department FROM users u
                            JOIN employee_directory d ON UPPER(TRIM(d.employee_code)) = UPPER(TRIM(u.employee_code)) WHERE u.id = ?`).get(userId)
    return row?.department || ''
  }

  function nextNumber() {
    const year = Number(today().slice(0, 4)) + 543
    db.prepare('INSERT OR IGNORE INTO requisition_counters (year, last) VALUES (?, 0)').run(year)
    db.prepare('UPDATE requisition_counters SET last = last + 1 WHERE year = ?').run(year)
    const last = db.prepare('SELECT last FROM requisition_counters WHERE year = ?').get(year).last
    return `REQ-${year}-${String(last).padStart(5, '0')}`
  }

  /** Reserves every approved line or throws SHORTAGE (the surrounding transaction rolls the whole approval back). */
  function finalApprove(req) {
    const lines = lineRows(req.id).filter((line) => line.qty_approved > 0)
    const short = []
    for (const line of lines) {
      const available = stock.availableToReserve({ variantId: line.variant_id, warehouseId: req.warehouse_id })
      if (available < line.qty_approved) short.push({ variantId: line.variant_id, name: `${line.name}${line.label ? ` ${line.label}` : ''}`, short: line.qty_approved - available })
    }
    if (short.length) throw new RequisitionError('SHORTAGE', `สต็อกไม่พอ: ${short.map((entry) => `${entry.name} ขาด ${entry.short}`).join(', ')}`, short)
    for (const line of lines) guardStock(() => stock.reserve({ variantId: line.variant_id, warehouseId: req.warehouse_id, qty: line.qty_approved, refType: 'requisition', refId: req.id }))
    db.prepare("UPDATE requisitions SET status = 'ready_to_issue', approved_at = ?, current_step = 0 WHERE id = ?").run(now(), req.id)
    addEvent(req.id, 0, '', 'approved_all', 'อนุมัติครบทุกขั้นตอน และจองสต็อกแล้ว')
  }

  /** Activates the first step at or after `fromPosition` that applies; when none is left the requisition is fully approved. */
  function advance(req, fromPosition) {
    const steps = db.prepare('SELECT * FROM requisition_steps WHERE requisition_id = ? AND position >= ? ORDER BY position').all(req.id, fromPosition)
    const lines = lineRows(req.id).filter((line) => line.qty_approved > 0)
    const context = { totalQty: lines.reduce((sum, line) => sum + line.qty_approved, 0), categoryIds: [...new Set(lines.map((line) => line.category_id))] }
    for (const step of steps) {
      const skip = (comment) => {
        db.prepare("UPDATE requisition_steps SET status = 'skipped', resolved_at = ? WHERE requisition_id = ? AND position = ?").run(now(), req.id, step.position)
        addEvent(req.id, step.position, '', 'step_skipped', comment)
      }
      if (!workflow.stepApplies(JSON.parse(step.condition_json || '{}'), context)) { skip('เงื่อนไขของขั้นตอนไม่ตรง'); continue }
      const resolved = workflow.resolveApprovers({ approverType: step.approver_type, approverRef: step.approver_ref }, { requesterId: req.requester_id, department: req.department, warehouseId: req.warehouse_id })
      if (resolved.note === 'skipped_self' || resolved.note === 'skipped_no_approver') { skip(resolved.note); continue }
      if (resolved.note === 'fallback_admin') addEvent(req.id, step.position, '', 'fallback_admin', 'ไม่พบผู้อนุมัติตามที่ตั้งไว้ ส่งให้ผู้ดูแลระบบ')
      const due = step.sla_hours > 0 ? new Date(Date.parse(now()) + step.sla_hours * 3_600_000).toISOString() : ''
      db.prepare("UPDATE requisition_steps SET status = 'active', approvers_json = ?, approvals_json = '[]', due_at = ?, escalated = 0 WHERE requisition_id = ? AND position = ?").run(JSON.stringify(resolved.approvers), due, req.id, step.position)
      db.prepare("UPDATE requisitions SET status = 'in_approval', current_step = ? WHERE id = ?").run(step.position, req.id)
      return
    }
    finalApprove(req)
  }

  // ---- checkout helpers ----
  /** Active warehouses with how many cart lines each could cover right now, best coverage first. */
  function warehouseOptions(userId, type) {
    assertType(type)
    const lines = getCart(userId, type).lines
    const rows = db.prepare('SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY code COLLATE NOCASE').all()
    return rows
      .map((row) => ({ id: row.id, code: row.code, name: row.name, total: lines.length, covered: lines.filter((line) => stock.availableToReserve({ variantId: line.variantId, warehouseId: row.id }) >= line.qty).length }))
      .sort((a, b) => b.covered - a.covered)
  }

  /** The approval route this cart would take (read-only version of what checkout snapshots). */
  function previewRoute({ userId, type, warehouseId }) {
    assertType(type)
    const warehouse = db.prepare('SELECT id, is_active FROM warehouses WHERE id = ?').get(String(warehouseId ?? ''))
    if (!warehouse || !warehouse.is_active) throw invalid('กรุณาเลือกคลังที่เปิดใช้งาน')
    const template = workflow.pickTemplate({ type, warehouseId: warehouse.id })
    const lines = getCart(userId, type).lines
    if (!template || !lines.length) return { templateName: template?.name ?? '', steps: [] }
    const categoryIds = [...new Set(lines.map((line) => variantInfo(line.variantId).category_id))]
    const totalQty = lines.reduce((sum, line) => sum + line.qty, 0)
    const department = departmentOf(userId)
    return {
      templateName: template.name,
      steps: template.steps.map((step) => {
        const resolved = workflow.resolveApprovers(step, { requesterId: userId, department, warehouseId: warehouse.id })
        return {
          position: step.position, name: step.name, approverType: step.approverType, mode: step.mode, applies: workflow.stepApplies(step.condition, { totalQty, categoryIds }),
          note: resolved.note, approvers: resolved.approvers.map((id) => ({ userId: id, name: userName(id) })),
        }
      }),
    }
  }

  // ---- checkout ----
  function checkout({ userId, type, warehouseId, reason, neededBy = '' }) {
    assertType(type)
    const text = String(reason ?? '').trim().slice(0, 500)
    if (!text) throw invalid('กรุณาระบุเหตุผลการเบิก')
    const warehouse = db.prepare('SELECT id, is_active FROM warehouses WHERE id = ?').get(String(warehouseId ?? ''))
    if (!warehouse || !warehouse.is_active) throw invalid('กรุณาเลือกคลังที่เปิดใช้งาน')
    const needed = String(neededBy ?? '')
    if (needed && (!isCalendarDate(needed) || needed < today())) throw invalid('วันที่ต้องการต้องไม่ใช่วันที่ผ่านมาแล้ว')
    return run(() => {
      const cart = getCart(userId, type)
      if (!cart.lines.length) throw invalid('ตะกร้าว่าง')
      const inactive = cart.lines.find((line) => !line.active)
      if (inactive) throw invalid(`${inactive.name} ถูกปิดใช้งานแล้ว กรุณานำออกจากตะกร้า`)
      const template = workflow.pickTemplate({ type, warehouseId: warehouse.id })
      if (!template) throw invalid('ยังไม่มีแม่แบบขั้นตอนอนุมัติสำหรับการเบิกนี้ กรุณาติดต่อผู้ดูแลระบบ')
      const id = randomUUID()
      const stamp = now()
      db.prepare(`INSERT INTO requisitions (id, number, type, requester_id, department, warehouse_id, template_id, template_version, status, reason, needed_by, current_step, created_at, submitted_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_approval', ?, ?, 0, ?, ?)`).run(id, nextNumber(), type, userId, departmentOf(userId), warehouse.id, template.id, template.version, text, needed, stamp, stamp)
      for (const line of cart.lines) db.prepare('INSERT INTO requisition_lines (id, requisition_id, variant_id, qty_requested, qty_approved) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), id, line.variantId, line.qty, line.qty)
      for (const step of template.steps) {
        db.prepare(`INSERT INTO requisition_steps (requisition_id, position, name, approver_type, approver_ref, condition_json, mode, sla_hours, escalate_type, escalate_ref, allow_edit_qty)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, step.position, step.name, step.approverType, step.approverRef, JSON.stringify(step.condition), step.mode, step.slaHours, step.escalateType, step.escalateRef, step.allowEditQty ? 1 : 0)
      }
      addEvent(id, 0, userId, 'submitted', text)
      clearCart(userId, type)
      advance(load(id), 1)
      return { id }
    })
  }

  // ---- approval actions ----
  /** Who the actor stands in for on the active step. Requesters never approve their own request, admins may act for anyone. */
  function authorize(req, step, userId) {
    const user = userRow(userId)
    if (!user || req.requester_id === userId) throw forbidden('ไม่มีสิทธิ์อนุมัติใบเบิกนี้')
    const approvers = JSON.parse(step.approvers_json)
    if (approvers.includes(userId)) return { user, satisfies: [userId] }
    const represented = approvers.filter((approver) => workflow.effectiveActors([approver]).includes(userId))
    if (represented.length) return { user, satisfies: represented }
    if (user.role === 'admin') return { user, satisfies: approvers }
    throw forbidden('คุณไม่ใช่ผู้อนุมัติในขั้นตอนนี้')
  }

  function applyQuantityChanges(req, step, user, lines, comment) {
    if (!(step.allow_edit_qty || user.role === 'admin')) throw forbidden('ขั้นตอนนี้ไม่อนุญาตให้ปรับจำนวน')
    if (!String(comment ?? '').trim()) throw invalid('กรุณาระบุเหตุผลที่ปรับจำนวน')
    const current = new Map(lineRows(req.id).map((line) => [line.id, line]))
    const changes = []
    for (const entry of lines) {
      const line = current.get(entry?.lineId)
      if (!line) throw invalid('ไม่พบรายการสินค้าในใบเบิก')
      if (!isWhole(entry.qty, 0, line.qty_requested)) throw invalid('จำนวนที่อนุมัติต้องเป็นจำนวนเต็ม ไม่เกินจำนวนที่ขอ')
      changes.push({ line, qty: entry.qty })
    }
    const after = new Map([...current].map(([id, line]) => [id, line.qty_approved]))
    for (const change of changes) after.set(change.line.id, change.qty)
    if (![...after.values()].some((qty) => qty > 0)) throw invalid('ต้องอนุมัติอย่างน้อย 1 รายการ หากไม่อนุมัติทั้งหมดให้ใช้การปฏิเสธ')
    for (const change of changes) {
      db.prepare('UPDATE requisition_lines SET qty_approved = ? WHERE id = ?').run(change.qty, change.line.id)
      addEvent(req.id, step.position, '', 'qty_changed', `${change.line.name}: ${change.line.qty_approved} → ${change.qty}`)
    }
  }

  function approve({ id, userId, comment = '', lines }) {
    return run(() => {
      const req = load(id)
      if (req.status !== 'in_approval') throw badState('ใบเบิกนี้ไม่ได้อยู่ระหว่างรออนุมัติ')
      const step = activeStep(id)
      if (!step) throw badState('ไม่พบขั้นตอนที่รออนุมัติ')
      const { user, satisfies } = authorize(req, step, userId)
      const approvals = JSON.parse(step.approvals_json)
      if (satisfies.every((approver) => approvals.includes(approver))) throw badState('คุณอนุมัติขั้นตอนนี้ไปแล้ว')
      if (Array.isArray(lines) && lines.length) applyQuantityChanges(req, step, user, lines, comment)
      const updated = [...new Set([...approvals, ...satisfies])]
      const approvers = JSON.parse(step.approvers_json)
      addEvent(id, step.position, userId, 'approved', String(comment ?? '').trim())
      db.prepare('UPDATE requisition_steps SET approvals_json = ? WHERE requisition_id = ? AND position = ?').run(JSON.stringify(updated), id, step.position)
      const done = step.mode === 'all' ? approvers.every((approver) => updated.includes(approver)) : true
      if (done) {
        db.prepare("UPDATE requisition_steps SET status = 'approved', resolved_at = ? WHERE requisition_id = ? AND position = ?").run(now(), id, step.position)
        advance(req, step.position + 1)
      }
      return get(id)
    })
  }

  function stopWithReason({ id, userId, reason, status, action }) {
    const text = String(reason ?? '').trim()
    if (!text) throw invalid('กรุณาระบุเหตุผล')
    return run(() => {
      const req = load(id)
      if (req.status !== 'in_approval') throw badState('ใบเบิกนี้ไม่ได้อยู่ระหว่างรออนุมัติ')
      const step = activeStep(id)
      if (!step) throw badState('ไม่พบขั้นตอนที่รออนุมัติ')
      authorize(req, step, userId)
      db.prepare('UPDATE requisitions SET status = ? WHERE id = ?').run(status, id)
      addEvent(id, step.position, userId, action, text)
      return get(id)
    })
  }

  const reject = ({ id, userId, reason }) => stopWithReason({ id, userId, reason, status: 'rejected', action: 'rejected' })
  const requestChanges = ({ id, userId, reason }) => stopWithReason({ id, userId, reason, status: 'returned_for_edit', action: 'changes_requested' })

  function cancel({ id, userId, reason = '', asAdmin = false }) {
    return run(() => {
      const req = load(id)
      const user = userRow(userId)
      if (!user) throw forbidden()
      if (asAdmin) {
        if (user.role !== 'admin') throw forbidden()
        if (!String(reason ?? '').trim()) throw invalid('กรุณาระบุเหตุผลการยกเลิก')
      } else if (req.requester_id !== userId) throw forbidden('เฉพาะผู้เบิกเท่านั้นที่ยกเลิกได้')
      if (!['in_approval', 'returned_for_edit', 'ready_to_issue'].includes(req.status)) throw badState('ใบเบิกนี้ยกเลิกไม่ได้แล้ว')
      if (lineRows(id).some((line) => line.qty_issued > 0)) throw badState('จ่ายของไปแล้ว ยกเลิกไม่ได้')
      stock.release({ refType: 'requisition', refId: id })
      db.prepare("UPDATE requisitions SET status = 'cancelled' WHERE id = ?").run(id)
      addEvent(id, 0, userId, asAdmin ? 'force_cancelled' : 'cancelled', String(reason ?? '').trim())
      return get(id)
    })
  }

  function resubmit({ id, userId, lines, reason, neededBy }) {
    return run(() => {
      const req = load(id)
      if (req.requester_id !== userId) throw forbidden('เฉพาะผู้เบิกเท่านั้นที่แก้ไขได้')
      if (req.status !== 'returned_for_edit') throw badState('ใบเบิกนี้ไม่ได้ถูกส่งกลับให้แก้ไข')
      const current = new Map(lineRows(id).map((line) => [line.id, line]))
      const changes = new Map()
      for (const entry of Array.isArray(lines) ? lines : []) {
        if (!current.has(entry?.lineId)) throw invalid('ไม่พบรายการสินค้าในใบเบิก')
        if (!isWhole(entry.qty, 0)) throw invalid('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0')
        changes.set(entry.lineId, entry.qty)
      }
      const remaining = [...current.keys()].filter((lineId) => (changes.has(lineId) ? changes.get(lineId) > 0 : true))
      if (remaining.length === 0) throw invalid('ต้องมีสินค้าอย่างน้อย 1 รายการ')
      let text = req.reason
      if (reason !== undefined && reason !== null) {
        text = String(reason).trim().slice(0, 500)
        if (!text) throw invalid('กรุณาระบุเหตุผลการเบิก')
      }
      let needed = req.needed_by
      if (neededBy !== undefined && neededBy !== null) {
        needed = String(neededBy)
        if (needed && (!isCalendarDate(needed) || needed < today())) throw invalid('วันที่ต้องการต้องไม่ใช่วันที่ผ่านมาแล้ว')
      }
      for (const [lineId, qty] of changes) {
        if (qty === 0) db.prepare('DELETE FROM requisition_lines WHERE id = ?').run(lineId)
        else db.prepare('UPDATE requisition_lines SET qty_requested = ? WHERE id = ?').run(qty, lineId)
      }
      db.prepare('UPDATE requisition_lines SET qty_approved = qty_requested WHERE requisition_id = ?').run(id)
      db.prepare("UPDATE requisition_steps SET status = 'waiting', approvers_json = '[]', approvals_json = '[]', due_at = '', escalated = 0, resolved_at = '' WHERE requisition_id = ?").run(id)
      db.prepare("UPDATE requisitions SET status = 'in_approval', reason = ?, needed_by = ?, current_step = 0, submitted_at = ? WHERE id = ?").run(text, needed, now(), id)
      addEvent(id, 0, userId, 'resubmitted', text)
      advance(load(id), 1)
      return get(id)
    })
  }

  // ---- issuing ----
  function assertWarehouseActor(req, userId) {
    const user = userRow(userId)
    if (!user) throw forbidden()
    if (user.role === 'admin') return user
    if (user.role === 'storekeeper' && isStaffOf(userId, req.warehouse_id)) return user
    throw forbidden('เฉพาะเจ้าหน้าที่คลังของคลังนี้หรือผู้ดูแลระบบเท่านั้น')
  }

  function issue({ id, userId, lines }) {
    return run(() => {
      const req = load(id)
      assertWarehouseActor(req, userId)
      if (!ACTIVE_ISSUE.includes(req.status)) throw badState('ใบเบิกนี้ไม่ได้อยู่ระหว่างรอจ่ายของ')
      if (!Array.isArray(lines) || lines.length === 0) throw invalid('กรุณาระบุรายการที่จ่าย')
      const current = new Map(lineRows(id).map((line) => [line.id, line]))
      const seen = new Set()
      const summaryParts = []
      for (const entry of lines) {
        const line = current.get(entry?.lineId)
        if (!line || seen.has(line.id)) throw invalid('รายการสินค้าไม่ถูกต้อง')
        seen.add(line.id)
        if (!isWhole(entry.qty, 1) || entry.qty > line.qty_approved - line.qty_issued) throw invalid(`จำนวนที่จ่าย ${line.name} ต้องเป็นจำนวนเต็ม 1 ถึง ${line.qty_approved - line.qty_issued}`)
        guardStock(() => stock.issueReserved({ refType: 'requisition', refId: id, variantId: line.variant_id, warehouseId: req.warehouse_id, qty: entry.qty, userId }))
        db.prepare('UPDATE requisition_lines SET qty_issued = qty_issued + ? WHERE id = ?').run(entry.qty, line.id)
        summaryParts.push(`${line.name}${line.label ? ` ${line.label}` : ''} × ${entry.qty}`)
      }
      const open = lineRows(id).some((line) => line.qty_issued < line.qty_approved)
      db.prepare('UPDATE requisitions SET status = ? WHERE id = ?').run(open ? 'partially_issued' : 'issued', id)
      addEvent(id, 0, userId, 'issued', summaryParts.join(', '))
      return get(id)
    })
  }

  function closeRemainder({ id, userId, reason }) {
    const text = String(reason ?? '').trim()
    if (!text) throw invalid('กรุณาระบุเหตุผลที่ปิดรายการที่ค้าง')
    return run(() => {
      const req = load(id)
      assertWarehouseActor(req, userId)
      if (!ACTIVE_ISSUE.includes(req.status)) throw badState('ใบเบิกนี้ไม่ได้อยู่ระหว่างรอจ่ายของ')
      stock.release({ refType: 'requisition', refId: id })
      const issuedAny = lineRows(id).some((line) => line.qty_issued > 0)
      db.prepare('UPDATE requisitions SET status = ? WHERE id = ?').run(issuedAny ? 'closed' : 'cancelled', id)
      addEvent(id, 0, userId, 'closed', text)
      return get(id)
    })
  }

  function recordReturn({ id, userId, lines, reason = '' }) {
    return run(() => {
      const req = load(id)
      assertWarehouseActor(req, userId)
      if (!RETURNABLE.includes(req.status)) throw badState('ใบเบิกนี้ยังไม่ได้จ่ายของ')
      if (!Array.isArray(lines) || lines.length === 0) throw invalid('กรุณาระบุรายการที่รับคืน')
      const current = new Map(lineRows(id).map((line) => [line.id, line]))
      const parts = []
      for (const entry of lines) {
        const line = current.get(entry?.lineId)
        if (!line) throw invalid('รายการสินค้าไม่ถูกต้อง')
        const room = line.qty_issued - line.qty_returned
        if (!isWhole(entry.qty, 1) || entry.qty > room) throw invalid(`จำนวนที่รับคืน ${line.name} ต้องเป็นจำนวนเต็ม 1 ถึง ${room}`)
        guardStock(() => stock.returnStock({ variantId: line.variant_id, warehouseId: req.warehouse_id, lotId: String(entry.lotId ?? ''), qty: entry.qty, userId, refType: 'requisition', refId: id, reason: String(reason ?? '').trim() }))
        db.prepare('UPDATE requisition_lines SET qty_returned = qty_returned + ? WHERE id = ?').run(entry.qty, line.id)
        current.set(line.id, { ...line, qty_returned: line.qty_returned + entry.qty })
        parts.push(`${line.name} × ${entry.qty}`)
      }
      addEvent(id, 0, userId, 'returned', `${parts.join(', ')}${String(reason ?? '').trim() ? ` (${String(reason).trim()})` : ''}`)
      return get(id)
    })
  }

  function confirmReceipt({ id, userId }) {
    return run(() => {
      const req = load(id)
      if (req.requester_id !== userId) throw forbidden('เฉพาะผู้เบิกเท่านั้นที่ยืนยันการรับของได้')
      if (!['issued', 'closed'].includes(req.status)) throw badState('ยืนยันรับของได้เมื่อจ่ายของครบหรือปิดรายการแล้ว')
      db.prepare("UPDATE requisitions SET status = 'received' WHERE id = ?").run(id)
      addEvent(id, 0, userId, 'received', '')
      return get(id)
    })
  }

  // ---- admin and background ----
  function reassign({ id, userId, toUserId, reason }) {
    return run(() => {
      const admin = userRow(userId)
      if (!admin || admin.role !== 'admin') throw forbidden()
      const target = userRow(String(toUserId ?? ''))
      if (!target || !['admin', 'leader', 'storekeeper'].includes(target.role)) throw invalid('เลือกได้เฉพาะแอดมิน หัวหน้างาน หรือเจ้าหน้าที่คลังที่เปิดใช้งาน')
      const text = String(reason ?? '').trim()
      if (!text) throw invalid('กรุณาระบุเหตุผล')
      const req = load(id)
      if (req.status !== 'in_approval') throw badState('ใบเบิกนี้ไม่ได้อยู่ระหว่างรออนุมัติ')
      if (target.id === req.requester_id) throw invalid('ผู้เบิกอนุมัติใบเบิกของตัวเองไม่ได้')
      const step = activeStep(id)
      const approvers = JSON.parse(step.approvers_json)
      if (!approvers.includes(target.id)) db.prepare('UPDATE requisition_steps SET approvers_json = ? WHERE requisition_id = ? AND position = ?').run(JSON.stringify([...approvers, target.id]), id, step.position)
      addEvent(id, step.position, userId, 'reassigned', `${target.display_name}: ${text}`)
      return get(id)
    })
  }

  /** Approved but never collected within the configured days: release the held stock. */
  function expireStale() {
    const limit = workflow.getExpireDays() * 86_400_000
    const rows = db.prepare(`SELECT id, approved_at FROM requisitions WHERE status IN ('ready_to_issue', 'partially_issued') AND approved_at != ''`).all()
    let count = 0
    for (const row of rows) {
      if (Date.parse(now()) - Date.parse(row.approved_at) <= limit) continue
      run(() => {
        stock.release({ refType: 'requisition', refId: row.id })
        db.prepare("UPDATE requisitions SET status = 'expired' WHERE id = ?").run(row.id)
        addEvent(row.id, 0, '', 'expired', 'หมดอายุเพราะไม่มารับของตามกำหนด')
      })
      count += 1
    }
    return count
  }

  /** Overdue active steps pass to their escalation target, once. */
  function escalateOverdue() {
    const rows = db.prepare(`SELECT s.*, r.requester_id, r.status FROM requisition_steps s JOIN requisitions r ON r.id = s.requisition_id
                             WHERE s.status = 'active' AND r.status = 'in_approval' AND s.escalated = 0 AND s.due_at != '' AND s.due_at < ? AND s.escalate_type != 'none'`).all(now())
    let count = 0
    for (const step of rows) {
      const extra = step.escalate_type === 'role'
        ? db.prepare('SELECT id FROM users WHERE role = ? AND is_active = 1').all(step.escalate_ref).map((row) => row.id)
        : (userRow(step.escalate_ref) ? [step.escalate_ref] : [])
      const approvers = [...new Set([...JSON.parse(step.approvers_json), ...extra.filter((userId) => userId !== step.requester_id)])]
      run(() => {
        db.prepare('UPDATE requisition_steps SET approvers_json = ?, escalated = 1 WHERE requisition_id = ? AND position = ?').run(JSON.stringify(approvers), step.requisition_id, step.position)
        addEvent(step.requisition_id, step.position, '', 'escalated', 'เกินเวลาที่กำหนด ส่งต่อให้ผู้รับเรื่องเพิ่มเติม')
      })
      count += 1
    }
    return count
  }

  // ---- views ----
  function listMine(userId, { status } = {}) {
    const rows = db.prepare(`SELECT * FROM requisitions WHERE requester_id = ? ${status ? 'AND status = ?' : ''} ORDER BY created_at DESC, rowid DESC LIMIT 500`).all(...[userId, ...(status ? [status] : [])])
    return rows.map(summary)
  }

  function inbox(userId) {
    const rows = db.prepare(`SELECT r.*, s.approvers_json FROM requisitions r JOIN requisition_steps s ON s.requisition_id = r.id AND s.status = 'active'
                             WHERE r.status = 'in_approval' AND r.requester_id != ? ORDER BY r.submitted_at, r.rowid`).all(userId)
    return rows.filter((row) => workflow.effectiveActors(JSON.parse(row.approvers_json)).includes(userId)).map(summary)
  }

  function issueQueue(userId, role) {
    const warehouseFilter = role === 'admin' ? '' : 'AND r.warehouse_id IN (SELECT warehouse_id FROM warehouse_staff WHERE user_id = ?)'
    if (role !== 'admin' && role !== 'storekeeper') return []
    const rows = db.prepare(`SELECT r.* FROM requisitions r WHERE r.status IN ('ready_to_issue', 'partially_issued') ${warehouseFilter} ORDER BY r.approved_at, r.rowid`).all(...(role === 'admin' ? [] : [userId]))
    return rows.map((row) => ({
      ...summary(row),
      lines: lineRows(row.id).map((line) => ({
        id: line.id, variantId: line.variant_id, itemId: line.item_id, sku: line.sku, name: line.name, variantLabel: line.label, unit: line.unit, imageUrl: imageUrl(line.item_id, line.image),
        qtyApproved: line.qty_approved, qtyIssued: line.qty_issued, remaining: line.qty_approved - line.qty_issued,
        picks: db.prepare(`SELECT r.lot_id, l.lot_no, l.expiry_date, r.qty FROM stock_reservations r JOIN stock_lots l ON l.id = r.lot_id
                           WHERE r.ref_type = 'requisition' AND r.ref_id = ? AND r.variant_id = ?
                           ORDER BY (l.expiry_date = '') ASC, l.expiry_date ASC, l.received_at ASC, l.rowid ASC`).all(row.id, line.variant_id).map((pick) => ({ lotId: pick.lot_id, lotNo: pick.lot_no, expiryDate: pick.expiry_date, qty: pick.qty })),
      })),
    }))
  }

  /** Requisitions already issued (newest first) with the lots the stock came from, so returns can go back to the right lot. */
  function issueHistory(userId, role) {
    if (role !== 'admin' && role !== 'storekeeper') return []
    const warehouseFilter = role === 'admin' ? '' : 'AND r.warehouse_id IN (SELECT warehouse_id FROM warehouse_staff WHERE user_id = ?)'
    const rows = db.prepare(`SELECT r.* FROM requisitions r WHERE r.status IN ('issued', 'closed', 'received') ${warehouseFilter} ORDER BY r.created_at DESC, r.rowid DESC LIMIT 100`).all(...(role === 'admin' ? [] : [userId]))
    return rows.map((row) => ({
      ...summary(row),
      lines: lineRows(row.id).map((line) => ({
        id: line.id, variantId: line.variant_id, itemId: line.item_id, sku: line.sku, name: line.name, variantLabel: line.label, unit: line.unit, imageUrl: imageUrl(line.item_id, line.image),
        qtyApproved: line.qty_approved, qtyIssued: line.qty_issued, qtyReturned: line.qty_returned,
        issuedLots: db.prepare(`SELECT m.lot_id, l.lot_no, l.expiry_date, SUM(-m.qty) AS qty FROM stock_movements m JOIN stock_lots l ON l.id = m.lot_id
                                WHERE m.ref_type = 'requisition' AND m.ref_id = ? AND m.variant_id = ? AND m.type = 'issue' GROUP BY m.lot_id ORDER BY l.expiry_date, l.rowid`)
          .all(row.id, line.variant_id).map((lot) => ({ lotId: lot.lot_id, lotNo: lot.lot_no, expiryDate: lot.expiry_date, qty: lot.qty })),
      })),
    }))
  }

  function listAll({ status, q, page = 1, pageSize = 25 } = {}) {
    const where = []
    const params = []
    if (status) { where.push('r.status = ?'); params.push(status) }
    const term = String(q ?? '').trim().slice(0, 80)
    if (term) {
      const like = `%${term.replace(/[!%_]/g, (char) => `!${char}`)}%`
      where.push("(r.number LIKE ? ESCAPE '!' OR r.reason LIKE ? ESCAPE '!' OR r.department LIKE ? ESCAPE '!' OR u.display_name LIKE ? ESCAPE '!')")
      params.push(like, like, like, like)
    }
    const from = `FROM requisitions r LEFT JOIN users u ON u.id = r.requester_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
    const size = Math.min(Math.max(Math.trunc(pageSize) || 25, 1), 100)
    const current = Math.max(Math.trunc(page) || 1, 1)
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n
    const rows = db.prepare(`SELECT r.* ${from} ORDER BY r.created_at DESC, r.rowid DESC LIMIT ? OFFSET ?`).all(...params, size, (current - 1) * size)
    return { rows: rows.map(summary), total, page: current, pageSize: size }
  }

  function badges(user) {
    return { approvals: inbox(user.id).length, issue: issueQueue(user.id, user.role).length }
  }

  // ---- photos (files are stored by the route; these functions enforce the rules and keep the rows) ----
  const EDITABLE_PHOTOS = ['in_approval', 'returned_for_edit']
  const MAX_PHOTOS = 6

  function photoActor(req, userId) {
    const user = userRow(userId)
    if (!user || (req.requester_id !== userId && user.role !== 'admin')) throw forbidden('เฉพาะผู้เบิกเท่านั้นที่แนบหรือลบรูปได้')
    if (!EDITABLE_PHOTOS.includes(req.status)) throw badState('แนบหรือลบรูปได้เฉพาะตอนรออนุมัติหรือถูกส่งกลับให้แก้ไข')
  }

  function prepareUpload({ id, userId, count }) {
    const req = load(id)
    photoActor(req, userId)
    const existing = db.prepare('SELECT COUNT(*) AS n FROM requisition_photos WHERE requisition_id = ?').get(id).n
    if (!Number.isInteger(count) || count < 1 || existing + count > MAX_PHOTOS) throw invalid(`แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูปต่อใบเบิก`)
  }

  function addPhotos({ id, userId, photos }) {
    return run(() => {
      const req = load(id)
      photoActor(req, userId)
      for (const photo of photos) db.prepare('INSERT INTO requisition_photos (id, requisition_id, stored_name, thumb_name, original_name, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), id, photo.stored, photo.thumb, photo.originalName, userId, now())
      addEvent(id, 0, userId, 'photo_added', `${photos.length} รูป`)
      return get(id)
    })
  }

  /** Removes the row and returns the stored file names so the caller can delete the files. */
  function removePhoto({ id, photoId, userId }) {
    return run(() => {
      const req = load(id)
      const photo = db.prepare('SELECT * FROM requisition_photos WHERE id = ? AND requisition_id = ?').get(photoId, id)
      if (!photo) throw new RequisitionError('NOT_FOUND', 'ไม่พบรูปภาพ')
      photoActor(req, userId)
      db.prepare('DELETE FROM requisition_photos WHERE id = ?').run(photoId)
      addEvent(id, 0, userId, 'photo_removed', photo.original_name)
      return { stored: photo.stored_name, thumb: photo.thumb_name }
    })
  }

  function getPhoto(photoId) {
    const photo = db.prepare('SELECT * FROM requisition_photos WHERE id = ?').get(photoId)
    if (!photo) throw new RequisitionError('NOT_FOUND', 'ไม่พบรูปภาพ')
    return { requisitionId: photo.requisition_id, stored: photo.stored_name, thumb: photo.thumb_name }
  }

  /** Requester, anyone who is or was an approver (or their delegate today), storekeepers of the warehouse and admins. */
  function canView(user, detail) {
    if (user.role === 'admin' || detail.requesterId === user.id) return true
    if (user.role === 'storekeeper' && isStaffOf(user.id, detail.warehouseId)) return true
    const approvers = detail.steps.flatMap((step) => step.approvers.map((approver) => approver.userId))
    if (approvers.includes(user.id) || detail.events.some((event) => event.actorId === user.id)) return true
    return workflow.effectiveActors(approvers).includes(user.id)
  }

  return {
    getCart, setCartLine, clearCart, catalog, warehouseOptions, previewRoute, checkout, get, approve, reject, requestChanges, cancel, resubmit, issue, closeRemainder, recordReturn, confirmReceipt,
    reassign, expireStale, escalateOverdue, listMine, inbox, issueQueue, issueHistory, listAll, badges, canView, departmentOf, prepareUpload, addPhotos, removePhoto, getPhoto,
  }
}
