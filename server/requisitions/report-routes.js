import express from 'express'
import ExcelJS from 'exceljs'
import { ReportError, createReportService } from './reports.js'

const FORBIDDEN = 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้'
const bangkokDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + offsetDays * 86_400_000))

/** /api/reports: usage, cycle time and the ledger integrity result, scoped by role. */
export function registerReportRoutes(app, { db, requireAuth, requireAdmin, addAudit, stock, service }) {
  const reports = createReportService(db, { stock })
  const router = express.Router()
  router.use(requireAuth)

  /** What the signed-in user may see: admin all, storekeeper their warehouses, leader their department, employee themselves. */
  function scopeOf(user) {
    if (user.role === 'admin') return {}
    if (user.role === 'storekeeper') return { warehouseIds: db.prepare('SELECT warehouse_id FROM warehouse_staff WHERE user_id = ?').all(user.id).map((row) => row.warehouse_id) }
    if (user.role === 'leader') {
      const department = service.departmentOf(user.id)
      return department ? { department } : { requesterId: user.id }
    }
    return { requesterId: user.id }
  }

  /** Query filters narrowed to the user's scope; a requested filter outside the scope matches nothing instead of leaking. */
  function optionsFrom(req) {
    const user = req.session.user
    const scope = scopeOf(user)
    const query = req.query
    const options = {
      from: String(query.from || bangkokDate(-30)), to: String(query.to || bangkokDate()),
      groupBy: String(query.groupBy || 'department'), type: query.type ? String(query.type) : undefined,
      department: scope.department || (query.department ? String(query.department) : undefined),
      requesterId: scope.requesterId || (query.requesterId ? String(query.requesterId) : undefined),
    }
    if (scope.warehouseIds) {
      const wanted = query.warehouseId ? [String(query.warehouseId)] : scope.warehouseIds
      options.warehouseIds = wanted.filter((id) => scope.warehouseIds.includes(id))
    } else if (query.warehouseId) options.warehouseIds = [String(query.warehouseId)]
    return options
  }

  const handle = (fn) => async (req, res, next) => {
    try { await fn(req, res) } catch (error) {
      if (error instanceof ReportError) return res.status(400).json({ error: error.message })
      next(error)
    }
  }

  router.get('/options', handle((req, res) => {
    const scope = scopeOf(req.session.user)
    const warehouses = db.prepare('SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY code').all().filter((row) => !scope.warehouseIds || scope.warehouseIds.includes(row.id))
    const departments = scope.department ? [scope.department] : scope.requesterId ? [] : db.prepare("SELECT DISTINCT department FROM requisitions WHERE department != '' ORDER BY department").all().map((row) => row.department)
    res.json({ warehouses, departments, scope: req.session.user.role })
  }))

  router.get('/usage', handle((req, res) => res.json(reports.usage(optionsFrom(req)))))
  router.get('/cycle-time', handle((req, res) => res.json(reports.cycleTime(optionsFrom(req)))))

  router.get('/usage.xlsx', handle(async (req, res) => {
    const options = optionsFrom(req)
    const result = reports.usage(options)
    const labels = { department: 'แผนก', person: 'ผู้เบิก', item: 'สินค้า' }
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Daily Safety | Y.T. Rubber'
    const sheet = workbook.addWorksheet('การใช้งาน', { views: [{ state: 'frozen', ySplit: 3 }] })
    sheet.addRow([`รายงานการเบิกใช้ ${result.from} ถึง ${result.to}`]).font = { bold: true, size: 14 }
    sheet.addRow([])
    sheet.addRow([labels[result.groupBy], 'จำนวนใบเบิก', 'จ่ายออก', 'รับคืน', 'ใช้สุทธิ']).font = { bold: true }
    for (const row of result.rows) sheet.addRow([row.label, row.requisitions, row.issued, row.returned, row.net])
    sheet.addRow(['รวม', '', result.totals.issued, result.totals.returned, result.totals.net]).font = { bold: true }
    sheet.columns = [{ width: 34 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }]
    addAudit(req.session.user.id, 'ส่งออกรายงานการเบิกใช้', 'report', 'usage', { from: result.from, to: result.to, groupBy: result.groupBy })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="usage-${result.from}-${result.to}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  }))

  router.get('/integrity', requireAdmin, handle((_req, res) => res.json({ last: reports.lastIntegrity() })))
  router.post('/integrity/run', requireAdmin, handle((req, res) => {
    const result = reports.runIntegrityCheck()
    addAudit(req.session.user.id, 'ตรวจความถูกต้องของสต็อก', 'report', 'integrity', { ok: result.ok, mismatchCount: result.mismatchCount })
    res.json({ last: { at: result.at, ok: result.ok, mismatchCount: result.mismatchCount }, mismatches: result.mismatches })
  }))

  app.use('/api/reports', router)
  return { reports }
}

export { FORBIDDEN }
