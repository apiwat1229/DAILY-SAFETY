import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, CircleHelp, ClipboardCheck, Images, ImagePlus, LoaderCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, localDateString, localTimeString } from '@/lib/api'
import type { Assignee, ChecklistItem, InspectionSuggestions, User } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { TimePicker } from '@/components/time-picker'
import { AutocompleteInput } from '@/components/autocomplete-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/i18n'

type Result = ChecklistItem['choices'][number] | ''
type DraftResponse = { result: Result; issueDetails: string; responsible: string; responsibleUserId: string; beforeFiles: File[] }
type Props = { user: User; onCreated: () => void }

const blankResponse = (): DraftResponse => ({ result: '', issueDetails: '', responsible: '', responsibleUserId: '', beforeFiles: [] })
const today = localDateString()
const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024
const COMPRESSED_IMAGE_TARGET_BYTES = 7.5 * 1024 * 1024

async function decodeImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap as CanvasImageSource, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() }
    } catch { /* Fall back to the browser's image element decoder. */ }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('ไม่สามารถเปิดรูปเพื่อบีบอัดได้ กรุณาเลือกรูป JPG หรือ PNG'))
      image.src = url
    })
    return { source: image as CanvasImageSource, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

async function compressLargeImage(file: File) {
  if (file.size <= MAX_IMAGE_UPLOAD_BYTES) return { file, compressed: false }

  const decoded = await decodeImage(file)
  try {
    let scale = Math.min(1, 2560 / Math.max(decoded.width, decoded.height))
    let quality = 0.86
    let compressed: Blob | null = null

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(decoded.width * scale))
      canvas.height = Math.max(1, Math.round(decoded.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('ไม่สามารถบีบอัดรูปภาพได้ กรุณาลองใหม่')
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
      compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      canvas.width = 0
      canvas.height = 0
      if (!compressed) throw new Error('ไม่สามารถบีบอัดรูปภาพได้ กรุณาลองใหม่')
      if (compressed.size <= COMPRESSED_IMAGE_TARGET_BYTES) break
      if (quality > 0.5) quality = Math.max(0.5, quality - 0.1)
      else { scale *= 0.78; quality = 0.82 }
    }

    if (!compressed || compressed.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error('รูปภาพยังมีขนาดเกิน 8 MB หลังบีบอัด กรุณาเลือกรูปอื่น')
    }
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return { file: new File([compressed], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified }), compressed: true }
  } finally {
    decoded.cleanup()
  }
}

