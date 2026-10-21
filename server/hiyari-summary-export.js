import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { EXPORT_FONT_FAMILY, EXPORT_FONT_SIZE } from './export-typography.js'

const palette = {
  deepTeal: 'FF19796F', teal: 'FF36A397', softGray: 'FFF1F3F5', headerGray: 'FFE3E6E8',
  lightFill: 'FFF8F9FA', white: 'FFFFFFFF', text: 'FF27383B', muted: 'FF53676B', border: 'FFD0D5DD',
}
const edge = { style: 'thin', color: { argb: palette.border } }
const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const copy = {
  th: {
    title: 'Hiyari Hat Report · สรุปรายบุคคล', summary: 'สรุปรวม', employees: 'จำนวนพนักงาน', reports: 'จำนวนรายงาน',
    generatedAt: 'ส่งออกเมื่อ', no: 'ลำดับ', name: 'ชื่อพนักงาน', code: 'รหัสพนักงาน', department: 'แผนก', from: 'ตั้งแต่วันที่', to: 'ถึงวันที่',
    reportCount: 'จำนวนรายงาน', dateRange: 'ช่วงวันที่รายงาน', sheet: 'ชีต', profile: 'ข้อมูลพนักงาน',
    submittedAt: 'วันที่ส่งรายงาน', language: 'ภาษา', form: 'แบบฟอร์ม', when: 'เมื่อไหร่', where: 'ที่ไหน',
    what: 'เกิดอะไรขึ้น', suggestions: 'ข้อเสนอแนะเพื่อปรับปรุง', note: 'หมายเหตุ', photos: 'รูปภาพ',
    reportList: 'รายการรายงานทั้งหมด', empty: 'ไม่มีรายงาน',
  },
  en: {
    title: 'Hiyari Hat Report · Employee Summary', summary: 'Summary', employees: 'Employees', reports: 'Reports',
    generatedAt: 'Exported at', no: 'No.', name: 'Employee name', code: 'Employee ID', department: 'Department', from: 'From', to: 'To',
    reportCount: 'Report count', dateRange: 'Report date range', sheet: 'Sheet', profile: 'Employee information',
    submittedAt: 'Submitted at', language: 'Language', form: 'Form', when: 'When', where: 'Where',
    what: 'What happened', suggestions: 'Suggestions', note: 'Note', photos: 'Photos',
    reportList: 'All reports', empty: 'No reports',
  },
  my: {
    title: 'Hiyari Hat Report · ဝန်ထမ်းအလိုက် အကျဉ်းချုပ်', summary: 'အကျဉ်းချုပ်', employees: 'ဝန်ထမ်းအရေအတွက်', reports: 'အစီရင်ခံစာအရေအတွက်',
    generatedAt: 'ထုတ်ယူချိန်', no: 'စဉ်', name: 'ဝန်ထမ်းအမည်', code: 'ဝန်ထမ်းအမှတ်', department: 'ဌာန', from: 'မှ', to: 'အထိ',
    reportCount: 'အစီရင်ခံစာအရေအတွက်', dateRange: 'တင်ပြသည့်ရက်စွဲကာလ', sheet: 'စာမျက်နှာ', profile: 'ဝန်ထမ်းအချက်အလက်',
    submittedAt: 'ပေးပို့သည့်အချိန်', language: 'ဘာသာစကား', form: 'ဖောင်', when: 'ဘယ်အချိန်', where: 'ဘယ်နေရာ',
    what: 'ဘာဖြစ်ခဲ့သလဲ', suggestions: 'အကြံပြုချက်များ', note: 'မှတ်ချက်', photos: 'ဓာတ်ပုံများ',
    reportList: 'အစီရင်ခံစာအားလုံး', empty: 'အစီရင်ခံစာမရှိပါ',
  },
}

const dateLocales = { th: 'th-TH', en: 'en-GB', my: 'my-MM-u-ca-gregory' }
const baseColumns = [
  { key: 'no', width: 7 }, { key: 'date', width: 18 }, { key: 'submittedAt', width: 24 },
  { key: 'language', width: 11 }, { key: 'form', width: 34 }, { key: 'department', width: 19 },
  { key: 'when', width: 20 }, { key: 'where', width: 23 }, { key: 'what', width: 38 },
  { key: 'suggestions', width: 36 }, { key: 'note', width: 30 },
]

function formatDate(value, language) {
  return new Intl.DateTimeFormat(dateLocales[language], {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  }).format(new Date(`${value}T12:00:00+07:00`))
}

