import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, LoaderCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, assessmentExportUrl, formatDateTime } from '@/lib/api'
import type { Assessment, AssessmentSubmission } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'

export function AssessmentReportsPage() {
  const { language, t } = useI18n()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<AssessmentSubmission | null>(null)

  useEffect(() => { api.assessments().then(({ assessments: rows }) => { setAssessments(rows); setSelectedId((current) => current || rows[0]?.id || '') }).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ'))) }, [t])
  useEffect(() => {
    if (!selectedId) { setSubmissions([]); setLoading(false); return }
    setLoading(true)
    api.assessmentSubmissions(selectedId).then(({ submissions: rows }) => setSubmissions(rows)).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ'))).finally(() => setLoading(false))
  }, [selectedId, t])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return submissions.filter((submission) => !term || submission.employeeName.toLocaleLowerCase().includes(term) || submission.employeeCode.toLocaleLowerCase().includes(term))
  }, [query, submissions])
  const scored = submissions.filter((submission) => submission.maxScore > 0)
  const average = scored.length ? Math.round(scored.reduce((sum, submission) => sum + submission.score / submission.maxScore, 0) / scored.length * 100) : 0
  const selectedAssessment = assessments.find((assessment) => assessment.id === selectedId)

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">{t('ผลการประเมิน')}</p><h2 className="mt-1 font-semibold tracking-tight">{t('รายงานแบบประเมิน')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('ค้นหาผู้ทำแบบประเมิน ตรวจคำตอบ และส่งออก Excel')}</p></div><Button asChild variant="outline" disabled={!selectedId} className="h-11 w-full gap-2 sm:w-auto"><a href={selectedId ? assessmentExportUrl(selectedId) : undefined}><FileSpreadsheet size={16} /> {t('ส่งออก Excel')}</a></Button></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(260px,1fr)_minmax(170px,240px)_minmax(170px,240px)]">
      <div className="grid gap-1.5"><Label>{t('เลือกแบบประเมิน')}</Label><Select value={selectedId || 'none'} onValueChange={(value) => setSelectedId(value === 'none' ? '' : value)}><SelectTrigger className="h-11 w-full"><SelectValue placeholder={t('เลือกแบบประเมิน')} /></SelectTrigger><SelectContent><SelectItem value="none">{t('เลือกแบบประเมิน')}</SelectItem>{assessments.map((assessment) => <SelectItem key={assessment.id} value={assessment.id}>{assessment.title}</SelectItem>)}</SelectContent></Select></div>
      <ReportMetric label={t('คำตอบทั้งหมด')} value={submissions.length.toLocaleString()} />
      <ReportMetric label={t('คะแนนเฉลี่ย')} value={scored.length ? `${average}%` : '—'} />
    </div>
    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]"><CardHeader className="flex flex-col gap-3 border-b border-[#edf0f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><CardTitle>{selectedAssessment?.title || t('ผลการส่งคำตอบ')}</CardTitle><CardDescription>{t('กดแถวเพื่อดูคำตอบรายข้อและคะแนน')}</CardDescription></div><div className="relative w-full sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-11 pl-9" /></div></CardHeader>
      {filtered.length ? <><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-[#fafcfc]"><TableHead className="pl-5">{t('วันที่ส่ง')}</TableHead><TableHead>{t('ชื่อพนักงาน')}</TableHead><TableHead>{t('รหัสพนักงาน')}</TableHead><TableHead>{t('คะแนน')}</TableHead><TableHead className="pr-5 text-right">{t('รายละเอียด')}</TableHead></TableRow></TableHeader><TableBody>{filtered.map((submission) => <TableRow key={submission.id} className="cursor-pointer" onClick={() => setDetail(submission)}><TableCell className="whitespace-nowrap pl-5">{formatDateTime(submission.submittedAt, language)}</TableCell><TableCell className="font-medium">{submission.employeeName}</TableCell><TableCell>{submission.employeeCode}</TableCell><TableCell>{submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : t('ไม่มีคะแนนอัตโนมัติ')}</TableCell><TableCell className="pr-5 text-right text-primary">{t('ดูคำตอบ')}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="divide-y md:hidden">{filtered.map((submission) => <button key={submission.id} type="button" onClick={() => setDetail(submission)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div className="min-w-0"><p className="truncate font-semibold">{submission.employeeName}</p><p className="mt-1 truncate text-sm text-muted-foreground">{submission.employeeCode} · {formatDateTime(submission.submittedAt, language)}</p></div><Badge variant="outline">{submission.maxScore > 0 ? `${submission.score}/${submission.maxScore}` : t('ดู')}</Badge></button>)}</div>
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div>{loading ? <LoaderCircle size={20} className="mx-auto animate-spin text-muted-foreground" /> : <p className="font-medium">{submissions.length ? t('ไม่พบผลลัพธ์ที่ตรงกับคำค้น') : t('ยังไม่มีผู้ส่งแบบประเมิน')}</p>}<p className="mt-1 text-sm text-muted-foreground">{t('เมื่อมีผู้ส่งคำตอบ รายงานจะแสดงข้อมูลที่นี่')}</p></div></CardContent>}
    </Card>
    {detail && <SubmissionDetailDialog submission={detail} open onOpenChange={(open) => !open && setDetail(null)} />}
  </div>
}

function ReportMetric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card> }

function SubmissionDetailDialog({ submission, open, onOpenChange }: { submission: AssessmentSubmission; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language, t } = useI18n()
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t('คำตอบแบบประเมิน')}</DialogTitle><DialogDescription>{submission.employeeName} · {submission.employeeCode} · {formatDateTime(submission.submittedAt, language)}</DialogDescription></DialogHeader>
    <div className="flex items-center justify-between rounded-xl bg-[#f5f8f8] p-4"><span className="font-medium">{t('คะแนน')}</span><Badge variant="outline" className="border-primary/20 bg-white text-primary">{submission.maxScore > 0 ? `${submission.score} / ${submission.maxScore}` : t('ไม่มีคะแนนอัตโนมัติ')}</Badge></div>
    <div className="space-y-3">{submission.answers.map((answer, index) => <article key={answer.questionId} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{index + 1}. {answer.prompt}</h3>{answer.isScored && <Badge variant="outline" className={answer.isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>{t(answer.isCorrect ? 'ถูกต้อง' : 'ไม่ถูกต้อง')}</Badge>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{answer.answer || '—'}</p></article>)}</div>
    <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>{t('ปิด')}</Button></div>
  </DialogContent></Dialog>
}