export function InspectionFormPage({ user, onCreated }: Props) {
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(localTimeString())
  const [inspectorName, setInspectorName] = useState(user.name)
  const [employeeCode, setEmployeeCode] = useState(user.employeeCode)
  const [area, setArea] = useState('')
  const [shift, setShift] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [checklistLoading, setChecklistLoading] = useState(true)
  const [responses, setResponses] = useState<Record<string, DraftResponse>>({})
  const [suggestions, setSuggestions] = useState<InspectionSuggestions>({ areas: [], shifts: [], inspectors: [], employeeCodes: [], responsibles: [] })
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [busy, setBusy] = useState(false)
  const [invalidTarget, setInvalidTarget] = useState<string | null>(null)
  const { language, t } = useI18n()

  useEffect(() => {
    api.checklist().then(({ items }) => {
      setChecklist(items)
      setResponses(Object.fromEntries(items.map((item) => [item.key, blankResponse()])))
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'โหลดรายการตรวจไม่สำเร็จ'))
      .finally(() => setChecklistLoading(false))
  }, [])
  useEffect(() => { api.suggestions(language).then(setSuggestions).catch(() => undefined) }, [language])
  useEffect(() => { api.assignees().then(({ assignees: rows }) => setAssignees(rows)).catch((error) => toast.error(error.message)) }, [])

  const answered = useMemo(() => Object.values(responses).filter((response) => response.result).length, [responses])
  const ngCount = useMemo(() => Object.values(responses).filter((response) => response.result === 'NG').length, [responses])
  const progress = checklist.length ? Math.round((answered / checklist.length) * 100) : 0

  function moveToInvalid(targetId: string) {
    setInvalidTarget(targetId)
    window.setTimeout(() => {
      const target = document.getElementById(targetId)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const focusable = target.matches('input, textarea, button, [tabindex]')
        ? target
        : target.querySelector<HTMLElement>('input, textarea, button, [tabindex]')
      focusable?.focus({ preventScroll: true })
    }, 60)
  }

  function clearInvalidTarget(targetId: string) {
    setInvalidTarget((current) => current === targetId ? null : current)
  }

  function updateResponse(key: string, update: Partial<DraftResponse>) {
    setInvalidTarget((current) => current?.startsWith(`item-${key}-`) ? null : current)
    setResponses((current) => ({ ...current, [key]: { ...current[key], ...update } }))
  }

  function chooseResult(key: string, result: Result) {
    setInvalidTarget((current) => current?.startsWith(`item-${key}-`) ? null : current)
    const current = responses[key]
    updateResponse(key, result === 'NG'
      ? { result, issueDetails: current.result === 'NG' ? current.issueDetails : '', responsible: current.result === 'NG' ? current.responsible : '', responsibleUserId: current.result === 'NG' ? current.responsibleUserId : '', beforeFiles: current.result === 'NG' ? current.beforeFiles : [] }
      : { result, issueDetails: '', responsible: '', responsibleUserId: '', beforeFiles: [] })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!checklist.length) return toast.error(t('ยังไม่มีหัวข้อตรวจที่เปิดใช้งาน'))
    const missingField = [
      [date, 'inspection-date'], [time, 'inspection-time'], [inspectorName.trim(), 'inspector-name'], [area.trim(), 'area'], [shift.trim(), 'shift'],
    ].find(([value]) => !value)
    if (missingField) {
      moveToInvalid(missingField[1])
      return toast.error(t('กรุณาตรวจสอบข้อมูลที่ไฮไลต์'))
    }
    const unanswered = checklist.find(({ key }) => !responses[key]?.result)
    if (unanswered) {
      moveToInvalid(`item-${unanswered.key}-card`)
      return toast.error(`${t('กรุณาเลือกผลตรวจให้ครบ')} · ${t(unanswered.title)}`)
    }
    const invalidNg = checklist.find(({ key }) => responses[key].result === 'NG' && (!responses[key].issueDetails.trim() || !responses[key].responsibleUserId || responses[key].beforeFiles.length === 0))
    if (invalidNg) {
      const response = responses[invalidNg.key]
      const targetId = !response.issueDetails.trim()
        ? `item-${invalidNg.key}-details`
        : !response.responsibleUserId
          ? `item-${invalidNg.key}-responsible`
          : `item-${invalidNg.key}-photo`
      moveToInvalid(targetId)
      return toast.error(`${t('หัวข้อ')} ${t(invalidNg.title)} ${t('กรุณาตรวจสอบข้อมูลที่ไฮไลต์')}`)
    }

    const body = new FormData()
    body.set('payload', JSON.stringify({
      date, time, inspectorName: inspectorName.trim(), employeeCode: employeeCode.trim(), area: area.trim(), shift: shift.trim(),
      responses: checklist.map(({ key }) => ({ key, result: responses[key].result, issueDetails: responses[key].issueDetails, responsible: responses[key].responsible, responsibleUserId: responses[key].responsibleUserId })),
    }))
    const photoMetadata: { key: string; type: 'before' }[] = []
    for (const item of checklist) {
      for (const file of responses[item.key].beforeFiles) {
        body.append('photos', file)
        photoMetadata.push({ key: item.key, type: 'before' })
      }
    }
    body.set('photoMetadata', JSON.stringify(photoMetadata))
    setBusy(true)
    try {
      await api.createInspection(body)
      toast.success(t('บันทึกแบบตรวจเรียบร้อยแล้ว'))
      onCreated()
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'))
    } finally { setBusy(false) }
  }

  if (checklistLoading) return <div className="mx-auto max-w-[1100px] rounded-xl border bg-white p-6 text-base text-muted-foreground">{t('กำลังโหลดรายการตรวจ…')}</div>

  return <form noValidate onSubmit={submit} className="inspection-form mx-auto max-w-[1100px] space-y-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><h1 className="text-2xl font-semibold tracking-tight">{t('แบบตรวจความปลอดภัยประจำวัน')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('เลือกผลตรวจในแต่ละหัวข้อ หากพบ NG ให้บันทึกรายละเอียดและแนบรูป')}</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-[#e4ecea] bg-white px-3 py-2"><div className="grid size-8 place-items-center rounded-lg bg-[#eaf4f1] text-primary"><CheckCircle2 size={16} /></div><div className="w-[138px]"><div className="flex justify-between text-xs sm:text-[10px]"><span className="font-medium">{t('ความคืบหน้า')}</span><span className="text-muted-foreground">{answered}/{checklist.length}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#edf1f0]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div></div>
    </div>

    <Card className={`rounded-2xl border p-4 transition-shadow sm:p-5 ${invalidTarget && invalidTarget.startsWith('inspection-') || ['inspector-name', 'area', 'shift'].includes(invalidTarget || '') ? 'border-red-400 ring-2 ring-red-200' : 'border-[#e4ebea]'}`}>
      <div className="mb-4 flex items-center gap-2"><div className="grid size-7 place-items-center rounded-lg bg-[#edf5f3] text-primary"><ClipboardCheck size={14} /></div><div><p className="text-sm font-semibold sm:text-xs">{t('ข้อมูลการตรวจ')}</p><p className="text-xs text-muted-foreground sm:text-[10px]">{t('กรอกข้อมูลประจำวันและพื้นที่ตรวจ')}</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <FormField label={t('วันที่ตรวจ')} htmlFor="inspection-date"><DatePicker id="inspection-date" ariaLabel={t('วันที่ตรวจ')} value={date} maxDate={today} onChange={(value) => { setDate(value); clearInvalidTarget('inspection-date') }} className={`h-10 ${invalidTarget === 'inspection-date' ? 'border-red-500 ring-2 ring-red-200' : ''}`} /></FormField>
        <FormField label={t('เวลาตรวจ')} htmlFor="inspection-time"><TimePicker id="inspection-time" value={time} onChange={(value) => { setTime(value); clearInvalidTarget('inspection-time') }} className={`h-10 ${invalidTarget === 'inspection-time' ? 'border-red-500 ring-2 ring-red-200' : ''}`} /></FormField>
        <FormField label={t('ผู้ตรวจ')} htmlFor="inspector-name"><AutocompleteInput id="inspector-name" value={inspectorName} onValueChange={(value) => { setInspectorName(value); clearInvalidTarget('inspector-name') }} suggestions={suggestions.inspectors} required className={`h-10 ${invalidTarget === 'inspector-name' ? 'border-red-500 ring-2 ring-red-200' : ''}`} /></FormField>
        <FormField label={t('รหัสพนักงาน')} htmlFor="employee-code"><AutocompleteInput id="employee-code" value={employeeCode} onValueChange={setEmployeeCode} suggestions={suggestions.employeeCodes} className="h-10" /></FormField>
        <FormField label={t('แผนก / พื้นที่')} htmlFor="area"><AutocompleteInput id="area" value={area} onValueChange={(value) => { setArea(value); clearInvalidTarget('area') }} suggestions={suggestions.areas} placeholder={t('เช่น แผนกผลิต / โซน A')} required className={`h-10 ${invalidTarget === 'area' ? 'border-red-500 ring-2 ring-red-200' : ''}`} /></FormField>
        <FormField label={t('กะ')} htmlFor="shift"><AutocompleteInput id="shift" value={shift} onValueChange={(value) => { setShift(value); clearInvalidTarget('shift') }} suggestions={suggestions.shifts} placeholder={t('เช่น กะเช้า')} required className={`h-10 ${invalidTarget === 'shift' ? 'border-red-500 ring-2 ring-red-200' : ''}`} /></FormField>
      </div>
    </Card>

    {ngCount > 0 && <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" /><p><span className="font-semibold">{t('พบ NG')} {ngCount} {t('ข้อ')}</span><span className="ml-1.5 text-amber-800">{t('กรอกรายละเอียด ผู้รับผิดชอบ และแนบรูปก่อนแก้ไขในแต่ละข้อ')}</span></p></div>}

    <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">{t('รายการตรวจ')} {checklist.length} {t('หัวข้อ')}</h2><p className="mt-1 text-[11px] text-muted-foreground">{t('ผลตรวจที่เลือกแล้ว')} {answered} / {checklist.length}</p></div><div className="flex gap-1.5"><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">OK {Object.values(responses).filter((item) => item.result === 'OK').length}</Badge><Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-700">NG {ngCount}</Badge></div></div>

    <div className="space-y-3">{checklist.map((item) => <ChecklistCard key={item.key} item={item} response={responses[item.key]} assignees={assignees} invalidTarget={invalidTarget} onChange={(update) => updateResponse(item.key, update)} onResult={(result) => chooseResult(item.key, result)} />)}</div>

    <div className="safe-area-bottom sticky bottom-0 z-10 -mx-4 border-t border-[#e3e9e8] bg-[#f4f7f8]/95 px-4 py-3 backdrop-blur-md sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><CircleHelp size={14} /> {t('เมื่อพบอันตรายเร่งด่วน ให้แจ้งหัวหน้างานหรือ Safety ทันที')}</div>
        <div className="ml-auto grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center"><Button type="button" variant="outline" onClick={() => { setResponses(Object.fromEntries(checklist.map((item) => [item.key, blankResponse()]))); setInvalidTarget(null) }} className="h-11 w-full gap-1.5 sm:w-auto"><X size={16} /> {t('ล้างแบบฟอร์ม')}</Button><Button type="submit" disabled={busy} className="h-11 w-full gap-2 sm:min-w-[142px] sm:w-auto">{busy ? <><LoaderCircle size={17} className="animate-spin" /> {t('กำลังบันทึก')}</> : <>{t('ส่งแบบตรวจ')} <ArrowRight size={17} /></>}</Button></div>
      </div>
    </div>
  </form>
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label htmlFor={htmlFor} className="inspection-field-label text-xs text-muted-foreground sm:text-[10px]">{label}</Label>{children}</div>
}

