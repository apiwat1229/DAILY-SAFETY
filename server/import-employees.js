import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importRosters, readRoster } from './employee-roster.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(appRoot, 'data')
const db = new DatabaseSync(path.join(dataDir, 'daily-safety.sqlite'))

async function main() {
  const [thaiPath, englishPath] = process.argv.slice(2)
  if (!thaiPath || !englishPath) throw new Error('Usage: node server/import-employees.js <thai-roster.xlsx> <english-roster.xlsx>')
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_directory (
      employee_code TEXT PRIMARY KEY,
      name_th TEXT NOT NULL DEFAULT '',
      name_en TEXT NOT NULL DEFAULT '',
      position_th TEXT NOT NULL DEFAULT '',
      position_en TEXT NOT NULL DEFAULT '',
      department_th TEXT NOT NULL DEFAULT '',
      department_en TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  const [thai, english] = await Promise.all([readRoster(thaiPath, path.basename(thaiPath)), readRoster(englishPath, path.basename(englishPath))])
  const { imported } = importRosters(db, { thai, english })
  process.stdout.write(`Imported ${imported} employees with matching Thai and English records.\n`)
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
  .finally(() => { try { db.close() } catch { /* database may already be closed */ } })
