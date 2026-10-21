import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { EXPORT_FONT_FAMILY, EXPORT_FONT_SIZE } from './export-typography.js'

const labelsByLanguage = {
  th: {
    title: 'รายงาน Hiyari Hat', sender: 'ชื่อผู้ส่ง', code: 'รหัสพนักงาน', department: 'แผนก', date: 'วันที่',
    when: 'เมื่อไหร่', where: 'ที่ไหน', what: 'เกิดอะไรขึ้น', suggestions: 'ข้อเสนอแนะเพื่อปรับปรุง', note: 'หมายเหตุ',
    documentNo: 'เลขที่เอกสาร', revision: 'ฉบับแก้ไข', submittedAt: 'วันที่ส่งรายงาน', reporterInfo: 'ข้อมูลผู้รายงาน',
    reportDetails: 'รายละเอียดรายงาน', signatures: 'การรับทราบและลงชื่อ', senderSign: 'ผู้รายงาน', safetySign: 'หัวหน้าความปลอดภัย', headSign: 'หัวหน้าแผนก', sign: 'ลงชื่อ',
    footer: 'เอกสารเพื่อการรายงานและปรับปรุงความปลอดภัยในการทำงาน',
    photoSheet: 'รูปภาพประกอบ', number: 'ลำดับ', fileName: 'ชื่อไฟล์', fileType: 'ประเภทไฟล์', preview: 'รูปภาพ', previewUnavailable: 'เปิดรูปภาพไม่ได้',
  },
  en: {
    title: 'Hiyari Hat Report', sender: 'Sender name', code: 'Employee ID', department: 'Department', date: 'Date',
    when: 'When', where: 'Where', what: 'What happened', suggestions: 'Suggestions for improvement', note: 'Note',
    documentNo: 'Document No.', revision: 'Revision', submittedAt: 'Submitted at', reporterInfo: 'Reporter information',
    reportDetails: 'Report details', signatures: 'Review and signatures', senderSign: 'Reporter', safetySign: 'Safety leader', headSign: 'Department head', sign: 'Signature',
    footer: 'For workplace safety reporting and continuous improvement',
    photoSheet: 'Photo evidence', number: 'No.', fileName: 'File name', fileType: 'File type', preview: 'Preview', previewUnavailable: 'Preview unavailable',
  },
  my: {
    title: 'ဟိယာရီ ဟတ် အစီရင်ခံစာ', sender: 'တင်ပြသူအမည်', code: 'ဝန်ထမ်းအမှတ်', department: 'ဌာန', date: 'ရက်စွဲ',
    when: 'ဘယ်အချိန်', where: 'ဘယ်နေရာ', what: 'ဘာဖြစ်ခဲ့သလဲ', suggestions: 'တိုးတက်ကောင်းမွန်ရေး အကြံပြုချက်', note: 'မှတ်ချက်',
    documentNo: 'စာရွက်စာတမ်းအမှတ်', revision: 'ပြင်ဆင်ချက်', submittedAt: 'ပေးပို့သည့်အချိန်', reporterInfo: 'တင်ပြသူအချက်အလက်',
    reportDetails: 'အစီရင်ခံစာအသေးစိတ်', signatures: 'စစ်ဆေးခြင်းနှင့် လက်မှတ်များ', senderSign: 'တင်ပြသူ', safetySign: 'ဘေးကင်းရေးခေါင်းဆောင်', headSign: 'ဌာနမှူး', sign: 'လက်မှတ်',
    footer: 'လုပ်ငန်းခွင်ဘေးကင်းရေး တင်ပြခြင်းနှင့် စဉ်ဆက်မပြတ် တိုးတက်စေရန်',
    photoSheet: 'ဓာတ်ပုံအထောက်အထား', number: 'စဉ်', fileName: 'ဖိုင်အမည်', fileType: 'ဖိုင်အမျိုးအစား', preview: 'ဓာတ်ပုံ', previewUnavailable: 'ဓာတ်ပုံကို ဖွင့်၍မရပါ',
  },
}

const palette = { black: 'FF000000', white: 'FFFFFFFF', border: 'FF000000', muted: 'FF53676B' }

const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const edge = { style: 'thin', color: { argb: palette.border } }

