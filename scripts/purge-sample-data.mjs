// Removes the demo data created by scripts/seed-samples.mjs so real data can take its place.
//
//   DATA_DIR=/app/data node scripts/purge-sample-data.mjs --dry-run   (only reports what it would remove)
//   DATA_DIR=/app/data node scripts/purge-sample-data.mjs             (removes it, permanently)
//
// Take a backup first. Stock movements and requisition events are append-only, so their guards are lifted inside one
// transaction and put back before it commits. Nothing runs if any requisition is not a sample one.
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const SAMPLE_WAREHOUSES = ['SAMPLE', 'PPE-SAMPLE', 'MED-SAMPLE']
const SAMPLE_CATEGORIES = ['ศีรษะ', 'ดวงตาและใบหน้า', 'มือ', 'หู', 'ระบบหายใจ', 'เท้า', 'ร่างกาย', 'ป้องกันการตก', 'ยาแก้ปวดลดไข้', 'ยาแก้แพ้', 'ปฐมพยาบาล', 'เกลือแร่และระบบทางเดินอาหาร', 'ยาใช้ภายนอก', 'อุปกรณ์ป้องกัน (ตัวอย่าง)', 'ยาสามัญประจำบ้าน (ตัวอย่าง)']
const SAMPLE_USER = 'demo-e01'
const SAMPLE_EMPLOYEE = 'DEMO-E01'
const SAMPLE_REASON = '[ตัวอย่าง]'
const GUARDS = ['stock_movements_no_update', 'stock_movements_no_delete', 'requisition_events_no_update', 'requisition_events_no_delete']

const placeholders = (values) => values.map(() => '?').join(',') || "''"
const thumbOf = (name) => name.replace(/\.jpg$/, '.thumb.jpg')

