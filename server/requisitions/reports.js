/** Read-only reports over the stock ledger and the requisition workflow, plus the nightly ledger check. */
export class ReportError extends Error {
  constructor(code, message) { super(message); this.name = 'ReportError'; this.code = code }
}

const INTEGRITY_KEY = 'inventory.integrity.last'
const GROUPS = {
  department: { key: "COALESCE(NULLIF(r.department, ''), '')", label: "COALESCE(NULLIF(r.department, ''), '(ไม่ระบุแผนก)')" },
  person: { key: 'r.requester_id', label: 'u.display_name' },
  item: { key: 'm.variant_id', label: "i.name || CASE WHEN v.label != '' THEN ' ' || v.label ELSE '' END" },
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function parseRange({ from, to }) {
  if (!isCalendarDate(from) || !isCalendarDate(to)) throw new ReportError('INVALID', 'ช่วงวันที่ไม่ถูกต้อง')
  if (from > to) throw new ReportError('INVALID', 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด')
  return { from, to }
}

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10

export function createReportService(db, { stock, now = () => new Date().toISOString() }) {
  /** Shared filters over the `r` (requisitions) alias. An empty warehouse list matches nothing. */
  function filters({ warehouseIds, department, requesterId, type }) {
    const where = []
    const params = []
    if (Array.isArray(warehouseIds)) {
      if (warehouseIds.length === 0) where.push('0 = 1')
      else { where.push(`r.warehouse_id IN (${warehouseIds.map(() => '?').join(',')})`); params.push(...warehouseIds) }
    }
    if (department) { where.push('r.department = ?'); params.push(String(department)) }
    if (requesterId) { where.push('r.requester_id = ?'); params.push(String(requesterId)) }
    if (type) { where.push('r.type = ?'); params.push(String(type)) }
    return { sql: where.length ? ` AND ${where.join(' AND ')}` : '', params }
  }

  /** Quantity issued to (and returned from) requisitions, grouped; dates are Bangkok calendar days. */
  function usage(options) {
    const { from, to } = parseRange(options)
    const group = GROUPS[options.groupBy]
    if (!group) throw new ReportError('INVALID', 'กลุ่มรายงานไม่ถูกต้อง')
    const extra = filters(options)
    const rows = db.prepare(`
      SELECT ${group.key} AS key, ${group.label} AS label,
             COALESCE(SUM(CASE WHEN m.type = 'issue' THEN -m.qty ELSE 0 END), 0) AS issued,
             COALESCE(SUM(CASE WHEN m.type = 'return' THEN m.qty ELSE 0 END), 0) AS returned,
             COUNT(DISTINCT r.id) AS requisitions
      FROM stock_movements m
      JOIN requisitions r ON r.id = m.ref_id
      JOIN item_variants v ON v.id = m.variant_id
      JOIN items i ON i.id = v.item_id
      JOIN users u ON u.id = r.requester_id
      WHERE m.ref_type = 'requisition' AND m.type IN ('issue', 'return')
        AND date(m.created_at, '+7 hours') BETWEEN ? AND ?${extra.sql}
      GROUP BY key ORDER BY issued DESC, label`).all(from, to, ...extra.params)
      .map((row) => ({ key: row.key, label: row.label, issued: row.issued, returned: row.returned, net: row.issued - row.returned, requisitions: row.requisitions }))
    const totals = rows.reduce((sum, row) => ({ issued: sum.issued + row.issued, returned: sum.returned + row.returned, net: sum.net + row.net }), { issued: 0, returned: 0, net: 0 })
    return { from, to, groupBy: options.groupBy, rows, totals }
  }

  /** How long requests take to approve and to issue, how many sat past their step SLA, and counts per status. */
  function cycleTime(options) {
    const { from, to } = parseRange(options)
    const extra = filters(options)
    const scope = `date(r.submitted_at, '+7 hours') BETWEEN ? AND ?${extra.sql}`
    const args = [from, to, ...extra.params]
    const statusRows = db.prepare(`SELECT r.status, COUNT(*) AS n FROM requisitions r WHERE ${scope} GROUP BY r.status`).all(...args)
    const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row.n]))
    const total = statusRows.reduce((sum, row) => sum + row.n, 0)
    const approval = db.prepare(`SELECT AVG((julianday(r.approved_at) - julianday(r.submitted_at)) * 24) AS hours FROM requisitions r WHERE r.approved_at != '' AND ${scope}`).get(...args)
    const issue = db.prepare(`
      SELECT AVG((julianday(e.first_at) - julianday(r.approved_at)) * 24) AS hours
      FROM requisitions r JOIN (SELECT requisition_id, MIN(at) AS first_at FROM requisition_events WHERE action = 'issued' GROUP BY requisition_id) e ON e.requisition_id = r.id
      WHERE r.approved_at != '' AND ${scope}`).get(...args)
    const breaches = db.prepare(`
      SELECT COUNT(*) AS n FROM requisition_steps s JOIN requisitions r ON r.id = s.requisition_id
      WHERE s.due_at != '' AND s.resolved_at != '' AND s.status = 'approved' AND s.resolved_at > s.due_at AND ${scope}`).get(...args)
    return { from, to, total, byStatus, avgApprovalHours: round1(approval?.hours), avgIssueHours: round1(issue?.hours), slaBreaches: breaches?.n ?? 0 }
  }

  /** Recomputes every balance from the ledger, stores the outcome for the admin dashboard and returns the full result. */
  function runIntegrityCheck() {
    const result = stock.verifyIntegrity()
    const summary = { at: now(), ok: result.ok, mismatchCount: result.mismatches.length }
    db.prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value').run(INTEGRITY_KEY, JSON.stringify(summary))
    return { ...summary, mismatches: result.mismatches }
  }

  function lastIntegrity() {
    const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(INTEGRITY_KEY)
    if (!row) return null
    try { return JSON.parse(row.setting_value) } catch { return null }
  }

  return { usage, cycleTime, runIntegrityCheck, lastIntegrity }
}
