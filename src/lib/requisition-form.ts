import { formatDateTime } from './api'
import { html, printDocument } from './print-html'
import type { RequisitionDetail } from './requisition-types'

const MIN_ROWS = 12

/** Printable requisition request form (A4): the real lines of this requisition, no manager-section acknowledgement box. */
export function printRequisitionForm(detail: RequisitionDetail, t: (text: string) => string, language: 'th' | 'en'): boolean {
  const title = detail.type === 'medicine' ? t('แบบฟอร์มการขอเบิกยาและอุปกรณ์รักษาพยาบาลเบื้องต้น') : t('แบบฟอร์มการขอเบิกอุปกรณ์ป้องกันอันตรายส่วนบุคคล (PPE)')
  const blanks = Math.max(0, MIN_ROWS - detail.lines.length)
  const rows = detail.lines.map((line, index) => html`<tr><td class="num">${index + 1}</td><td>${line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ''}</td><td class="num">${line.qtyRequested}</td><td>${line.unit}</td><td class="num">${line.qtyIssued > 0 ? line.qtyIssued : ''}</td><td>${line.qtyIssued > 0 ? line.unit : ''}</td></tr>`)
  const empty = Array.from({ length: blanks }, (_, i) => html`<tr><td class="num">${detail.lines.length + i + 1}</td><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>`)
  const body = html`<h1 style="text-align:center">${title}</h1>
    <p class="muted" style="text-align:center">${t('เลขที่ใบเบิก')} ${detail.number}</p>
    <dl class="meta">
      <dt>${t('วันที่')}</dt><dd>${formatDateTime(detail.submittedAt || detail.createdAt, language, false)}</dd>
      <dt>${t('ชื่อผู้เบิก')}</dt><dd>${detail.requesterName}</dd>
      <dt>${t('รหัสพนักงาน')}</dt><dd>${detail.requesterCode || '—'}</dd>
      <dt>${t('ตำแหน่ง')}</dt><dd>${detail.requesterPosition || '—'}</dd>
      <dt>${t('แผนก')}</dt><dd>${detail.department || '—'}</dd>
      <dt>${t('คลัง')}</dt><dd>${detail.warehouseName}</dd>
      <dt>${t('เหตุผลการเบิก')}</dt><dd>${detail.reason || '—'}</dd>
    </dl>
    <table><thead>
      <tr><th rowspan="2">#</th><th rowspan="2">${t('รายการ')}</th><th colspan="2">${t('สำหรับผู้เบิก')}</th><th colspan="2">${t('สำหรับเจ้าหน้าที่คลัง')}</th></tr>
      <tr><th>${t('จำนวนการเบิก')}</th><th>${t('หน่วย')}</th><th>${t('จำนวนการจ่าย')}</th><th>${t('หน่วย')}</th></tr>
    </thead><tbody>${rows}${empty}</tbody></table>
    <div class="sign"><div>${t('ผู้ขอเบิก')}</div><div>${t('ตรวจสอบ / อนุมัติ (Manager)')}</div><div>${t('ผู้จ่ายของ')}</div></div>`
  return printDocument(`${title} ${detail.number}`, body, language)
}
