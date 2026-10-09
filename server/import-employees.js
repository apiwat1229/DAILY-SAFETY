import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db = new DatabaseSync(path.join(appRoot, 'data', 'daily-safety.sqlite'))

function cellText(row, column) {
  return String(row.getCell(column).text || '').trim()
}

async function readRoster(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`No worksheet found in ${path.basename(filePath)}`)

  let headerRow = 0
  let columns = null
  sheet.eachRow((row, rowNumber) => {
    if (columns) return
    const found = {}
    row.eachCell((cell, column) => {
      const heading = cellText(row, column).toLocaleLowerCase()
      if (['code', 'name', 'position', 'department'].includes(heading)) found[heading] = column
    })
    if (['code', 'name', 'position', 'department'].every((key) => found[key])) {
      headerRow = rowNumber
      columns = found
    }
  })
  if (!columns) throw new Error(`Roster headings were not found in ${path.basename(filePath)}`)

  const entries = new Map()
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return
    const employeeCode = cellText(row, columns.code).toUpperCase()
    if (!employeeCode) return
    if (entries.has(employeeCode)) throw new Error(`Duplicate employee code in ${path.basename(filePath)}`)
    entries.set(employeeCode, {
      name: cellText(row, columns.name),
      position: cellText(row, columns.position),
      department: cellText(row, columns.department),
    })
  })
  if (!entries.size) throw new Error(`No employee rows found in ${path.basename(filePath)}`)
  if ([...entries.values()].some((employee) => !employee.name)) throw new Error(`A roster row has no employee name in ${path.basename(filePath)}`)
  return entries
}

async function main() {
  const [thaiPath, englishPath] = process.argv.slice(2)
  if (!thaiPath || !englishPath) throw new Error('Usage: node server/import-employees.js <thai-roster.xlsx> <english-roster.xlsx>')

  const [thai, english] = await Promise.all([readRoster(thaiPath), readRoster(englishPath)])
  const thaiCodes = [...thai.keys()].sort()
  const englishCodes = [...english.keys()].sort()
  if (thaiCodes.length !== englishCodes.length || thaiCodes.some((code, index) => code !== englishCodes[index])) {
    throw new Error('Thai and English rosters do not contain the same employee codes; no rows were imported.')
  }

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
  const now = new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO employee_directory
      (employee_code, name_th, name_en, position_th, position_en, department_th, department_en, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_code) DO UPDATE SET
      name_th = CASE WHEN excluded.name_th != '' THEN excluded.name_th ELSE employee_directory.name_th END,
      name_en = CASE WHEN excluded.name_en != '' THEN excluded.name_en ELSE employee_directory.name_en END,
      position_th = CASE WHEN excluded.position_th != '' THEN excluded.position_th ELSE employee_directory.position_th END,
      position_en = CASE WHEN excluded.position_en != '' THEN excluded.position_en ELSE employee_directory.position_en END,
      department_th = CASE WHEN excluded.department_th != '' THEN excluded.department_th ELSE employee_directory.department_th END,
      department_en = CASE WHEN excluded.department_en != '' THEN excluded.department_en ELSE employee_directory.department_en END,
      updated_at = excluded.updated_at
  `)

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const code of thaiCodes) {
      const th = thai.get(code)
      const en = english.get(code)
      upsert.run(code, th.name, en.name, th.position, en.position, th.department, en.department, now, now)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
  process.stdout.write(`Imported ${thaiCodes.length} employees with matching Thai and English records.\n`)
}

main().catch((error) => {
  try { db.close() } catch { /* database may already be closed */ }
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
