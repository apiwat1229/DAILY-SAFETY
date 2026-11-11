import type { AssessmentReportSubmission, Inspection } from './types'

export function escapePrintHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

export function createPrintWindow() {
  return window.open('', '_blank')
}

export function renderPrintWindow(popup: Window, title: string, content: string) {
  popup.document.open()
  popup.document.write(`<!doctype html><html lang="th"><head><base href="${window.location.origin}/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePrintHtml(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eef3f3;color:#172b2b;font:14px/1.55 "Bai Jamjuree","Leelawadee UI",Tahoma,sans-serif}.paper{max-width:900px;margin:24px auto;padding:36px;background:#fff;border:1px solid #d8e1e1;border-radius:12px}.eyebrow{color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.04em}h1{margin:4px 0 18px;font-size:24px}h2{margin:24px 0 8px;font-size:16px}.meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 22px}.meta div{padding:10px 12px;background:#f4f7f7;border-radius:8px}.label{display:block;margin-bottom:3px;color:#647575;font-size:11px}table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border:1px solid #dbe3e3;text-align:left;vertical-align:top}th{background:#f3f6f6;font-weight:600}.status{font-weight:700}.ng{color:#b42318}.ok{color:#067647}.na{color:#667085}.finding{margin-top:8px;padding:9px 11px;background:#fff7ed;border-left:3px solid #f59e0b;white-space:pre-wrap}.photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}.photos figure{width:180px;margin:0;break-inside:avoid}.photos img{width:100%;height:140px;object-fit:contain;border:1px solid #dbe3e3;border-radius:6px}.photos figcaption{color:#647575;font-size:11px}.answers article{padding:12px 0;border-bottom:1px solid #e2e8e8;break-inside:avoid}.answers h3{margin:0 0 5px;font-size:14px}.answers p{margin:0;white-space:pre-wrap}.footer{margin-top:24px;padding-top:10px;border-top:1px solid #dbe3e3;color:#647575;font-size:11px}
    @page{size:A4;margin:14mm}@media(max-width:600px){.paper{margin:0;padding:18px;border:0;border-radius:0}.meta{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:20px}}@media print{body{background:#fff;font-size:10.5pt}.paper{max-width:none;margin:0;padding:0;border:0;border-radius:0}.meta div{background:#f4f7f7!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}tr,figure,article{break-inside:avoid}h2{break-after:avoid}}
    </style></head><body><main class="paper">${content}</main><script>window.addEventListener('load',async()=>{try{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})))}finally{setTimeout(()=>window.print(),250)}})<\/script></body></html>`)
  popup.document.close()
  popup.focus()
}

export function openPrintWindow(title: string, content: string) {
  const popup = createPrintWindow()
  if (!popup) return null
  renderPrintWindow(popup, title, content)
  return popup
}

