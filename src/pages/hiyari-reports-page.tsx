import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileBarChart2, FileSpreadsheet, LoaderCircle, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate, formatDateTime, hiyariEmployeeSummaryExportUrl, hiyariSubmissionExportUrl } from '@/lib/api'
import type { HiyariForm, HiyariLanguage, HiyariSubmission } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { useI18n } from '@/lib/i18n'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'

type DocumentLabels = {
  title: string
  documentNo: string
  revision: string
  reporterInfo: string
  reportDetails: string
  sender: string
  employeeCode: string
  department: string
  reportDate: string
  submittedAt: string
  when: string
  where: string
  what: string
  suggestions: string
  note: string
  photos: string
  reporterSign: string
  safetySign: string
  managerSign: string
  sign: string
  footer: string
}

const documentLabels: Record<HiyariLanguage, DocumentLabels> = {
  th: {
    title: 'รายงาน Hiyari Hat', documentNo: 'เลขที่เอกสาร', revision: 'ฉบับแก้ไข', reporterInfo: 'ข้อมูลผู้รายงาน', reportDetails: 'รายละเอียดรายงาน', sender: 'ชื่อผู้รายงาน',
    employeeCode: 'รหัสพนักงาน', department: 'แผนก', reportDate: 'วันที่รายงาน', submittedAt: 'วันที่ส่งรายงาน', when: 'เมื่อไหร่',
    where: 'ที่ไหน', what: 'เกิดอะไรขึ้น', suggestions: 'ข้อเสนอแนะเพื่อปรับปรุง', note: 'หมายเหตุ', photos: 'รูปภาพประกอบ', reporterSign: 'ผู้รายงาน',
    safetySign: 'หัวหน้าความปลอดภัย', managerSign: 'หัวหน้าแผนก', sign: 'ลงชื่อ', footer: 'เอกสารเพื่อการรายงานและปรับปรุงความปลอดภัยในการทำงาน',
  },
  en: {
    title: 'Hiyari Hat Report', documentNo: 'Document No.', revision: 'Revision', reporterInfo: 'Reporter information', reportDetails: 'Report details', sender: 'Reported by',
    employeeCode: 'Employee ID', department: 'Department', reportDate: 'Report date', submittedAt: 'Submitted at', when: 'When',
    where: 'Where', what: 'What happened', suggestions: 'Suggestions for improvement', note: 'Note', photos: 'Supporting photos', reporterSign: 'Reporter',
    safetySign: 'Safety leader', managerSign: 'Department head', sign: 'Signature', footer: 'For workplace safety reporting and continuous improvement',
  },
  my: {
    title: 'ဟိယာရီ ဟတ် အစီရင်ခံစာ', documentNo: 'စာရွက်စာတမ်းအမှတ်', revision: 'ပြင်ဆင်ချက်', reporterInfo: 'တင်ပြသူအချက်အလက်', reportDetails: 'အစီရင်ခံစာအသေးစိတ်', sender: 'တင်ပြသူအမည်',
    employeeCode: 'ဝန်ထမ်းအမှတ်', department: 'ဌာန', reportDate: 'တင်ပြသည့်ရက်စွဲ', submittedAt: 'ပေးပို့သည့်အချိန်', when: 'ဘယ်အချိန်',
    where: 'ဘယ်နေရာ', what: 'ဘာဖြစ်ခဲ့သလဲ', suggestions: 'တိုးတက်ကောင်းမွန်ရေး အကြံပြုချက်', note: 'မှတ်ချက်', photos: 'အထောက်အကူပြု ဓာတ်ပုံများ', reporterSign: 'တင်ပြသူ',
    safetySign: 'ဘေးကင်းရေးခေါင်းဆောင်', managerSign: 'ဌာနမှူး', sign: 'လက်မှတ်', footer: 'လုပ်ငန်းခွင်ဘေးကင်းရေး တင်ပြခြင်းနှင့် စဉ်ဆက်မပြတ် တိုးတက်စေရန်',
  },
}

