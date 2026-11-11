import { randomUUID } from 'node:crypto'

export class StockError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_QTY = 1_000_000_000
/** True only for real calendar dates in YYYY-MM-DD form (rejects 2026-02-30). */
function isCalendarDate(value) {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())

/**
 * Every stock change goes through here. Quantities are whole numbers; the ledger (stock_movements) is append-only
 * and stock_balances is kept in step inside the same transaction.
 */
export function createStockService(db, opts = {}) {
  const now = opts.now || (() => new Date().toISOString())
  const today = opts.today || bangkokToday
  let depth = 0

  /** Runs fn atomically. Nested calls join the outer transaction. */
  function transaction(fn) {
    if (depth > 0) { depth += 1; try { return fn() } finally { depth -= 1 } }
    db.exec('BEGIN IMMEDIATE')
    depth = 1
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    } finally { depth = 0 }
  }

  function assertQty(qty) {
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) throw new StockError('INVALID_QTY', 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0 และไม่เกิน 1,000,000,000')
  }

  function loadVariant(variantId) {
    const row = db.prepare(`SELECT v.id, v.is_active AS variant_active, i.id AS item_id, i.name, i.type, i.track_lot, i.track_expiry, i.is_active AS item_active
                            FROM item_variants v JOIN items i ON i.id = v.item_id WHERE v.id = ?`).get(variantId)
    if (!row) throw new StockError('NOT_FOUND', 'ไม่พบสินค้า')
    return row
  }

  /** Throws when the warehouse is missing, or (when an item type is given) is reserved for the other type. */
  function assertWarehouse(warehouseId, itemType = '') {
    const row = db.prepare('SELECT id, type FROM warehouses WHERE id = ?').get(warehouseId)
    if (!row) throw new StockError('NOT_FOUND', 'ไม่พบคลัง')
    if (itemType && row.type !== 'any' && row.type !== itemType) throw new StockError('WRONG_WAREHOUSE', row.type === 'ppe' ? 'คลังนี้เก็บเฉพาะอุปกรณ์ PPE' : 'คลังนี้เก็บเฉพาะยา')
  }

  /** Writes one signed ledger row and moves the balance. Refuses to take on_hand below zero. */
  function applyMovement({ type, variantId, warehouseId, lotId = '', qty, refType = '', refId = '', reason = '', userId = '' }) {
    const current = db.prepare('SELECT on_hand FROM stock_balances WHERE variant_id = ? AND warehouse_id = ? AND lot_id = ?').get(variantId, warehouseId, lotId)?.on_hand ?? 0
    if (current + qty < 0) throw new StockError('INSUFFICIENT_STOCK', 'สต็อกไม่เพียงพอ')
    const movementId = randomUUID()
    db.prepare(`INSERT INTO stock_movements (id, type, variant_id, warehouse_id, lot_id, qty, ref_type, ref_id, reason, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(movementId, type, variantId, warehouseId, lotId, qty, refType, refId, reason, userId, now())
    db.prepare('INSERT OR IGNORE INTO stock_balances (variant_id, warehouse_id, lot_id, on_hand) VALUES (?, ?, ?, 0)').run(variantId, warehouseId, lotId)
    db.prepare('UPDATE stock_balances SET on_hand = on_hand + ? WHERE variant_id = ? AND warehouse_id = ? AND lot_id = ?').run(qty, variantId, warehouseId, lotId)
    return movementId
  }

  function receive({ variantId, warehouseId, qty, lotNo = '', expiryDate = '', reason = '', userId = '', refType = '', refId = '' }) {
    assertQty(qty)
    return transaction(() => {
      const variant = loadVariant(variantId)
      assertWarehouse(warehouseId, variant.type)
      if (!variant.variant_active || !variant.item_active) throw new StockError('INACTIVE', 'สินค้านี้ถูกปิดใช้งาน')
      const lot = variant.track_lot ? String(lotNo || '').trim() : ''
      const expiry = variant.track_expiry ? String(expiryDate || '').trim() : ''
      if (variant.track_lot && !lot) throw new StockError('LOT_REQUIRED', 'กรุณาระบุเลขล็อต')
      if (variant.track_expiry && !isCalendarDate(expiry)) throw new StockError('EXPIRY_REQUIRED', 'กรุณาระบุวันหมดอายุ (YYYY-MM-DD)')
      let lotRow = db.prepare('SELECT id, expiry_date FROM stock_lots WHERE variant_id = ? AND warehouse_id = ? AND lot_no = ?').get(variantId, warehouseId, lot)
      if (lotRow && variant.track_expiry && lotRow.expiry_date !== expiry) throw new StockError('EXPIRY_MISMATCH', 'เลขล็อตนี้มีวันหมดอายุไม่ตรงกับที่รับเข้าไว้ก่อนหน้า')
      if (!lotRow) {
        const lotId = randomUUID()
        db.prepare('INSERT INTO stock_lots (id, variant_id, warehouse_id, lot_no, expiry_date, received_at) VALUES (?, ?, ?, ?, ?, ?)').run(lotId, variantId, warehouseId, lot, expiry, now())
        lotRow = { id: lotId }
      }
      const movementId = applyMovement({ type: 'receive', variantId, warehouseId, lotId: lotRow.id, qty, refType, refId, reason, userId })
      return { movementId, lotId: lotRow.id }
    })
  }

  function balance({ variantId, warehouseId, lotId }) {
    const row = db.prepare(`SELECT COALESCE(SUM(on_hand), 0) AS on_hand, COALESCE(SUM(reserved), 0) AS reserved FROM stock_balances
                            WHERE variant_id = ? AND warehouse_id = ? ${lotId === undefined ? '' : 'AND lot_id = ?'}`).get(...[variantId, warehouseId, ...(lotId === undefined ? [] : [lotId])])
    return { onHand: row.on_hand, reserved: row.reserved, available: row.on_hand - row.reserved }
  }

  /** Recomputes every balance from the ledger and reports any that disagree. */
  function verifyIntegrity() {
    const ledgerRows = db.prepare('SELECT variant_id, warehouse_id, lot_id, SUM(qty) AS total FROM stock_movements GROUP BY variant_id, warehouse_id, lot_id').all()
    const balanceRows = db.prepare('SELECT variant_id, warehouse_id, lot_id, on_hand FROM stock_balances').all()
    const keyOf = (row) => `${row.variant_id}|${row.warehouse_id}|${row.lot_id}`
    const table = new Map()
    for (const row of ledgerRows) table.set(keyOf(row), { variantId: row.variant_id, warehouseId: row.warehouse_id, lotId: row.lot_id, ledger: row.total, balance: 0 })
    for (const row of balanceRows) {
      const entry = table.get(keyOf(row)) || { variantId: row.variant_id, warehouseId: row.warehouse_id, lotId: row.lot_id, ledger: 0, balance: 0 }
      entry.balance = row.on_hand
      table.set(keyOf(row), entry)
    }
    const mismatches = [...table.values()].filter((entry) => entry.ledger !== entry.balance)
    return { ok: mismatches.length === 0, mismatches }
  }

  /** Takes stock first-expiry-first-out. Expired lots are skipped; all-or-nothing across lots. */
  function issueFefo({ variantId, warehouseId, qty, userId = '', refType = '', refId = '' }) {
    assertQty(qty)
    return transaction(() => {
      loadVariant(variantId)
      assertWarehouse(warehouseId)
      const lots = db.prepare(`SELECT l.id AS lot_id, b.on_hand, b.reserved FROM stock_lots l
                               JOIN stock_balances b ON b.variant_id = l.variant_id AND b.warehouse_id = l.warehouse_id AND b.lot_id = l.id
                               WHERE l.variant_id = ? AND l.warehouse_id = ? AND b.on_hand - b.reserved > 0 AND (l.expiry_date = '' OR l.expiry_date >= ?)
                               ORDER BY (l.expiry_date = '') ASC, l.expiry_date ASC, l.received_at ASC, l.rowid ASC`).all(variantId, warehouseId, today())
      let remaining = qty
      const picks = []
      for (const lot of lots) {
        if (remaining === 0) break
        const take = Math.min(remaining, lot.on_hand - lot.reserved)
        const movementId = applyMovement({ type: 'issue', variantId, warehouseId, lotId: lot.lot_id, qty: -take, refType, refId, userId })
        picks.push({ lotId: lot.lot_id, qty: take, movementId })
        remaining -= take
      }
      if (remaining > 0) throw new StockError('INSUFFICIENT_STOCK', 'สต็อกที่ใช้ได้ไม่เพียงพอ')
      return { picks }
    })
  }

  /** Puts issued stock back into the lot it came from. */
  function returnStock({ variantId, warehouseId, lotId, qty, userId = '', refType = '', refId = '', reason = '' }) {
    assertQty(qty)
    return transaction(() => {
      loadVariant(variantId)
      assertWarehouse(warehouseId)
      if (!db.prepare('SELECT id FROM stock_lots WHERE id = ? AND variant_id = ? AND warehouse_id = ?').get(lotId, variantId, warehouseId)) throw new StockError('NOT_FOUND', 'ไม่พบล็อตสินค้า')
      return { movementId: applyMovement({ type: 'return', variantId, warehouseId, lotId, qty, refType, refId, reason, userId }) }
    })
  }

  const WRITE_OFF_REASONS = ['expired', 'damaged', 'lost', 'other']

  function findLot(variantId, warehouseId, lotId) {
    const lot = db.prepare('SELECT id, lot_no, expiry_date FROM stock_lots WHERE id = ? AND variant_id = ? AND warehouse_id = ?').get(lotId, variantId, warehouseId)
    if (!lot) throw new StockError('NOT_FOUND', 'ไม่พบล็อตสินค้า')
    return lot
  }

  /** Manual correction (positive or negative). Works on inactive items; a reason is mandatory. */
  function adjust({ variantId, warehouseId, lotId, delta, reason, userId = '' }) {
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_QTY) throw new StockError('INVALID_QTY', 'จำนวนที่ปรับต้องเป็นจำนวนเต็ม ไม่เป็นศูนย์ และไม่เกิน 1,000,000,000')
    const text = String(reason ?? '').trim()
    if (!text) throw new StockError('REASON_REQUIRED', 'กรุณาระบุเหตุผล')
    return transaction(() => {
      loadVariant(variantId)
      assertWarehouse(warehouseId)
      findLot(variantId, warehouseId, lotId)
      return { movementId: applyMovement({ type: 'adjust', variantId, warehouseId, lotId, qty: delta, reason: text, userId }) }
    })
  }

  function writeOff({ variantId, warehouseId, lotId, qty, reason, note = '', userId = '' }) {
    assertQty(qty)
    if (!WRITE_OFF_REASONS.includes(reason)) throw new StockError('REASON_REQUIRED', 'กรุณาเลือกเหตุผลการตัดจำหน่าย')
    const detail = String(note || '').trim()
    return transaction(() => {
      loadVariant(variantId)
      assertWarehouse(warehouseId)
      findLot(variantId, warehouseId, lotId)
      return { movementId: applyMovement({ type: 'write_off', variantId, warehouseId, lotId, qty: -qty, reason: detail ? `${reason}: ${detail}` : reason, userId }) }
    })
  }

  /** Moves a lot between warehouses; only available (not reserved) stock can move. */
  function transfer({ variantId, fromWarehouseId, toWarehouseId, lotId, qty, userId = '' }) {
    assertQty(qty)
    if (fromWarehouseId === toWarehouseId) throw new StockError('SAME_WAREHOUSE', 'คลังต้นทางและปลายทางต้องไม่ใช่คลังเดียวกัน')
    return transaction(() => {
      const variant = loadVariant(variantId)
      assertWarehouse(fromWarehouseId)
      assertWarehouse(toWarehouseId, variant.type)
      const lot = findLot(variantId, fromWarehouseId, lotId)
      if (balance({ variantId, warehouseId: fromWarehouseId, lotId }).available < qty) throw new StockError('INSUFFICIENT_STOCK', 'สต็อกที่ใช้ได้ไม่เพียงพอ')
      let target = db.prepare('SELECT id, expiry_date FROM stock_lots WHERE variant_id = ? AND warehouse_id = ? AND lot_no = ?').get(variantId, toWarehouseId, lot.lot_no)
      if (target && target.expiry_date !== lot.expiry_date) throw new StockError('EXPIRY_MISMATCH', 'เลขล็อตนี้ในคลังปลายทางมีวันหมดอายุไม่ตรงกัน')
      if (!target) {
        target = { id: randomUUID() }
        db.prepare('INSERT INTO stock_lots (id, variant_id, warehouse_id, lot_no, expiry_date, received_at) VALUES (?, ?, ?, ?, ?, ?)').run(target.id, variantId, toWarehouseId, lot.lot_no, lot.expiry_date, now())
      }
      const outId = applyMovement({ type: 'transfer_out', variantId, warehouseId: fromWarehouseId, lotId, qty: -qty, refType: 'warehouse', refId: toWarehouseId, userId })
      const inId = applyMovement({ type: 'transfer_in', variantId, warehouseId: toWarehouseId, lotId: target.id, qty, refType: 'warehouse', refId: fromWarehouseId, userId })
      return { outId, inId, toLotId: target.id }
    })
  }

  /** FEFO candidates for reserving: non-expired lots with unreserved stock. */
  function reservableLots(variantId, warehouseId) {
    return db.prepare(`SELECT l.id AS lot_id, b.on_hand, b.reserved FROM stock_lots l
                       JOIN stock_balances b ON b.variant_id = l.variant_id AND b.warehouse_id = l.warehouse_id AND b.lot_id = l.id
                       WHERE l.variant_id = ? AND l.warehouse_id = ? AND b.on_hand - b.reserved > 0 AND (l.expiry_date = '' OR l.expiry_date >= ?)
                       ORDER BY (l.expiry_date = '') ASC, l.expiry_date ASC, l.received_at ASC, l.rowid ASC`).all(variantId, warehouseId, today())
  }

  /** Reserves as much as is available (up to qty) and returns the lots used; callers decide whether a shortfall is an error. */
  function reserveUpTo({ variantId, warehouseId, qty, refType, refId }) {
    let remaining = qty
    const reserved = []
    for (const lot of reservableLots(variantId, warehouseId)) {
      if (remaining === 0) break
      const take = Math.min(remaining, lot.on_hand - lot.reserved)
      db.prepare('INSERT INTO stock_reservations (id, ref_type, ref_id, variant_id, warehouse_id, lot_id, qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), refType, refId, variantId, warehouseId, lot.lot_id, take, now())
      db.prepare('UPDATE stock_balances SET reserved = reserved + ? WHERE variant_id = ? AND warehouse_id = ? AND lot_id = ?').run(take, variantId, warehouseId, lot.lot_id)
      reserved.push({ lotId: lot.lot_id, qty: take })
      remaining -= take
    }
    return { reserved, short: remaining }
  }

  function dropReservationRow(row) {
    db.prepare('UPDATE stock_balances SET reserved = reserved - ? WHERE variant_id = ? AND warehouse_id = ? AND lot_id = ?').run(row.qty, row.variant_id, row.warehouse_id, row.lot_id)
    db.prepare('DELETE FROM stock_reservations WHERE id = ?').run(row.id)
  }

  /** Holds stock for a reference (e.g. a requisition), first-expiry-first-out, all-or-nothing. */
  function reserve({ variantId, warehouseId, qty, refType, refId }) {
    assertQty(qty)
    return transaction(() => {
      loadVariant(variantId)
      assertWarehouse(warehouseId)
      const { reserved, short } = reserveUpTo({ variantId, warehouseId, qty, refType, refId })
      if (short > 0) throw new StockError('INSUFFICIENT_STOCK', 'สต็อกที่ใช้ได้ไม่เพียงพอ')
      return { reserved }
    })
  }

  /** Frees the holds of a reference (optionally one variant). Returns the quantity released. */
  function release({ refType, refId, variantId }) {
    return transaction(() => {
      const rows = db.prepare(`SELECT * FROM stock_reservations WHERE ref_type = ? AND ref_id = ? ${variantId ? 'AND variant_id = ?' : ''}`).all(...[refType, refId, ...(variantId ? [variantId] : [])])
      let total = 0
      for (const row of rows) { dropReservationRow(row); total += row.qty }
      return total
    })
  }

  /** Quantity that could be reserved right now (non-expired, not already held). */
  function availableToReserve({ variantId, warehouseId }) {
    return reservableLots(variantId, warehouseId).reduce((sum, lot) => sum + (lot.on_hand - lot.reserved), 0)
  }

  function reservedFor({ refType, refId, variantId }) {
    return db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM stock_reservations WHERE ref_type = ? AND ref_id = ? AND variant_id = ?').get(refType, refId, variantId).n
  }

  /**
   * Issues stock that was reserved for a reference. Holds sitting on lots that expired since are first moved to other lots
   * (as far as stock allows); if the reserved quantity still falls short nothing is written.
   */
  function issueReserved({ refType, refId, variantId, warehouseId, qty, userId = '' }) {
    assertQty(qty)
    return transaction(() => {
      loadVariant(variantId)
      assertWarehouse(warehouseId)
      const select = () => db.prepare(`SELECT r.*, l.expiry_date FROM stock_reservations r JOIN stock_lots l ON l.id = r.lot_id
                                       WHERE r.ref_type = ? AND r.ref_id = ? AND r.variant_id = ?
                                       ORDER BY (l.expiry_date = '') ASC, l.expiry_date ASC, l.received_at ASC, l.rowid ASC`).all(refType, refId, variantId)
      const expired = select().filter((row) => row.expiry_date !== '' && row.expiry_date < today())
      if (expired.length) {
        const total = expired.reduce((sum, row) => sum + row.qty, 0)
        for (const row of expired) dropReservationRow(row)
        reserveUpTo({ variantId, warehouseId, qty: total, refType, refId })
      }
      const rows = select()
      if (rows.reduce((sum, row) => sum + row.qty, 0) < qty) throw new StockError('INSUFFICIENT_STOCK', 'สต็อกที่จองไว้ไม่เพียงพอ (ล็อตที่จองหมดอายุหรือสต็อกถูกปรับลด)')
      let remaining = qty
      const picks = []
      for (const row of rows) {
        if (remaining === 0) break
        const take = Math.min(remaining, row.qty)
        const movementId = applyMovement({ type: 'issue', variantId, warehouseId, lotId: row.lot_id, qty: -take, refType, refId, userId })
        db.prepare('UPDATE stock_balances SET reserved = reserved - ? WHERE variant_id = ? AND warehouse_id = ? AND lot_id = ?').run(take, variantId, warehouseId, row.lot_id)
        if (take === row.qty) db.prepare('DELETE FROM stock_reservations WHERE id = ?').run(row.id)
        else db.prepare('UPDATE stock_reservations SET qty = qty - ? WHERE id = ?').run(take, row.id)
        picks.push({ lotId: row.lot_id, qty: take, movementId })
        remaining -= take
      }
      return { picks }
    })
  }

  return { transaction, receive, reserve, release, reservedFor, availableToReserve, issueReserved, issueFefo, returnStock, adjust, writeOff, transfer, balance, verifyIntegrity, _internal: { applyMovement, loadVariant, assertWarehouse, assertQty, today, now } }
}
