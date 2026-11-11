import express from 'express'
import { WorkflowError, createWorkflowService } from './workflow.js'
import { RequisitionError, createRequisitionService } from './service.js'

const FORBIDDEN = 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้'
const STATUS = { INVALID: 400, NOT_FOUND: 404, FORBIDDEN: 403, BAD_STATE: 409, IN_USE: 409, SHORTAGE: 409 }

/** Workflow settings (/api/workflow) and requisitions (/api/requisitions). */
export function registerRequisitionRoutes(app, { db, requireAuth, requireAdmin, addAudit, stock }) {
  const workflow = createWorkflowService(db)
  const service = createRequisitionService(db, { stock, workflow })

  /** Maps domain errors to HTTP statuses; anything else is a real bug and goes to the error handler. */
  const handle = (handler) => async (req, res, next) => {
    try { await handler(req, res) } catch (error) {
      if (error instanceof WorkflowError || error instanceof RequisitionError) {
        const body = { error: error.message }
        if (error.details) body.details = error.details
        return res.status(STATUS[error.code] ?? 400).json(body)
      }
      next(error)
    }
  }

  const MANAGER_ROLES = ['admin', 'leader', 'storekeeper']
  const requireManagerRole = (req, res, next) => requireAuth(req, res, () => {
    if (!MANAGER_ROLES.includes(req.session.user.role)) return res.status(403).json({ error: FORBIDDEN })
    next()
  })

  // ---- workflow settings ----
  const wfRouter = express.Router()

  wfRouter.get('/templates', requireManagerRole, handle((_req, res) => res.json({ templates: workflow.listTemplates() })))
  wfRouter.post('/templates', requireAdmin, handle((req, res) => {
    const template = workflow.saveTemplate({ ...req.body, id: undefined })
    addAudit(req.session.user.id, 'สร้างแม่แบบขั้นตอนอนุมัติ', 'workflow_template', template.id, { name: template.name, steps: template.steps.length })
    res.status(201).json({ template })
  }))
  wfRouter.get('/templates/:id', requireManagerRole, handle((req, res) => res.json({ template: workflow.getTemplate(req.params.id) })))
  wfRouter.put('/templates/:id', requireAdmin, handle((req, res) => {
    const template = workflow.saveTemplate({ ...req.body, id: req.params.id })
    addAudit(req.session.user.id, 'แก้ไขแม่แบบขั้นตอนอนุมัติ', 'workflow_template', template.id, { name: template.name, version: template.version })
    res.json({ template })
  }))
  wfRouter.delete('/templates/:id', requireAdmin, handle((req, res) => {
    const template = workflow.getTemplate(req.params.id)
    workflow.deleteTemplate(req.params.id)
    addAudit(req.session.user.id, 'ลบแม่แบบขั้นตอนอนุมัติ', 'workflow_template', template.id, { name: template.name })
    res.json({ ok: true })
  }))

  wfRouter.get('/approvers', requireManagerRole, handle((_req, res) => {
    const users = db.prepare("SELECT id, display_name, employee_code, role FROM users WHERE is_active = 1 AND role IN ('admin', 'leader', 'storekeeper') ORDER BY display_name COLLATE NOCASE").all()
    res.json({ users: users.map((user) => ({ id: user.id, name: user.display_name, employeeCode: user.employee_code, role: user.role })) })
  }))

  wfRouter.get('/departments', requireAdmin, handle((_req, res) => res.json({ departments: workflow.listDepartments() })))
  wfRouter.put('/departments/supervisors', requireAdmin, handle((req, res) => {
    workflow.setDepartmentSupervisors(req.body?.department, req.body?.entries)
    addAudit(req.session.user.id, 'กำหนดหัวหน้างานของแผนก', 'workflow_department', `dept:${String(req.body.department).trim()}`, { department: String(req.body.department).trim(), count: req.body.entries.length })
    res.json({ departments: workflow.listDepartments() })
  }))

  wfRouter.get('/delegations', requireManagerRole, handle((req, res) => {
    const user = req.session.user
    res.json({ delegations: workflow.listDelegations(user.role === 'admin' ? {} : { userId: user.id }) })
  }))
  wfRouter.post('/delegations', requireManagerRole, handle((req, res) => {
    const user = req.session.user
    const fromUser = user.role === 'admin' && req.body?.fromUser ? String(req.body.fromUser) : user.id
    const delegation = workflow.addDelegation({ fromUser, toUser: req.body?.toUser, fromDate: req.body?.fromDate, toDate: req.body?.toDate })
    addAudit(user.id, 'มอบสิทธิ์อนุมัติแทน', 'workflow_delegation', delegation.id, { from: fromUser, to: delegation.toUser, fromDate: delegation.fromDate, toDate: delegation.toDate })
    res.status(201).json({ delegation })
  }))
  wfRouter.delete('/delegations/:id', requireManagerRole, handle((req, res) => {
    const user = req.session.user
    const existing = workflow.listDelegations().find((row) => row.id === req.params.id)
    if (!existing) return res.status(404).json({ error: 'ไม่พบการมอบสิทธิ์' })
    if (user.role !== 'admin' && existing.fromUser !== user.id) return res.status(403).json({ error: FORBIDDEN })
    workflow.removeDelegation(req.params.id)
    addAudit(user.id, 'ยกเลิกการมอบสิทธิ์อนุมัติแทน', 'workflow_delegation', existing.id, { from: existing.fromUser, to: existing.toUser })
    res.json({ ok: true })
  }))

  wfRouter.post('/preview', requireAdmin, handle((req, res) => {
    const { templateId, requesterId, totalQty, categoryIds = [], warehouseId = '' } = req.body || {}
    const template = workflow.getTemplate(String(templateId ?? ''))
    if (!db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(String(requesterId ?? ''))) throw new WorkflowError('INVALID', 'ไม่พบผู้เบิก')
    if (!Number.isInteger(totalQty) || totalQty < 0) throw new WorkflowError('INVALID', 'จำนวนรวมต้องเป็นจำนวนเต็มตั้งแต่ 0')
    if (!Array.isArray(categoryIds) || categoryIds.some((id) => typeof id !== 'string')) throw new WorkflowError('INVALID', 'หมวดสินค้าไม่ถูกต้อง')
    const department = service.departmentOf(requesterId)
    const name = (id) => db.prepare('SELECT display_name FROM users WHERE id = ?').get(id)?.display_name || ''
    res.json({
      department,
      steps: template.steps.map((step) => {
        const resolved = workflow.resolveApprovers(step, { requesterId, department, warehouseId: String(warehouseId) })
        return {
          position: step.position, name: step.name, approverType: step.approverType, mode: step.mode, slaHours: step.slaHours,
          applies: workflow.stepApplies(step.condition, { totalQty, categoryIds }), note: resolved.note,
          approvers: resolved.approvers.map((userId) => ({ userId, name: name(userId) })),
        }
      }),
    })
  }))

  wfRouter.get('/settings', requireManagerRole, handle((_req, res) => res.json({ expireDays: workflow.getExpireDays() })))
  wfRouter.put('/settings', requireAdmin, handle((req, res) => {
    workflow.setExpireDays(req.body?.expireDays)
    addAudit(req.session.user.id, 'ตั้งค่าวันหมดอายุของใบเบิกที่ไม่มารับของ', 'workflow_settings', 'requisition.expire_days', { days: req.body.expireDays })
    res.json({ expireDays: workflow.getExpireDays() })
  }))

  app.use('/api/workflow', wfRouter)

  // ---- requisitions ----
  const reqRouter = express.Router()
  reqRouter.use(requireAuth)
  const actor = (req) => req.session.user
  const detailBody = (id) => ({ requisition: service.get(id) })

  reqRouter.get('/catalog', handle((req, res) => res.json({ items: service.catalog({ type: req.query.type, q: req.query.q }) })))

  reqRouter.get('/cart', handle((req, res) => res.json({ cart: service.getCart(actor(req).id, String(req.query.type ?? '')) })))
  reqRouter.put('/cart/lines', handle((req, res) => res.json({ cart: service.setCartLine(actor(req).id, String(req.body?.type ?? ''), String(req.body?.variantId ?? ''), req.body?.qty) })))
  reqRouter.delete('/cart', handle((req, res) => {
    service.clearCart(actor(req).id, String(req.query.type ?? ''))
    res.json({ ok: true })
  }))

  reqRouter.post('/checkout', handle((req, res) => {
    const { id } = service.checkout({ userId: actor(req).id, type: String(req.body?.type ?? ''), warehouseId: req.body?.warehouseId, reason: req.body?.reason, neededBy: req.body?.neededBy ?? '' })
    addAudit(actor(req).id, 'ส่งใบเบิก', 'requisition', id, { type: req.body.type })
    res.status(201).json(detailBody(id))
  }))

  reqRouter.get('/mine', handle((req, res) => res.json({ requisitions: service.listMine(actor(req).id, { status: req.query.status ? String(req.query.status) : undefined }) })))
  reqRouter.get('/inbox', requireManagerRole, handle((req, res) => res.json({ requisitions: service.inbox(actor(req).id) })))
  reqRouter.get('/issue-queue', requireManagerRole, handle((req, res) => res.json({ requisitions: service.issueQueue(actor(req).id, actor(req).role) })))
  reqRouter.get('/badges', handle((req, res) => {
    const user = actor(req)
    const cart = ['ppe', 'medicine'].reduce((sum, type) => sum + service.getCart(user.id, type).lines.length, 0)
    res.json({ ...service.badges(user), cart })
  }))

  reqRouter.get('/admin/all', requireAdmin, handle((req, res) => {
    const result = service.listAll({ status: req.query.status ? String(req.query.status) : undefined, q: req.query.q, page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 25 })
    res.json({ requisitions: result.rows, total: result.total, page: result.page, pageSize: result.pageSize })
  }))

  reqRouter.post('/bulk-approve', requireManagerRole, handle((req, res) => {
    const ids = req.body?.ids
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) return res.status(400).json({ error: 'เลือกใบเบิก 1–50 ใบ' })
    const results = ids.map((rawId) => {
      const id = String(rawId)
      try {
        service.approve({ id, userId: actor(req).id, comment: String(req.body?.comment ?? '') })
        addAudit(actor(req).id, 'อนุมัติใบเบิก', 'requisition', id, { bulk: true })
        return { id, ok: true }
      } catch (error) {
        if (!(error instanceof RequisitionError)) throw error
        return { id, ok: false, code: error.code, error: error.message }
      }
    })
    res.json({ results })
  }))

  reqRouter.get('/:id', handle((req, res) => {
    const detail = service.get(req.params.id)
    if (!service.canView(actor(req), detail)) return res.status(403).json({ error: FORBIDDEN })
    res.json({ requisition: detail })
  }))

  /** Declares a mutation: runs the service call, writes the audit row and returns the fresh detail. */
  const action = (path, label, run) => reqRouter.post(path, handle((req, res) => {
    run(req)
    addAudit(actor(req).id, label, 'requisition', req.params.id, { ...(req.body?.reason ? { reason: String(req.body.reason).slice(0, 200) } : {}) })
    res.json(detailBody(req.params.id))
  }))

  action('/:id/approve', 'อนุมัติใบเบิก', (req) => service.approve({ id: req.params.id, userId: actor(req).id, comment: String(req.body?.comment ?? ''), lines: req.body?.lines }))
  action('/:id/reject', 'ปฏิเสธใบเบิก', (req) => service.reject({ id: req.params.id, userId: actor(req).id, reason: req.body?.reason }))
  action('/:id/request-changes', 'ส่งใบเบิกกลับให้แก้ไข', (req) => service.requestChanges({ id: req.params.id, userId: actor(req).id, reason: req.body?.reason }))
  action('/:id/cancel', 'ยกเลิกใบเบิก', (req) => service.cancel({ id: req.params.id, userId: actor(req).id, reason: req.body?.reason }))
  action('/:id/resubmit', 'ส่งใบเบิกใหม่หลังแก้ไข', (req) => service.resubmit({ id: req.params.id, userId: actor(req).id, lines: req.body?.lines, reason: req.body?.reason, neededBy: req.body?.neededBy }))
  action('/:id/receive', 'ยืนยันรับของ', (req) => service.confirmReceipt({ id: req.params.id, userId: actor(req).id }))
  action('/:id/issue', 'จ่ายของตามใบเบิก', (req) => service.issue({ id: req.params.id, userId: actor(req).id, lines: req.body?.lines }))
  action('/:id/close', 'ปิดรายการค้างจ่าย', (req) => service.closeRemainder({ id: req.params.id, userId: actor(req).id, reason: req.body?.reason }))
  action('/:id/returns', 'รับคืนของ', (req) => service.recordReturn({ id: req.params.id, userId: actor(req).id, lines: req.body?.lines, reason: req.body?.reason }))
  reqRouter.post('/:id/admin/reassign', requireAdmin, handle((req, res) => {
    service.reassign({ id: req.params.id, userId: actor(req).id, toUserId: req.body?.toUserId, reason: req.body?.reason })
    addAudit(actor(req).id, 'ผู้ดูแลระบบเปลี่ยนผู้อนุมัติ', 'requisition', req.params.id, { to: req.body.toUserId, reason: String(req.body.reason).slice(0, 200) })
    res.json(detailBody(req.params.id))
  }))
  reqRouter.post('/:id/admin/force-cancel', requireAdmin, handle((req, res) => {
    service.cancel({ id: req.params.id, userId: actor(req).id, reason: req.body?.reason, asAdmin: true })
    addAudit(actor(req).id, 'ผู้ดูแลระบบยกเลิกใบเบิก', 'requisition', req.params.id, { reason: String(req.body.reason).slice(0, 200) })
    res.json(detailBody(req.params.id))
  }))

  app.use('/api/requisitions', reqRouter)
  return { workflow, service, handle, requireManagerRole }
}