export async function purgeSampleData(db, { uploadDir, dryRun = false }) {
  const all = (sql, ...params) => db.prepare(sql).all(...params)
  const one = (sql, ...params) => db.prepare(sql).get(...params)

  const items = all("SELECT id, image FROM items WHERE sku LIKE 'DEMO-%'")
  const itemIds = items.map((row) => row.id)
  const variantIds = all(`SELECT id FROM item_variants WHERE item_id IN (${placeholders(itemIds)})`, ...itemIds).map((row) => row.id)
  const warehouseIds = all(`SELECT id FROM warehouses WHERE code IN (${placeholders(SAMPLE_WAREHOUSES)})`, ...SAMPLE_WAREHOUSES).map((row) => row.id)
  const users = all('SELECT id FROM users WHERE username = ?', SAMPLE_USER).map((row) => row.id)

  // Safety checks: stop rather than delete anything real.
  const requisitions = all('SELECT id, requester_id, reason FROM requisitions')
  const foreign = requisitions.filter((row) => !users.includes(row.requester_id) && !String(row.reason).startsWith(SAMPLE_REASON))
  if (foreign.length) throw new Error(`${foreign.length} requisition(s) are not a sample requisition; nothing was removed`)
  if (warehouseIds.length) {
    const stray = one(`SELECT COUNT(*) AS n FROM stock_movements WHERE warehouse_id IN (${placeholders(warehouseIds)}) AND variant_id NOT IN (${placeholders(variantIds)})`, ...warehouseIds, ...variantIds).n
    if (stray) throw new Error(`${stray} stock movement(s) of real items sit in a sample warehouse; nothing was removed`)
  }

  const movementSql = `SELECT COUNT(*) AS n FROM stock_movements WHERE variant_id IN (${placeholders(variantIds)}) OR warehouse_id IN (${placeholders(warehouseIds)})`
  const report = {
    items: items.length, warehouses: warehouseIds.length, requisitions: requisitions.length, users: users.length,
    movements: one(movementSql, ...variantIds, ...warehouseIds).n, dryRun,
  }
  if (dryRun) return report

  const photoFiles = [
    ...items.filter((row) => row.image).flatMap((row) => [['inventory', row.image], ['inventory', thumbOf(row.image)]]),
    ...all('SELECT stored_name, thumb_name FROM requisition_photos').flatMap((row) => [['requisitions', row.stored_name], ['requisitions', row.thumb_name]]),
  ]
  const reqIds = requisitions.map((row) => row.id)
  const guards = GUARDS.map((name) => one("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", name)).filter(Boolean)

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const guard of guards) db.exec(`DROP TRIGGER ${guard.name}`)
    const run = (sql, ...params) => db.prepare(sql).run(...params)
    const counts = all(`SELECT id FROM stock_counts WHERE warehouse_id IN (${placeholders(warehouseIds)})`, ...warehouseIds).map((row) => row.id)
    run(`DELETE FROM stock_count_lines WHERE count_id IN (${placeholders(counts)}) OR variant_id IN (${placeholders(variantIds)})`, ...counts, ...variantIds)
    run(`DELETE FROM stock_counts WHERE id IN (${placeholders(counts)})`, ...counts)
    for (const table of ['requisition_lines', 'requisition_steps', 'requisition_events', 'requisition_photos']) run(`DELETE FROM ${table} WHERE requisition_id IN (${placeholders(reqIds)})`, ...reqIds)
    run(`DELETE FROM requisitions WHERE id IN (${placeholders(reqIds)})`, ...reqIds)
    run(`DELETE FROM cart_lines WHERE variant_id IN (${placeholders(variantIds)}) OR cart_id IN (SELECT id FROM carts WHERE user_id IN (${placeholders(users)}))`, ...variantIds, ...users)
    run(`DELETE FROM carts WHERE user_id IN (${placeholders(users)})`, ...users)
    run(`DELETE FROM stock_reservations WHERE variant_id IN (${placeholders(variantIds)}) OR warehouse_id IN (${placeholders(warehouseIds)})`, ...variantIds, ...warehouseIds)
    run(`DELETE FROM stock_movements WHERE variant_id IN (${placeholders(variantIds)}) OR warehouse_id IN (${placeholders(warehouseIds)})`, ...variantIds, ...warehouseIds)
    run(`DELETE FROM stock_balances WHERE variant_id IN (${placeholders(variantIds)}) OR warehouse_id IN (${placeholders(warehouseIds)})`, ...variantIds, ...warehouseIds)
    run(`DELETE FROM stock_lots WHERE variant_id IN (${placeholders(variantIds)}) OR warehouse_id IN (${placeholders(warehouseIds)})`, ...variantIds, ...warehouseIds)
    run(`DELETE FROM warehouse_staff WHERE warehouse_id IN (${placeholders(warehouseIds)})`, ...warehouseIds)
    run(`DELETE FROM warehouses WHERE id IN (${placeholders(warehouseIds)})`, ...warehouseIds)
    run(`DELETE FROM item_variants WHERE item_id IN (${placeholders(itemIds)})`, ...itemIds)
    run(`DELETE FROM items WHERE id IN (${placeholders(itemIds)})`, ...itemIds)
    // Categories the sample script made go once they are empty; a category with real items stays.
    run(`DELETE FROM item_categories WHERE name IN (${placeholders(SAMPLE_CATEGORIES)}) AND id NOT IN (SELECT category_id FROM items)`, ...SAMPLE_CATEGORIES)
    // The sample user's own audit entries go with it; if anything real still points at the account, it is switched off instead.
    if (one("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'").n) run(`DELETE FROM audit_log WHERE user_id IN (${placeholders(users)})`, ...users)
    db.exec('SAVEPOINT remove_user')
    try { run(`DELETE FROM users WHERE id IN (${placeholders(users)})`, ...users); report.userRemoved = true }
    catch { db.exec('ROLLBACK TO remove_user'); run(`UPDATE users SET is_active = 0 WHERE id IN (${placeholders(users)})`, ...users); report.userRemoved = false }
    db.exec('RELEASE remove_user')
    run('DELETE FROM employee_directory WHERE employee_code = ?', SAMPLE_EMPLOYEE)
    if (one('SELECT COUNT(*) AS n FROM requisitions').n === 0) run('DELETE FROM requisition_counters')
    for (const guard of guards) db.exec(guard.sql)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  await Promise.allSettled(photoFiles.map(([folder, name]) => unlink(path.join(uploadDir, folder, path.basename(name)))))
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.DATA_DIR
  if (!dataDir) { console.error('Set DATA_DIR to the folder that holds daily-safety.sqlite'); process.exit(1) }
  const db = new DatabaseSync(path.join(dataDir, 'daily-safety.sqlite'))
  db.exec('PRAGMA busy_timeout = 10000') // the app may be writing at the same moment
  const dryRun = process.argv.includes('--dry-run')
  const report = await purgeSampleData(db, { uploadDir: path.join(dataDir, 'uploads'), dryRun })
  console.log(`${dryRun ? 'Would remove' : 'Removed'}: ${report.items} items, ${report.warehouses} warehouses, ${report.movements} stock movements, ${report.requisitions} requisitions, ${report.users} sample user${report.users && !report.dryRun ? (report.userRemoved ? ' (deleted)' : ' (switched off: real records still point to it)') : ''}`)
}
