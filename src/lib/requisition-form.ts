import { formatDateTime } from './api'
import { html, printDocument, raw } from './print-html'
import type { RequisitionDetail } from './requisition-types'

const MIN_ROWS = 22

const FORM_CSS = raw(`<style>
  .rf { font-size: 12px; color: #000; }
  .rf .code { text-align: right; font-size: 12px; }
  .rf h1 { text-align: center; font-size: 15px; margin: 2px 0 8px; }
  .rf .field { display: flex; align-items: baseline; gap: 4px; margin: 5px 0; }
  .rf .field > span { white-space: nowrap; } .rf .field > b { flex: 1; min-width: 20px; border-bottom: 1px dotted #000; font-weight: 400; padding: 0 4px; min-height: 16px; }
  .rf .row { display: flex; gap: 10px; } .rf .row > .field { flex: 1; }
  .rf .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 8px 0 10px; }
  .rf .box { display: inline-block; width: 11px; height: 11px; border: 1.2px solid #000; margin-right: 6px; vertical-align: -1px; text-align: center; line-height: 10px; font-size: 11px; }
  .rf table { margin-top: 6px; border: 1.5px solid #000; } .rf th, .rf td { border: 1px solid #000; padding: 2px 6px; background: none; text-align: center; }
  .rf th { font-weight: 700; } .rf th small { display: block; font-weight: 400; }
  .rf td { height: 22px; border-top: 1px dotted #000; border-bottom: 1px dotted #000; } .rf td.desc { text-align: left; }
  .rf td.num { text-align: center; }
  .rf .sign3 { margin-top: 12px; border: 1.5px solid #000; } .rf .sign3 th { height: 34px; } .rf .sign3 td { height: 62px; border: 1px solid #000; vertical-align: bottom; font-weight: 400; }
  .rf .sign3 td .who { display: block; text-align: center; }
  .rf .sign3 td .line { display: block; border-top: 1px dotted #000; margin: 26px 8px 2px; padding-top: 2px; }
  .rf .sign3 td .date { display: block; text-align: left; margin: 4px 8px 4px; }
</style>`)

/** Printable requisition request form (A4), laid out like the paper form FM-SFT-, filled with this requisition's real lines. */
export function printRequisitionForm(detail: RequisitionDetail, t: (text: string) => string, language: 'th' | 'en'): boolean {
  const title = detail.type === 'medicine' ? t('แบบฟอร์มการขอเบิกยาและอุปกรณ์รักษาพยาบาลเบื้องต้น') : t('แบบฟอร์มการขอเบิกอุปกรณ์ป้องกันอันตรายส่วนบุคคล (PPE)')
  const blanks = Math.max(0, MIN_ROWS - detail.lines.length)
  const rows = detail.lines.map((line, index) => html`<tr><td>${index + 1}</td><td class="desc">${line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ''}</td><td>${line.qtyRequested}</td><td>${line.unit}</td><td>${line.qtyIssued > 0 ? line.qtyIssued : ''}</td><td>${line.qtyIssued > 0 ? line.unit : ''}</td></tr>`)
  const empty = Array.from({ length: blanks }, (_, i) => html`<tr><td>${detail.lines.length + i + 1}</td><td class="desc"></td><td></td><td></td><td></td><td></td></tr>`)
  const field = (label: string, value = '') => html`<div class="field"><span>${label}</span><b>${value}</b></div>`
  const signCell = (label: string, sub: string) => html`<th>${label}${sub ? raw(`<small>${sub}</small>`) : ''}</th>`
  const body = html`${FORM_CSS}<div class="rf">
    <div class="code">FM – SFT-</div>
    <h1>${title}</h1>
    <div class="field" style="justify-content:flex-end"><span>${t('วันที่')}</span><b style="flex:none;width:240px">${formatDateTime(detail.submittedAt || detail.createdAt, language, false)}</b></div>
    <div class="row">${field(t('ชื่อผู้เบิก'), detail.requesterName)}${field(t('รหัส'), detail.requesterCode)}${field(t('ตำแหน่ง'), detail.requesterPosition)}</div>
    <div class="row">${field(t('แผนก'), detail.department)}${field(t('กะทำงาน'))}${field(t('จำนวนพนักงานทั้งหมด'))}<span style="align-self:flex-end">${t('คน')}</span></div>
    <div class="checks">
      <div><span class="box"></span>${t('ขอเบิกประจำเดือน')}</div>
      <div><span class="box"></span>${t('ขอเบิกเพิ่ม เนื่องจาก')} ........................</div>
      <div style="grid-column:1 / span 2"><span class="box">✓</span>${t('อื่นๆ ระบุ')} ${detail.reason} · ${t('ใบเบิกเลขที่')} ${detail.number}</div>
    </div>
    <table><thead>
      <tr><th colspan="4">${t('สำหรับผู้เบิก')}<small>For Requisition</small></th><th colspan="2">${t('สำหรับเจ้าหน้าที่ store')}</th></tr>
      <tr><th rowspan="2" style="width:38px">No.</th><th rowspan="2" style="width:46%">${t('รายการ')}<small>Description</small></th><th colspan="2">${t('จำนวนการเบิก')}</th><th colspan="2">${t('จำนวนการจ่าย')}</th></tr>
      <tr><th>${t('จำนวน')} Q'ty</th><th>${t('หน่วย')} Unit</th><th>${t('จำนวน')} Q'ty</th><th>${t('หน่วย')} Unit</th></tr>
    </thead><tbody>${rows}${empty}</tbody></table>
    <table class="sign3"><thead><tr>${signCell(`${t('ผู้ขอเบิก')} Request`, '')}${signCell(`${t('ตรวจสอบ')} Check`, `${t('อนุมัติ')} Approve`)}${signCell(`${t('ผู้จ่ายของ')} Delivery`, '')}</tr></thead>
    <tbody><tr>${[0, 1, 2].map((i) => html`<td><span class="who">${i === 1 ? 'Manager' : ''}</span><span class="line"></span><span class="date">${t('วันที่')} Date.........................</span></td>`)}</tr></tbody></table>
  </div>`
  return printDocument(`${title} ${detail.number}`, body, language)
}
