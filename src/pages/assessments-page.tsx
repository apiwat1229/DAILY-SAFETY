import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ClipboardList, FileQuestion, LoaderCircle, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Assessment, AssessmentQuestion } from '@/lib/types'
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

type QuestionDraft = { key: string; id?: string; prompt: string; type: 'choice' | 'text'; optionsText: string; correctOption: string; required: boolean }
type AssessmentDraft = { title: string; description: string; instructions: string; allowMultipleAttempts: boolean; questions: QuestionDraft[] }

function emptyQuestion(): QuestionDraft { return { key: crypto.randomUUID(), prompt: '', type: 'choice', optionsText: '', correctOption: '', required: true } }

function toQuestionDraft(question: AssessmentQuestion): QuestionDraft {
  return { key: question.id, id: question.id, prompt: question.prompt, type: question.type, optionsText: question.options.join('\n'), correctOption: question.correctOption === null ? '' : String(question.correctOption), required: question.required }
}

export function AssessmentsPage() {
  const { t } = useI18n()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ assessment: Assessment | null; key: string } | null>(null)
  const [share, setShare] = useState<Assessment | null>(null)
  const [busyId, setBusyId] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    api.assessments().then(({ assessments: rows }) => setAssessments(rows)).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดแบบประเมินไม่สำเร็จ'))).finally(() => setLoading(false))
  }, [t])
  useEffect(refresh, [refresh])

  async function togglePublished(assessment: Assessment) {
    setBusyId(assessment.id)
    try {
      const { assessment: updated } = await api.updateAssessment(assessment.id, {
        title: assessment.title, description: assessment.description, instructions: assessment.instructions,
        isPublished: !assessment.isPublished, allowMultipleAttempts: assessment.allowMultipleAttempts,
        questions: assessment.questions,
      })
      toast.success(t(updated.isPublished ? 'เผยแพร่แบบประเมินแล้ว' : 'ปิดรับคำตอบแล้ว'))
      refresh()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusyId('') }
  }

  async function remove(assessment: Assessment) {
    if (!window.confirm(`${t('ลบแบบประเมิน')} “${assessment.title}”? ${t('ผลคำตอบของแบบประเมินนี้จะถูกลบด้วย')}`)) return
    try { await api.deleteAssessment(assessment.id); toast.success(t('ลบแบบประเมินแล้ว')); refresh() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบแบบประเมินไม่สำเร็จ')) }
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">{t('การประเมิน')}</p><h2 className="mt-1 font-semibold tracking-tight">{t('จัดการแบบประเมิน')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('สร้างข้อสอบ จัดการคำถาม และแชร์ลิงก์หรือ QR Code ให้พนักงาน')}</p></div><Button onClick={() => setEditor({ assessment: null, key: 'new' })} className="h-11 w-full gap-2 sm:w-auto"><Plus size={17} /> {t('สร้างแบบประเมิน')}</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label={t('แบบประเมินทั้งหมด')} count={assessments.length} icon={ClipboardList} /><Metric label={t('เผยแพร่แล้ว')} count={assessments.filter((assessment) => assessment.isPublished).length} icon={QrCode} /><Metric label={t('คำตอบที่ได้รับ')} count={assessments.reduce((total, assessment) => total + assessment.submissionCount, 0)} icon={FileQuestion} /></div>
    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]"><CardHeader className="border-b border-[#edf0f0] px-5 py-4"><CardTitle>{t('แบบประเมินขององค์กร')}</CardTitle><CardDescription>{t('บันทึกแบบร่างก่อน แล้วเผยแพร่เมื่อตรวจสอบข้อสอบเรียบร้อย')}</CardDescription></CardHeader>
      {assessments.length ? <div className="divide-y">{assessments.map((assessment) => <article key={assessment.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{assessment.title}</h3><Badge variant="outline" className={assessment.isPublished ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{t(assessment.isPublished ? 'เผยแพร่' : 'แบบร่าง')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{assessment.description || t('ไม่มีคำอธิบาย')} · {assessment.questionCount} {t('ข้อ')} · {assessment.submissionCount} {t('คำตอบ')}</p><p className="mt-1 text-xs text-muted-foreground">{t(assessment.allowMultipleAttempts ? 'อนุญาตให้ทำซ้ำ' : 'ตอบได้ครั้งเดียวต่อรหัสพนักงาน')}</p></div>
        <div className="flex flex-wrap gap-2 sm:justify-end"><Button variant="outline" onClick={() => setEditor({ assessment, key: assessment.id })} className="h-10 gap-1.5"><Pencil size={15} /> {t('แก้ไข')}</Button><Button variant="outline" disabled={busyId === assessment.id || assessment.questionCount === 0 && !assessment.isPublished} onClick={() => togglePublished(assessment)} className="h-10">{busyId === assessment.id ? <LoaderCircle size={16} className="animate-spin" /> : t(assessment.isPublished ? 'ปิดรับ' : 'เผยแพร่')}</Button>{assessment.isPublished && <Button variant="outline" onClick={() => setShare(assessment)} className="h-10 gap-1.5"><QrCode size={15} /> {t('ลิงก์ / QR')}</Button>}<Button variant="outline" onClick={() => remove(assessment)} className="h-10 px-3 text-destructive hover:text-destructive" aria-label={t('ลบแบบประเมิน')}><Trash2 size={16} /></Button></div>
      </article>)}</div> : <CardContent className="grid min-h-48 place-items-center text-center"><div><p className="font-medium">{loading ? t('กำลังโหลดแบบประเมิน…') : t('ยังไม่มีแบบประเมิน')}</p><p className="mt-1 text-sm text-muted-foreground">{t('สร้างแบบประเมินแรกเพื่อเริ่มเก็บคำตอบ')}</p></div></CardContent>}
    </Card>
    <AssessmentEditorDialog key={editor?.key || 'closed'} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh() }} />
    {share && <ShareLinkDialog kind="assessment" token={share.token} title={share.title} open onOpenChange={(open) => !open && setShare(null)} />}
  </div>
}

function Metric({ label, count, icon: Icon }: { label: string; count: number; icon: typeof ClipboardList }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count.toLocaleString()}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Icon size={19} /></div></CardContent></Card>
}

function AssessmentEditorDialog({ editor, onClose, onSaved }: { editor: { assessment: Assessment | null } | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const assessment = editor?.assessment
  const [draft, setDraft] = useState<AssessmentDraft>({ title: '', description: '', instructions: '', allowMultipleAttempts: false, questions: [] })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!editor) return
    setDraft(assessment ? {
      title: assessment.title, description: assessment.description, instructions: assessment.instructions,
      allowMultipleAttempts: assessment.allowMultipleAttempts, questions: assessment.questions.map(toQuestionDraft),
    } : { title: '', description: '', instructions: '', allowMultipleAttempts: false, questions: [] })
  }, [editor, assessment])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.title.trim()) return toast.error(t('กรอกชื่อแบบประเมิน'))
    if (draft.questions.some((question) => !question.prompt.trim())) return toast.error(t('กรอกคำถามให้ครบทุกข้อ'))
    const questions = draft.questions.map((question) => {
      const options = question.type === 'choice' ? [...new Set(question.optionsText.split('\n').map((option) => option.trim()).filter(Boolean))] : []
      return { id: question.id || '', prompt: question.prompt.trim(), type: question.type, options, correctOption: question.type === 'choice' && question.correctOption !== '' ? Number(question.correctOption) : null, required: question.required }
    })
    if (questions.some((question) => question.type === 'choice' && question.options.length < 2)) return toast.error(t('คำถามแบบตัวเลือกต้องมีอย่างน้อย 2 ตัวเลือก'))
    setBusy(true)
    try {
      if (assessment) {
        await api.updateAssessment(assessment.id, { ...draft, questions: questions as AssessmentQuestion[], isPublished: assessment.isPublished })
        toast.success(t('บันทึกแบบประเมินแล้ว'))
      } else {
        await api.createAssessment({ ...draft, questions: questions.map(({ id: _id, ...question }) => question) })
        toast.success(t('สร้างแบบประเมินแล้ว'))
      }
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  function updateQuestion(key: string, changes: Partial<QuestionDraft>) {
    setDraft((current) => ({ ...current, questions: current.questions.map((question) => question.key === key ? { ...question, ...changes } : question) }))
  }

  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><ClipboardList size={19} /></div><DialogTitle>{t(assessment ? 'แก้ไขแบบประเมิน' : 'สร้างแบบประเมิน')}</DialogTitle><DialogDescription>{t('เพิ่มคำถามแบบตัวเลือกหรือคำตอบสั้น กำหนดเฉลยเพื่อสรุปคะแนนอัตโนมัติ')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4"><div className="grid gap-1.5"><Label htmlFor="assessment-title">{t('ชื่อแบบประเมิน')} *</Label><Input id="assessment-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={200} required placeholder={t('เช่น แบบประเมินหลังอบรมความปลอดภัย')} /></div><div className="grid gap-1.5"><Label htmlFor="assessment-description">{t('คำอธิบาย')}</Label><Textarea id="assessment-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={2} maxLength={2000} /></div><div className="grid gap-1.5"><Label htmlFor="assessment-instructions">{t('คำแนะนำก่อนเริ่มทำ')}</Label><Textarea id="assessment-instructions" value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} rows={2} maxLength={4000} /></div><label className="flex items-start gap-3 rounded-xl border p-3"><Checkbox checked={draft.allowMultipleAttempts} onCheckedChange={(checked) => setDraft((current) => ({ ...current, allowMultipleAttempts: checked === true }))} /><span><span className="block font-medium">{t('อนุญาตให้ทำซ้ำ')}</span><span className="mt-0.5 block text-sm text-muted-foreground">{t('หากไม่เลือก พนักงานหนึ่งรหัสจะส่งคำตอบได้ครั้งเดียว')}</span></span></label></div>
      <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{t('ข้อคำถาม')} ({draft.questions.length})</h3><p className="mt-1 text-sm text-muted-foreground">{t('คะแนนคำนวณจากคำถามแบบตัวเลือกที่กำหนดเฉลย')}</p></div><Button type="button" variant="outline" onClick={() => setDraft((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }))} className="gap-1.5"><Plus size={15} /> {t('เพิ่มคำถาม')}</Button></div>
        {draft.questions.length ? draft.questions.map((question, index) => {
          const options = question.optionsText.split('\n').map((option) => option.trim()).filter(Boolean)
          return <section key={question.key} className="space-y-3 rounded-xl border bg-[#fbfcfc] p-4"><div className="flex items-center justify-between gap-2"><Badge variant="outline">{t('ข้อ')} {index + 1}</Badge><Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, questions: current.questions.filter((item) => item.key !== question.key) }))} className="text-destructive hover:text-destructive"><Trash2 size={15} /> {t('ลบคำถาม')}</Button></div><div className="grid gap-3 sm:grid-cols-[1fr_190px]"><div className="grid gap-1.5"><Label>{t('คำถาม')} *</Label><Textarea value={question.prompt} onChange={(event) => updateQuestion(question.key, { prompt: event.target.value })} rows={2} maxLength={1000} required /></div><div className="grid gap-1.5"><Label>{t('ประเภทคำถาม')}</Label><select value={question.type} onChange={(event) => updateQuestion(question.key, { type: event.target.value as 'choice' | 'text', correctOption: '' })} className="h-11 rounded-lg border border-input bg-background px-3 text-sm"><option value="choice">{t('ตัวเลือก')}</option><option value="text">{t('คำตอบสั้น')}</option></select></div></div>
            {question.type === 'choice' && <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label>{t('ตัวเลือก (หนึ่งบรรทัดต่อข้อ)')}</Label><Textarea value={question.optionsText} onChange={(event) => updateQuestion(question.key, { optionsText: event.target.value, correctOption: '' })} rows={4} placeholder={`${t('ตัวเลือก')} 1\n${t('ตัวเลือก')} 2\n${t('ตัวเลือก')} 3`} /></div><div className="grid content-start gap-1.5"><Label>{t('เฉลยสำหรับให้คะแนน')}</Label><select value={question.correctOption === '' ? 'none' : question.correctOption} onChange={(event) => updateQuestion(question.key, { correctOption: event.target.value === 'none' ? '' : event.target.value })} className="h-11 rounded-lg border border-input bg-background px-3 text-sm"><option value="none">{t('ไม่กำหนดเฉลย')}</option>{options.map((option, optionIndex) => <option key={`${optionIndex}-${option}`} value={optionIndex}>{option}</option>)}</select><p className="text-sm text-muted-foreground">{t('คำถามที่ไม่กำหนดเฉลยจะไม่ถูกนำไปรวมคะแนน')}</p></div></div>}
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={question.required} onCheckedChange={(checked) => updateQuestion(question.key, { required: checked === true })} />{t('ต้องตอบคำถามนี้')}</label>
          </section>
        }) : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('เพิ่มคำถามอย่างน้อย 1 ข้อก่อนเผยแพร่')}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึกแบบประเมิน')}</Button></div>
    </form>
  </DialogContent></Dialog>
}
