import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { EXPORT_FONT_FAMILY, EXPORT_FONT_SIZE } from './export-typography.js'

const palette = {
  deepTeal: 'FF115E59', teal: 'FF36A397', softGray: 'FFF1F3F5', headerGray: 'FFE3E6E8',
  lightFill: 'FFF8F9FA', white: 'FFFFFFFF', text: 'FF27383B', muted: 'FF53676B', border: 'FFD0D5DD',
}
const edge = { style: 'thin', color: { argb: palette.border } }
const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

const copy = {
  th: {
    title: 'Hiyari Hat Report · สรุปรายบุคคล', summary: 'สรุปรวม', employees: 'จำนวนพนักงาน', reports: 'จำนวนรายงาน',
    generatedAt: 'ส่งออกเมื่อ', no: 'ลำดับ', name: 'ชื่อพนักงาน', code: 'รหัสพนักงาน', department: 'แผนก', from: 'ตั้งแต่วันที่', to: 'ถึงวันที่',
    reportCount: 'จำนวนรายงาน', dateRange: 'ช่วงวันที่รายงาน', lastReport: 'รายงานล่าสุด', selectCode: 'เลือกรหัสพนักงานเพื่อข้ามไปยังรายงานแรก และใช้ตัวกรองในชีตรายงานเพื่อดูเฉพาะบุคคล',
    reportDate: 'วันที่รายงาน', submittedAt: 'วันที่ส่งรายงาน', language: 'ภาษา', form: 'แบบฟอร์ม', when: 'เมื่อไหร่', where: 'ที่ไหน',
    what: 'เกิดอะไรขึ้น', suggestions: 'ข้อเสนอแนะเพื่อปรับปรุง', note: 'หมายเหตุ', photos: 'รูปภาพ', previewUnavailable: 'ไม่สามารถแสดงรูปได้',
    reportList: 'รายการรายงานทั้งหมด', empty: 'ไม่มีรายงาน',
  },
  en: {
    title: 'Hiyari Hat Report · Employee Summary', summary: 'Summary', employees: 'Employees', reports: 'Reports',
    generatedAt: 'Exported at', no: 'No.', name: 'Employee name', code: 'Employee ID', department: 'Department', from: 'From', to: 'To',
    reportCount: 'Report count', dateRange: 'Report date range', lastReport: 'Latest report', selectCode: 'Select an employee ID to jump to their first report. Use the filter on the Reports sheet to view one employee.',
    reportDate: 'Report date', submittedAt: 'Submitted at', language: 'Language', form: 'Form', when: 'When', where: 'Where',
    what: 'What happened', suggestions: 'Suggestions', note: 'Note', photos: 'Photos', previewUnavailable: 'Image unavailable',
    reportList: 'All reports', empty: 'No reports',
  },
  my: {
    title: 'Hiyari Hat Report · ဝန်ထမ်းအလိုက် အကျဉ်းချုပ်', summary: 'အကျဉ်းချုပ်', employees: 'ဝန်ထမ်းအရေအတွက်', reports: 'အစီရင်ခံစာအရေအတွက်',
    generatedAt: 'ထုတ်ယူချိန်', no: 'စဉ်', name: 'ဝန်ထမ်းအမည်', code: 'ဝန်ထမ်းအမှတ်', department: 'ဌာန', from: 'မှ', to: 'အထိ',
    reportCount: 'အစီရင်ခံစာအရေအတွက်', dateRange: 'တင်ပြသည့်ရက်စွဲကာလ', lastReport: 'နောက်ဆုံးအစီရင်ခံစာ', selectCode: 'ဝန်ထမ်းအမှတ်ကို ရွေး၍ ပထမအစီရင်ခံစာသို့ သွားပါ။ ဝန်ထမ်းတစ်ဦးချင်းကြည့်ရန် အစီရင်ခံစာစာမျက်နှာရှိ စစ်ထုတ်မှုကို အသုံးပြုပါ။',
    reportDate: 'အစီရင်ခံသည့်ရက်စွဲ', submittedAt: 'ပေးပို့သည့်အချိန်', language: 'ဘာသာစကား', form: 'ဖောင်', when: 'ဘယ်အချိန်', where: 'ဘယ်နေရာ',
    what: 'ဘာဖြစ်ခဲ့သလဲ', suggestions: 'အကြံပြုချက်များ', note: 'မှတ်ချက်', photos: 'ဓာတ်ပုံများ', previewUnavailable: 'ဓာတ်ပုံကို ပြသ၍မရပါ',
    reportList: 'အစီရင်ခံစာအားလုံး', empty: 'အစီရင်ခံစာမရှိပါ',
  },
}

