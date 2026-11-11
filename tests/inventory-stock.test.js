import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateInventory } from '../server/inventory/schema.js'
import { StockError, createStockService } from '../server/inventory/stock.js'

const TODAY = '2026-11-11'
let db
let stock
let ids

function seed() {
  db = new DatabaseSync(':memory:')
  migrateInventory(db)
  const now = '2026-01-01T00:00:00.000Z'
  db.exec(`
    INSERT INTO items (id, sku, name, type, unit, min_stock, track_lot, track_expiry, is_active, created_at) VALUES
      ('i-ppe', 'PPE-1', 'ถุงมือ', 'ppe', 'คู่', 5, 0, 0, 1, '${now}'),
      ('i-med', 'MED-1', 'พาราเซตามอล', 'medicine', 'แผง', 5, 1, 1, 1, '${now}');
    INSERT INTO item_variants (id, item_id, label, is_active) VALUES ('v-ppe', 'i-ppe', 'M', 1), ('v-med', 'i-med', '', 1), ('v-off', 'i-ppe', 'XL', 0);
    INSERT INTO warehouses (id, code, name, is_active) VALUES ('w1', 'W1', 'คลัง 1', 1), ('w2', 'W2', 'คลัง 2', 1);
  `)
  stock = createStockService(db, { today: () => TODAY })
  ids = { ppe: 'v-ppe', med: 'v-med', w1: 'w1', w2: 'w2' }
}
beforeEach(seed)

const ledger = () => db.prepare('SELECT * FROM stock_movements ORDER BY created_at, rowid').all()
const rejects = (fn, code) => assert.throws(fn, (error) => error instanceof StockError && error.code === code, `expected ${code}`)

describe('receive and balances', () => {
  test('receive adds on_hand and writes one ledger row', () => {
    const result = stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty: 10, userId: 'u1' })
    assert.ok(result.movementId)
    assert.deepEqual(stock.balance({ variantId: ids.ppe, warehouseId: ids.w1 }), { onHand: 10, reserved: 0, available: 10 })
    assert.equal(ledger().length, 1)
    assert.equal(ledger()[0].type, 'receive')
    assert.equal(ledger()[0].qty, 10)
  })

  test('receive rejects qty 0, -1, 1.5 and "3" and writes nothing', () => {
    for (const qty of [0, -1, 1.5, '3', NaN, null]) rejects(() => stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty, userId: 'u1' }), 'INVALID_QTY')
    assert.equal(ledger().length, 0)
  })

  test('medicine receive requires lot number and expiry date', () => {
    rejects(() => stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, expiryDate: '2027-01-01', userId: 'u1' }), 'LOT_REQUIRED')
    rejects(() => stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, lotNo: 'L1', userId: 'u1' }), 'EXPIRY_REQUIRED')
    rejects(() => stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, lotNo: 'L1', expiryDate: '01/01/2027', userId: 'u1' }), 'EXPIRY_REQUIRED')
    assert.equal(ledger().length, 0)
  })

  test('same lot number merges into one lot', () => {
    const first = stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, lotNo: 'L1', expiryDate: '2027-01-01', userId: 'u1' })
    const second = stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 3, lotNo: 'L1', expiryDate: '2027-01-01', userId: 'u1' })
    assert.equal(first.lotId, second.lotId)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_lots').get().n, 1)
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 8)
  })

  test('same lot number with a different expiry is refused', () => {
    stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, lotNo: 'L1', expiryDate: '2027-01-01', userId: 'u1' })
    rejects(() => stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 1, lotNo: 'L1', expiryDate: '2027-06-01', userId: 'u1' }), 'EXPIRY_MISMATCH')
    assert.equal(ledger().length, 1)
  })

  test('inactive variant and unknown ids cannot receive', () => {
    rejects(() => stock.receive({ variantId: 'v-off', warehouseId: ids.w1, qty: 1, userId: 'u1' }), 'INACTIVE')
    rejects(() => stock.receive({ variantId: 'nope', warehouseId: ids.w1, qty: 1, userId: 'u1' }), 'NOT_FOUND')
    rejects(() => stock.receive({ variantId: ids.ppe, warehouseId: 'nope', qty: 1, userId: 'u1' }), 'NOT_FOUND')
  })

  test('ledger rows cannot be updated or deleted', () => {
    stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty: 1, userId: 'u1' })
    assert.throws(() => db.exec('UPDATE stock_movements SET qty = 9'), /append-only/)
    assert.throws(() => db.exec('DELETE FROM stock_movements'), /append-only/)
  })

  test('verifyIntegrity is ok after receipts and detects a tampered balance', () => {
    stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty: 4, userId: 'u1' })
    stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 6, lotNo: 'L1', expiryDate: '2027-01-01', userId: 'u1' })
    assert.deepEqual(stock.verifyIntegrity(), { ok: true, mismatches: [] })
    db.exec("UPDATE stock_balances SET on_hand = on_hand + 1 WHERE variant_id = 'v-ppe'")
    const result = stock.verifyIntegrity()
    assert.equal(result.ok, false)
    assert.deepEqual(result.mismatches.map((row) => [row.variantId, row.ledger, row.balance]), [['v-ppe', 4, 5]])
  })

  test('transaction rolls back every receipt when one fails', () => {
    rejects(() => stock.transaction(() => {
      stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty: 2, userId: 'u1' })
      stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty: 0, userId: 'u1' })
    }), 'INVALID_QTY')
    assert.equal(ledger().length, 0)
    assert.equal(stock.balance({ variantId: ids.ppe, warehouseId: ids.w1 }).onHand, 0)
  })
})
