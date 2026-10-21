import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, ClipboardPenLine, ImagePlus, LoaderCircle, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, localDateString } from '@/lib/api'
import type { HiyariLanguage, PublicEmployeeSuggestion } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const words: Record<HiyariLanguage, Record<string, string>> = {
  th: {
    brand: 'ระบบความปลอดภัยประจำวัน', badge: 'แบบรายงานออนไลน์', heading: 'รายงาน Hiyari Hat',
    subtitle: 'รายงานสภาพหรือเหตุการณ์ที่อาจก่อให้เกิดอุบัติเหตุ เพื่อปรับปรุงและป้องกันการเกิดซ้ำ',
    participant: 'ข้อมูลผู้รายงาน', employeeName: 'ชื่อผู้ส่ง', employeeCode: 'รหัสพนักงาน', department: 'แผนก',
    reportDate: 'วันที่รายงาน', when: 'เมื่อไหร่', whenHint: 'ระบุเวลา ช่วงเวลา หรือจังหวะที่พบเหตุการณ์',
    where: 'ที่ไหน', whereHint: 'ระบุอาคาร สายการผลิต เครื่องจักร หรือจุดที่พบ', what: 'เกิดอะไรขึ้น',
    whatHint: 'อธิบายสภาพที่ไม่ปลอดภัย เหตุการณ์เกือบเกิดอุบัติเหตุ หรือความเสี่ยงที่พบ',
    suggestions: 'ข้อเสนอแนะเพื่อปรับปรุง', suggestionsHint: 'เสนอแนวทางแก้ไขหรือป้องกันไม่ให้เกิดซ้ำ (ไม่บังคับ)',
    note: 'หมายเหตุ', noteHint: 'ข้อมูลเพิ่มเติม (ไม่บังคับ)', searchName: 'พิมพ์ชื่อหรือรหัสเพื่อค้นหาพนักงาน',
    selectDirectory: 'เลือกชื่อและรหัสพนักงานจากรายการเพื่อยืนยันตัวตน', searching: 'กำลังค้นหา…',
    submit: 'ส่งรายงาน', submitting: 'กำลังส่งรายงาน…', thanks: 'ส่งรายงานเรียบร้อยแล้ว',
    thankYou: 'ขอบคุณที่ช่วยรายงาน เพื่อให้เราปรับปรุงความปลอดภัยร่วมกัน', required: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ',
    selectEmployee: 'กรุณาเลือกชื่อและรหัสพนักงานจากทะเบียน', loadFail: 'ไม่พบแบบฟอร์มหรือปิดรับรายงานแล้ว',
    submitFail: 'ส่งรายงานไม่สำเร็จ กรุณาลองอีกครั้ง', loading: 'กำลังโหลดแบบฟอร์ม…', reportUnavailable: 'ไม่สามารถเปิดแบบฟอร์มได้',
    footer: 'แบบฟอร์มเปิดได้โดยไม่ต้องเข้าสู่ระบบ', language: 'ภาษา', photos: 'รูปภาพประกอบ (ไม่บังคับ)',
    addPhotos: 'เพิ่มรูปภาพ', photoHint: 'แนบรูปเพื่อช่วยอธิบายเหตุการณ์ได้สูงสุด 5 รูป (JPG, PNG หรือ WebP)', removePhoto: 'นำรูปออก', photoLimit: 'แนบรูปได้ไม่เกิน 5 รูป', photoType: 'เลือกรูป JPG, PNG หรือ WebP เท่านั้น', photoSize: 'แต่ละรูปต้องมีขนาดไม่เกิน 8 MB',
  },
  en: {
    brand: 'Daily Safety System', badge: 'Online report', heading: 'Hiyari Hat Report',
    subtitle: 'Report a hazard or near miss so we can improve conditions and prevent recurrence.',
    participant: 'Reporter details', employeeName: 'Reporter name', employeeCode: 'Employee ID', department: 'Department',
    reportDate: 'Report date', when: 'When did it happen?', whenHint: 'Enter the time, period, or activity when you noticed it.',
    where: 'Where did it happen?', whereHint: 'Enter the building, production line, machine, or location.', what: 'What happened?',
    whatHint: 'Describe the unsafe condition, near miss, or risk you observed.',
    suggestions: 'Suggestions for improvement', suggestionsHint: 'Suggest a corrective or preventive action (optional).',
    note: 'Note', noteHint: 'Additional information (optional).', searchName: 'Search employees by name or ID',
    selectDirectory: 'Select your name and employee ID from the list to verify your identity.', searching: 'Searching…',
    submit: 'Submit report', submitting: 'Submitting report…', thanks: 'Report submitted successfully',
    thankYou: 'Thank you for helping us improve workplace safety.', required: 'Complete all required fields.',
    selectEmployee: 'Select your name and employee ID from the employee directory.', loadFail: 'This form is unavailable or closed.',
    submitFail: 'Could not submit the report. Please try again.', loading: 'Loading form…', reportUnavailable: 'The form could not be opened.',
    footer: 'This form opens without signing in.', language: 'Language', photos: 'Supporting photos (optional)',
    addPhotos: 'Add photos', photoHint: 'Attach up to 5 photos to help explain the incident (JPG, PNG, or WebP).', removePhoto: 'Remove photo', photoLimit: 'You can attach up to 5 photos.', photoType: 'Choose JPG, PNG, or WebP images only.', photoSize: 'Each image must be 8 MB or smaller.',
  },
  my: {
    brand: 'နေ့စဉ် ဘေးကင်းလုံခြုံရေးစနစ်', badge: 'အွန်လိုင်းအစီရင်ခံစာ', heading: 'ဟိယာရီ ဟတ် အစီရင်ခံစာ',
    subtitle: 'မတော်တဆမှုဖြစ်စေနိုင်သော အန္တရာယ်ရှိသည့်အခြေအနေ သို့မဟုတ် မတော်တဆမှုဖြစ်လုနီးပါးကို တင်ပြပြီး ထပ်မံမဖြစ်ပွားစေရန် ကူညီပါ။',
    participant: 'တင်ပြသူအချက်အလက်', employeeName: 'တင်ပြသူအမည်', employeeCode: 'ဝန်ထမ်းအမှတ်', department: 'ဌာန',
    reportDate: 'တင်ပြသည့်ရက်စွဲ', when: 'ဘယ်အချိန်တွင် ဖြစ်ခဲ့သလဲ', whenHint: 'တွေ့ရှိသည့်အချိန်၊ ကာလ သို့မဟုတ် လုပ်ငန်းအခြေအနေကို ရေးပါ။',
    where: 'ဘယ်နေရာတွင် ဖြစ်ခဲ့သလဲ', whereHint: 'အဆောက်အအုံ၊ ထုတ်လုပ်ရေးလိုင်း၊ စက် သို့မဟုတ် နေရာကို ရေးပါ။', what: 'ဘာဖြစ်ခဲ့သလဲ',
    whatHint: 'သတိပြုမိသည့် အန္တရာယ်ရှိသောအခြေအနေ၊ မတော်တဆမှုဖြစ်လုနီးပါး သို့မဟုတ် အန္တရာယ်ကို ရှင်းပြပါ။',
    suggestions: 'တိုးတက်ကောင်းမွန်ရေး အကြံပြုချက်', suggestionsHint: 'ပြုပြင်ရန် သို့မဟုတ် ထပ်မံမဖြစ်ပွားစေရန် အကြံပြုပါ (မဖြည့်လည်းရသည်)။',
    note: 'မှတ်ချက်', noteHint: 'ထပ်ဆောင်းအချက်အလက် (မဖြည့်လည်းရသည်)။', searchName: 'အမည် သို့မဟုတ် ဝန်ထမ်းအမှတ်ဖြင့် ရှာပါ',
    selectDirectory: 'အတည်ပြုရန် အမည်နှင့် ဝန်ထမ်းအမှတ်ကို စာရင်းမှ ရွေးပါ။', searching: 'ရှာဖွေနေသည်…',
    submit: 'အစီရင်ခံစာ ပို့ရန်', submitting: 'အစီရင်ခံစာ ပို့နေသည်…', thanks: 'အစီရင်ခံစာ ပို့ပြီးပါပြီ',
    thankYou: 'လုပ်ငန်းခွင်ဘေးကင်းရေး တိုးတက်စေရန် ကူညီပေးသည့်အတွက် ကျေးဇူးတင်ပါသည်။', required: 'လိုအပ်သောအချက်အလက်အားလုံးကို ဖြည့်ပါ။',
    selectEmployee: 'ဝန်ထမ်းစာရင်းမှ အမည်နှင့် ဝန်ထမ်းအမှတ်ကို ရွေးပါ။', loadFail: 'ဤဖောင်ကို မရရှိနိုင်တော့ပါ သို့မဟုတ် ပိတ်ထားပါသည်။',
    submitFail: 'အစီရင်ခံစာ ပို့၍မရပါ။ ထပ်မံကြိုးစားပါ။', loading: 'ဖောင်ကို ဖွင့်နေသည်…', reportUnavailable: 'ဖောင်ကို ဖွင့်၍မရပါ။',
    footer: 'အကောင့်ဝင်ရန်မလိုဘဲ ဖောင်ကို ဖွင့်နိုင်သည်။', language: 'ဘာသာစကား', photos: 'အထောက်အကူပြု ဓာတ်ပုံများ (မဖြည့်လည်းရသည်)',
    addPhotos: 'ဓာတ်ပုံထည့်ရန်', photoHint: 'ဖြစ်ရပ်ကို ရှင်းပြရန် ဓာတ်ပုံ ၅ ပုံအထိ ပူးတွဲနိုင်သည် (JPG, PNG သို့မဟုတ် WebP)။', removePhoto: 'ဓာတ်ပုံဖယ်ရှားရန်', photoLimit: 'ဓာတ်ပုံ ၅ ပုံအထိသာ ပူးတွဲနိုင်သည်။', photoType: 'JPG, PNG သို့မဟုတ် WebP ဓာတ်ပုံများကိုသာ ရွေးပါ။', photoSize: 'ဓာတ်ပုံတစ်ပုံလျှင် ၈ MB ထက် မကြီးရပါ။',
  },
}

