import { useEffect, useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet, LoaderCircle, Pencil, Printer, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, assessmentReportExportUrl, formatDateTime } from '@/lib/api'
import type { AssessmentReportSubmission } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { ConfirmActionDialog } from '@/components/confirm-action-dialog'
import { assessmentPrintMarkup, openPrintWindow } from '@/lib/print-documents'
import { useConfirm } from '@/components/confirm-provider'

export function AssessmentReportsPage() {
  const { language, t } = useI18n()
  const confirm = useConfirm()
  const [submissions, setSubmissions] = useState<AssessmentReportSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<AssessmentReportSubmission | null>(null)
  const [editing, setEditing] = useState<AssessmentReportSubmission | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssessmentReportSubmission | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function refresh() {
    try { const { submissions: rows } = await api.assessmentReportSubmissions(); setSubmissions(rows) }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [t])

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      if (!(await confirm('update'))) return
      const result = await api.updateAssessmentSubmissionEmployee(editing.id, { employeeCode: String(form.get('employeeCode') || '').trim(), employeeName: String(form.get('employeeName') || '').trim() })
      setSubmissions((current) => current.map((row) => row.id === editing.id ? { ...row, employeeCode: result.employeeCode, employeeName: result.employeeName } : row))
      setDetail((current) => current?.id === editing.id ? { ...current, employeeCode: result.employeeCode, employeeName: result.employeeName } : current)
      setEditing(null); toast.success(t('บันทึกการแก้ไขแล้ว'))
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setSaving(false) }
  }

  async function deleteSubmission() {
    if (!deleteTarget) return
    setDeleting(true)
    try { await api.deleteAssessmentSubmission(deleteTarget.id); setSubmissions((current) => current.filter((row) => row.id !== deleteTarget.id)); setDetail((current) => current?.id === deleteTarget.id ? null : current); setDeleteTarget(null); toast.success(t('ลบรายการแล้ว')) }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบรายการไม่สำเร็จ')) }
    finally { setDeleting(false) }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return submissions.filter((submission) => !term || submission.assessmentTitle.toLocaleLowerCase().includes(term) || submission.employeeName.toLocaleLowerCase().includes(term) || submission.employeeCode.toLocaleLowerCase().includes(term))
  }, [query, submissions])
  const pagination = useDataPagination(filtered)
  const printSubmission = (submission: AssessmentReportSubmission, mode: 'pdf' | 'print') => {
    const title = `${mode === 'pdf' ? 'assessment-report' : 'assessment-print'}-${submission.employeeCode}-${submission.id}`
    const popup = openPrintWindow(title, assessmentPrintMarkup(submission, language, formatDateTime, t))
    if (!popup) toast.error(t('เบราว์เซอร์บล็อกหน้าต่าง PDF โปรดอนุญาตป๊อปอัปแล้วลองอีกครั้ง'))
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('ผลการประเมิน')}</p><h2 className="page-heading mt-1 font-semibold tracking-tight">{t('รายงานแบบประเมิน')}</h2></div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative w-full sm:w-64"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาแบบประเมินหรือพนักงาน')} className="h-11 pl-9" /></div><Button iconOnly asChild variant="outline" disabled={!submissions.length} className="h-11 w-full gap-2 whitespace-nowrap sm:w-auto"><a href={assessmentReportExportUrl()} download><FileSpreadsheet size={16} /> {t('ส่งออก Excel')}</a></Button></div>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      {filtered.length ? <><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-surface-subtle"><TableHead className="pl-5">{t('แบบประเมิน')}</TableHead><TableHead>{t('วันที่ส่ง')}</TableHead><TableHead>{t('ชื่อพนักงาน')}</TableHead><TableHead>{t('รหัสพนักงาน')}</TableHead><TableHead>{t('คะแนน')}</TableHead><TableHead className="pr-5 text-right">{t('การทำรายการ')}</TableHead></TableRow></TableHeader><TableBody>{pagination.visibleItems.map((submission) => <TableRow key={submission.id}><TableCell className="max-w-64 truncate pl-5 font-medium">{submission.assessmentTitle}</TableCell><TableCell className="whitespace-nowrap">{formatDateTime(submission.submittedAt, language, false)}</TableCell><TableCell>{submission.employeeName}</TableCell><TableCell>{submission.employeeCode}</TableCell><TableCell>{submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : t('ไม่มีคะแนนอัตโนมัติ')}</TableCell><TableCell className="pr-5"><div className="flex justify-end gap-0.5"><Button type="button" size="sm" variant="ghost" onClick={() => setDetail(submission)}>{t('ดูคำตอบ')}</Button><Button iconOnly type="button" size="icon" variant="ghost" aria-label={t('ดาวน์โหลด PDF')} title={t('ดาวน์โหลด PDF')} onClick={() => printSubmission(submission, 'pdf')}><FileDown size={15} /></Button><Button iconOnly type="button" size="icon" variant="ghost" aria-label={t('พิมพ์')} title={t('พิมพ์')} onClick={() => printSubmission(submission, 'print')}><Printer size={15} /></Button><Button iconOnly type="button" size="icon" variant="ghost" aria-label={t('แก้ไขข้อมูลผู้ส่ง')} onClick={() => setEditing(submission)}><Pencil size={15} /></Button><Button iconOnly type="button" size="icon" variant="ghost" className="text-destructive" aria-label={t('ลบรายการ')} onClick={() => setDeleteTarget(submission)}><Trash2 size={15} /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>
        <div className="divide-y md:hidden">{pagination.visibleItems.map((submission) => <div key={submission.id} className="space-y-3 p-4"><button type="button" onClick={() => setDetail(submission)} className="flex w-full items-center justify-between gap-3 text-left"><div className="min-w-0"><p className="truncate font-semibold">{submission.employeeName}</p><p className="mt-1 truncate text-sm text-muted-foreground">{submission.assessmentTitle} · {submission.employeeCode}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatDateTime(submission.submittedAt, language, false)}</p></div><Badge variant="outline">{submission.maxScore > 0 ? `${submission.score}/${submission.maxScore}` : t('ดู')}</Badge></button><div className="flex justify-end gap-1"><Button iconOnly type="button" size="icon" variant="ghost" aria-label={t('ดาวน์โหลด PDF')} title={t('ดาวน์โหลด PDF')} onClick={() => printSubmission(submission, 'pdf')}><FileDown size={15} /></Button><Button iconOnly type="button" size="icon" variant="ghost" aria-label={t('พิมพ์')} title={t('พิมพ์')} onClick={() => printSubmission(submission, 'print')}><Printer size={15} /></Button><Button iconOnly type="button" size="sm" variant="outline" onClick={() => setEditing(submission)}><Pencil size={14} />{t('แก้ไขผู้ส่ง')}</Button><Button iconOnly type="button" size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(submission)}><Trash2 size={14} />{t('ลบ')}</Button></div></div>)}</div>
        <DataTablePagination total={filtered.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div>{loading ? <LoaderCircle size={20} className="mx-auto animate-spin text-muted-foreground" /> : <p className="font-medium">{submissions.length ? t('ไม่พบผลลัพธ์ที่ตรงกับคำค้น') : t('ยังไม่มีผู้ส่งแบบประเมิน')}</p>}<p className="mt-1 text-sm text-muted-foreground">{t('เมื่อมีผู้ส่งคำตอบ รายงานจะแสดงข้อมูลที่นี่')}</p></div></CardContent>}
    </Card>
    {detail && <SubmissionDetailDialog submission={detail} open onOpenChange={(open) => !open && setDetail(null)} />}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t('แก้ไขข้อมูลผู้ส่ง')}</DialogTitle><DialogDescription>{editing?.assessmentTitle} · {t('คำตอบและคะแนนจะคงเดิม')}</DialogDescription></DialogHeader><form onSubmit={(event) => void saveEmployee(event)} className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm"><span>{t('รหัสพนักงาน')}</span><Input name="employeeCode" defaultValue={editing?.employeeCode || ''} required /></label><label className="block space-y-1 text-sm"><span>{t('ชื่อพนักงาน')}</span><Input name="employeeName" defaultValue={editing?.employeeName || ''} required /></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>{t('ยกเลิก')}</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div></form></DialogContent></Dialog>
    <ConfirmActionDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('ลบผลการประเมินนี้หรือไม่')} description={t('การลบจะนำคำตอบและคะแนนรายการนี้ออกจากรายงานอย่างถาวร')} confirmLabel={t('ลบรายการ')} cancelLabel={t('ยกเลิก')} pending={deleting} onConfirm={() => void deleteSubmission()} />
  </div>
}