export function inspectionPrintMarkup(inspection: Inspection, language: 'th' | 'en', formatDate: (date: string, language: 'th' | 'en') => string, formatDateTime: (date: string, language: 'th' | 'en', includeTimezone?: boolean) => string, t: (key: string) => string) {
  const safe = escapePrintHtml
  const label = (th: string, en: string) => language === 'th' ? th : en
  const items = inspection.items.map((item, index) => {
    const status = item.result === 'NG' ? 'ng' : item.result === 'OK' ? 'ok' : 'na'
    const photos = item.photos?.length ? `<div class="photos">${item.photos.map((photo) => `<figure><img src="${safe(photo.url)}" alt="${safe(photo.name || t('รูปภาพประกอบ'))}"><figcaption>${safe(photo.type === 'before' ? t('ก่อนแก้ไข') : t('หลังแก้ไข'))} · ${safe(photo.name || '')}</figcaption></figure>`).join('')}</div>` : ''
    const finding = item.result === 'NG' ? `<div class="finding"><strong>${safe(label('รายละเอียดที่พบ', 'Finding'))}:</strong> ${safe(item.issueDetails || '—')}<br><strong>${safe(label('ผู้รับผิดชอบ', 'Owner'))}:</strong> ${safe(item.responsible || '—')} · <strong>${safe(label('สถานะ', 'Status'))}:</strong> ${safe(item.followUpStatus || '—')}${item.dueDate ? ` · <strong>${safe(label('กำหนดเสร็จ', 'Due'))}:</strong> ${safe(formatDate(item.dueDate, language))}` : ''}${item.resolutionNote ? `<br><strong>${safe(label('วิธีแก้ไข', 'Resolution'))}:</strong> ${safe(item.resolutionNote)}` : ''}${photos}</div>` : ''
    return `<tr><td>${index + 1}</td><td><strong>${safe(item.title)}</strong>${item.description ? `<br><span style="color:#647575">${safe(item.description)}</span>` : ''}</td><td class="status ${status}">${safe(item.result)}</td><td>${finding || '—'}</td></tr>`
  }).join('')
  return `<p class="eyebrow">Y.T. RUBBER · ${safe(label('รายงานการตรวจความปลอดภัย', 'SAFETY INSPECTION REPORT'))}</p><h1>${safe(t('รายละเอียดการตรวจ'))}</h1><section class="meta"><div><span class="label">${safe(label('วันที่ตรวจ', 'Inspection date'))}</span>${safe(formatDate(inspection.date, language))}</div><div><span class="label">${safe(label('เวลา', 'Time'))}</span>${safe(inspection.time ? (language === 'th' ? `${inspection.time} น.` : inspection.time) : '—')}</div><div><span class="label">${safe(label('ผู้ตรวจ', 'Inspector'))}</span>${safe(inspection.inspector || '—')}</div><div><span class="label">${safe(label('รหัสพนักงาน', 'Employee ID'))}</span>${safe(inspection.employeeCode || '—')}</div><div><span class="label">${safe(label('แผนก / พื้นที่', 'Department / Area'))}</span>${safe(inspection.area || '—')}</div><div><span class="label">${safe(label('กะ', 'Shift'))}</span>${safe(inspection.shift || '—')}</div><div><span class="label">${safe(label('บันทึกเมื่อ', 'Submitted'))}</span>${safe(formatDateTime(inspection.createdAt, language, false))}</div></section><h2>${safe(label('ผลตรวจรายหัวข้อ', 'Checklist results'))}</h2><table><thead><tr><th>#</th><th>${safe(label('หัวข้อตรวจ', 'Checklist item'))}</th><th>${safe(label('ผล', 'Result'))}</th><th>${safe(label('รายละเอียด / การติดตาม', 'Details / follow-up'))}</th></tr></thead><tbody>${items}</tbody></table><p class="footer">${safe(label('เอกสารนี้สร้างจากระบบความปลอดภัยประจำวัน', 'Generated by Daily Safety'))} · ${safe(inspection.id)}</p>`
}

export function assessmentPrintMarkup(submission: AssessmentReportSubmission, language: 'th' | 'en', formatDateTime: (date: string, language: 'th' | 'en', includeTimezone?: boolean) => string, t: (key: string) => string) {
  const safe = escapePrintHtml
  const label = (th: string, en: string) => language === 'th' ? th : en
  const answers = submission.answers.map((answer, index) => `<article><h3>${index + 1}. ${safe(answer.prompt)}${answer.isScored ? ` <span class="status ${answer.isCorrect ? 'ok' : 'ng'}">· ${safe(t(answer.isCorrect ? 'ถูกต้อง' : 'ไม่ถูกต้อง'))}</span>` : ''}</h3><p>${safe(answer.answer || '—')}</p></article>`).join('')
  return `<p class="eyebrow">Y.T. RUBBER · ${safe(label('รายงานผลแบบประเมิน', 'ASSESSMENT REPORT'))}</p><h1>${safe(submission.assessmentTitle)}</h1><section class="meta"><div><span class="label">${safe(label('ชื่อพนักงาน', 'Employee'))}</span>${safe(submission.employeeName)}</div><div><span class="label">${safe(label('รหัสพนักงาน', 'Employee ID'))}</span>${safe(submission.employeeCode)}</div><div><span class="label">${safe(label('วันที่ส่ง', 'Submitted'))}</span>${safe(formatDateTime(submission.submittedAt, language, false))}</div><div><span class="label">${safe(label('คะแนน', 'Score'))}</span>${submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : safe(t('ไม่มีคะแนนอัตโนมัติ'))}</div></section><h2>${safe(label('คำตอบ', 'Answers'))}</h2><section class="answers">${answers}</section><p class="footer">${safe(label('เอกสารนี้สร้างจากระบบความปลอดภัยประจำวัน', 'Generated by Daily Safety'))} · ${safe(submission.id)}</p>`
}
