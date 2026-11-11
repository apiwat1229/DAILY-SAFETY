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
      ('i-med', 'MED-1', 'พาราเซตามอล', 'medicine', 'แผง', 5, 1, 1, 1, '${now}'),
      ('i-lot', 'LOT-1', 'น้ำยาล้างตา', 'medicine', 'ขวด', 5, 1, 0, 1, '${now}');
    INSERT INTO item_variants (id, item_id, label, is_active) VALUES ('v-ppe', 'i-ppe', 'M', 1), ('v-med', 'i-med', '', 1), ('v-off', 'i-ppe', 'XL', 0), ('v-lot', 'i-lot', '', 1);
    INSERT INTO warehouses (id, code, name, is_active) VALUES ('w1', 'W1', 'คลัง 1', 1), ('w2', 'W2', 'คลัง 2', 1);
  `)
  stock = createStockService(db, { today: () => TODAY })
  ids = { ppe: 'v-ppe', med: 'v-med', lot: 'v-lot', w1: 'w1', w2: 'w2' }
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

describe('FEFO issue and returns', () => {
  const receiveMed = (lotNo, expiryDate, qty) => stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty, lotNo, expiryDate, userId: 'u1' })

  test('issue takes the earliest expiry first across lots', () => {
    const late = receiveMed('L-LATE', '2027-01-01', 5)
    const early = receiveMed('L-EARLY', '2026-12-01', 5)
    const { picks } = stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 7, userId: 'u2', refType: 'requisition', refId: 'r1' })
    assert.deepEqual(picks.map((pick) => [pick.lotId, pick.qty]), [[early.lotId, 5], [late.lotId, 2]])
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 3)
    const issued = ledger().filter((row) => row.type === 'issue')
    assert.deepEqual(issued.map((row) => [row.qty, row.ref_type, row.ref_id]), [[-5, 'requisition', 'r1'], [-2, 'requisition', 'r1']])
  })

  test('lots without expiry come after expiring lots, oldest received first', () => {
    let tick = 0
    const timed = createStockService(db, { today: () => TODAY, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() })
    const noExpiryOld = timed.receive({ variantId: ids.lot, warehouseId: ids.w1, qty: 2, lotNo: 'A', userId: 'u1' })
    const noExpiryNew = timed.receive({ variantId: ids.lot, warehouseId: ids.w1, qty: 2, lotNo: 'B', userId: 'u1' })
    const { picks } = timed.issueFefo({ variantId: ids.lot, warehouseId: ids.w1, qty: 3, userId: 'u2' })
    assert.deepEqual(picks.map((pick) => [pick.lotId, pick.qty]), [[noExpiryOld.lotId, 2], [noExpiryNew.lotId, 1]])
  })

  test('expired lot is skipped', () => {
    receiveMed('L-OLD', '2026-11-10', 9)
    const fresh = receiveMed('L-OK', '2026-12-01', 4)
    const { picks } = stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 4, userId: 'u2' })
    assert.deepEqual(picks.map((pick) => pick.lotId), [fresh.lotId])
    rejects(() => stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 1, userId: 'u2' }), 'INSUFFICIENT_STOCK')
  })

  test('a lot expiring today is still issuable', () => {
    const today = receiveMed('L-TODAY', TODAY, 2)
    assert.deepEqual(stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 2, userId: 'u2' }).picks.map((pick) => pick.lotId), [today.lotId])
  })

  test('issue beyond non-expired stock throws and changes nothing', () => {
    receiveMed('L1', '2026-12-01', 3)
    receiveMed('L2', '2027-01-01', 3)
    const before = { ledger: ledger().length, balance: stock.balance({ variantId: ids.med, warehouseId: ids.w1 }) }
    rejects(() => stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 7, userId: 'u2' }), 'INSUFFICIENT_STOCK')
    assert.equal(ledger().length, before.ledger)
    assert.deepEqual(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }), before.balance)
    assert.deepEqual(stock.verifyIntegrity(), { ok: true, mismatches: [] })
  })

  test('issue respects reserved stock', () => {
    receiveMed('L1', '2026-12-01', 5)
    db.exec("UPDATE stock_balances SET reserved = 3 WHERE variant_id = 'v-med'")
    rejects(() => stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 3, userId: 'u2' }), 'INSUFFICIENT_STOCK')
    assert.equal(stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 2, userId: 'u2' }).picks[0].qty, 2)
  })

  test('issue validates qty', () => {
    receiveMed('L1', '2026-12-01', 5)
    for (const qty of [0, -2, 1.5]) rejects(() => stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty, userId: 'u2' }), 'INVALID_QTY')
  })

  test('returnStock adds back to the same lot', () => {
    const lot = receiveMed('L1', '2026-12-01', 5)
    stock.issueFefo({ variantId: ids.med, warehouseId: ids.w1, qty: 5, userId: 'u2' })
    stock.returnStock({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, qty: 2, userId: 'u2', refType: 'requisition', refId: 'r1' })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId }).onHand, 2)
    assert.equal(ledger().at(-1).type, 'return')
  })

  test('returnStock to an unknown lot throws NOT_FOUND', () => {
    rejects(() => stock.returnStock({ variantId: ids.med, warehouseId: ids.w1, lotId: 'missing', qty: 1, userId: 'u2' }), 'NOT_FOUND')
  })
})