function SubmissionDetailDialog({ submission, open, onOpenChange }: { submission: AssessmentReportSubmission; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language, t } = useI18n()
  const print = (mode: 'pdf' | 'print') => {
    const title = `${mode === 'pdf' ? 'assessment-report' : 'assessment-print'}-${submission.employeeCode}-${submission.id}`
    const popup = openPrintWindow(title, assessmentPrintMarkup(submission, language, formatDateTime, t))
    if (!popup) toast.error(t('เบราว์เซอร์บล็อกหน้าต่าง PDF โปรดอนุญาตป๊อปอัปแล้วลองอีกครั้ง'))
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t('คำตอบแบบประเมิน')}</DialogTitle><DialogDescription>{submission.assessmentTitle} · {submission.employeeName} · {submission.employeeCode} · {formatDateTime(submission.submittedAt, language, false)}</DialogDescription></DialogHeader>
    <div className="flex items-center justify-between rounded-xl bg-surface-subtle p-4"><span className="font-medium">{t('คะแนน')}</span><Badge variant="outline" className="border-primary/20 bg-white text-primary">{submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : t('ไม่มีคะแนนอัตโนมัติ')}</Badge></div>
    <div className="space-y-3">{submission.answers.map((answer, index) => <article key={answer.questionId} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{index + 1}. {answer.prompt}</h3>{answer.isScored && <Badge variant="outline" className={answer.isCorrect ? 'border-success/25 bg-success/10 text-success' : 'border-destructive/25 bg-destructive/10 text-destructive'}>{t(answer.isCorrect ? 'ถูกต้อง' : 'ไม่ถูกต้อง')}</Badge>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{answer.answer || '—'}</p></article>)}</div>
    <div className="flex flex-wrap justify-end gap-2"><Button iconOnly variant="outline" onClick={() => print('pdf')}><FileDown size={15} />PDF</Button><Button iconOnly variant="outline" onClick={() => print('print')}><Printer size={15} />{t('พิมพ์')}</Button><Button variant="outline" onClick={() => onOpenChange(false)}>{t('ปิด')}</Button></div>
  </DialogContent></Dialog>
}
