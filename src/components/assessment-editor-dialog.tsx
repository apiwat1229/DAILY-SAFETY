import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, CircleCheck, ClipboardList, Copy, ListChecks, LoaderCircle, Plus, TextCursorInput, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Assessment, AssessmentQuestion } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { useConfirm } from '@/components/confirm-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type Question = { key: string; id?: string; prompt: string; type: 'choice' | 'text'; options: string[]; correct: number | null; required: boolean }
type Draft = { title: string; description: string; instructions: string; allowMultipleAttempts: boolean; questions: Question[] }

const blankDraft = (): Draft => ({ title: '', description: '', instructions: '', allowMultipleAttempts: false, questions: [] })
const newQuestion = (type: Question['type']): Question => ({ key: crypto.randomUUID(), prompt: '', type, options: type === 'choice' ? ['', ''] : [], correct: null, required: true })
const toQuestion = (question: AssessmentQuestion): Question => ({
  key: question.id, id: question.id, prompt: question.prompt, type: question.type,
  options: question.options.length ? [...question.options] : question.type === 'choice' ? ['', ''] : [],
  correct: question.correctOption, required: question.required,
})

type Props = { editor: { assessment: Assessment | null } | null; onClose: () => void; onSaved: () => void }

/** Assessment builder: collapsible question cards, one input per option, and a radio to mark the correct answer. */
export function AssessmentEditorDialog({ editor, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const assessment = editor?.assessment
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editor) return
    setInvalid(new Set())
    setOpenKey(null)
    setDraft(assessment ? {
      title: assessment.title, description: assessment.description, instructions: assessment.instructions,
      allowMultipleAttempts: assessment.allowMultipleAttempts, questions: assessment.questions.map(toQuestion),
    } : blankDraft())
  }, [editor, assessment])

  const stats = useMemo(() => ({
    total: draft.questions.length,
    choice: draft.questions.filter((question) => question.type === 'choice').length,
    scored: draft.questions.filter((question) => question.type === 'choice' && question.correct !== null).length,
  }), [draft.questions])

  const update = (key: string, changes: Partial<Question>) => {
    setDraft((current) => ({ ...current, questions: current.questions.map((question) => question.key === key ? { ...question, ...changes } : question) }))
    setInvalid((current) => { if (!current.has(key)) return current; const next = new Set(current); next.delete(key); return next })
  }
  const add = (type: Question['type']) => {
    const question = newQuestion(type)
    setDraft((current) => ({ ...current, questions: [...current.questions, question] }))
    setOpenKey(question.key)
  }
  const remove = (key: string) => setDraft((current) => ({ ...current, questions: current.questions.filter((question) => question.key !== key) }))
  const move = (key: string, direction: -1 | 1) => setDraft((current) => {
    const index = current.questions.findIndex((question) => question.key === key)
    const target = index + direction
    if (index < 0 || target < 0 || target >= current.questions.length) return current
    const questions = [...current.questions]
    ;[questions[index], questions[target]] = [questions[target], questions[index]]
    return { ...current, questions }
  })
  const duplicate = (key: string) => setDraft((current) => {
    const index = current.questions.findIndex((question) => question.key === key)
    if (index < 0) return current
    const copy: Question = { ...current.questions[index], key: crypto.randomUUID(), id: undefined, options: [...current.questions[index].options] }
    const questions = [...current.questions]
    questions.splice(index + 1, 0, copy)
    setOpenKey(copy.key)
    return { ...current, questions }
  })

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.title.trim()) return toast.error(t('กรอกชื่อแบบประเมิน'))
    const problems = new Set<string>()
    const payload = draft.questions.map((question) => {
      const kept = question.options.map((text, index) => ({ text: text.trim(), index })).filter((option) => option.text)
      const texts = kept.map((option) => option.text)
      if (!question.prompt.trim()) problems.add(question.key)
      if (question.type === 'choice' && (kept.length < 2 || new Set(texts).size !== texts.length)) problems.add(question.key)
      const correct = question.type === 'choice' && question.correct !== null ? kept.findIndex((option) => option.index === question.correct) : -1
      return { id: question.id || '', prompt: question.prompt.trim(), type: question.type, options: question.type === 'choice' ? texts : [], correctOption: correct >= 0 ? correct : null, required: question.required }
    })
    if (problems.size) {
      setInvalid(problems)
      const first = draft.questions.find((question) => problems.has(question.key))
      if (first) setOpenKey(first.key)
      const firstProblem = draft.questions.find((question) => problems.has(question.key))
      const duplicateOptions = firstProblem?.type === 'choice' && firstProblem.prompt.trim() && new Set(firstProblem.options.map((option) => option.trim()).filter(Boolean)).size !== firstProblem.options.map((option) => option.trim()).filter(Boolean).length
      return toast.error(duplicateOptions ? t('ตัวเลือกในข้อเดียวกันต้องไม่ซ้ำกัน') : t('กรอกคำถามและตัวเลือกอย่างน้อย 2 ข้อให้ครบ ในข้อที่ไฮไลต์'))
    }
    setBusy(true)
    try {
      if (!(await confirm('update'))) return
      if (assessment) {
        await api.updateAssessment(assessment.id, { ...draft, questions: payload as AssessmentQuestion[], isPublished: assessment.isPublished })
        toast.success(t('บันทึกแบบประเมินแล้ว'))
      } else {
        await api.createAssessment({ ...draft, questions: payload.map(({ id: _id, ...question }) => question) })
        toast.success(t('สร้างแบบประเมินแล้ว'))
      }
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <div className="mb-1 grid size-10 place-items-center rounded-lg bg-secondary text-primary"><ClipboardList size={19} /></div>
        <DialogTitle>{t(assessment ? 'แก้ไขแบบประเมิน' : 'สร้างแบบประเมิน')}</DialogTitle>
        <DialogDescription>{t('เพิ่มคำถามแบบตัวเลือกหรือคำตอบสั้น กำหนดเฉลยเพื่อสรุปคะแนนอัตโนมัติ')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="grid gap-6">
        <section className="grid gap-4">
          <div className="grid gap-1.5"><Label htmlFor="assessment-title">{t('ชื่อแบบประเมิน')} *</Label><Input id="assessment-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={200} required placeholder={t('เช่น แบบประเมินหลังอบรมความปลอดภัย')} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="assessment-description">{t('คำอธิบาย')}</Label><Textarea id="assessment-description" rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={2000} /></div>
            <div className="grid gap-1.5"><Label htmlFor="assessment-instructions">{t('คำแนะนำก่อนเริ่มทำ')}</Label><Textarea id="assessment-instructions" rows={3} value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} maxLength={4000} /></div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-subtle p-3">
            <div className="min-w-0"><Label htmlFor="assessment-multiple" className="text-sm font-medium">{t('อนุญาตให้ทำซ้ำ')}</Label><p className="mt-0.5 text-sm text-muted-foreground">{t('หากไม่เลือก พนักงานหนึ่งรหัสจะส่งคำตอบได้ครั้งเดียว')}</p></div>
            <Switch id="assessment-multiple" checked={draft.allowMultipleAttempts} onCheckedChange={(checked) => setDraft((current) => ({ ...current, allowMultipleAttempts: checked }))} />
          </div>
        </section>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">{t('ข้อคำถาม')}</h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge variant="outline">{stats.total} {t('ข้อ')}</Badge>
                <Badge variant="outline">{stats.choice} {t('แบบตัวเลือก')}</Badge>
                <Badge variant="outline" className="border-success/25 bg-success/10 text-success">{stats.scored} {t('ข้อมีเฉลย')}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => add('choice')} className="gap-1.5"><Plus size={14} />{t('ข้อแบบตัวเลือก')}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => add('text')} className="gap-1.5"><Plus size={14} />{t('ข้อคำตอบสั้น')}</Button>
            </div>
          </div>

          {draft.questions.length === 0 && <div className="grid place-items-center gap-1 rounded-lg border border-dashed border-border bg-surface-subtle p-8 text-center text-sm text-muted-foreground"><ListChecks size={22} className="text-muted-foreground/70" />{t('เพิ่มคำถามอย่างน้อย 1 ข้อก่อนเผยแพร่')}</div>}

          <ol className="grid gap-2">
            {draft.questions.map((question, index) => {
              const open = openKey === question.key
              const hasError = invalid.has(question.key)
              const filled = question.options.filter((option) => option.trim()).length
              return <li key={question.key} className={`overflow-hidden rounded-lg border bg-card ${hasError ? 'border-destructive ring-2 ring-destructive/15' : open ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border'}`}>
                <div className="flex items-center gap-2 p-2.5">
                  <button type="button" onClick={() => setOpenKey(open ? null : question.key)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-primary">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-md text-sm font-semibold ${hasError ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-primary'}`}>{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${question.prompt.trim() ? '' : 'text-muted-foreground'}`}>{question.prompt.trim() || t('ยังไม่ได้กรอกคำถาม')}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {question.type === 'choice' ? <><span className="inline-flex items-center gap-1"><ListChecks size={12} />{t('ตัวเลือก')} {filled}</span><span className={question.correct === null ? '' : 'inline-flex items-center gap-1 text-success'}>{question.correct === null ? t('ไม่มีเฉลย') : <><CircleCheck size={12} />{t('เฉลยข้อ')} {question.correct + 1}</>}</span></> : <span className="inline-flex items-center gap-1"><TextCursorInput size={12} />{t('คำตอบสั้น')}</span>}
                        {!question.required && <span>{t('ไม่บังคับตอบ')}</span>}
                      </span>
                    </span>
                    <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div className="flex shrink-0 items-center">
                    <Button iconOnly type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(question.key, -1)}><ArrowUp size={15} />{t('เลื่อนขึ้น')}</Button>
                    <Button iconOnly type="button" variant="ghost" size="sm" disabled={index === draft.questions.length - 1} onClick={() => move(question.key, 1)}><ArrowDown size={15} />{t('เลื่อนลง')}</Button>
                    <Button iconOnly type="button" variant="ghost" size="sm" onClick={() => duplicate(question.key)}><Copy size={15} />{t('ทำสำเนาข้อนี้')}</Button>
                    <Button iconOnly type="button" variant="ghost" size="sm" onClick={() => remove(question.key)} className="text-destructive hover:text-destructive"><Trash2 size={15} />{t('ลบข้อนี้')}</Button>
                  </div>
                </div>

                {open && <div className="grid gap-4 border-t border-border-subtle bg-surface-subtle p-4">
                  <div className="grid gap-1.5"><Label htmlFor={`q-${question.key}`}>{t('คำถาม')} *</Label><Textarea id={`q-${question.key}`} rows={2} autoFocus={!question.prompt} value={question.prompt} onChange={(event) => update(question.key, { prompt: event.target.value })} maxLength={1000} placeholder={t('พิมพ์คำถาม')} className="bg-card" /></div>
                  <div className="grid gap-1.5"><Label>{t('ประเภทคำถาม')}</Label>
                    <Tabs value={question.type} onValueChange={(value) => update(question.key, { type: value as Question['type'], options: value === 'choice' && question.options.length < 2 ? ['', ''] : question.options })}>
                      <TabsList><TabsTrigger value="choice">{t('ตัวเลือก')}</TabsTrigger><TabsTrigger value="text">{t('คำตอบสั้น')}</TabsTrigger></TabsList>
                    </Tabs>
                  </div>

                  {question.type === 'choice' ? <div className="grid gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><Label>{t('ตัวเลือกคำตอบ')}</Label><p className="text-xs text-muted-foreground">{t('เลือกวงกลมหน้าข้อที่เป็นคำตอบที่ถูกต้อง ถ้าไม่เลือกจะไม่คิดคะแนนข้อนี้')}</p></div>
                    <RadioGroup value={question.correct === null ? '' : String(question.correct)} onValueChange={(value) => update(question.key, { correct: Number(value) })} className="gap-2">
                      {question.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2">
                        <RadioGroupItem value={String(optionIndex)} aria-label={`${t('ตั้งเป็นเฉลย')} ${optionIndex + 1}`} />
                        <Input value={option} onChange={(event) => update(question.key, { options: question.options.map((current, currentIndex) => currentIndex === optionIndex ? event.target.value : current) })} maxLength={300} placeholder={`${t('ตัวเลือก')} ${optionIndex + 1}`} className="bg-card" aria-label={`${t('ตัวเลือก')} ${optionIndex + 1}`} />
                        <Button iconOnly type="button" variant="ghost" size="sm" disabled={question.options.length <= 2} onClick={() => update(question.key, {
                          options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex),
                          correct: question.correct === null ? null : question.correct === optionIndex ? null : question.correct > optionIndex ? question.correct - 1 : question.correct,
                        })}><X size={15} />{t('ลบตัวเลือก')}</Button>
                      </div>)}
                    </RadioGroup>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={question.options.length >= 10} onClick={() => update(question.key, { options: [...question.options, ''] })} className="gap-1.5"><Plus size={14} />{t('เพิ่มตัวเลือก')}</Button>
                      {question.correct !== null && <Button type="button" variant="ghost" size="sm" onClick={() => update(question.key, { correct: null })}>{t('ล้างเฉลย')}</Button>}
                    </div>
                  </div> : <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">{t('ผู้ตอบพิมพ์คำตอบสั้นเอง ข้อนี้ไม่ถูกนำไปคิดคะแนน')}</p>}

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                    <Label htmlFor={`req-${question.key}`} className="text-sm">{t('ต้องตอบคำถามนี้')}</Label>
                    <Switch id={`req-${question.key}`} checked={question.required} onCheckedChange={(checked) => update(question.key, { required: checked })} />
                  </div>
                </div>}
              </li>
            })}
          </ol>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t('ยกเลิก')}</Button>
          <Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึกแบบประเมิน')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