function ChecklistCard({ item, response, assignees, invalidTarget, onChange, onResult }: { item: ChecklistItem; response: DraftResponse; assignees: Assignee[]; invalidTarget: string | null; onChange: (update: Partial<DraftResponse>) => void; onResult: (result: Result) => void }) {
  const [previews, setPreviews] = useState<string[]>([])
  const [compressing, setCompressing] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    const urls = response.beforeFiles.map((file) => URL.createObjectURL(file))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [response.beforeFiles])

  async function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'))
    if (!files.length) return
    setCompressing(true)
    try {
      const processed: File[] = []
      let compressedCount = 0
      for (const file of files) {
        const result = await compressLargeImage(file)
        processed.push(result.file)
        if (result.compressed) compressedCount += 1
      }
      onChange({ beforeFiles: [...response.beforeFiles, ...processed] })
      if (compressedCount) toast.success(`${t('บีบอัดรูปภาพแล้ว')} ${compressedCount} ${t('รูป')}`)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'ไม่สามารถบีบอัดรูปภาพได้ กรุณาลองใหม่'))
    } finally {
      setCompressing(false)
      input.value = ''
    }
  }

  function removeFile(index: number) {
    onChange({ beforeFiles: response.beforeFiles.filter((_, currentIndex) => currentIndex !== index) })
  }

  const itemTargetPrefix = `item-${item.key}-`
  const itemHasError = Boolean(invalidTarget?.startsWith(itemTargetPrefix))
  return <Card id={`${itemTargetPrefix}card`} className={`rounded-2xl border p-4 transition-colors sm:p-5 ${itemHasError ? 'border-red-500 bg-red-50/30 ring-2 ring-red-200 ring-offset-2' : response.result === 'NG' ? 'border-[#f0d4ce] bg-[#fffdfc]' : 'border-[#e5ebea] bg-white'}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f4f3] text-xs font-semibold text-[#58716c]">{item.order.toString().padStart(2, '0')}</span><div className="min-w-0"><h3 className="text-base font-semibold">{t(item.title)}</h3><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t(item.description)}</p></div></div>
      <div id={`${itemTargetPrefix}result`} style={{ gridTemplateColumns: `repeat(${item.choices.length}, minmax(0, 1fr))` }} className={`grid w-full shrink-0 gap-2 rounded-lg transition-shadow sm:flex sm:w-auto sm:gap-1.5 sm:pl-4 ${invalidTarget === `${itemTargetPrefix}card` ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>{item.choices.map((result) => <Button key={result} type="button" variant="outline" size="sm" onClick={() => onResult(result)} aria-pressed={response.result === result} data-result={result} data-selected={response.result === result ? 'true' : 'false'} className="result-choice h-11 w-full min-w-0 px-2.5 text-sm font-semibold sm:h-9 sm:w-auto sm:min-w-[68px]">{result}</Button>)}</div>
    </div>
    {response.result === 'NG' && <div className="mt-4 grid gap-3 border-t border-[#f1e2de] pt-4 lg:grid-cols-[1.1fr_.9fr]">
      <div className="grid gap-3">
        <div className="grid gap-1.5"><Label htmlFor={`${itemTargetPrefix}details`} className="inspection-field-label text-xs font-medium sm:text-[10px]">{t('รายละเอียดที่พบ')} <span className="text-red-600">*</span></Label><Textarea id={`${itemTargetPrefix}details`} aria-invalid={invalidTarget === `${itemTargetPrefix}details`} value={response.issueDetails} onChange={(event) => onChange({ issueDetails: event.target.value })} rows={2} placeholder={t('ระบุสิ่งที่พบและจุดที่เกิดปัญหา')} className={`resize-y bg-white text-xs ${invalidTarget === `${itemTargetPrefix}details` ? 'border-red-500 ring-2 ring-red-200' : ''}`} required /></div>
        <div className="grid gap-1.5"><Label htmlFor={`${itemTargetPrefix}responsible`} className="inspection-field-label text-xs font-medium sm:text-[10px]">{t('ผู้รับผิดชอบ')} <span className="text-red-600">*</span></Label><Select value={response.responsibleUserId} onValueChange={(id) => { const assignee = assignees.find((candidate) => candidate.id === id); onChange({ responsibleUserId: id, responsible: assignee?.name || '' }) }}><SelectTrigger id={`${itemTargetPrefix}responsible`} aria-invalid={invalidTarget === `${itemTargetPrefix}responsible`} className={`h-10 w-full bg-white text-sm ${invalidTarget === `${itemTargetPrefix}responsible` ? 'border-red-500 ring-2 ring-red-200' : ''}`}><SelectValue placeholder={t('เลือกบัญชีผู้รับผิดชอบ')} /></SelectTrigger><SelectContent>{assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.employeeCode}</SelectItem>)}</SelectContent></Select>{assignees.length === 0 && <p className="text-xs text-amber-700">{t('ยังไม่มีบัญชีพนักงานหรือหัวหน้างานที่ใช้งานได้')}</p>}</div>
      </div>
      <div id={`${itemTargetPrefix}photo`} className="grid content-start gap-1.5">
        <Label className="inspection-field-label text-xs font-medium sm:text-[10px]">{t('รูปก่อนแก้ไข')} <span className="text-red-600">*</span></Label>
        <div className={`rounded-xl border border-dashed border-[#d9c4be] bg-[#fff9f7] p-3 ${invalidTarget === `${itemTargetPrefix}photo` ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><ImagePlus size={17} className="text-[#b45e4e]" />{t('ถ่ายรูปหรือเลือกไฟล์')}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={compressing} onClick={() => cameraInput.current?.click()} className="h-11 w-full gap-2 bg-white text-sm"><Camera size={17} />{t('ถ่ายรูป')}</Button>
            <Button type="button" variant="outline" disabled={compressing} onClick={() => galleryInput.current?.click()} className="h-11 w-full gap-2 bg-white text-sm"><Images size={17} />{t('เลือกจากอัลบั้ม')}</Button>
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={chooseFiles} className="sr-only" />
          <input ref={galleryInput} type="file" accept="image/*" multiple onChange={chooseFiles} className="sr-only" />
          {compressing && <p className="mt-2 text-center text-xs font-medium text-primary">{t('กำลังบีบอัดรูปภาพ…')}</p>}
        </div>
        {response.beforeFiles.length > 0 && <div className="flex flex-wrap gap-2">{response.beforeFiles.map((file, index) => <div key={`${file.name}-${index}`} className="relative size-14 overflow-hidden rounded-lg border bg-white"><img src={previews[index]} alt={file.name} className="h-full w-full object-cover" /><Button type="button" variant="ghost" size="icon-xs" onClick={() => removeFile(index)} aria-label={t('นำรูปออก')} className="absolute right-0.5 top-0.5 size-5 rounded-full bg-black/60 p-0 text-white hover:bg-black/80 hover:text-white"><X size={11} /></Button></div>)}</div>}
      </div>
    </div>}
    {!response.result && <p className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-700"><CircleHelp size={12} /> {t('เลือกผลตรวจเพื่อบันทึกหัวข้อนี้')}</p>}
  </Card>
}