const paperStyles = `
  .hiyari-paper{box-sizing:border-box;width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:15mm;background:#fff;color:#000;font-family:"Bai Jamjuree","Myanmar Text","Noto Sans Thai",Arial,sans-serif;font-size:11pt;line-height:1.55}
  .hiyari-paper *{box-sizing:border-box}
  .hiyari-paper h1{margin:0 0 16px;font-size:15pt!important;line-height:1.3!important;letter-spacing:0!important;color:#000;font-weight:700}
  .hiyari-paper .section-title{margin:22px 0 8px;font-size:11pt;font-weight:700;color:#000}
  .hiyari-paper table{width:100%;border-collapse:collapse;table-layout:fixed}
  .hiyari-paper th,.hiyari-paper td{border:1px solid #000;padding:8px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}
  .hiyari-paper .meta th{width:25%;background:#fff;color:#000;font-weight:700}
  .hiyari-paper .meta td{width:25%}
  .hiyari-paper .answers th{width:28%;background:#fff;color:#000;font-weight:700}
  .hiyari-paper .answers td{min-height:36px}
  .hiyari-paper .photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .hiyari-paper .photo{margin:0;padding:7px;border:1px solid #000;break-inside:avoid}
  .hiyari-paper .photo img{display:block;width:100%;height:58mm;object-fit:contain;background:#fff}
  .hiyari-paper .photo figcaption{padding-top:5px;color:#000;font-size:8.5pt;overflow-wrap:anywhere}
  .hiyari-paper .signature{margin-top:28px;break-inside:avoid}
  .hiyari-paper .signature td{height:68px;padding-top:42px;text-align:center;font-size:9pt;color:#000}
  .hiyari-paper .doc-footer{margin-top:20px;padding-top:8px;border-top:1px solid #000;color:#000;font-size:8.5pt;display:flex;justify-content:space-between;gap:12px}
  @media screen{.hiyari-paper{box-shadow:0 4px 20px rgba(0,0,0,.13);border:1px solid #000}}
  @media screen and (max-width:640px){
    .hiyari-paper{width:100%;max-width:100%;min-height:0;padding:14px;font-size:10pt;line-height:1.5}
    .hiyari-paper h1{margin:0 0 12px;font-size:14pt!important}
    .hiyari-paper .section-title{margin:16px 0 6px}
    .hiyari-paper .meta,.hiyari-paper .meta tbody{display:block}
    .hiyari-paper .meta tr{display:grid;grid-template-columns:minmax(88px,.8fr) minmax(0,1.4fr)}
    .hiyari-paper .meta th,.hiyari-paper .meta td{width:auto;min-width:0;padding:7px;overflow-wrap:anywhere;word-break:normal}
    .hiyari-paper .meta td[colspan="3"]{grid-column:span 1}
    .hiyari-paper .answers th{width:34%}
    .hiyari-paper .answers th,.hiyari-paper .answers td{padding:7px}
    .hiyari-paper .photos{grid-template-columns:1fr}
    .hiyari-paper .photo img{height:52mm}
    .hiyari-paper .signature,.hiyari-paper .signature tbody,.hiyari-paper .signature tr{display:block}
    .hiyari-paper .signature td{display:block;width:100%;height:auto;min-height:70px;padding:36px 8px 8px;text-align:left}
    .hiyari-paper .doc-footer{display:block;overflow-wrap:anywhere}
  }
  @media print{@page{size:A4;margin:14mm}.hiyari-paper{width:auto;max-width:none;min-height:0;margin:0;padding:0;font-size:10.5pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}.hiyari-paper .section-title{break-after:avoid}.hiyari-paper tr{break-inside:avoid}.hiyari-paper .signature{break-inside:avoid}.hiyari-paper .photo img{height:55mm}}
`

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

