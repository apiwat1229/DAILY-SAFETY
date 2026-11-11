import { formatDate, formatDateTime } from './api'
import { html, printDocument } from './print-html'
import type { RequisitionDetail } from './requisition-types'

/** Printable issue slip (A4) for a requisition that has had items issued. Returns false when the popup was blocked. */
export function printIssueSlip(detail: RequisitionDetail, t: (text: string) => string, language: 'th' | 'en'): boolean {
  const issuedAt = detail.events.filter((event) => event.action === 'issued').at(-1)?.at ?? ''
  const lines = detail.lines.filter((line) => line.qtyIssued > 0)
  const body = html`<h1>${t('ใบจ่ายของ')}</h1><p class="muted">${detail.number}</p>
    <dl class="meta">
      <dt>${t('ผู้เบิก')}</dt><dd>${detail.requesterName}</dd>
      <dt>${t('แผนก')}</dt><dd>${detail.department || '—'}</dd>
      <dt>${t('คลัง')}</dt><dd>${detail.warehouseName}</dd>
      <dt>${t('เหตุผลการเบิก')}</dt><dd>${detail.reason}</dd>
      <dt>${t('ส่งเมื่อ')}</dt><dd>${formatDateTime(detail.submittedAt, language, false)}</dd>
      <dt>${t('จ่ายเมื่อ')}</dt><dd>${issuedAt ? formatDateTime(issuedAt, language, false) : '—'}</dd>
      <dt>${t('ต้องการภายใน')}</dt><dd>${detail.neededBy ? formatDate(detail.neededBy, language) : '—'}</dd>
    </dl>
    <table><thead><tr><th>#</th><th>${t('สินค้า')}</th><th>${t('รหัส')}</th><th class="num">${t('อนุมัติ')}</th><th class="num">${t('จ่ายแล้ว')}</th><th>${t('หน่วย')}</th></tr></thead>
    <tbody>${lines.map((line, index) => html`<tr><td>${index + 1}</td><td>${line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ''}</td><td>${line.sku}</td><td class="num">${line.qtyApproved}</td><td class="num">${line.qtyIssued}</td><td>${line.unit}</td></tr>`)}</tbody></table>
    <div class="sign"><div>${t('ผู้จ่ายของ')}</div><div>${t('ผู้รับของ')}</div></div>`
  return printDocument(`${t('ใบจ่ายของ')} ${detail.number}`, body, language)
}
