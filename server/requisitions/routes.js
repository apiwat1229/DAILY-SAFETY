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
  return { workflow, service, handle, requireManagerRole }
}
