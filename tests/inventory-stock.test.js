import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateInventory } from '../server/inventory/schema.js'
import { StockError, createStockService } from '../server/inventory/stock.js'
import { createCountService } from '../server/inventory/counts.js'

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

describe('adjust, write-off and transfer', () => {
  const receive = (warehouseId = ids.w1, qty = 10) => stock.receive({ variantId: ids.med, warehouseId, qty, lotNo: 'L1', expiryDate: '2026-12-31', userId: 'u1' })

  test('adjust requires a reason', () => {
    const lot = receive()
    for (const reason of ['', '   ', undefined]) rejects(() => stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: 1, reason, userId: 'u1' }), 'REASON_REQUIRED')
  })

  test('adjust moves stock up and down with signed ledger rows and rejects zero delta', () => {
    const lot = receive()
    stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: -4, reason: 'นับขาด', userId: 'u1' })
    stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: 2, reason: 'พบเพิ่ม', userId: 'u1' })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 8)
    assert.deepEqual(ledger().filter((row) => row.type === 'adjust').map((row) => [row.qty, row.reason]), [[-4, 'นับขาด'], [2, 'พบเพิ่ม']])
    rejects(() => stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: 0, reason: 'x', userId: 'u1' }), 'INVALID_QTY')
    rejects(() => stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: 1.5, reason: 'x', userId: 'u1' }), 'INVALID_QTY')
  })

  test('adjust cannot take on_hand below 0', () => {
    const lot = receive(ids.w1, 3)
    rejects(() => stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: -4, reason: 'x', userId: 'u1' }), 'INSUFFICIENT_STOCK')
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 3)
  })

  test('adjust works on inactive variants', () => {
    db.exec("UPDATE item_variants SET is_active = 0 WHERE id = 'v-med'")
    const lot = db.prepare("INSERT INTO stock_lots (id, variant_id, warehouse_id, lot_no, expiry_date, received_at) VALUES ('l-x','v-med','w1','X','2027-01-01','2026-01-01T00:00:00Z') RETURNING id").get()
    stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.id, delta: 2, reason: 'ยกยอด', userId: 'u1' })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 2)
  })

  test('writeOff reason must be one of the four', () => {
    const lot = receive()
    for (const reason of ['stolen', '', undefined]) rejects(() => stock.writeOff({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, qty: 1, reason, userId: 'u1' }), 'REASON_REQUIRED')
  })

  test('writeOff reduces stock with type write_off and keeps the note', () => {
    const lot = receive()
    stock.writeOff({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, qty: 4, reason: 'expired', note: 'หมดอายุตามล็อต', userId: 'u1' })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 6)
    const row = ledger().at(-1)
    assert.equal(row.type, 'write_off')
    assert.equal(row.qty, -4)
    assert.equal(row.reason, 'expired: หมดอายุตามล็อต')
    rejects(() => stock.writeOff({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, qty: 99, reason: 'lost', userId: 'u1' }), 'INSUFFICIENT_STOCK')
  })

  test('transfer moves stock and keeps lot number and expiry', () => {
    const lot = receive(ids.w1, 10)
    const result = stock.transfer({ variantId: ids.med, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, lotId: lot.lotId, qty: 4, userId: 'u1' })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 6)
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w2 }).onHand, 4)
    const destination = db.prepare('SELECT lot_no, expiry_date FROM stock_lots WHERE id = ?').get(result.toLotId)
    assert.deepEqual({ ...destination }, { lot_no: 'L1', expiry_date: '2026-12-31' })
    assert.deepEqual(ledger().filter((row) => row.type.startsWith('transfer')).map((row) => [row.type, row.warehouse_id, row.qty]), [['transfer_out', 'w1', -4], ['transfer_in', 'w2', 4]])
    stock.transfer({ variantId: ids.med, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, lotId: lot.lotId, qty: 1, userId: 'u1' })
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_lots WHERE warehouse_id = 'w2'").get().n, 1)
    assert.deepEqual(stock.verifyIntegrity(), { ok: true, mismatches: [] })
  })

  test('transfer to the same warehouse throws SAME_WAREHOUSE', () => {
    const lot = receive()
    rejects(() => stock.transfer({ variantId: ids.med, fromWarehouseId: ids.w1, toWarehouseId: ids.w1, lotId: lot.lotId, qty: 1, userId: 'u1' }), 'SAME_WAREHOUSE')
  })

  test('transfer more than on hand throws and changes nothing', () => {
    const lot = receive(ids.w1, 3)
    rejects(() => stock.transfer({ variantId: ids.med, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, lotId: lot.lotId, qty: 4, userId: 'u1' }), 'INSUFFICIENT_STOCK')
    assert.equal(ledger().length, 1)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_lots WHERE warehouse_id = 'w2'").get().n, 0)
  })

  test('transfer cannot move reserved stock', () => {
    const lot = receive(ids.w1, 5)
    db.exec("UPDATE stock_balances SET reserved = 4 WHERE variant_id = 'v-med'")
    rejects(() => stock.transfer({ variantId: ids.med, fromWarehouseId: ids.w1, toWarehouseId: ids.w2, lotId: lot.lotId, qty: 2, userId: 'u1' }), 'INSUFFICIENT_STOCK')
  })
})

