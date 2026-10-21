import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const labelsByLanguage = {
  th: {
    title: 'รายงาน Hiyari Hat', sender: 'ชื่อผู้ส่ง', code: 'รหัสพนักงาน', department: 'แผนก', date: 'วันที่',
    when: 'เมื่อไหร่', where: 'ที่ไหน', what: 'เกิดอะไรขึ้น', suggestions: 'ข้อเสนอแนะเพื่อปรับปรุง', note: 'หมายเหตุ',
    documentNo: 'เลขที่เอกสาร', revision: 'ฉบับแก้ไข', submittedAt: 'วันที่ส่งรายงาน', reporterInfo: 'ข้อมูลผู้รายงาน',
    reportDetails: 'รายละเอียดรายงาน', signatures: 'การรับทราบและลงชื่อ', senderSign: 'ผู้รายงาน', safetySign: 'หัวหน้าความปลอดภัย', headSign: 'หัวหน้าแผนก',
    photoSheet: 'รูปภาพประกอบ', number: 'ลำดับ', fileName: 'ชื่อไฟล์', fileType: 'ประเภทไฟล์', preview: 'รูปภาพ', previewUnavailable: 'เปิดรูปภาพไม่ได้',
  },
  en: {
    title: 'Hiyari Hat Report', sender: 'Sender name', code: 'Employee ID', department: 'Department', date: 'Date',
    when: 'When', where: 'Where', what: 'What happened', suggestions: 'Suggestions for improvement', note: 'Note',
    documentNo: 'Document No.', revision: 'Revision', submittedAt: 'Submitted at', reporterInfo: 'Reporter information',
    reportDetails: 'Report details', signatures: 'Review and signatures', senderSign: 'Reporter', safetySign: 'Safety leader', headSign: 'Department head',
    photoSheet: 'Photo evidence', number: 'No.', fileName: 'File name', fileType: 'File type', preview: 'Preview', previewUnavailable: 'Preview unavailable',
  },
  my: {
    title: 'ဟိယာရီ ဟတ် အစီရင်ခံစာ', sender: 'တင်ပြသူအမည်', code: 'ဝန်ထမ်းအမှတ်', department: 'ဌာန', date: 'ရက်စွဲ',
    when: 'ဘယ်အချိန်', where: 'ဘယ်နေရာ', what: 'ဘာဖြစ်ခဲ့သလဲ', suggestions: 'တိုးတက်ကောင်းမွန်ရေး အကြံပြုချက်', note: 'မှတ်ချက်',
    documentNo: 'စာရွက်စာတမ်းအမှတ်', revision: 'ပြင်ဆင်ချက်', submittedAt: 'ပေးပို့သည့်အချိန်', reporterInfo: 'တင်ပြသူအချက်အလက်',
    reportDetails: 'အစီရင်ခံစာအသေးစိတ်', signatures: 'စစ်ဆေးခြင်းနှင့် လက်မှတ်များ', senderSign: 'တင်ပြသူ', safetySign: 'ဘေးကင်းရေးခေါင်းဆောင်', headSign: 'ဌာနမှူး',
    photoSheet: 'ဓာတ်ပုံအထောက်အထား', number: 'စဉ်', fileName: 'ဖိုင်အမည်', fileType: 'ဖိုင်အမျိုးအစား', preview: 'ဓာတ်ပုံ', previewUnavailable: 'ဓာတ်ပုံကို ဖွင့်၍မရပါ',
  },
}

const palette = { black: 'FF000000', white: 'FFFFFFFF' }

const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const edge = { style: 'thin', color: { argb: palette.black } }

