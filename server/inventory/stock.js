import { randomUUID } from 'node:crypto'

export class StockError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
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
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) throw new StockError('INVALID_QTY', 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0')
  }

  function loadVariant(variantId) {
    const row = db.prepare(`SELECT v.id, v.is_active AS variant_active, i.id AS item_id, i.name, i.type, i.track_lot, i.track_expiry, i.is_active AS item_active
                            FROM item_variants v JOIN items i ON i.id = v.item_id WHERE v.id = ?`).get(variantId)
    if (!row) throw new StockError('NOT_FOUND', 'ไม่พบสินค้า')
    return row
  }

  function assertWarehouse(warehouseId) {
    if (!db.prepare('SELECT id FROM warehouses WHERE id = ?').get(warehouseId)) throw new StockError('NOT_FOUND', 'ไม่พบคลัง')
  }

  /** Writes one signed ledger row and moves the balance. Refuses to take on_hand below zero. */
  function applyMovement({ type, variantId, warehouseId, lotId = '', qty, refType = '', refId = '', reason = '', userId = '' }) {
    const current = db.prepare('SELECT on_hand FROM stock_balances WHERE variant_id = ? AND warehouse_id = ? AND lot_id = ?').get(variantId, warehouseId, lotId)?.on_hand ?? 0
    if (current + qty < 0) throw new StockError('INSUFFICIENT_STOCK', 'สต็อกไม่เพียงพอ')
    const movementId = randomUUID()
    db.prepare(`INSERT INTO stock_movements (id, type, variant_id, warehouse_id, lot_id, qty, ref_type, ref_id, reason, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(movementId, type, variantId, warehouseId, lotId, qty, refType, refId, reason, userId, now())
    db.prepare(`INSERT INTO stock_balances (variant_id, warehouse_id, lot_id, on_hand) VALUES (?, ?, ?, ?)
                ON CONFLICT(variant_id, warehouse_id, lot_id) DO UPDATE SET on_hand = on_hand + excluded.on_hand`).run(variantId, warehouseId, lotId, qty)
    return movementId
  }

  function receive({ variantId, warehouseId, qty, lotNo = '', expiryDate = '', reason = '', userId = '', refType = '', refId = '' }) {
    assertQty(qty)
    return transaction(() => {
      const variant = loadVariant(variantId)
      assertWarehouse(warehouseId)
      if (!variant.variant_active || !variant.item_active) throw new StockError('INACTIVE', 'สินค้านี้ถูกปิดใช้งาน')
      const lot = variant.track_lot ? String(lotNo || '').trim() : ''
      const expiry = variant.track_expiry ? String(expiryDate || '').trim() : ''
      if (variant.track_lot && !lot) throw new StockError('LOT_REQUIRED', 'กรุณาระบุเลขล็อต')
      if (variant.track_expiry && !DATE_RE.test(expiry)) throw new StockError('EXPIRY_REQUIRED', 'กรุณาระบุวันหมดอายุ (YYYY-MM-DD)')
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

  return { transaction, receive, balance, verifyIntegrity, _internal: { applyMovement, loadVariant, assertWarehouse, assertQty, today, now } }
}
