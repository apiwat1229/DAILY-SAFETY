import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, ClipboardPenLine, Download, FileSpreadsheet, LoaderCircle, Pencil, Plus, QrCode, Trash2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate, formatDateTime, hiyariSubmissionExportUrl } from '@/lib/api'
import type { HiyariForm, HiyariSubmission } from '@/lib/types'
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/i18n'

type HiyariDraft = { title: string; description: string }

export function HiyariPage() {
  const { language, t } = useI18n()
  const [forms, setForms] = useState<HiyariForm[]>([])
  const [submissions, setSubmissions] = useState<HiyariSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [search, setSearch] = useState('')
  const [formFilter, setFormFilter] = useState('all')
  const [editor, setEditor] = useState<{ form: HiyariForm | null; draft: HiyariDraft } | null>(null)
  const [share, setShare] = useState<HiyariForm | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [formData, submissionData] = await Promise.all([api.hiyariForms(), api.hiyariSubmissions()])
      setForms(formData.forms)
      setSubmissions(submissionData.submissions)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'โหลดรายงาน Hiyari Hat ไม่สำเร็จ'))
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

  const totalSubmissions = submissions.length
  const todaySubmissions = submissions.filter((submission) => submission.submittedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length
  const visibleSubmissions = useMemo(() => submissions.filter((submission) => {
    const matchesForm = formFilter === 'all' || submission.formId === formFilter
    const query = search.trim().toLocaleLowerCase()
    const matchesSearch = !query || [submission.employeeName, submission.employeeCode, submission.department, submission.formTitle].some((value) => value.toLocaleLowerCase().includes(query))
    return matchesForm && matchesSearch
  }), [formFilter, search, submissions])

  function openCreate() {
    setEditor({ form: null, draft: { title: 'Hiyari Hat Report · FM-SFT-42 Rev.01', description: 'รายงานสภาพหรือเหตุการณ์ที่อาจก่อให้เกิดอุบัติเหตุ เพื่อปรับปรุงและป้องกันการเกิดซ้ำ' } })
  }

  function openEdit(form: HiyariForm) {
    setEditor({ form, draft: { title: form.title, description: form.description } })
  }

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || saving) return
    setSaving(true)
    try {
      if (editor.form) {
        await api.updateHiyariForm(editor.form.id, editor.draft)
        toast.success(t('บันทึกแบบฟอร์มแล้ว'))
      } else {
        await api.createHiyariForm(editor.draft)
        toast.success(t('สร้างแบบฟอร์มแล้ว'))
      }
      setEditor(null)
      await refresh()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกแบบฟอร์มไม่สำเร็จ')) }
    finally { setSaving(false) }
  }

  async function toggleForm(form: HiyariForm) {
    setBusyId(form.id)
    try {
      await api.updateHiyariForm(form.id, { isActive: !form.isActive })
      toast.success(t(form.isActive ? 'ปิดลิงก์สาธารณะแล้ว' : 'เปิดลิงก์สาธารณะแล้ว'))
      await refresh()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusyId('') }
  }

  async function deleteForm(form: HiyariForm) {
    if (!window.confirm(`${t('ลบแบบฟอร์ม')} “${form.title}”?`)) return
    try { await api.deleteHiyariForm(form.id); toast.success(t('ลบแบบฟอร์มแล้ว')); await refresh() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบแบบฟอร์มไม่สำเร็จ')) }
  }

  async function downloadReport(submission: HiyariSubmission) {
    setBusyId(submission.id)
    try {
      const response = await fetch(hiyariSubmissionExportUrl(submission.id), { credentials: 'same-origin' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'ส่งออก Excel ไม่สำเร็จ')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
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

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('แบบฟอร์มออนไลน์')}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Hiyari Hat</h2><p className="mt-1 text-sm text-muted-foreground">{t('เปิดให้รายงานโดยไม่ต้อง Login และส่งออกเป็น Excel ตามภาษาที่ผู้กรอกเลือก')}</p></div>
      <Button onClick={openCreate} className="h-11 w-full gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มแบบฟอร์ม')}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <HiyariMetric label={t('แบบฟอร์มทั้งหมด')} value={forms.length} icon={ClipboardPenLine} />
      <HiyariMetric label={t('รายงานทั้งหมด')} value={totalSubmissions} icon={UsersRound} />
      <HiyariMetric label={t('รายงานวันนี้')} value={todaySubmissions} icon={CalendarDays} />
    </div>

    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]">
      <CardHeader className="border-b border-[#edf0f0] px-5 py-4"><CardTitle>{t('แบบฟอร์ม Hiyari Hat')}</CardTitle><CardDescription>{t('แชร์ลิงก์หรือ QR Code ให้พนักงานกรอกได้โดยไม่ต้องเข้าสู่ระบบ')}</CardDescription></CardHeader>
      {forms.length ? <div className="divide-y">{forms.map((form) => <article key={form.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f3] text-primary"><ClipboardPenLine size={19} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{form.title}</h3><Badge variant="outline" className={form.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{t(form.isActive ? 'เปิดให้กรอก' : 'ปิดลิงก์')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{form.description || t('รายงานสภาพหรือเหตุการณ์ที่อาจก่อให้เกิดอุบัติเหตุ')}</p><p className="mt-1 text-sm text-muted-foreground">{form.submissionCount.toLocaleString()} {t('รายงาน')} · {t('ภาษาไทย อังกฤษ และพม่า')}</p></div></div>
        <div className="flex flex-wrap gap-2 sm:justify-end"><Button variant="outline" className="h-10 gap-2" onClick={() => setShare(form)}><QrCode size={16} /> {t('ลิงก์และ QR')}</Button><Button variant="outline" className="h-10 gap-2" onClick={() => openEdit(form)}><Pencil size={15} /> {t('แก้ไข')}</Button><Button variant="outline" className="h-10" disabled={busyId === form.id} onClick={() => void toggleForm(form)}>{busyId === form.id ? <LoaderCircle size={15} className="animate-spin" /> : t(form.isActive ? 'ปิดลิงก์' : 'เปิดลิงก์')}</Button>{form.submissionCount === 0 && <Button variant="outline" size="icon" aria-label={t('ลบแบบฟอร์ม')} className="h-10 w-10 text-destructive hover:text-destructive" onClick={() => void deleteForm(form)}><Trash2 size={15} /></Button>}</div>
      </article>)}</div> : <CardContent className="grid min-h-44 place-items-center p-8 text-center text-sm text-muted-foreground">{loading ? t('กำลังโหลดข้อมูล…') : t('ยังไม่มีแบบฟอร์ม Hiyari Hat')}</CardContent>}
    </Card>

    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]">
      <CardHeader className="flex flex-col gap-3 border-b border-[#edf0f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{t('รายงานที่ส่งเข้ามา')}</CardTitle><CardDescription>{t('แต่ละรายการส่งออกเป็นไฟล์ Excel ตามภาษาที่พนักงานเลือกตอนกรอก')}</CardDescription></div><div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[220px_210px]"><Select value={formFilter} onValueChange={setFormFilter}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('ทุกแบบฟอร์ม')}</SelectItem>{forms.map((form) => <SelectItem key={form.id} value={form.id}>{form.title}</SelectItem>)}</SelectContent></Select><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-10" /></div></CardHeader>
      {visibleSubmissions.length ? <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead><tr className="bg-[#fafcfc] text-left text-muted-foreground"><th className="px-5 py-3 font-medium">{t('วันที่รายงาน')}</th><th className="px-3 py-3 font-medium">{t('พนักงาน')}</th><th className="px-3 py-3 font-medium">{t('แผนก')}</th><th className="px-3 py-3 font-medium">{t('ภาษา')}</th><th className="px-5 py-3 text-right font-medium">{t('ส่งออก')}</th></tr></thead><tbody>{visibleSubmissions.map((submission) => <tr key={submission.id} className="border-t"><td className="px-5 py-3"><p>{formatDate(submission.reportDate, language)}</p><p className="text-xs text-muted-foreground">{formatDateTime(submission.submittedAt, language)}</p></td><td className="px-3 py-3"><p className="font-medium">{submission.employeeName}</p><p className="text-xs text-muted-foreground">{submission.employeeCode}</p></td><td className="px-3 py-3">{submission.department || '—'}</td><td className="px-3 py-3"><Badge variant="outline">{submission.language.toUpperCase()}</Badge></td><td className="px-5 py-3 text-right"><Button variant="outline" className="h-9 gap-2" disabled={busyId === submission.id} onClick={() => void downloadReport(submission)}>{busyId === submission.id ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}{t('Excel')}</Button></td></tr>)}</tbody></table></div>
        <div className="divide-y md:hidden">{visibleSubmissions.map((submission) => <article key={submission.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{submission.employeeName}</p><p className="text-sm text-muted-foreground">{submission.employeeCode} · {submission.department || '—'}</p></div><Badge variant="outline">{submission.language.toUpperCase()}</Badge></div><div className="flex items-center justify-between gap-3"><div><p className="text-sm">{formatDate(submission.reportDate, language)}</p><p className="text-xs text-muted-foreground">{formatDateTime(submission.submittedAt, language)}</p></div><Button variant="outline" className="h-9 gap-2" disabled={busyId === submission.id} onClick={() => void downloadReport(submission)}>{busyId === submission.id ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}{t('Excel')}</Button></div></article>)}</div>
      </> : <CardContent className="grid min-h-44 place-items-center p-8 text-center"><div><FileSpreadsheet className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-2 font-medium">{loading ? t('กำลังโหลดข้อมูล…') : t('ยังไม่มีรายงาน')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เมื่อพนักงานส่งแบบฟอร์ม รายงานจะแสดงที่นี่')}</p></div></CardContent>}
    </Card>

    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><ClipboardPenLine size={19} /></div><DialogTitle>{t(editor?.form ? 'แก้ไขแบบฟอร์ม' : 'เพิ่มแบบฟอร์ม Hiyari Hat')}</DialogTitle><DialogDescription>{t('ผู้ใช้งานเปิดลิงก์ได้โดยไม่ต้องเข้าสู่ระบบ')}</DialogDescription></DialogHeader>
      {editor && <form onSubmit={saveForm} className="space-y-4"><div className="grid gap-1.5"><Label htmlFor="hiyari-title">{t('ชื่อแบบฟอร์ม')} *</Label><Input id="hiyari-title" required maxLength={200} value={editor.draft.title} onChange={(event) => setEditor((current) => current && ({ ...current, draft: { ...current.draft, title: event.target.value } }))} /></div><div className="grid gap-1.5"><Label htmlFor="hiyari-description">{t('รายละเอียด')}</Label><Textarea id="hiyari-description" rows={3} maxLength={2000} value={editor.draft.description} onChange={(event) => setEditor((current) => current && ({ ...current, draft: { ...current.draft, description: event.target.value } }))} /></div><p className="rounded-xl bg-[#f6f9f8] p-3 text-sm text-muted-foreground">{t('ผู้กรอกเลือกภาษาไทย อังกฤษ หรือพม่า และไฟล์ Excel จะใช้ภาษาเดียวกับที่เลือก')}</p><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" className="h-10" onClick={() => setEditor(null)}>{t('ยกเลิก')}</Button><Button type="submit" className="h-10 gap-2" disabled={saving}>{saving && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div></form>}
    </DialogContent></Dialog>
    {share && <ShareLinkDialog kind="hiyari" token={share.token} title={share.title} open onOpenChange={(open) => !open && setShare(null)} />}
  </div>
}

function HiyariMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return <Card className="rounded-2xl border-[#e8eeee]"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Icon size={19} /></div></CardContent></Card>
}