function reportDocumentMarkup(submission: HiyariSubmission) {
  const labels = documentLabels[submission.language]
  const documentNo = submission.formTitle.match(/\bFM-SFT-\d+\b/i)?.[0] || 'HIYARI-HAT'
  const revision = submission.formTitle.match(/\bRev\.?\s*([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)?)/i)?.[1] || '01'
  const dateLocale = submission.language === 'th' ? 'th-TH' : submission.language === 'my' ? 'my-MM-u-ca-gregory' : 'en-GB'
  const reportDate = new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${submission.reportDate}T12:00:00+07:00`))
  const submittedDate = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(submission.submittedAt))
  const value = (text: string) => escapeHtml(text.trim() || '—')
  const rows: [string, string][] = [
    [labels.when, submission.whenText], [labels.where, submission.whereText], [labels.what, submission.whatHappened],
    [labels.suggestions, submission.suggestions], [labels.note, submission.note],
  ]
  const photosMarkup = submission.photos?.length ? `<p class="section-title">${escapeHtml(labels.photos)}</p><div class="photos">${submission.photos.map((photo) => `<figure class="photo"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.originalName)}"><figcaption>${escapeHtml(photo.originalName)}</figcaption></figure>`).join('')}</div>` : ''
  return `<h1>${escapeHtml(submission.formTitle)}</h1>
    <p class="section-title">${escapeHtml(labels.reporterInfo)}</p>
    <table class="meta"><tbody><tr><th>${escapeHtml(labels.sender)}</th><td>${value(submission.employeeName)}</td><th>${escapeHtml(labels.employeeCode)}</th><td>${value(submission.employeeCode)}</td></tr><tr><th>${escapeHtml(labels.department)}</th><td>${value(submission.department)}</td><th>${escapeHtml(labels.reportDate)}</th><td>${escapeHtml(reportDate)}</td></tr><tr><th>${escapeHtml(labels.submittedAt)}</th><td colspan="3">${escapeHtml(submittedDate)}</td></tr></tbody></table>
    <p class="section-title">${escapeHtml(labels.reportDetails)}</p><table class="answers"><tbody>${rows.map(([label, text]) => `<tr><th>${escapeHtml(label)}</th><td>${value(text)}</td></tr>`).join('')}</tbody></table>${photosMarkup}
    <table class="signature"><tbody><tr><td>${escapeHtml(labels.reporterSign)}<br>${escapeHtml(labels.sign)} ____________________<br>${escapeHtml(labels.reportDate)} ____ / ____ / ______</td><td>${escapeHtml(labels.safetySign)}<br>${escapeHtml(labels.sign)} ____________________<br>${escapeHtml(labels.reportDate)} ____ / ____ / ______</td><td>${escapeHtml(labels.managerSign)}<br>${escapeHtml(labels.sign)} ____________________<br>${escapeHtml(labels.reportDate)} ____ / ____ / ______</td></tr></tbody></table>
    <footer class="doc-footer"><span>${escapeHtml(labels.footer)}</span><span>${escapeHtml(documentNo)} · Rev.${escapeHtml(revision)} · ${escapeHtml(submission.employeeCode)}</span></footer>`
}

function openPdfWindow(submission: HiyariSubmission, t: (key: string) => string) {
  const popup = window.open('', '_blank')
  if (!popup) {
    toast.error(t('เบราว์เซอร์บล็อกหน้าต่าง PDF โปรดอนุญาตป๊อปอัปแล้วลองอีกครั้ง'))
    return
  }
  const fileName = `hiyari-${submission.language}-${submission.employeeCode}-${submission.reportDate}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  popup.document.open()
  popup.document.write(`<!doctype html><html lang="${submission.language}"><head><base href="${window.location.origin}/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(fileName)}</title><style>html,body{margin:0;background:#edf1f1}body{padding:20px}${paperStyles}@media print{html,body{padding:0;background:#fff}}</style></head><body><main class="hiyari-paper">${reportDocumentMarkup(submission)}</main><script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),350)})<\/script></body></html>`)
  popup.document.close()
  popup.focus()
}