type PublicForm = { title: string; description: string }

export function PublicHiyariPage({ token }: { token: string }) {
  const [language, setLanguage] = useState<HiyariLanguage>(() => {
    const saved = localStorage.getItem('hiyari-language')
    return saved === 'en' || saved === 'my' ? saved : 'th'
  })
  const copy = words[language]
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [employeeName, setEmployeeName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [department, setDepartment] = useState('')
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<PublicEmployeeSuggestion | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [suggestions, setSuggestions] = useState<PublicEmployeeSuggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [reportDate, setReportDate] = useState(localDateString())
  const [whenText, setWhenText] = useState('')
  const [whereText, setWhereText] = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [improvements, setImprovements] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<{ file: File; url: string }[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [highlight, setHighlight] = useState('')

  useEffect(() => {
    const previews = photos.map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPhotoPreviews(previews)
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url))
  }, [photos])

  useEffect(() => {
    let current = true
    api.publicHiyari(token).then(({ form: data }) => { if (current) setForm(data) })
      .catch(() => { if (current) setLoadError(true) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token])

  useEffect(() => {
    const query = searchTerm.trim()
    if (query.length < 2) { setSuggestions([]); setSuggesting(false); return }
    let current = true
    const timer = window.setTimeout(() => {
      setSuggesting(true)
      api.publicEmployeeSuggestions(query, language === 'th' ? 'th' : 'en')
        .then(({ employees }) => { if (current) setSuggestions(employees) })
        .catch(() => { if (current) setSuggestions([]) })
        .finally(() => { if (current) setSuggesting(false) })
    }, 220)
    return () => { current = false; window.clearTimeout(timer) }
  }, [searchTerm, language])

  function changeLanguage(next: HiyariLanguage) {
    setLanguage(next)
    localStorage.setItem('hiyari-language', next)
    if (selectedEmployee) {
      const name = next === 'th' ? selectedEmployee.nameTh || selectedEmployee.nameEn : selectedEmployee.nameEn || selectedEmployee.nameTh
      setEmployeeName(name)
      setEmployeeCode(selectedEmployee.employeeCode)
      setDepartment(next === 'th' ? selectedEmployee.departmentTh || selectedEmployee.departmentEn : selectedEmployee.departmentEn || selectedEmployee.departmentTh)
      setSelectedEmployeeCode(selectedEmployee.employeeCode)
    }
  }

  function chooseEmployee(employee: PublicEmployeeSuggestion) {
    setSelectedEmployee(employee)
    setEmployeeName(language === 'th' ? employee.nameTh || employee.nameEn : employee.nameEn || employee.nameTh)
    setEmployeeCode(employee.employeeCode)
    setDepartment(language === 'th' ? employee.departmentTh || employee.departmentEn : employee.departmentEn || employee.departmentTh)
    setSelectedEmployeeCode(employee.employeeCode)
    setSearchTerm('')
    setSuggestions([])
    setHighlight('')
  }

  function showMissing(field: string) {
    setHighlight(field)
    window.requestAnimationFrame(() => document.querySelector(`[data-field="${field}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setAttempted(true)
    if (!employeeName.trim() || !employeeCode.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase()) {
      showMissing('employee')
      toast.error(copy.selectEmployee)
      return
    }
    const missing = !reportDate ? 'date' : !whenText.trim() ? 'when' : !whereText.trim() ? 'where' : !whatHappened.trim() ? 'what' : ''
    if (missing) {
      showMissing(missing)
      toast.error(copy.required)
      return
    }
    setHighlight('')
    setSubmitting(true)
    try {
      await api.submitHiyari(token, {
        employeeCode: employeeCode.trim(), employeeName: employeeName.trim(), language,
        reportDate, whenText: whenText.trim(), whereText: whereText.trim(), whatHappened: whatHappened.trim(),
        suggestions: improvements.trim(), note: note.trim(),
        photos,
      })
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      toast.error(message.includes('ชื่อและรหัส') ? copy.selectEmployee : copy.submitFail)
    } finally { setSubmitting(false) }
  }

  const languageOptions: { code: HiyariLanguage; label: string }[] = [
    { code: 'th', label: 'ไทย' }, { code: 'en', label: 'English' }, { code: 'my', label: 'မြန်မာ' },
  ]

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selected.length) return
    if (photos.length + selected.length > 5) toast.error(copy.photoLimit)
    const accepted = selected.filter((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error(copy.photoType); return false }
      if (file.size > 8 * 1024 * 1024) { toast.error(copy.photoSize); return false }
      return true
    }).slice(0, Math.max(0, 5 - photos.length))
    if (accepted.length) setPhotos((current) => [...current, ...accepted].slice(0, 5))
  }

  return <div lang={language === 'my' ? 'my' : language} className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6"><div className="flex min-w-0 items-center gap-2.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ClipboardPenLine size={20} /></div><div className="min-w-0"><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="truncate text-xs text-muted-foreground">{copy.brand}</p></div></div><div className="flex shrink-0 items-center gap-1 rounded-xl border bg-surface-subtle p-1" aria-label={copy.language}>{languageOptions.map((option) => <button key={option.code} type="button" onClick={() => changeLanguage(option.code)} aria-pressed={language === option.code} className={`min-h-9 rounded-lg px-2.5 text-xs font-medium transition-colors sm:px-3 ${language === option.code ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-muted-foreground hover:text-foreground'}`}>{option.label}</button>)}</div></div></header>
    <main className="mx-auto flex w-full max-w-4xl justify-center px-3 py-4 sm:px-6 sm:py-8">
      <Card className="w-full overflow-hidden rounded-2xl border-border shadow-sm">
        <CardHeader className="space-y-3 bg-white p-4 sm:p-7"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><ClipboardPenLine size={22} /></div><Badge variant="outline" className="border-primary/20 bg-white text-primary">{copy.badge}</Badge></div><CardTitle as="h1" className="page-heading text-2xl leading-tight sm:text-3xl">{copy.heading}</CardTitle><CardDescription className="text-base leading-relaxed">{copy.subtitle}</CardDescription></CardHeader>
        {loading ? <CardContent className="flex items-center gap-2 border-t p-6 text-muted-foreground"><LoaderCircle size={18} className="animate-spin" />{copy.loading}</CardContent>
          : loadError || !form ? <CardContent className="flex items-start gap-3 border-t p-5 text-destructive"><AlertCircle className="mt-0.5 shrink-0" size={19} /><p>{copy.loadFail || copy.reportUnavailable}</p></CardContent>
            : submitted ? <CardContent className="border-t p-5 sm:p-7"><div className="rounded-2xl border border-success/25 bg-success/10 p-6 text-center sm:p-8"><CheckCircle2 className="mx-auto size-12 text-success" /><h2 className="mt-3 text-xl font-semibold text-success">{copy.thanks}</h2><p className="mt-1 text-muted-foreground">{copy.thankYou}</p><p className="mt-4 text-sm text-success">{employeeName} · {employeeCode}</p></div></CardContent>
              : <form noValidate onSubmit={submit} className="space-y-5 border-t p-4 sm:p-7">
                <section data-field="employee" className={`space-y-4 rounded-xl border p-4 transition-colors sm:p-5 ${highlight === 'employee' ? 'border-destructive/50 bg-destructive/10 ring-2 ring-destructive/20' : 'bg-white'}`}>
                  <div className="flex items-center gap-2 font-semibold"><UserRound size={18} className="text-primary" />{copy.participant}</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label htmlFor="hiyari-name">{copy.employeeName} *</Label><Input id="hiyari-name" value={employeeName} autoComplete="off" aria-invalid={attempted && (!employeeName || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} onChange={(event) => { setEmployeeName(event.target.value); setSelectedEmployee(null); setSelectedEmployeeCode(''); setDepartment(''); setSearchTerm(event.target.value); setHighlight('') }} placeholder={copy.searchName} maxLength={160} className="h-12" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="hiyari-code">{copy.employeeCode} *</Label><Input id="hiyari-code" value={employeeCode} autoComplete="off" aria-invalid={attempted && (!employeeCode || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} onChange={(event) => { setEmployeeCode(event.target.value); setSelectedEmployee(null); setSelectedEmployeeCode(''); setDepartment(''); setSearchTerm(event.target.value); setHighlight('') }} placeholder={copy.searchName} maxLength={80} className="h-12 uppercase" /></div>
                  </div>
                  {(suggestions.length > 0 || suggesting) && <div className="max-h-56 overflow-y-auto rounded-xl border bg-white shadow-sm" role="listbox" aria-label={copy.participant}>{suggesting && <div className="p-3 text-sm text-muted-foreground">{copy.searching}</div>}{suggestions.map((employee) => <button key={employee.employeeCode} type="button" role="option" aria-selected={false} onClick={() => chooseEmployee(employee)} className="flex min-h-12 w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-secondary/50"><span className="font-medium">{language === 'th' ? employee.nameTh || employee.nameEn : employee.nameEn || employee.nameTh}</span><span className="shrink-0 text-sm text-muted-foreground">{employee.employeeCode}</span></button>)}</div>}
                  <p className="text-sm text-muted-foreground">{copy.selectDirectory}</p>
                  <div className="grid gap-1.5 sm:max-w-[calc(50%-0.5rem)]"><Label htmlFor="hiyari-department">{copy.department}</Label><Input id="hiyari-department" readOnly value={department} placeholder="—" className="h-12 bg-surface-subtle" /></div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-field="date" className={`grid content-start gap-1.5 rounded-xl transition-colors ${highlight === 'date' ? 'rounded-xl ring-2 ring-destructive/20' : ''}`}><Label htmlFor="hiyari-date">{copy.reportDate} *</Label><DatePicker id="hiyari-date" value={reportDate} onChange={(value) => { setReportDate(value); setHighlight('') }} placeholder={copy.reportDate} ariaLabel={copy.reportDate} language={language === 'th' ? 'th' : 'en'} translatePlaceholder={false} ariaInvalid={attempted && !reportDate} className="h-12" /></div>
                  <div data-field="when" className={`grid content-start gap-1.5 rounded-xl transition-colors ${highlight === 'when' ? 'rounded-xl ring-2 ring-destructive/20' : ''}`}><Label htmlFor="hiyari-when">{copy.when} *</Label><Textarea id="hiyari-when" value={whenText} onChange={(event) => { setWhenText(event.target.value); setHighlight('') }} rows={2} maxLength={2000} aria-invalid={attempted && !whenText.trim()} placeholder={copy.whenHint} /></div>
                  <div data-field="where" className={`grid content-start gap-1.5 rounded-xl transition-colors ${highlight === 'where' ? 'rounded-xl ring-2 ring-destructive/20' : ''}`}><Label htmlFor="hiyari-where">{copy.where} *</Label><Textarea id="hiyari-where" value={whereText} onChange={(event) => { setWhereText(event.target.value); setHighlight('') }} rows={2} maxLength={2000} aria-invalid={attempted && !whereText.trim()} placeholder={copy.whereHint} /></div>
                  <div data-field="what" className={`grid content-start gap-1.5 rounded-xl transition-colors sm:col-span-2 ${highlight === 'what' ? 'rounded-xl ring-2 ring-destructive/20' : ''}`}><Label htmlFor="hiyari-what">{copy.what} *</Label><Textarea id="hiyari-what" value={whatHappened} onChange={(event) => { setWhatHappened(event.target.value); setHighlight('') }} rows={4} maxLength={5000} aria-invalid={attempted && !whatHappened.trim()} placeholder={copy.whatHint} /></div>
                </div>

                <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><Label>{copy.photos}</Label><p className="mt-1 text-sm text-muted-foreground">{copy.photoHint}</p></div><Button type="button" variant="outline" className="h-10 gap-2" disabled={photos.length >= 5} onClick={() => photoInputRef.current?.click()}><ImagePlus size={17} />{copy.addPhotos}</Button><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={addPhotos} /></div>{photoPreviews.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photoPreviews.map(({ file, url }, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="group relative overflow-hidden rounded-xl border bg-surface-subtle"><img src={url} alt={file.name} className="h-36 w-full object-cover" /><div className="flex items-center justify-between gap-2 px-2.5 py-2"><p className="truncate text-xs text-muted-foreground">{file.name}</p><button type="button" aria-label={copy.removePhoto} title={copy.removePhoto} onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X size={15} /></button></div></div>)}</div>}</section>

                <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="hiyari-suggestions">{copy.suggestions}</Label><Textarea id="hiyari-suggestions" value={improvements} onChange={(event) => setImprovements(event.target.value)} rows={3} maxLength={5000} placeholder={copy.suggestionsHint} /></div><div className="grid gap-1.5"><Label htmlFor="hiyari-note">{copy.note}</Label><Textarea id="hiyari-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={3000} placeholder={copy.noteHint} /></div></div>

                <div className="flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{copy.footer}</p><Button type="submit" disabled={submitting} className="h-12 w-full gap-2 sm:w-auto">{submitting && <LoaderCircle size={17} className="animate-spin" />}{submitting ? copy.submitting : copy.submit}</Button></div>
              </form>}
      </Card>
    </main>
    <p className="px-3 pb-5 text-center text-sm text-muted-foreground">Y.T. RUBBER · {copy.footer}</p>
  </div>
}
