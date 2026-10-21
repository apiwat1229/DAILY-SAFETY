import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, LoaderCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, assessmentReportExportUrl, formatDateTime } from '@/lib/api'
import type { AssessmentReportSubmission } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'

export function AssessmentReportsPage() {
  const { language, t } = useI18n()
  const [submissions, setSubmissions] = useState<AssessmentReportSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<AssessmentReportSubmission | null>(null)

  useEffect(() => { api.assessmentReportSubmissions().then(({ submissions: rows }) => setSubmissions(rows)).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ'))).finally(() => setLoading(false)) }, [t])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return submissions.filter((submission) => !term || submission.assessmentTitle.toLocaleLowerCase().includes(term) || submission.employeeName.toLocaleLowerCase().includes(term) || submission.employeeCode.toLocaleLowerCase().includes(term))
  }, [query, submissions])
  const pagination = useDataPagination(filtered)

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('ผลการประเมิน')}</p><h2 className="page-heading mt-1 font-semibold tracking-tight">{t('รายงานแบบประเมิน')}</h2></div>
      <Button asChild variant="outline" disabled={!submissions.length} className="h-11 w-full gap-2 whitespace-nowrap sm:w-auto"><a href={assessmentReportExportUrl()} download><FileSpreadsheet size={16} /> {t('ส่งออก Excel')}</a></Button>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border"><CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><CardTitle>{t('ผลการส่งคำตอบ')}</CardTitle><CardDescription>{t('กดแถวเพื่อดูคำตอบรายข้อและคะแนน')}</CardDescription></div><div className="relative w-full sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาแบบประเมินหรือพนักงาน')} className="h-11 pl-9" /></div></CardHeader>
      {filtered.length ? <><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-surface-subtle"><TableHead className="pl-5">{t('แบบประเมิน')}</TableHead><TableHead>{t('วันที่ส่ง')}</TableHead><TableHead>{t('ชื่อพนักงาน')}</TableHead><TableHead>{t('รหัสพนักงาน')}</TableHead><TableHead>{t('คะแนน')}</TableHead><TableHead className="pr-5 text-right">{t('รายละเอียด')}</TableHead></TableRow></TableHeader><TableBody>{pagination.visibleItems.map((submission) => <TableRow key={submission.id} className="cursor-pointer" onClick={() => setDetail(submission)}><TableCell className="max-w-64 truncate pl-5 font-medium">{submission.assessmentTitle}</TableCell><TableCell className="whitespace-nowrap">{formatDateTime(submission.submittedAt, language, false)}</TableCell><TableCell>{submission.employeeName}</TableCell><TableCell>{submission.employeeCode}</TableCell><TableCell>{submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : t('ไม่มีคะแนนอัตโนมัติ')}</TableCell><TableCell className="pr-5 text-right text-primary">{t('ดูคำตอบ')}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="divide-y md:hidden">{pagination.visibleItems.map((submission) => <button key={submission.id} type="button" onClick={() => setDetail(submission)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div className="min-w-0"><p className="truncate font-semibold">{submission.employeeName}</p><p className="mt-1 truncate text-sm text-muted-foreground">{submission.assessmentTitle} · {submission.employeeCode}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatDateTime(submission.submittedAt, language, false)}</p></div><Badge variant="outline">{submission.maxScore > 0 ? `${submission.score}/${submission.maxScore}` : t('ดู')}</Badge></button>)}</div>
        <DataTablePagination total={filtered.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div>{loading ? <LoaderCircle size={20} className="mx-auto animate-spin text-muted-foreground" /> : <p className="font-medium">{submissions.length ? t('ไม่พบผลลัพธ์ที่ตรงกับคำค้น') : t('ยังไม่มีผู้ส่งแบบประเมิน')}</p>}<p className="mt-1 text-sm text-muted-foreground">{t('เมื่อมีผู้ส่งคำตอบ รายงานจะแสดงข้อมูลที่นี่')}</p></div></CardContent>}
    </Card>
    {detail && <SubmissionDetailDialog submission={detail} open onOpenChange={(open) => !open && setDetail(null)} />}
  </div>
}

function SubmissionDetailDialog({ submission, open, onOpenChange }: { submission: AssessmentReportSubmission; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language, t } = useI18n()
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t('คำตอบแบบประเมิน')}</DialogTitle><DialogDescription>{submission.assessmentTitle} · {submission.employeeName} · {submission.employeeCode} · {formatDateTime(submission.submittedAt, language, false)}</DialogDescription></DialogHeader>
    <div className="flex items-center justify-between rounded-xl bg-surface-subtle p-4"><span className="font-medium">{t('คะแนน')}</span><Badge variant="outline" className="border-primary/20 bg-white text-primary">{submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : t('ไม่มีคะแนนอัตโนมัติ')}</Badge></div>
    <div className="space-y-3">{submission.answers.map((answer, index) => <article key={answer.questionId} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{index + 1}. {answer.prompt}</h3>{answer.isScored && <Badge variant="outline" className={answer.isCorrect ? 'border-success/25 bg-success/10 text-success' : 'border-destructive/25 bg-destructive/10 text-destructive'}>{t(answer.isCorrect ? 'ถูกต้อง' : 'ไม่ถูกต้อง')}</Badge>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{answer.answer || '—'}</p></article>)}</div>
    <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>{t('ปิด')}</Button></div>
  </DialogContent></Dialog>
}
