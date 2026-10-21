import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ClipboardPenLine, LoaderCircle, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { HiyariForm } from '@/lib/types'
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

type HiyariDraft = { title: string; description: string }

export function HiyariPage() {
  const { t } = useI18n()
  const [forms, setForms] = useState<HiyariForm[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editor, setEditor] = useState<{ form: HiyariForm | null; draft: HiyariDraft } | null>(null)
  const [share, setShare] = useState<HiyariForm | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const formData = await api.hiyariForms()
      setForms(formData.forms)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'โหลดรายงาน Hiyari Hat ไม่สำเร็จ'))
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

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

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="shrink-0"><p className="text-sm font-medium text-primary">{t('แบบฟอร์มออนไลน์ Hiyari Hat')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">Hiyari Hat</h2></div>
      <Button onClick={openCreate} className="h-11 w-full shrink-0 gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มแบบฟอร์ม')}</Button>
    </div>

    <Card className="overflow-hidden rounded-2xl border-border">
      <CardHeader className="border-b border-border-subtle px-5 py-4"><CardTitle>{t('แบบฟอร์ม Hiyari Hat')}</CardTitle><CardDescription>{t('แชร์ลิงก์หรือ QR Code ให้พนักงานกรอกได้โดยไม่ต้องเข้าสู่ระบบ')}</CardDescription></CardHeader>
      {forms.length ? <div className="divide-y">{forms.map((form) => <article key={form.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ClipboardPenLine size={19} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{form.title}</h3><Badge variant="outline" className={form.isActive ? 'border-success/25 bg-success/10 text-success' : 'border-info/20 bg-surface-subtle text-info'}>{t(form.isActive ? 'เปิดให้กรอก' : 'ปิดลิงก์')}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{form.description || t('รายงานสภาพหรือเหตุการณ์ที่อาจก่อให้เกิดอุบัติเหตุ')}</p><p className="mt-1 text-sm text-muted-foreground">{form.submissionCount.toLocaleString()} {t('รายงาน')} · {t('ภาษาไทย อังกฤษ และพม่า')}</p></div></div>
        <div className="flex flex-wrap gap-2 sm:justify-end"><Button variant="outline" className="h-10 gap-2" onClick={() => setShare(form)}><QrCode size={16} /> {t('ลิงก์และ QR')}</Button><Button variant="outline" className="h-10 gap-2" onClick={() => openEdit(form)}><Pencil size={15} /> {t('แก้ไข')}</Button><Button variant="outline" className="h-10" disabled={busyId === form.id} onClick={() => void toggleForm(form)}>{busyId === form.id ? <LoaderCircle size={15} className="animate-spin" /> : t(form.isActive ? 'ปิดลิงก์' : 'เปิดลิงก์')}</Button>{form.submissionCount === 0 && <Button variant="outline" size="icon" aria-label={t('ลบแบบฟอร์ม')} className="h-10 w-10 text-destructive hover:text-destructive" onClick={() => void deleteForm(form)}><Trash2 size={15} /></Button>}</div>
      </article>)}</div> : <CardContent className="grid min-h-44 place-items-center p-8 text-center text-sm text-muted-foreground">{loading ? t('กำลังโหลดข้อมูล…') : t('ยังไม่มีแบบฟอร์ม Hiyari Hat')}</CardContent>}
    </Card>

    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><ClipboardPenLine size={19} /></div><DialogTitle>{t(editor?.form ? 'แก้ไขแบบฟอร์ม' : 'เพิ่มแบบฟอร์ม Hiyari Hat')}</DialogTitle><DialogDescription>{t('ผู้ใช้งานเปิดลิงก์ได้โดยไม่ต้องเข้าสู่ระบบ')}</DialogDescription></DialogHeader>
      {editor && <form onSubmit={saveForm} className="space-y-4"><div className="grid gap-1.5"><Label htmlFor="hiyari-title">{t('ชื่อแบบฟอร์ม')} *</Label><Input id="hiyari-title" required maxLength={200} value={editor.draft.title} onChange={(event) => setEditor((current) => current && ({ ...current, draft: { ...current.draft, title: event.target.value } }))} /></div><div className="grid gap-1.5"><Label htmlFor="hiyari-description">{t('รายละเอียด')}</Label><Textarea id="hiyari-description" rows={3} maxLength={2000} value={editor.draft.description} onChange={(event) => setEditor((current) => current && ({ ...current, draft: { ...current.draft, description: event.target.value } }))} /></div><p className="rounded-xl bg-surface-subtle p-3 text-sm text-muted-foreground">{t('ผู้กรอกเลือกภาษาไทย อังกฤษ หรือพม่า และไฟล์ Excel จะใช้ภาษาเดียวกับที่เลือก')}</p><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" className="h-10" onClick={() => setEditor(null)}>{t('ยกเลิก')}</Button><Button type="submit" className="h-10 gap-2" disabled={saving}>{saving && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div></form>}
    </DialogContent></Dialog>
    {share && <ShareLinkDialog kind="hiyari" token={share.token} title={share.title} open onOpenChange={(open) => !open && setShare(null)} />}
  </div>
}