export async function createHiyariWorkbook(row, uploadDir) {
  const language = ['th', 'en', 'my'].includes(row.language) ? row.language : 'th'
  const labels = labelsByLanguage[language]
  const fontName = language === 'my' ? 'Myanmar Text' : 'Bai Jamjuree'
  const baseFont = { name: fontName, size: 10, color: { argb: palette.black } }
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
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    properties: { tabColor: { argb: palette.black }, defaultRowHeight: 22 },
  })
  sheet.columns = [{ width: 25 }, { width: 26 }, { width: 26 }, { width: 26 }]
  sheet.pageSetup.orientation = 'portrait'
  sheet.pageSetup.paperSize = 9
  sheet.pageSetup.fitToPage = true
  sheet.pageSetup.fitToWidth = 1
  sheet.pageSetup.fitToHeight = 0
  sheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
  sheet.pageSetup.printArea = 'A1:D23'
  sheet.headerFooter.oddFooter = '&CPage &P of &N'

  sheet.mergeCells('A1:D1')
  for (let column = 1; column <= 4; column += 1) sheet.getCell(1, column).fill = solidFill(palette.black)
  sheet.getCell('A1').value = labels.title
  sheet.getCell('A1').font = { name: fontName, size: 18, bold: true, color: { argb: palette.white } }
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 38

  sheet.mergeCells('A2:D2')
  for (let column = 1; column <= 4; column += 1) sheet.getCell(2, column).fill = solidFill(palette.white)
  sheet.getCell('A2').value = row.form_title
  sheet.getCell('A2').font = { name: fontName, size: 11, color: { argb: palette.black }, italic: true }
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  sheet.getRow(2).height = 30

  sheet.getRow(3).height = 9

  function sectionHeading(rowNumber, text) {
    sheet.mergeCells(rowNumber, 1, rowNumber, 4)
    for (let column = 1; column <= 4; column += 1) sheet.getCell(rowNumber, column).fill = solidFill(palette.black)
    const cell = sheet.getCell(rowNumber, 1)
    cell.value = text
    cell.font = { name: fontName, size: 10, bold: true, color: { argb: palette.white } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    sheet.getRow(rowNumber).height = 25
  }

  function tableRow(rowNumber, label, value, height = 30) {
    sheet.getCell(rowNumber, 1).value = label
    sheet.mergeCells(rowNumber, 2, rowNumber, 4)
    sheet.getCell(rowNumber, 2).value = String(value || '—').trim() || '—'
    sheet.getRow(rowNumber).height = height
    for (let column = 1; column <= 4; column += 1) {
      const cell = sheet.getCell(rowNumber, column)
      cell.font = column === 1 ? { ...baseFont, bold: true } : baseFont
      cell.fill = solidFill(palette.white)
      cell.alignment = { vertical: column === 1 ? 'middle' : 'top', horizontal: 'left', wrapText: true }
      cell.border = {
        top: edge, bottom: edge,
        ...(column === 1 ? { left: edge, right: edge } : {}),
        ...(column === 2 ? { left: edge } : {}),
        ...(column === 4 ? { right: edge } : {}),
      }
    }
  }

  sectionHeading(4, labels.reporterInfo)
  tableRow(5, labels.sender, row.employee_name)
  tableRow(6, labels.code, row.employee_code, 28)
  tableRow(7, labels.department, row.department, 28)
  tableRow(8, labels.date, reportDate, 28)
  tableRow(9, labels.submittedAt, submittedAt, 28)
  sheet.getRow(10).height = 9
  sectionHeading(11, labels.reportDetails)

  const details = [
    [labels.when, row.when_text], [labels.where, row.where_text], [labels.what, row.what_happened],
    [labels.suggestions, row.suggestions], [labels.note, row.note],
  ]
  for (const [index, [label, text]] of details.entries()) {
    const value = String(text || '').trim() || '—'
    const lineCount = value.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 76)), 0)
    tableRow(12 + index, label, value, Math.max(42, Math.min(360, lineCount * 15 + 16)))
  }

  sheet.getRow(17).height = 9
  sectionHeading(18, labels.signatures)
  tableRow(19, labels.senderSign, '____________________________________________', 38)
  tableRow(20, labels.safetySign, '____________________________________________', 38)
  tableRow(21, labels.headSign, '____________________________________________', 38)
  sheet.mergeCells('A23:D23')
  sheet.getCell('A23').value = row.employee_code
  sheet.getCell('A23').font = { name: fontName, size: 8, color: { argb: palette.black } }
  sheet.getCell('A23').alignment = { horizontal: 'right', vertical: 'middle' }
  sheet.getRow(23).height = 18

  const photos = JSON.parse(row.photos_json || '[]').filter((photo) => photo && photo.storedName)
  if (photos.length) {
    const photoSheet = workbook.addWorksheet(language === 'th' ? 'รูปภาพประกอบ' : labels.photoSheet, {
      views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
      properties: { tabColor: { argb: palette.black }, defaultRowHeight: 22 },
    })
    photoSheet.columns = [{ width: 9 }, { width: 42 }, { width: 22 }, { width: 34 }]
    photoSheet.pageSetup.orientation = 'landscape'
    photoSheet.pageSetup.paperSize = 9
    photoSheet.pageSetup.fitToPage = true
    photoSheet.pageSetup.fitToWidth = 1
    photoSheet.pageSetup.fitToHeight = 0
    photoSheet.pageSetup.margins = { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
    photoSheet.mergeCells('A1:D1')
    for (let column = 1; column <= 4; column += 1) photoSheet.getCell(1, column).fill = solidFill(palette.black)
    photoSheet.getCell('A1').value = labels.photoSheet
    photoSheet.getCell('A1').font = { name: fontName, size: 16, bold: true, color: { argb: palette.white } }
    photoSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    photoSheet.getRow(1).height = 34
    photoSheet.getRow(2).values = [labels.number, labels.fileName, labels.fileType, labels.preview]
    photoSheet.getRow(2).height = 28
    for (let column = 1; column <= 4; column += 1) {
      const cell = photoSheet.getCell(2, column)
      cell.fill = solidFill(palette.black)
      cell.font = { name: fontName, size: 9, bold: true, color: { argb: palette.white } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = { top: edge, bottom: edge, left: edge, right: edge }
    }
    photoSheet.autoFilter = { from: 'A2', to: `D${photos.length + 2}` }

    for (const [index, photo] of photos.entries()) {
      const rowNumber = index + 3
      const photoRow = photoSheet.getRow(rowNumber)
      photoRow.values = [index + 1, photo.originalName || `photo-${index + 1}.jpg`, 'JPG', '']
      photoRow.height = 105
      for (let column = 1; column <= 4; column += 1) {
        const cell = photoSheet.getCell(rowNumber, column)
        cell.font = baseFont
        cell.fill = solidFill(palette.white)
        cell.alignment = { horizontal: column === 1 || column === 3 ? 'center' : 'left', vertical: 'middle', wrapText: true }
        cell.border = { top: edge, bottom: edge, left: edge, right: edge }
      }
      try {
        const photoPath = path.join(uploadDir, path.basename(photo.storedName))
        const photoBuffer = await sharp(await readFile(photoPath)).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
        const photoInfo = await sharp(photoBuffer).metadata()
        const scale = Math.min(225 / (photoInfo.width || 1), 122 / (photoInfo.height || 1))
        const imageId = workbook.addImage({ buffer: photoBuffer, extension: 'jpeg' })
        photoSheet.addImage(imageId, {
          tl: { col: 3, row: rowNumber - 1 },
          ext: { width: Math.round((photoInfo.width || 1) * scale), height: Math.round((photoInfo.height || 1) * scale) },
          editAs: 'oneCell',
        })
      } catch {
        photoRow.getCell(4).value = labels.previewUnavailable
        photoRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
    }
    photoSheet.pageSetup.printArea = `A1:D${photos.length + 2}`
    photoSheet.headerFooter.oddFooter = '&CPage &P of &N'
  }

  return workbook.xlsx.writeBuffer()
}
