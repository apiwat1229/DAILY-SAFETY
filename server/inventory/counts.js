import { randomUUID } from 'node:crypto'
import { StockError } from './stock.js'

/** Stock count sheets: snapshot a warehouse, record counted quantities, post the differences as count_adjust movements. */
export function createCountService(db, stock) {
  const { applyMovement, assertWarehouse, now } = stock._internal

  function loadCount(id) {
    const count = db.prepare('SELECT id, warehouse_id, status FROM stock_counts WHERE id = ?').get(id)
    if (!count) throw new StockError('NOT_FOUND', 'ไม่พบใบนับสต็อก')
    if (count.status === 'posted') throw new StockError('ALREADY_POSTED', 'ใบนับสต็อกนี้ปรับยอดแล้ว')
    return count
  }

  function create({ warehouseId, userId = '' }) {
    return stock.transaction(() => {
      assertWarehouse(warehouseId)
      const id = randomUUID()
      db.prepare("INSERT INTO stock_counts (id, warehouse_id, status, created_by, created_at) VALUES (?, ?, 'draft', ?, ?)").run(id, warehouseId, userId, now())
      db.prepare(`INSERT INTO stock_count_lines (count_id, variant_id, lot_id, system_qty)
                  SELECT ?, variant_id, lot_id, on_hand FROM stock_balances WHERE warehouse_id = ?`).run(id, warehouseId)
      return { id }
    })
  }

  /** Saves counted quantities. Every line must already be on the sheet; nothing is saved if any line is bad. */
  function setLines(id, lines) {
    return stock.transaction(() => {
      loadCount(id)
      const update = db.prepare('UPDATE stock_count_lines SET counted_qty = ? WHERE count_id = ? AND variant_id = ? AND lot_id = ?')
      for (const line of lines) {
        if (typeof line.countedQty !== 'number' || !Number.isInteger(line.countedQty) || line.countedQty < 0 || line.countedQty > 1_000_000_000) throw new StockError('INVALID_QTY', 'จำนวนที่นับต้องเป็นจำนวนเต็มตั้งแต่ 0')
        if (update.run(line.countedQty, id, line.variantId, line.lotId).changes === 0) throw new StockError('NOT_FOUND', 'ไม่พบรายการนี้ในใบนับสต็อก')
      }
      db.prepare("UPDATE stock_counts SET status = 'counting' WHERE id = ?").run(id)
    })
  }

  /** Difference = counted − on_hand now, so stock that moved after the sheet was made is not counted twice. */
  function post(id, userId = '') {
    return stock.transaction(() => {
      const count = loadCount(id)
      const lines = db.prepare('SELECT variant_id, lot_id, counted_qty FROM stock_count_lines WHERE count_id = ? AND counted_qty IS NOT NULL').all(id)
      let adjustments = 0
      for (const line of lines) {
        const current = stock.balance({ variantId: line.variant_id, warehouseId: count.warehouse_id, lotId: line.lot_id }).onHand
        const diff = line.counted_qty - current
        if (diff === 0) continue
        applyMovement({ type: 'count_adjust', variantId: line.variant_id, warehouseId: count.warehouse_id, lotId: line.lot_id, qty: diff, refType: 'stock_count', refId: id, reason: 'นับสต็อก', userId })
        adjustments += 1
      }
      db.prepare("UPDATE stock_counts SET status = 'posted', posted_at = ? WHERE id = ?").run(now(), id)
      return { adjustments }
    })
  }

  return { create, setLines, post }
}
