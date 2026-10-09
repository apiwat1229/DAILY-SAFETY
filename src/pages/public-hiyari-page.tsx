import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, ClipboardPenLine, LoaderCircle, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, localDateString } from '@/lib/api'
import type { HiyariLanguage, PublicEmployeeSuggestion } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    footer: 'แบบฟอร์มเปิดได้โดยไม่ต้องเข้าสู่ระบบ', language: 'ภาษา',
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
    footer: 'This form opens without signing in.', language: 'Language',
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
    footer: 'အကောင့်ဝင်ရန်မလိုဘဲ ဖောင်ကို ဖွင့်နိုင်သည်။', language: 'ဘာသာစကား',
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
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [highlight, setHighlight] = useState('')

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

  return <div lang={language === 'my' ? 'my' : language} className="min-h-dvh bg-[#f3f7f7] text-foreground">
    <header className="sticky top-0 z-20 border-b border-[#e5eceb] bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6"><div className="flex min-w-0 items-center gap-2.5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e5f2ef] text-primary"><ClipboardPenLine size={20} /></div><div className="min-w-0"><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="truncate text-xs text-muted-foreground">{copy.brand}</p></div></div><div className="flex shrink-0 items-center gap-1 rounded-xl border bg-[#f7f9f9] p-1" aria-label={copy.language}>{languageOptions.map((option) => <button key={option.code} type="button" onClick={() => changeLanguage(option.code)} aria-pressed={language === option.code} className={`min-h-9 rounded-lg px-2.5 text-xs font-medium transition-colors sm:px-3 ${language === option.code ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-muted-foreground hover:text-foreground'}`}>{option.label}</button>)}</div></div></header>
    <main className="mx-auto flex w-full max-w-4xl justify-center px-3 py-4 sm:px-6 sm:py-8">
      <Card className="w-full overflow-hidden rounded-2xl border-[#e5eceb] shadow-sm">
        <CardHeader className="space-y-3 bg-white p-4 sm:p-7"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#eaf4f1] text-primary"><ClipboardPenLine size={22} /></div><Badge variant="outline" className="border-primary/20 bg-white text-primary">{copy.badge}</Badge></div><CardTitle className="text-2xl leading-tight sm:text-3xl">{copy.heading}</CardTitle><CardDescription className="text-base leading-relaxed">{copy.subtitle}</CardDescription></CardHeader>
        {loading ? <CardContent className="flex items-center gap-2 border-t p-6 text-muted-foreground"><LoaderCircle size={18} className="animate-spin" />{copy.loading}</CardContent>
          : loadError || !form ? <CardContent className="flex items-start gap-3 border-t p-5 text-destructive"><AlertCircle className="mt-0.5 shrink-0" size={19} /><p>{copy.loadFail || copy.reportUnavailable}</p></CardContent>
            : submitted ? <CardContent className="border-t p-5 sm:p-7"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-8"><CheckCircle2 className="mx-auto size-12 text-emerald-600" /><h2 className="mt-3 text-xl font-semibold text-emerald-900">{copy.thanks}</h2><p className="mt-1 text-muted-foreground">{copy.thankYou}</p><p className="mt-4 text-sm text-emerald-800">{employeeName} · {employeeCode}</p></div></CardContent>
              : <form noValidate onSubmit={submit} className="space-y-5 border-t p-4 sm:p-7">
                <section data-field="employee" className={`space-y-4 rounded-xl border p-4 transition-colors sm:p-5 ${highlight === 'employee' ? 'border-red-400 bg-red-50/50 ring-2 ring-red-200' : 'bg-white'}`}>
                  <div className="flex items-center gap-2 font-semibold"><UserRound size={18} className="text-primary" />{copy.participant}</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label htmlFor="hiyari-name">{copy.employeeName} *</Label><Input id="hiyari-name" value={employeeName} autoComplete="off" aria-invalid={attempted && (!employeeName || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} onChange={(event) => { setEmployeeName(event.target.value); setSelectedEmployee(null); setSelectedEmployeeCode(''); setDepartment(''); setSearchTerm(event.target.value); setHighlight('') }} placeholder={copy.searchName} maxLength={160} className="h-12" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="hiyari-code">{copy.employeeCode} *</Label><Input id="hiyari-code" value={employeeCode} autoComplete="off" aria-invalid={attempted && (!employeeCode || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} onChange={(event) => { setEmployeeCode(event.target.value); setSelectedEmployee(null); setSelectedEmployeeCode(''); setDepartment(''); setSearchTerm(event.target.value); setHighlight('') }} placeholder={copy.searchName} maxLength={80} className="h-12 uppercase" /></div>
                  </div>
                  {(suggestions.length > 0 || suggesting) && <div className="max-h-56 overflow-y-auto rounded-xl border bg-white shadow-sm" role="listbox" aria-label={copy.participant}>{suggesting && <div className="p-3 text-sm text-muted-foreground">{copy.searching}</div>}{suggestions.map((employee) => <button key={employee.employeeCode} type="button" role="option" aria-selected={false} onClick={() => chooseEmployee(employee)} className="flex min-h-12 w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-[#f2f7f6]"><span className="font-medium">{language === 'th' ? employee.nameTh || employee.nameEn : employee.nameEn || employee.nameTh}</span><span className="shrink-0 text-sm text-muted-foreground">{employee.employeeCode}</span></button>)}</div>}
                  <p className="text-sm text-muted-foreground">{copy.selectDirectory}</p>
                  <div className="grid gap-1.5 sm:max-w-[calc(50%-0.5rem)]"><Label htmlFor="hiyari-department">{copy.department}</Label><Input id="hiyari-department" readOnly value={department} placeholder="—" className="h-12 bg-[#f7f9f9]" /></div>
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-field="date" className={`grid content-start gap-1.5 rounded-xl transition-colors ${highlight === 'date' ? 'rounded-xl ring-2 ring-red-200' : ''}`}><Label htmlFor="hiyari-date">{copy.reportDate} *</Label><Input id="hiyari-date" type="date" value={reportDate} onChange={(event) => { setReportDate(event.target.value); setHighlight('') }} aria-invalid={attempted && !reportDate} className="h-12" /></div>
                  <div data-field="when" className={`grid content-start gap-1.5 rounded-xl transition-colors ${highlight === 'when' ? 'rounded-xl ring-2 ring-red-200' : ''}`}><Label htmlFor="hiyari-when">{copy.when} *</Label><Textarea id="hiyari-when" value={whenText} onChange={(event) => { setWhenText(event.target.value); setHighlight('') }} rows={2} maxLength={2000} aria-invalid={attempted && !whenText.trim()} placeholder={copy.whenHint} /></div>
                  <div data-field="where" className={`grid content-start gap-1.5 rounded-xl transition-colors ${highlight === 'where' ? 'rounded-xl ring-2 ring-red-200' : ''}`}><Label htmlFor="hiyari-where">{copy.where} *</Label><Textarea id="hiyari-where" value={whereText} onChange={(event) => { setWhereText(event.target.value); setHighlight('') }} rows={2} maxLength={2000} aria-invalid={attempted && !whereText.trim()} placeholder={copy.whereHint} /></div>
                  <div data-field="what" className={`grid content-start gap-1.5 rounded-xl transition-colors sm:col-span-2 ${highlight === 'what' ? 'rounded-xl ring-2 ring-red-200' : ''}`}><Label htmlFor="hiyari-what">{copy.what} *</Label><Textarea id="hiyari-what" value={whatHappened} onChange={(event) => { setWhatHappened(event.target.value); setHighlight('') }} rows={4} maxLength={5000} aria-invalid={attempted && !whatHappened.trim()} placeholder={copy.whatHint} /></div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="hiyari-suggestions">{copy.suggestions}</Label><Textarea id="hiyari-suggestions" value={improvements} onChange={(event) => setImprovements(event.target.value)} rows={3} maxLength={5000} placeholder={copy.suggestionsHint} /></div><div className="grid gap-1.5"><Label htmlFor="hiyari-note">{copy.note}</Label><Textarea id="hiyari-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={3000} placeholder={copy.noteHint} /></div></div>

                <div className="flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{copy.footer}</p><Button type="submit" disabled={submitting} className="h-12 w-full gap-2 sm:w-auto">{submitting && <LoaderCircle size={17} className="animate-spin" />}{submitting ? copy.submitting : copy.submit}</Button></div>
              </form>}
      </Card>
    </main>
    <p className="px-3 pb-5 text-center text-sm text-muted-foreground">Y.T. RUBBER · {copy.footer}</p>
  </div>
}