const dateLocales = { th: 'th-TH', en: 'en-GB', my: 'my-MM-u-ca-gregory' }
const baseColumns = [
  { key: 'no', width: 7 }, { key: 'code', width: 18 }, { key: 'name', width: 26 }, { key: 'department', width: 20 },
  { key: 'date', width: 18 }, { key: 'submittedAt', width: 24 }, { key: 'language', width: 11 }, { key: 'form', width: 30 },
  { key: 'when', width: 20 }, { key: 'where', width: 22 }, { key: 'what', width: 36 }, { key: 'suggestions', width: 32 }, { key: 'note', width: 28 },
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
    cell.fill = solidFill(palette.deepTeal)
    cell.border = { top: edge, bottom: edge, left: edge, right: edge }
  }
  const cell = sheet.getCell(rowNumber, 1)
  cell.value = value
  cell.font = { name: EXPORT_FONT_FAMILY, size: fontSize, bold: true, color: { argb: palette.white } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

function styleTableRow(sheet, rowNumber, values, widths, { header = false, height = 28 } = {}) {
  const row = sheet.getRow(rowNumber)
  row.values = values
  row.height = height
  for (let column = 1; column <= widths.length; column += 1) {
    const cell = row.getCell(column)
    cell.font = { name: EXPORT_FONT_FAMILY, size: header ? EXPORT_FONT_SIZE.compact : EXPORT_FONT_SIZE.body, bold: header, color: { argb: header ? palette.white : palette.text } }
    cell.fill = solidFill(header ? palette.deepTeal : rowNumber % 2 === 0 ? palette.lightFill : palette.white)
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
  }).sort((a, b) => a.employee_code.localeCompare(b.employee_code, undefined, { numeric: true, sensitivity: 'base' }) || a.employee_name.localeCompare(b.employee_name, dateLocales[language]))

  const summaryName = language === 'th' ? 'สรุปรวม' : language === 'my' ? 'အကျဉ်းချုပ်' : 'Summary'
  const reportsName = language === 'th' ? 'รายการรายงาน' : language === 'my' ? 'အစီရင်ခံစာများ' : 'Reports'
  const summaryWidths = [8, 20, 24, 17, 34, 23]
  const summary = workbook.addWorksheet(summaryName, {
    views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
    properties: { tabColor: { argb: palette.deepTeal } },
  })
  summary.columns = summaryWidths.map((width) => ({ width }))
  summary.pageSetup.orientation = 'landscape'
  summary.pageSetup.paperSize = 9
  summary.pageSetup.fitToPage = true
  summary.pageSetup.fitToWidth = 1
  summary.pageSetup.fitToHeight = 0
  summary.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  styleMergedBar(summary, 1, summaryWidths.length, labels.title, EXPORT_FONT_SIZE.reportTitle)
  summary.getRow(1).height = 38
  summary.mergeCells('A2:F2')
  summary.getCell('A2').value = `${labels.generatedAt}: ${formatDateTime(new Date().toISOString(), language)}`
  summary.getCell('A2').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.text } }
  summary.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' }
  summary.getRow(2).height = 25
  summary.mergeCells('A3:F3')
  summary.getCell('A3').value = `${labels.dateRange}: ${period}`
  summary.getCell('A3').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.muted } }
  summary.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' }
  summary.getRow(3).height = 22
  styleMergedBar(summary, 4, summaryWidths.length, `${labels.employees}: ${people.length}     ·     ${labels.reports}: ${rows.length}`, EXPORT_FONT_SIZE.sectionHeading)
  summary.getRow(4).height = 32
  summary.mergeCells('A5:F5')
  summary.getCell('A5').value = labels.selectCode
  summary.getCell('A5').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.compact, italic: true, color: { argb: palette.muted } }
  summary.getCell('A5').alignment = { vertical: 'middle', wrapText: true }
  summary.getRow(5).height = 30
  const summaryHeaders = [labels.no, labels.code, labels.department, labels.reportCount, labels.dateRange, labels.lastReport]
  styleTableRow(summary, 6, summaryHeaders, summaryWidths, { header: true, height: 30 })

  const photoCount = Math.max(1, ...rows.map((row) => reportPhotos(row.photos_json).length))
  const photoColumns = Array.from({ length: photoCount }, (_, photoIndex) => ({ key: `photo${photoIndex + 1}`, width: 22 }))
  const columns = [...baseColumns, ...photoColumns]
  const reportWidths = columns.map((column) => column.width)
  const lastColumn = columns.length
  const reports = workbook.addWorksheet(reportsName, {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    properties: { tabColor: { argb: palette.teal }, defaultRowHeight: 24 },
  })
  reports.columns = columns.map((column) => ({ width: column.width }))
  reports.pageSetup.orientation = 'landscape'
  reports.pageSetup.paperSize = 9
  reports.pageSetup.fitToPage = true
  reports.pageSetup.fitToWidth = 1
  reports.pageSetup.fitToHeight = 0
  reports.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  reports.pageSetup.printTitleRows = '1:5'
  reports.headerFooter.oddFooter = '&CPage &P of &N'
  styleMergedBar(reports, 1, lastColumn, labels.reportList, EXPORT_FONT_SIZE.reportTitle)
  reports.getRow(1).height = 38
  reports.mergeCells(2, 1, 2, lastColumn)
  reports.getCell('A2').value = `${labels.generatedAt}: ${formatDateTime(new Date().toISOString(), language)}`
  reports.getCell('A2').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.text } }
  reports.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' }
  reports.getRow(2).height = 25
  reports.mergeCells(3, 1, 3, lastColumn)
  reports.getCell('A3').value = `${labels.dateRange}: ${period}`
  reports.getCell('A3').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.muted } }
  reports.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' }
  reports.getRow(3).height = 22
  styleMergedBar(reports, 4, lastColumn, `${labels.employees}: ${people.length}     ·     ${labels.reports}: ${rows.length}`, EXPORT_FONT_SIZE.subtitle)
  reports.getRow(4).height = 26
  const headers = [labels.no, labels.code, labels.name, labels.department, labels.reportDate, labels.submittedAt, labels.language, labels.form,
    labels.when, labels.where, labels.what, labels.suggestions, labels.note,
    ...photoColumns.map((_, photoIndex) => `${labels.photos} ${photoIndex + 1}`)]
  styleTableRow(reports, 5, headers, reportWidths, { header: true, height: 34 })

  const reportStarts = new Map()
  let excelRow = 6
  for (const group of people) {
    for (const row of group.rows) {
      if (!reportStarts.has(group)) reportStarts.set(group, excelRow)
      const photos = reportPhotos(row.photos_json)
      const values = [
        excelRow - 5,
        group.employee_code || '—',
        group.employee_name || '—',
        row.department || group.department || '—',
        formatDate(row.report_date, language),
        formatDateTime(row.submitted_at, language),
        String(row.language || '').toUpperCase(),
        row.form_title || '—',
        row.when_text || '—',
        row.where_text || '—',
        row.what_happened || '—',
        row.suggestions || '—',
        row.note || '—',
        ...photoColumns.map(() => ''),
      ]
      const imageRowHeight = photos.length ? 82 : 0
      styleTableRow(reports, excelRow, values, reportWidths, { height: Math.max(rowHeight(values, reportWidths), imageRowHeight) })
      for (const [photoIndex, photo] of photos.entries()) {
        const photoColumn = baseColumns.length + photoIndex + 1
        const photoCell = reports.getCell(excelRow, photoColumn)
        try {
          const imagePath = path.join(uploadDir, path.basename(String(photo.storedName)))
          const imageBuffer = await sharp(await readFile(imagePath)).rotate().resize({ width: 240, height: 150, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()
          const imageId = workbook.addImage({ buffer: imageBuffer, extension: 'jpeg' })
          reports.addImage(imageId, { tl: { col: photoColumn - 1, row: excelRow - 1 }, ext: { width: 140, height: 82 }, editAs: 'oneCell' })
        } catch {
          photoCell.value = labels.previewUnavailable
        }
      }
      excelRow += 1
    }
  }

  for (const [index, group] of people.entries()) {
    const dateRange = group.firstDate && group.lastDate
      ? `${formatDate(group.firstDate, language)} – ${formatDate(group.lastDate, language)}`
      : '—'
    const summaryRowNumber = 7 + index
    const summaryRow = [index + 1, group.employee_code || '—', group.department || '—', group.rows.length, dateRange, group.lastDate ? formatDate(group.lastDate, language) : '—']
    styleTableRow(summary, summaryRowNumber, summaryRow, summaryWidths, { height: 30 })
    const employeeCodeCell = summary.getCell(summaryRowNumber, 2)
    const firstReportRow = reportStarts.get(group)
    if (group.employee_code && firstReportRow) {
      employeeCodeCell.value = { text: group.employee_code, hyperlink: `#'${reportsName.replace(/'/g, "''")}'!B${firstReportRow}`, tooltip: group.employee_code }
      employeeCodeCell.font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.body, color: { argb: palette.deepTeal }, underline: true }
    }
  }

  if (!people.length) {
    summary.mergeCells('A7:F7')
    summary.getCell('A7').value = labels.empty
    summary.getCell('A7').font = { name: EXPORT_FONT_FAMILY, size: EXPORT_FONT_SIZE.subtitle, color: { argb: palette.text } }
    summary.getCell('A7').alignment = { horizontal: 'center', vertical: 'middle' }
    summary.getRow(7).height = 32
  }
  summary.autoFilter = people.length ? { from: 'A6', to: `F${6 + people.length}` } : undefined
  summary.pageSetup.printArea = `A1:F${Math.max(7, 6 + people.length)}`
  summary.headerFooter.oddFooter = '&CPage &P of &N'

  const lastColumnLetter = reports.getColumn(lastColumn).letter
  const lastReportRow = Math.max(5, excelRow - 1)
  reports.autoFilter = rows.length ? { from: 'A5', to: `${lastColumnLetter}${lastReportRow}` } : undefined
  reports.pageSetup.printArea = `A1:${lastColumnLetter}${lastReportRow}`

  return workbook.xlsx.writeBuffer()
}