function formatDateTime(value, language) {
  return new Intl.DateTimeFormat(dateLocales[language], {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function sheetNameFor(group, used) {
  const rawName = `${group.employee_code || ''} ${group.employee_name || ''}`
    .replace(/[\\/?*\[\]:]/g, ' ').replace(/[']+/g, '').trim() || `Employee ${used.size}`
  const base = rawName.slice(0, 31)
  let name = base
  let index = 2
  while (used.has(name.toLocaleLowerCase())) {
    const suffix = ` (${index++})`
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`
  }
  used.add(name.toLocaleLowerCase())
  return name
}

function reportPhotos(value) {
  try {
    return JSON.parse(value || '[]').filter((photo) => photo?.storedName)
  } catch {
    return []
  }
}

function styleMergedBar(sheet, rowNumber, lastColumn, value, fontSize = EXPORT_FONT_SIZE.subtitle) {
  sheet.mergeCells(rowNumber, 1, rowNumber, lastColumn)
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = sheet.getCell(rowNumber, column)
    cell.fill = solidFill(palette.softGray)
    cell.border = { top: edge, bottom: edge, left: edge, right: edge }
  }
  const cell = sheet.getCell(rowNumber, 1)
  cell.value = value
  cell.font = { name: EXPORT_FONT_FAMILY, size: fontSize, bold: true, color: { argb: palette.text } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

function styleTableRow(sheet, rowNumber, values, widths, { header = false, height = 28 } = {}) {
  const row = sheet.getRow(rowNumber)
  row.values = values
  row.height = height
  for (let column = 1; column <= widths.length; column += 1) {
    const cell = row.getCell(column)
    cell.font = { name: EXPORT_FONT_FAMILY, size: header ? EXPORT_FONT_SIZE.compact : EXPORT_FONT_SIZE.body, bold: header, color: { argb: palette.text } }
    cell.fill = solidFill(header ? palette.headerGray : rowNumber % 2 === 0 ? palette.lightFill : palette.white)
    cell.alignment = { vertical: 'middle', horizontal: header || column === 1 ? 'center' : 'left', wrapText: true }
    cell.border = { top: edge, bottom: edge, left: edge, right: edge }
  }
}

function rowHeight(values, widths) {
  const wrappedLines = values.map((value, index) => {
    const text = String(value ?? '')
    return text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(10, widths[index] * 1.4))), 0)
  })
  return Math.max(34, Math.min(300, Math.max(...wrappedLines) * 15 + 12))
}

export async function createHiyariEmployeeSummaryWorkbook(rows, uploadDir, requestedLanguage = 'th', dateRange = {}) {
  const language = Object.hasOwn(copy, requestedLanguage) ? requestedLanguage : 'th'
  const labels = copy[language]
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Daily Safety'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.title = labels.title
  workbook.subject = labels.reportList
  const period = dateRange.from && dateRange.to
    ? `${labels.from}: ${formatDate(dateRange.from, language)}   ${labels.to}: ${formatDate(dateRange.to, language)}`
    : (language === 'th' ? 'ทุกวันที่' : language === 'my' ? 'ရက်စွဲအားလုံး' : 'All dates')

  const grouped = new Map()
  for (const row of rows) {
    const employeeCode = String(row.employee_code || '').trim()
    const employeeName = String(row.employee_name || '').trim() || employeeCode || '—'
    const key = employeeCode || employeeName.toLocaleLowerCase()
    if (!grouped.has(key)) grouped.set(key, { employee_code: employeeCode, employee_name: employeeName, rows: [] })
    const group = grouped.get(key)
    group.rows.push(row)
    if (!group.employee_name || row.submitted_at > (group.latestSubmittedAt || '')) {
      group.employee_name = employeeName
      group.department = String(row.department || '').trim()
      group.latestSubmittedAt = row.submitted_at
    }
  }

  const people = [...grouped.values()].map((group) => {
    group.rows.sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)) || String(b.submitted_at).localeCompare(String(a.submitted_at)))
    const dates = group.rows.map((row) => String(row.report_date)).filter(Boolean).sort()
    group.firstDate = dates[0] || ''
    group.lastDate = dates.at(-1) || ''
    return group
  }).sort((a, b) => a.employee_name.localeCompare(b.employee_name, dateLocales[language]) || a.employee_code.localeCompare(b.employee_code))

  const summaryName = language === 'th' ? 'สรุปรวม' : language === 'my' ? 'အကျဉ်းချုပ်' : 'Summary'
  const summary = workbook.addWorksheet(summaryName, { views: [{ showGridLines: false }], properties: { tabColor: { argb: palette.teal } } })
  const summaryWidths = [8, 34, 18, 24, 16, 31, 32]
  summary.columns = summaryWidths.map((width) => ({ width }))
  summary.pageSetup.orientation = 'landscape'
  summary.pageSetup.paperSize = 9
  summary.pageSetup.fitToPage = true
  summary.pageSetup.fitToWidth = 1
  summary.pageSetup.fitToHeight = 0
  summary.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  styleMergedBar(summary, 1, 7, labels.title, EXPORT_FONT_SIZE.reportTitle)
  summary.getRow(1).height = 38
  summary.mergeCells('A2:G2')
  summary.getCell('A2').value = `${labels.generatedAt}: ${formatDateTime(new Date().toISOString(), language)}`
  summary.getCell('A2').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.text } }
  summary.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' }
  summary.getRow(2).height = 25
  summary.mergeCells('A3:G3')
  summary.getCell('A3').value = `${labels.dateRange}: ${period}`
  summary.getCell('A3').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.muted } }
  summary.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' }
  summary.getRow(3).height = 22
  summary.mergeCells('A4:C4')
  summary.mergeCells('D4:G4')
  summary.getCell('A4').value = `${labels.employees}: ${people.length}`
  summary.getCell('D4').value = `${labels.reports}: ${rows.length}`
  for (const cellAddress of ['A4', 'D4']) {
    const cell = summary.getCell(cellAddress)
    cell.fill = solidFill(palette.softGray)
    cell.font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.sectionHeading, bold: true, color: { argb: palette.text } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  summary.getRow(4).height = 32
  const summaryHeaders = [labels.no, labels.name, labels.code, labels.department, labels.reportCount, labels.dateRange, labels.sheet]
  styleTableRow(summary, 6, summaryHeaders, summaryWidths, { header: true, height: 30 })

  const usedNames = new Set([summaryName.toLocaleLowerCase()])
  const sheetNames = new Map()
  for (const group of people) sheetNames.set(group, sheetNameFor(group, usedNames))

  for (const [index, group] of people.entries()) {
    const sheetName = sheetNames.get(group)
    const photoCount = Math.max(1, ...group.rows.map((row) => reportPhotos(row.photos_json).length))
    const photoColumns = Array.from({ length: photoCount }, (_, photoIndex) => ({ key: `photo${photoIndex + 1}`, width: 22 }))
    const columns = [...baseColumns, ...photoColumns]
    const reportWidths = columns.map((column) => column.width)
    const lastColumn = columns.length
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
      properties: { tabColor: { argb: palette.teal }, defaultRowHeight: 24 },
    })
    sheet.columns = columns.map((column) => ({ width: column.width }))
    sheet.pageSetup.orientation = 'landscape'
    sheet.pageSetup.paperSize = 9
    sheet.pageSetup.fitToPage = true
    sheet.pageSetup.fitToWidth = 1
    sheet.pageSetup.fitToHeight = 0
    sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
    sheet.headerFooter.oddFooter = '&CPage &P of &N'

    styleMergedBar(sheet, 1, columns.length, labels.title, EXPORT_FONT_SIZE.secondarySheetTitle)
    sheet.getRow(1).height = 36
    sheet.mergeCells(2, 1, 2, columns.length)
    sheet.getCell('A2').value = `${group.employee_name} · ${group.employee_code || '—'}`
    sheet.getCell('A2').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.sectionHeading, bold: true, color: { argb: palette.deepTeal } }
    sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' }
    sheet.getRow(2).height = 28
    sheet.mergeCells(3, 1, 3, lastColumn)
    sheet.getCell('A3').value = period
    sheet.getCell('A3').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.muted } }
    sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' }
    sheet.getRow(3).height = 22
    styleMergedBar(sheet, 4, lastColumn, labels.profile)
    sheet.getRow(4).height = 24

    const profileValues = [
      labels.name, '', group.employee_name, '', '', labels.code, group.employee_code || '—', '', labels.department, '', group.department || '—', '',
    ]
    const profileRow = sheet.getRow(5)
    profileRow.values = profileValues
    sheet.mergeCells('A5:B5')
    sheet.mergeCells('C5:E5')
    sheet.mergeCells('G5:H5')
    sheet.mergeCells('I5:J5')
    sheet.mergeCells('K5:L5')
    for (let column = 1; column <= columns.length; column += 1) {
      const cell = profileRow.getCell(column)
      cell.font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, bold: [1, 6, 9].includes(column), color: { argb: [1, 6, 9].includes(column) ? palette.muted : palette.text } }
      cell.fill = solidFill([1, 6, 9].includes(column) ? palette.softGray : palette.white)
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      cell.border = { top: edge, bottom: edge, left: edge, right: edge }
    }
    sheet.getRow(5).height = 32
    sheet.getRow(6).height = 8
    styleMergedBar(sheet, 7, lastColumn, `${labels.reportList} (${group.rows.length})`)
    sheet.getRow(7).height = 24

    const headers = [labels.no, labels.date, labels.submittedAt, labels.language, labels.form, labels.department, labels.when, labels.where, labels.what, labels.suggestions, labels.note,
      ...photoColumns.map((_, photoIndex) => `${labels.photos} ${photoIndex + 1}`)]
    styleTableRow(sheet, 8, headers, reportWidths, { header: true, height: 34 })
    for (const [reportIndex, row] of group.rows.entries()) {
      const photos = reportPhotos(row.photos_json)
      const values = [
        reportIndex + 1,
        formatDate(row.report_date, language),
        formatDateTime(row.submitted_at, language),
        String(row.language || '').toUpperCase(),
        row.form_title || '—',
        row.department || '—',
        row.when_text || '—',
        row.where_text || '—',
        row.what_happened || '—',
        row.suggestions || '—',
        row.note || '—',
        ...photoColumns.map((_, photoIndex) => photos[photoIndex]?.originalName || (photoIndex === 0 && !photos.length ? '—' : '')),
      ]
      const excelRow = 9 + reportIndex
      const imageRowHeight = photos.length ? 82 : 0
      styleTableRow(sheet, excelRow, values, reportWidths, { height: Math.max(rowHeight(values, reportWidths), imageRowHeight) })
      for (const [photoIndex, photo] of photos.entries()) {
        const photoColumn = baseColumns.length + photoIndex + 1
        const photoCell = sheet.getCell(excelRow, photoColumn)
        photoCell.value = ''
        photoCell.note = photo.originalName || labels.photos
        try {
          const imagePath = path.join(uploadDir, path.basename(String(photo.storedName)))
          const imageBuffer = await sharp(await readFile(imagePath)).rotate().resize({ width: 240, height: 150, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()
          const imageId = workbook.addImage({ buffer: imageBuffer, extension: 'jpeg' })
          sheet.addImage(imageId, { tl: { col: photoColumn - 1, row: excelRow - 1 }, ext: { width: 140, height: 82 }, editAs: 'oneCell' })
        } catch {
          photoCell.value = photo.originalName || '—'
        }
      }
    }
    const lastColumnLetter = sheet.getColumn(lastColumn).letter
    sheet.autoFilter = { from: 'A8', to: `${lastColumnLetter}${Math.max(8, 8 + group.rows.length)}` }
    sheet.pageSetup.printArea = `A1:${lastColumnLetter}${Math.max(8, 8 + group.rows.length)}`

    const dateRange = group.firstDate && group.lastDate
      ? `${formatDate(group.firstDate, language)} – ${formatDate(group.lastDate, language)}`
      : '—'
    const summaryRow = [index + 1, group.employee_name, group.employee_code || '—', group.department || '—', group.rows.length, dateRange, sheetName]
    styleTableRow(summary, 7 + index, summaryRow, summaryWidths, { height: 30 })
    const sheetCell = summary.getCell(7 + index, 7)
    sheetCell.value = { text: sheetName, hyperlink: `#'${sheetName.replace(/'/g, "''")}'!A1`, tooltip: sheetName }
    sheetCell.font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.deepTeal }, underline: true }
  }

  if (!people.length) {
    summary.mergeCells('A7:G7')
    summary.getCell('A7').value = labels.empty
    summary.getCell('A7').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.subtitle, color: { argb: palette.text } }
    summary.getCell('A7').alignment = { horizontal: 'center', vertical: 'middle' }
    summary.getRow(7).height = 32
  }
  summary.autoFilter = people.length ? { from: 'A6', to: `G${6 + people.length}` } : undefined
  summary.pageSetup.printArea = `A1:G${Math.max(7, 6 + people.length)}`
  summary.headerFooter.oddFooter = '&CPage &P of &N'

  return workbook.xlsx.writeBuffer()
}
