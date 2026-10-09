import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck, LoaderCircle, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { AssessmentQuestionPublic, PublicEmployeeSuggestion } from '@/lib/types'
import { LanguageSwitch } from '@/components/language-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

type PublicAssessment = { title: string; description: string; instructions: string; allowMultipleAttempts: boolean; questions: AssessmentQuestionPublic[] }

export function PublicAssessmentPage({ token }: { token: string }) {
  const { language, t } = useI18n()
  const [assessment, setAssessment] = useState<PublicAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [suggestions, setSuggestions] = useState<PublicEmployeeSuggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; maxScore: number } | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [highlightedQuestionId, setHighlightedQuestionId] = useState('')

  useEffect(() => {
    let current = true
    api.publicAssessment(token).then(({ assessment: row }) => { if (current) setAssessment(row) })
      .catch((error) => { if (current) setLoadError(error instanceof Error ? error.message : 'ไม่พบแบบประเมินหรือปิดรับคำตอบแล้ว') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token])

  useEffect(() => {
    const query = searchTerm.trim()
    if (query.length < 2) { setSuggestions([]); setSuggesting(false); return }
    let current = true
    const timer = window.setTimeout(() => {
      setSuggesting(true)
      api.publicEmployeeSuggestions(query, language).then(({ employees }) => { if (current) setSuggestions(employees) })
        .catch(() => { if (current) setSuggestions([]) })
        .finally(() => { if (current) setSuggesting(false) })
    }, 220)
    return () => { current = false; window.clearTimeout(timer) }
  }, [searchTerm, language])

  function chooseEmployee(employee: PublicEmployeeSuggestion) {
    setEmployeeName(employee.name)
    setEmployeeCode(employee.employeeCode)
    setSelectedEmployeeCode(employee.employeeCode)
    setSearchTerm('')
    setSuggestions([])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assessment || submitting) return
    setAttempted(true)
    if (!employeeName.trim() || !employeeCode.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase()) {
      document.getElementById('participant-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error(t('กรุณาเลือกชื่อและรหัสพนักงานจากรายการทะเบียน'))
      return
    }
    const missing = assessment.questions.find((question) => question.required && !answers[question.id]?.trim())
    if (missing) {
      setHighlightedQuestionId(missing.id)
      window.requestAnimationFrame(() => document.querySelector(`[data-question-id="${CSS.escape(missing.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      toast.error(t('กรุณาตอบคำถามให้ครบทุกข้อ'))
      return
    }
    setHighlightedQuestionId('')
    setSubmitting(true)
    try {
      const response = await api.submitAssessment(token, { employeeName: employeeName.trim(), employeeCode: employeeCode.trim(), answers })
      setResult({ score: response.score, maxScore: response.maxScore })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'ส่งคำตอบไม่สำเร็จ'))
    } finally { setSubmitting(false) }
  }

  return <PublicPageFrame>
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Card className="overflow-hidden rounded-2xl border-[#e5eceb] shadow-sm">
        <CardHeader className="bg-white p-5 sm:p-7">
          <div className="mb-2 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#eaf4f1] text-primary"><ClipboardCheck size={22} /></div><Badge variant="outline" className="border-primary/20 bg-white text-primary">{t('แบบประเมิน')}</Badge></div>
          <CardTitle className="text-2xl leading-tight sm:text-3xl">{assessment?.title || (loading ? t('กำลังโหลดข้อมูล…') : t('ไม่พบแบบประเมิน'))}</CardTitle>
          {assessment?.description && <CardDescription className="text-base">{assessment.description}</CardDescription>}
        </CardHeader>
        {loading ? <CardContent className="flex items-center gap-2 border-t p-6 text-muted-foreground"><LoaderCircle size={18} className="animate-spin" />{t('กำลังโหลดข้อมูล…')}</CardContent>
          : loadError ? <CardContent className="flex items-start gap-3 border-t p-5 text-destructive"><AlertCircle className="mt-0.5 shrink-0" size={19} /><p>{t(loadError)}</p></CardContent>
            : result ? <CardContent className="border-t p-5 sm:p-7"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center"><CheckCircle2 className="mx-auto size-10 text-emerald-600" /><h2 className="mt-3 text-xl font-semibold text-emerald-900">{t('ส่งคำตอบเรียบร้อยแล้ว')}</h2><p className="mt-1 text-muted-foreground">{t('ขอบคุณที่ทำแบบประเมิน')}</p>{result.maxScore > 0 && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold text-primary">{t('คะแนน')}: {result.score} / {result.maxScore}</div>}</div></CardContent>
              : assessment && <form noValidate onSubmit={submit} className="space-y-5 border-t p-4 sm:p-7">
                {assessment.instructions && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="font-semibold text-sky-900">{t('คำแนะนำ')}</p><p className="mt-1 whitespace-pre-wrap text-sm text-sky-900/80">{assessment.instructions}</p></div>}
                <section id="participant-details" className="space-y-4 rounded-xl border p-4 sm:p-5">
                  <div className="flex items-center gap-2 font-semibold"><UserRound size={18} className="text-primary" />{t('ข้อมูลผู้ทำแบบประเมิน')}</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="relative grid gap-1.5"><Label htmlFor="assessment-employee-name">{t('ชื่อพนักงาน')} *</Label><Input id="assessment-employee-name" aria-invalid={attempted && (!employeeName.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} value={employeeName} autoComplete="off" onChange={(event) => { setEmployeeName(event.target.value); setSelectedEmployeeCode(''); setSearchTerm(event.target.value) }} placeholder={t('พิมพ์ชื่อเพื่อค้นหา')} maxLength={160} className="h-12" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="assessment-employee-code">{t('รหัสพนักงาน')} *</Label><Input id="assessment-employee-code" aria-invalid={attempted && (!employeeCode.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} value={employeeCode} autoComplete="off" onChange={(event) => { setEmployeeCode(event.target.value); setSelectedEmployeeCode(''); setSearchTerm(event.target.value) }} placeholder={t('พิมพ์รหัสเพื่อค้นหา')} maxLength={80} className="h-12 uppercase" /></div>
                  </div>
                  {(suggestions.length > 0 || suggesting) && <div className="max-h-56 overflow-y-auto rounded-xl border bg-white shadow-sm" role="listbox" aria-label={t('รายชื่อพนักงาน')}>
                    {suggesting && <div className="p-3 text-sm text-muted-foreground">{t('กำลังค้นหา…')}</div>}
                    {suggestions.map((employee) => <button key={employee.employeeCode} type="button" role="option" aria-selected="false" onClick={() => chooseEmployee(employee)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-[#f2f7f6]"><span className="font-medium">{employee.name}</span><span className="shrink-0 text-sm text-muted-foreground">{employee.employeeCode}</span></button>)}
                  </div>}
                  <p className="text-sm text-muted-foreground">{t('เลือกชื่อหรือรหัสจากรายการ ระบบจะเติมอีกช่องให้อัตโนมัติ')}</p>
                </section>
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">{t('ข้อคำถาม')} <span className="text-sm font-normal text-muted-foreground">({assessment.questions.length})</span></h2>
                  {assessment.questions.map((question, index) => <article key={question.id} data-question-id={question.id} className={`space-y-4 rounded-xl border bg-white p-4 transition-colors sm:p-5 ${highlightedQuestionId === question.id ? 'border-red-400 bg-red-50/60 ring-2 ring-red-200' : ''}`}>
                    <div className="flex items-start gap-3"><Badge variant="outline" className="mt-0.5 shrink-0">{index + 1}</Badge><h3 className="font-semibold leading-relaxed">{question.prompt}{question.required && <span className="ml-1 text-red-600">*</span>}</h3></div>
                    {question.type === 'choice' ? <div className="space-y-2 pl-1 sm:pl-10">{question.options.map((option) => <label key={option} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:border-primary/50 hover:bg-[#f8fbfa]"><input type="radio" name={`question-${question.id}`} value={option} checked={answers[question.id] === option} onChange={() => { setAnswers((current) => ({ ...current, [question.id]: option })); if (highlightedQuestionId === question.id) setHighlightedQuestionId('') }} className="size-4 accent-[#146b60]" /><span>{option}</span></label>)}</div>
                      : <Textarea value={answers[question.id] || ''} onChange={(event) => { setAnswers((current) => ({ ...current, [question.id]: event.target.value })); if (highlightedQuestionId === question.id && event.target.value.trim()) setHighlightedQuestionId('') }} rows={3} maxLength={5000} placeholder={t('พิมพ์คำตอบ')} />}
                  </article>)}
                </section>
                <div className="flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{t('ตรวจสอบข้อมูลก่อนส่งคำตอบ')}</p><Button type="submit" disabled={submitting} className="h-12 w-full gap-2 sm:w-auto">{submitting && <LoaderCircle size={17} className="animate-spin" />}{t('ส่งคำตอบ')}</Button></div>
              </form>}
      </Card>
      <p className="text-center text-sm text-muted-foreground">Y.T. RUBBER · {t('แบบประเมินออนไลน์')}</p>
    </div>
  </PublicPageFrame>
}

function PublicPageFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return <div className="min-h-dvh bg-[#f3f7f7] text-foreground"><header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-lg bg-[#e5f2ef] text-primary"><ClipboardCheck size={18} /></div><div><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="text-xs text-muted-foreground">{t('ระบบความปลอดภัยประจำวัน')}</p></div></div><LanguageSwitch /></div></header><main className="mx-auto flex max-w-5xl justify-center px-3 py-5 sm:px-6 sm:py-8">{children}</main></div>
}
