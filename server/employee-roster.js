// Shared by the CLI (server/import-employees.js) and the admin import endpoint.
import ExcelJS from 'exceljs'

const HEADINGS = ['code', 'name', 'position', 'department']
const cellText = (row, column) => String(row.getCell(column).text || '').trim()

/** Parse a roster workbook (file path or Buffer) into Map<employeeCode, { name, position, department }>. */
export async function readRoster(source, label = 'roster') {
  const workbook = new ExcelJS.Workbook()
  if (Buffer.isBuffer(source)) await workbook.xlsx.load(source)
  else await workbook.xlsx.readFile(source)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error(`No worksheet found in ${label}`)

  let headerRow = 0
  let columns = null
  sheet.eachRow((row, rowNumber) => {
    if (columns) return
    const found = {}
    row.eachCell((cell, column) => {
      const heading = cellText(row, column).toLocaleLowerCase()
      if (HEADINGS.includes(heading)) found[heading] = column
    })
    if (HEADINGS.every((key) => found[key])) {
      headerRow = rowNumber
      columns = found
    }
  })
  if (!columns) throw new Error(`Roster headings (Code, Name, Position, Department) were not found in ${label}`)

  const entries = new Map()
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return
    const employeeCode = cellText(row, columns.code).toUpperCase()
    if (!employeeCode) return
    if (!/^[A-Z0-9._-]{1,40}$/.test(employeeCode)) throw new Error(`Invalid employee code "${employeeCode}" in ${label}`)
    if (entries.has(employeeCode)) throw new Error(`Duplicate employee code ${employeeCode} in ${label}`)
    entries.set(employeeCode, {
      name: cellText(row, columns.name),
      position: cellText(row, columns.position),
      department: cellText(row, columns.department),
    })
  })
  if (!entries.size) throw new Error(`No employee rows found in ${label}`)
  if ([...entries.values()].some((employee) => !employee.name)) throw new Error(`A roster row has no employee name in ${label}`)
  return entries
}

/**
 * Upsert employees from a Thai roster, an English roster, or both. When both are given they must list the same codes.
 * Empty fields never overwrite existing values. Runs in one transaction.
 */
export function importRosters(db, { thai, english }, now = new Date().toISOString()) {
  if (!thai && !english) throw new Error('Provide at least one roster file.')
  const codes = [...new Set([...(thai?.keys() ?? []), ...(english?.keys() ?? [])])].sort()
  if (thai && english) {
    const thaiCodes = [...thai.keys()].sort()
    const englishCodes = [...english.keys()].sort()
    if (thaiCodes.length !== englishCodes.length || thaiCodes.some((code, index) => code !== englishCodes[index])) {
      throw new Error('Thai and English rosters do not contain the same employee codes; no rows were imported.')
    }
  }
  const exists = db.prepare('SELECT 1 FROM employee_directory WHERE employee_code = ?')
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
  let created = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const code of codes) {
      const th = thai?.get(code)
      const en = english?.get(code)
      if (!exists.get(code)) created += 1
      upsert.run(code, th?.name ?? '', en?.name ?? '', th?.position ?? '', en?.position ?? '', th?.department ?? '', en?.department ?? '', now, now)
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transaction already closed */ }
    throw error
  }
  return { imported: codes.length, created, updated: codes.length - created }
}
