import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BookOpenText, FileImage, FileText, LoaderCircle, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { TrainingMaterial } from '@/lib/types'
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'

export function TrainingMaterialsPage() {
  const { t } = useI18n()
  const [materials, setMaterials] = useState<TrainingMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ material: TrainingMaterial | null; key: string } | null>(null)
  const [share, setShare] = useState<TrainingMaterial | null>(null)
  const [busyId, setBusyId] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    api.trainingMaterials().then(({ materials: rows }) => setMaterials(rows)).catch((error) => toast.error(error instanceof Error ? t(error.message) : t('โหลดสื่ออบรมไม่สำเร็จ'))).finally(() => setLoading(false))
  }, [t])
  useEffect(refresh, [refresh])

  async function toggleActive(material: TrainingMaterial) {
    const body = new FormData()
    body.set('title', material.title)
    body.set('description', material.description)
    body.set('isActive', String(!material.isActive))
    setBusyId(material.id)
    try { await api.updateTrainingMaterial(material.id, body); toast.success(t(material.isActive ? 'ปิดลิงก์สื่อแล้ว' : 'เปิดลิงก์สื่อแล้ว')); refresh() }
    catch (error) { toast.error(error instanceof Error ? t(error.message) : t('บันทึกไม่สำเร็จ')) }
    finally { setBusyId('') }
  }

  async function remove(material: TrainingMaterial) {
    if (!window.confirm(`${t('ลบสื่ออบรม')} “${material.title}”?`)) return
    try { await api.deleteTrainingMaterial(material.id); toast.success(t('ลบสื่ออบรมแล้ว')); refresh() }
    catch (error) { toast.error(error instanceof Error ? t(error.message) : t('ลบสื่ออบรมไม่สำเร็จ')) }
  }

  return <div className="space-y-5">
    <div><p className="text-sm font-medium text-primary">{t('สื่อการเรียนรู้')}</p><h2 className="mt-1 font-semibold tracking-tight">{t('เอกสารและสื่ออบรม')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('แนบรูปหรือ PDF แล้วส่งลิงก์หรือ QR Code ให้พนักงานเปิดดูได้ทันที')}</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><MaterialMetric label={t('สื่อทั้งหมด')} value={materials.length} icon={BookOpenText} /><MaterialMetric label={t('เปิดให้เข้าดู')} value={materials.filter((material) => material.isActive).length} icon={QrCode} /></div>
    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]"><CardHeader className="flex flex-col gap-3 border-b border-[#edf0f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{t('คลังสื่ออบรม')}</CardTitle><CardDescription>{t('ลิงก์สาธารณะเปิดดูได้โดยไม่ต้องลงชื่อเข้าใช้')}</CardDescription></div><Button onClick={() => setEditor({ material: null, key: 'new' })} className="w-full gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มสื่ออบรม')}</Button></CardHeader>
      {materials.length ? <div className="divide-y">{materials.map((material) => <article key={material.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f3] text-primary">{material.mimeType === 'application/pdf' ? <FileText size={19} /> : <FileImage size={19} />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{material.title}</h3><Badge variant="outline" className={material.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{t(material.isActive ? 'เปิดเผยแพร่' : 'ปิดลิงก์')}</Badge><Badge variant="outline">{material.mimeType === 'application/pdf' ? 'PDF' : 'Image'}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{material.description || material.originalName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{material.originalName}</p></div></div>
        <div className="flex flex-wrap gap-2 sm:justify-end"><Button variant="outline" onClick={() => setEditor({ material, key: material.id })} className="h-10 gap-1.5"><Pencil size={15} /> {t('แก้ไข')}</Button><Button variant="outline" disabled={busyId === material.id} onClick={() => toggleActive(material)} className="h-10">{busyId === material.id ? <LoaderCircle size={15} className="animate-spin" /> : t(material.isActive ? 'ปิดลิงก์' : 'เผยแพร่')}</Button>{material.isActive && <Button variant="outline" onClick={() => setShare(material)} className="h-10 gap-1.5"><QrCode size={15} /> {t('ลิงก์ / QR')}</Button>}<Button variant="outline" size="icon" onClick={() => remove(material)} aria-label={t('ลบสื่ออบรม')} className="h-10 w-10 text-destructive hover:text-destructive"><Trash2 size={16} /></Button></div>
      </article>)}</div> : <CardContent className="grid min-h-48 place-items-center text-center"><div><p className="font-medium">{loading ? t('กำลังโหลดสื่ออบรม…') : t('ยังไม่มีสื่ออบรม')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่มเอกสารหรือสื่อเพื่อสร้างลิงก์ให้ผู้ใช้')}</p></div></CardContent>}
    </Card>
    <TrainingMaterialEditor key={editor?.key || 'closed'} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh() }} />
    {share && <ShareLinkDialog kind="training" token={share.token} title={share.title} open onOpenChange={(open) => !open && setShare(null)} />}
  </div>
}

function MaterialMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BookOpenText }) { return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Icon size={19} /></div></CardContent></Card> }

function TrainingMaterialEditor({ editor, onClose, onSaved }: { editor: { material: TrainingMaterial | null } | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const material = editor?.material
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const body = new FormData(formElement)
    const uploadedFile = body.get('file')
    if (!material && (!(uploadedFile instanceof File) || uploadedFile.size === 0)) return toast.error(t('เลือกไฟล์รูปหรือ PDF'))
    body.set('isActive', String(material?.isActive ?? true))
    setBusy(true)
    try {
      if (material) { await api.updateTrainingMaterial(material.id, body); toast.success(t('บันทึกสื่ออบรมแล้ว')) }
      else { await api.createTrainingMaterial(body); toast.success(t('เพิ่มสื่ออบรมแล้ว')) }
      onSaved()
    } catch (error) { toast.error(error instanceof Error ? t(error.message) : t('บันทึกสื่ออบรมไม่สำเร็จ')) }
    finally { setBusy(false) }
  }
  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><BookOpenText size={19} /></div><DialogTitle>{t(material ? 'แก้ไขสื่ออบรม' : 'เพิ่มสื่ออบรม')}</DialogTitle><DialogDescription>{t('แนบรูปหรือไฟล์ PDF แล้วแชร์ลิงก์ให้ผู้ใช้เปิดได้โดยไม่ต้อง login')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4"><div className="grid gap-1.5"><Label htmlFor="training-title">{t('ชื่อสื่อ')} *</Label><Input id="training-title" name="title" defaultValue={material?.title || ''} maxLength={200} required /></div><div className="grid gap-1.5"><Label htmlFor="training-description">{t('รายละเอียด')}</Label><Textarea id="training-description" name="description" defaultValue={material?.description || ''} rows={3} maxLength={2000} /></div>
      <div className="grid gap-1.5"><Label htmlFor="training-file">{t(material ? 'เปลี่ยนไฟล์ (ไม่บังคับ)' : 'ไฟล์รูปหรือ PDF')} {!material && '*'}</Label><Input id="training-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" required={!material} onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} className="h-auto min-h-12 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm" /><p className="text-sm text-muted-foreground">{fileName || (material ? `${t('ไฟล์ปัจจุบัน')}: ${material.originalName}` : t('รองรับ PDF, JPG, PNG และ WebP ขนาดไม่เกิน 25 MB'))}</p></div>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div></form>
    </DialogContent></Dialog>
}