export function HiyariReportsPage() {
  const { language, t } = useI18n()
  const [forms, setForms] = useState<HiyariForm[]>([])
  const [submissions, setSubmissions] = useState<HiyariSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [search, setSearch] = useState('')
  const [formFilter, setFormFilter] = useState('all')
  const [selected, setSelected] = useState<HiyariSubmission | null>(null)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [formData, reportData] = await Promise.all([api.hiyariForms(), api.hiyariSubmissions()])
      setForms(formData.forms)
      setSubmissions(reportData.submissions)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'โหลดรายงาน Hiyari Hat ไม่สำเร็จ'))
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

  const visibleSubmissions = useMemo(() => submissions.filter((submission) => {
    const matchesForm = formFilter === 'all' || submission.formId === formFilter
    const query = search.trim().toLocaleLowerCase()
    const matchesSearch = !query || [submission.employeeName, submission.employeeCode, submission.department, submission.formTitle, submission.reportDate].some((value) => value.toLocaleLowerCase().includes(query))
    return matchesForm && matchesSearch
  }), [formFilter, search, submissions])
  const pagination = useDataPagination(visibleSubmissions)

  async function downloadExcel(submission: HiyariSubmission) {
    setBusyId(submission.id)
    try {
      const response = await fetch(hiyariSubmissionExportUrl(submission.id), { credentials: 'same-origin' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'ส่งออก Excel ไม่สำเร็จ')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `hiyari-${submission.language}-${submission.employeeCode}-${submission.reportDate}.xlsx`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ส่งออก Excel ไม่สำเร็จ')) }
    finally { setBusyId('') }
  }

  async function downloadEmployeeSummary() {
    if (Boolean(exportFrom) !== Boolean(exportTo)) {
      toast.error(t('กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด หรือ ล้างวันที่ทั้งสองช่องเพื่อส่งออกทั้งหมด'))
      return
    }
    if (exportFrom && exportTo && exportFrom > exportTo) {
      toast.error(t('วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด'))
      return
    }
    setBusyId('employee-summary')
    try {
      const response = await fetch(hiyariEmployeeSummaryExportUrl(language, exportFrom, exportTo), { credentials: 'same-origin' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'ส่งออก Excel แยกรายคนไม่สำเร็จ')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `hiyari-reports-by-employee-${exportFrom && exportTo ? `${exportFrom}-to-${exportTo}` : 'all-dates'}.xlsx`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ส่งออก Excel แยกรายคนไม่สำเร็จ')) }
    finally { setBusyId('') }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
      <div className="shrink-0"><h2 className="page-heading text-2xl font-semibold tracking-tight">{t('รายงาน Hiyari Hat')}</h2></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-[170px_170px]">
          <label className="block min-w-0 text-xs text-muted-foreground"><span className="mb-1 block">{t('ตั้งแต่วันที่')}</span><DatePicker value={exportFrom} onChange={setExportFrom} maxDate={exportTo || undefined} placeholder="เลือกวันที่" ariaLabel={t('ตั้งแต่วันที่')} language={language} clearable className="w-full" /></label>
          <label className="block min-w-0 text-xs text-muted-foreground"><span className="mb-1 block">{t('ถึงวันที่')}</span><DatePicker value={exportTo} onChange={setExportTo} minDate={exportFrom || undefined} placeholder="เลือกวันที่" ariaLabel={t('ถึงวันที่')} language={language} clearable className="w-full" /></label>
        </div>
        <Button variant="outline" className="h-10 shrink-0 gap-2 whitespace-nowrap" disabled={busyId === 'employee-summary' || Boolean(exportFrom) !== Boolean(exportTo)} onClick={() => void downloadEmployeeSummary()}>{busyId === 'employee-summary' ? <LoaderCircle size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}{language === 'en' ? 'Excel by employee' : 'Excel แยกรายคน'}</Button>
      </div>
    </div>

    <Card className="overflow-hidden rounded-2xl border-border">
      <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{t('รายงานที่ส่งเข้ามา')}</CardTitle><CardDescription>{t('ค้นหาตามชื่อหรือรหัสพนักงาน แล้วเปิดดูหรือส่งออกรายงาน')}</CardDescription></div><div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[220px_240px]"><Select value={formFilter} onValueChange={setFormFilter}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('ทุกแบบฟอร์ม')}</SelectItem>{forms.map((form) => <SelectItem key={form.id} value={form.id}>{form.title}</SelectItem>)}</SelectContent></Select><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-10 pl-9" /></div></div></CardHeader>
      {visibleSubmissions.length ? <>
        <div className="overflow-x-auto"><Table className="min-w-[840px]"><TableHeader><TableRow className="bg-surface-subtle text-left text-muted-foreground"><TableHead className="px-5 font-medium">{t('วันที่รายงาน')}</TableHead><TableHead className="px-3 font-medium">{t('พนักงาน')}</TableHead><TableHead className="px-3 font-medium">{t('แผนก')}</TableHead><TableHead className="px-3 font-medium">{t('ภาษา')}</TableHead><TableHead className="px-5 text-right font-medium">{t('การทำรายการ')}</TableHead></TableRow></TableHeader><TableBody>{pagination.visibleItems.map((submission) => <TableRow key={submission.id}><TableCell className="px-5"><p>{formatDate(submission.reportDate, language)}</p><p className="text-xs text-muted-foreground">{formatDateTime(submission.submittedAt, language)}</p></TableCell><TableCell className="px-3"><p className="font-medium">{submission.employeeName}</p><p className="text-xs text-muted-foreground">{submission.employeeCode}</p></TableCell><TableCell className="px-3">{submission.department || '—'}</TableCell><TableCell className="px-3"><Badge variant="outline">{submission.language.toUpperCase()}</Badge></TableCell><TableCell className="px-5"><div className="flex justify-end gap-2"><Button variant="outline" className="h-9 gap-1.5" onClick={() => setSelected(submission)}><Eye size={15} />{t('ดูข้อมูล')}</Button><Button variant="outline" className="h-9 gap-1.5" aria-label={`${t('ดาวน์โหลด PDF')} ${submission.employeeName}`} onClick={() => openPdfWindow(submission, t)}><Download size={15} />PDF</Button><Button variant="outline" className="h-9 gap-1.5" disabled={busyId === submission.id} onClick={() => void downloadExcel(submission)}>{busyId === submission.id ? <LoaderCircle size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}{t('Excel')}</Button></div></TableCell></TableRow>)}</TableBody></Table></div>
        <DataTablePagination total={visibleSubmissions.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center p-8 text-center"><div><FileBarChart2 className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-2 font-medium">{loading ? t('กำลังโหลดข้อมูล…') : t('ยังไม่มีรายงาน')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เมื่อพนักงานส่งแบบฟอร์ม รายงานจะแสดงที่นี่')}</p></div></CardContent>}
    </Card>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent showCloseButton={false} className="w-[calc(100vw-1rem)] max-h-[96dvh] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl"><DialogHeader className="flex-col items-stretch gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4"><div className="min-w-0"><DialogTitle>{t('รายละเอียดรายงาน Hiyari Hat')}</DialogTitle><DialogDescription className="mt-1">{selected ? `${selected.employeeName} · ${selected.employeeCode} · ${formatDate(selected.reportDate, language)}` : ''}</DialogDescription></div><div className="flex shrink-0 items-center justify-end gap-2"><Button variant="outline" className="h-10 gap-2 whitespace-nowrap" onClick={() => selected && openPdfWindow(selected, t)}><Download size={15} />{t('ดาวน์โหลด PDF')}</Button><Button variant="ghost" size="icon" aria-label={t('ปิด')} onClick={() => setSelected(null)}><X size={17} /></Button></div></DialogHeader>
      {selected && <div className="max-h-[calc(96dvh-116px)] overflow-auto bg-muted p-2 sm:max-h-[calc(96dvh-88px)] sm:p-6"><style>{paperStyles}</style><article className="hiyari-paper" dangerouslySetInnerHTML={{ __html: reportDocumentMarkup(selected) }} /></div>}
    </DialogContent></Dialog>
  </div>
}