export async function createHiyariWorkbook(row, uploadDir) {
  const language = ['th', 'en', 'my'].includes(row.language) ? row.language : 'th'
  const labels = labelsByLanguage[language]
  const fontName = language === 'my' ? 'Myanmar Text' : EXPORT_FONT_FAMILY
  const baseFont = { name: fontName, size: EXPORT_FONT_SIZE.body, color: { argb: palette.black } }
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Daily Safety | Y.T. Rubber'
  workbook.company = 'Y.T. Rubber'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.title = labels.title
  workbook.subject = `FM-SFT-42 Rev.01 · ${labels.title}`

  const dateLocale = language === 'th' ? 'th-TH' : language === 'my' ? 'my-MM-u-ca-gregory' : 'en-GB'
  const reportDate = new Intl.DateTimeFormat(dateLocale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  }).format(new Date(`${row.report_date}T12:00:00+07:00`))
  const submittedAt = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(row.submitted_at))
  const sheet = workbook.addWorksheet(language === 'th' ? 'รายงาน Hiyari Hat' : 'Hiyari Hat Report', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: 'FF115E59' }, defaultRowHeight: 22 },
  })
  const columnWidths = [18, 18, 22, 18, 18, 22]
  sheet.columns = columnWidths.map((width) => ({ width }))
  sheet.pageSetup.orientation = 'portrait'
  sheet.pageSetup.paperSize = 9
  sheet.pageSetup.fitToPage = true
  sheet.pageSetup.fitToWidth = 1
  sheet.pageSetup.fitToHeight = 0
  sheet.pageSetup.margins = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
  sheet.headerFooter.oddFooter = '&CPage &P of &N'

  const documentNo = row.form_title?.match(/\bFM-SFT-\d+\b/i)?.[0] || 'FM-SFT-42'
  const revision = row.form_title?.match(/\bRev\.?\s*([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)?)/i)?.[1] || '01'
  const title = String(row.form_title || labels.title).trim() || labels.title
  const bottomBorder = { top: edge, bottom: edge }

  sheet.pageSetup.margins = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }

  function styleMergedRange(rowNumber, firstColumn, lastColumn, value, { bold = false, fontSize = EXPORT_FONT_SIZE.body, alignment = 'left', border = true, italic = false } = {}) {
    if (lastColumn > firstColumn) sheet.mergeCells(rowNumber, firstColumn, rowNumber, lastColumn)
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const cell = sheet.getCell(rowNumber, column)
      cell.font = { ...baseFont, bold, size: fontSize, italic }
      cell.fill = solidFill(palette.white)
      cell.alignment = { horizontal: alignment, vertical: 'middle', wrapText: true }
      if (border) cell.border = {
        ...bottomBorder,
        ...(column === firstColumn ? { left: edge } : {}),
        ...(column === lastColumn ? { right: edge } : {}),
      }
    }
    sheet.getCell(rowNumber, firstColumn).value = value
  }

  function sectionHeading(rowNumber, text) {
    sheet.mergeCells(rowNumber, 1, rowNumber, 6)
    const cell = sheet.getCell(rowNumber, 1)
    cell.value = text
    cell.font = { ...baseFont, size: EXPORT_FONT_SIZE.sectionHeading, bold: true }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    sheet.getRow(rowNumber).height = 24
  }

  function pairedRow(rowNumber, leftLabel, leftValue, rightLabel, rightValue, height = 32) {
    styleMergedRange(rowNumber, 1, 1, leftLabel, { bold: true })
    styleMergedRange(rowNumber, 2, 3, String(leftValue || '—').trim() || '—')
    styleMergedRange(rowNumber, 4, 4, rightLabel, { bold: true })
    styleMergedRange(rowNumber, 5, 6, String(rightValue || '—').trim() || '—')
    sheet.getRow(rowNumber).height = height
  }

  sheet.mergeCells('A1:F1')
  sheet.getCell('A1').value = title
  sheet.getCell('A1').font = { ...baseFont, size: EXPORT_FONT_SIZE.sheetTitle, bold: true }
  sheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  sheet.getRow(1).height = 34

  let currentRow = 3
  sectionHeading(currentRow, labels.reporterInfo)
  currentRow += 1
  pairedRow(currentRow++, labels.sender, row.employee_name, labels.code, row.employee_code, 34)
  pairedRow(currentRow++, labels.department, row.department, labels.date, reportDate, 32)
  styleMergedRange(currentRow, 1, 1, labels.submittedAt, { bold: true })
  styleMergedRange(currentRow, 2, 6, submittedAt)
  sheet.getRow(currentRow).height = 30
  currentRow += 2

  sectionHeading(currentRow, labels.reportDetails)
  currentRow += 1
  const details = [
    [labels.when, row.when_text], [labels.where, row.where_text], [labels.what, row.what_happened],
    [labels.suggestions, row.suggestions], [labels.note, row.note],
  ]
  for (const [label, text] of details) {
    const value = String(text || '').trim() || '—'
    const lines = value.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 90)), 0)
    const height = Math.max(38, Math.min(300, lines * 15 + 14))
    styleMergedRange(currentRow, 1, 2, label, { bold: true })
    styleMergedRange(currentRow, 3, 6, value, { alignment: 'left' })
    sheet.getRow(currentRow).height = height
    currentRow += 1
  }

  const photos = JSON.parse(row.photos_json || '[]').filter((photo) => photo && photo.storedName)
  if (photos.length) {
    currentRow += 1
    sectionHeading(currentRow, labels.photoSheet)
    currentRow += 1
    for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 2) {
      const photoRow = sheet.getRow(currentRow)
      photoRow.height = 132
      for (const startColumn of [1, 4]) {
        const hasPhoto = startColumn === 1 ? Boolean(photos[photoIndex]) : Boolean(photos[photoIndex + 1])
        if (!hasPhoto) continue
        for (let column = startColumn; column < startColumn + 3; column += 1) {
          const cell = sheet.getCell(currentRow, column)
          cell.fill = solidFill(palette.white)
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = {
            top: edge,
            bottom: edge,
            ...(column === startColumn ? { left: edge } : {}),
            ...(column === startColumn + 2 ? { right: edge } : {}),
          }
        }
      }
      for (const [slotIndex, photo] of [photos[photoIndex], photos[photoIndex + 1]].entries()) {
        if (!photo) continue
        const startColumn = slotIndex === 0 ? 1 : 4
        try {
          const photoPath = path.join(uploadDir, path.basename(photo.storedName))
          const photoBuffer = await sharp(await readFile(photoPath)).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
          const photoInfo = await sharp(photoBuffer).metadata()
          const slotWidth = columnWidths.slice(startColumn - 1, startColumn + 2).reduce((sum, width) => sum + width * 7 + 5, 0)
          const maxWidth = Math.min(330, slotWidth - 20)
          const maxHeight = 170
          const scale = Math.min(maxWidth / (photoInfo.width || 1), maxHeight / (photoInfo.height || 1), 1)
          const imageWidth = Math.round((photoInfo.width || 1) * scale)
          const imageHeight = Math.round((photoInfo.height || 1) * scale)
          const firstColumnWidth = columnWidths[startColumn - 1] * 7 + 5
          const horizontalOffset = Math.max(0, (slotWidth - imageWidth) / 2)
          const verticalOffset = Math.max(0, (132 * 4 / 3 - imageHeight) / 2)
          const imageId = workbook.addImage({ buffer: photoBuffer, extension: 'jpeg' })
          sheet.addImage(imageId, {
            tl: { col: startColumn - 1 + horizontalOffset / firstColumnWidth, row: currentRow - 1 + verticalOffset / (132 * 4 / 3) },
            ext: { width: imageWidth, height: imageHeight },
            editAs: 'oneCell',
          })
        } catch {
          const fallback = sheet.getCell(currentRow, startColumn)
          fallback.value = labels.previewUnavailable
          fallback.font = baseFont
          fallback.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        }
      }
      currentRow += 1
    }
  }

  currentRow += 1
  sectionHeading(currentRow, labels.signatures)
  currentRow += 1
  const signatureRanges = [[1, 2, labels.senderSign], [3, 4, labels.safetySign], [5, 6, labels.headSign]]
  for (const [startColumn, endColumn, label] of signatureRanges) {
    const text = `${label}\n${labels.sign} ____________________\n${labels.date} ____ / ____ / ______`
    styleMergedRange(currentRow, startColumn, endColumn, text, { alignment: 'center' })
  }
  sheet.getRow(currentRow).height = 68
  currentRow += 2

  styleMergedRange(currentRow, 1, 3, labels.footer, { fontSize: EXPORT_FONT_SIZE.footnote, border: false })
  styleMergedRange(currentRow, 4, 6, `${documentNo} · Rev.${revision} · ${row.employee_code}`, { fontSize: EXPORT_FONT_SIZE.footnote, alignment: 'right', border: false })
  sheet.getRow(currentRow).border = { top: edge }
  for (let column = 1; column <= 6; column += 1) sheet.getCell(currentRow, column).border = { top: edge }
  sheet.getRow(currentRow).height = 26
  sheet.pageSetup.printArea = `A1:F${currentRow}`

  return workbook.xlsx.writeBuffer()
}