describe('stock counts', () => {
  let counts
  let lotA
  let lotB
  beforeEach(() => {
    counts = createCountService(db, stock)
    lotA = stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 10, lotNo: 'A', expiryDate: '2026-12-31', userId: 'u1' })
    lotB = stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, lotNo: 'B', expiryDate: '2027-03-31', userId: 'u1' })
  })
  const adjustments = () => ledger().filter((row) => row.type === 'count_adjust')

  test('count sheet snapshots balances', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    const lines = db.prepare('SELECT lot_id, system_qty, counted_qty FROM stock_count_lines WHERE count_id = ? ORDER BY system_qty').all(id)
    assert.deepEqual(lines.map((line) => [line.lot_id, line.system_qty, line.counted_qty]), [[lotB.lotId, 5, null], [lotA.lotId, 10, null]])
    assert.equal(db.prepare('SELECT status FROM stock_counts WHERE id = ?').get(id).status, 'draft')
  })

  test('posting writes only non-zero differences', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    counts.setLines(id, [{ variantId: ids.med, lotId: lotA.lotId, countedQty: 8 }, { variantId: ids.med, lotId: lotB.lotId, countedQty: 5 }])
    assert.equal(db.prepare('SELECT status FROM stock_counts WHERE id = ?').get(id).status, 'counting')
    assert.deepEqual(counts.post(id, 'u2'), { adjustments: 1 })
    assert.deepEqual(adjustments().map((row) => [row.lot_id, row.qty, row.ref_type, row.ref_id]), [[lotA.lotId, -2, 'stock_count', id]])
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 13)
    assert.equal(db.prepare('SELECT status FROM stock_counts WHERE id = ?').get(id).status, 'posted')
  })

  test('difference uses on_hand at post time', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 3, lotNo: 'A', expiryDate: '2026-12-31', userId: 'u1' })
    counts.setLines(id, [{ variantId: ids.med, lotId: lotA.lotId, countedQty: 13 }])
    assert.deepEqual(counts.post(id, 'u2'), { adjustments: 0 })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1, lotId: lotA.lotId }).onHand, 13)
  })

  test('posting twice throws ALREADY_POSTED', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    counts.setLines(id, [{ variantId: ids.med, lotId: lotA.lotId, countedQty: 9 }])
    counts.post(id, 'u2')
    rejects(() => counts.post(id, 'u2'), 'ALREADY_POSTED')
    assert.equal(adjustments().length, 1)
  })

  test('lines cannot be edited after posting', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    counts.post(id, 'u2')
    rejects(() => counts.setLines(id, [{ variantId: ids.med, lotId: lotA.lotId, countedQty: 1 }]), 'ALREADY_POSTED')
  })

  test('uncounted lines are left alone', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    assert.deepEqual(counts.post(id, 'u2'), { adjustments: 0 })
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 15)
  })

  test('invalid counted quantity or foreign line is rejected and nothing is saved', () => {
    const { id } = counts.create({ warehouseId: ids.w1, userId: 'u1' })
    for (const countedQty of [-1, 1.5, '4']) rejects(() => counts.setLines(id, [{ variantId: ids.med, lotId: lotA.lotId, countedQty }]), 'INVALID_QTY')
    rejects(() => counts.setLines(id, [{ variantId: ids.med, lotId: 'not-on-sheet', countedQty: 1 }]), 'NOT_FOUND')
    rejects(() => counts.setLines(id, [{ variantId: ids.med, lotId: lotA.lotId, countedQty: 4 }, { variantId: ids.med, lotId: 'not-on-sheet', countedQty: 1 }]), 'NOT_FOUND')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_count_lines WHERE counted_qty IS NOT NULL').get().n, 0)
  })

  test('count for an unknown warehouse is refused', () => {
    rejects(() => counts.create({ warehouseId: 'nope', userId: 'u1' }), 'NOT_FOUND')
  })
})

describe('input hardening', () => {
  test('quantities above one billion are refused everywhere', () => {
    for (const qty of [1_000_000_001, 1e21, Number.MAX_SAFE_INTEGER]) rejects(() => stock.receive({ variantId: ids.ppe, warehouseId: ids.w1, qty, userId: 'u1' }), 'INVALID_QTY')
    const lot = stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 5, lotNo: 'L1', expiryDate: '2027-01-01', userId: 'u1' })
    rejects(() => stock.adjust({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, delta: 1e21, reason: 'x', userId: 'u1' }), 'INVALID_QTY')
    rejects(() => stock.writeOff({ variantId: ids.med, warehouseId: ids.w1, lotId: lot.lotId, qty: 1e21, reason: 'lost', userId: 'u1' }), 'INVALID_QTY')
    assert.equal(stock.balance({ variantId: ids.med, warehouseId: ids.w1 }).onHand, 5)
  })

  test('expiry dates must be real calendar dates', () => {
    for (const expiryDate of ['2026-13-45', '2026-02-30', '0000-00-00', '2026-1-5']) {
      rejects(() => stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 1, lotNo: 'L-BAD', expiryDate, userId: 'u1' }), 'EXPIRY_REQUIRED')
    }
    assert.equal(ledger().length, 0)
    stock.receive({ variantId: ids.med, warehouseId: ids.w1, qty: 1, lotNo: 'L-OK', expiryDate: '2028-02-29', userId: 'u1' })
    assert.equal(ledger().length, 1)
  })
})
