import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BookOpenText, Eye, EyeOff, FileImage, FileText, LoaderCircle, Pencil, Plus, Presentation, QrCode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { TrainingMaterial } from '@/lib/types'
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmActionDialog } from '@/components/confirm-action-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function TrainingMaterialsPage() {
  const { t } = useI18n()
  const [materials, setMaterials] = useState<TrainingMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ material: TrainingMaterial | null; key: string } | null>(null)
  const [share, setShare] = useState<TrainingMaterial | null>(null)
  const [busyId, setBusyId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TrainingMaterial | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pagination = useDataPagination(materials)

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

  async function remove() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try { await api.deleteTrainingMaterial(deleteTarget.id); toast.success(t('ลบสื่ออบรมแล้ว')); setDeleteTarget(null); refresh() }
    catch (error) { toast.error(error instanceof Error ? t(error.message) : t('ลบสื่ออบรมไม่สำเร็จ')) }
    finally { setDeleting(false) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">{t('สื่อการเรียนรู้')}</p><h2 className="page-heading mt-1 font-semibold tracking-tight">{t('เอกสารและสื่ออบรม')}</h2></div><Button onClick={() => setEditor({ material: null, key: 'new' })} className="w-full gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มสื่ออบรม')}</Button></div>
    <Card className="overflow-hidden rounded-2xl border-border">
      {materials.length ? <>
        <div className="overflow-x-auto"><Table className="min-w-[860px]">
          <TableHeader><TableRow><TableHead>{t('ชื่อสื่อ')}</TableHead><TableHead>{t('ประเภทไฟล์')}</TableHead><TableHead>{t('รายละเอียด')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="text-right">{t('การทำรายการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((material) => { const isPdf = material.mimeType === 'application/pdf'; const isPptx = material.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; return <TableRow key={material.id}>
            <TableCell className="min-w-[190px] whitespace-normal"><div className="flex items-center gap-2.5"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">{isPdf ? <FileText size={17} /> : isPptx ? <Presentation size={17} /> : <FileImage size={17} />}</div><span className="font-medium">{material.title}</span></div></TableCell>
            <TableCell><div className="flex gap-1.5"><Badge variant="outline">{isPdf ? 'PDF' : isPptx ? 'PPTX' : t('รูปภาพ')}</Badge>{material.companionOriginalName && <Badge variant="outline" className="gap-1"><Presentation size={12} /> PPTX</Badge>}</div></TableCell>
            <TableCell className="min-w-[240px] whitespace-normal"><p>{material.description || t('ไม่มีคำอธิบาย')}</p><p className="mt-1 text-xs text-muted-foreground">{material.originalName}{material.companionOriginalName ? ' · ' + material.companionOriginalName : ''}</p></TableCell>
            <TableCell><Badge variant="outline" className={material.isActive ? 'border-success/25 bg-success/10 text-success' : 'border-info/20 bg-surface-subtle text-info'}>{t(material.isActive ? 'เปิดเผยแพร่' : 'ปิดลิงก์')}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => setEditor({ material, key: material.id })} aria-label={t('แก้ไข')} title={t('แก้ไข')}><Pencil size={16} /></Button><Button variant="ghost" size="icon" disabled={busyId === material.id} onClick={() => toggleActive(material)} aria-label={t(material.isActive ? 'ปิดลิงก์' : 'เผยแพร่')} title={t(material.isActive ? 'ปิดลิงก์' : 'เผยแพร่')}>{busyId === material.id ? <LoaderCircle size={16} className="animate-spin" /> : material.isActive ? <EyeOff size={16} /> : <Eye size={16} />}</Button>{material.isActive && <Button variant="ghost" size="icon" onClick={() => setShare(material)} aria-label={t('ลิงก์ / QR')} title={t('ลิงก์ / QR')}><QrCode size={16} /></Button>}<Button variant="ghost" size="icon" onClick={() => setDeleteTarget(material)} aria-label={t('ลบสื่ออบรม')} title={t('ลบสื่ออบรม')} className="text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 size={16} /></Button></div></TableCell>
          </TableRow>})}</TableBody>
        </Table></div>
        <DataTablePagination total={materials.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div><p className="font-medium">{loading ? t('กำลังโหลดสื่ออบรม…') : t('ยังไม่มีสื่ออบรม')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่มเอกสารหรือสื่อเพื่อสร้างลิงก์ให้ผู้ใช้')}</p></div></CardContent>}
    </Card>
    <TrainingMaterialEditor key={editor?.key || 'closed'} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh() }} />
    {share && <ShareLinkDialog kind="training" token={share.token} title={share.title} open onOpenChange={(open) => !open && setShare(null)} />}
    <ConfirmActionDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }} title={t('ลบสื่ออบรม')} description={deleteTarget ? `“${deleteTarget.title}” · ${t('การลบนี้ไม่สามารถย้อนกลับได้')}` : ''} confirmLabel={t('ลบ')} cancelLabel={t('ยกเลิก')} pending={deleting} onConfirm={remove} />
  </div>
}

function TrainingMaterialEditor({ editor, onClose, onSaved }: { editor: { material: TrainingMaterial | null } | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const material = editor?.material
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const body = new FormData(formElement)
    for (const fieldName of ['file', 'presentation']) {
      const selectedFile = body.get(fieldName)
      if (selectedFile instanceof File && selectedFile.size === 0) body.delete(fieldName)
    }
    const uploadedFile = body.get('file')
    const uploadedPresentation = body.get('presentation')
    const hasPrimaryFile = uploadedFile instanceof File && uploadedFile.size > 0
    const hasPresentation = uploadedPresentation instanceof File && uploadedPresentation.size > 0
    if (!material && !hasPrimaryFile && !hasPresentation) return toast.error(t('เลือกไฟล์อย่างน้อยหนึ่งไฟล์'))
    if (hasPrimaryFile && uploadedFile instanceof File && uploadedFile.name.toLowerCase().endsWith('.pptx') && hasPresentation) return toast.error(t('หากเลือก PowerPoint เป็นไฟล์หลัก ให้เว้นช่อง PowerPoint สำหรับดาวน์โหลดไว้'))
    body.set('isActive', String(material?.isActive ?? true))
    setBusy(true)
    try {
      if (material) { await api.updateTrainingMaterial(material.id, body); toast.success(t('บันทึกสื่ออบรมแล้ว')) }
      else { await api.createTrainingMaterial(body); toast.success(t('เพิ่มสื่ออบรมแล้ว')) }
      onSaved()
    } catch (error) { toast.error(error instanceof Error ? t(error.message) : t('บันทึกสื่ออบรมไม่สำเร็จ')) }
    finally { setBusy(false) }
  }
  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><BookOpenText size={19} /></div><DialogTitle>{t(material ? 'แก้ไขสื่ออบรม' : 'เพิ่มสื่ออบรม')}</DialogTitle><DialogDescription>{t('แนบไฟล์สื่อแล้วแชร์ลิงก์ให้เปิดได้บนคอมพิวเตอร์และมือถือ โดยไม่ต้อง login')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4"><div className="grid gap-1.5"><Label htmlFor="training-title">{t('ชื่อสื่อ')} *</Label><Input id="training-title" name="title" defaultValue={material?.title || ''} maxLength={200} required /></div><div className="grid gap-1.5"><Label htmlFor="training-description">{t('รายละเอียด')}</Label><Textarea id="training-description" name="description" defaultValue={material?.description || ''} rows={3} maxLength={2000} /></div>
      <div className="grid gap-1.5"><Label htmlFor="training-file">{t(material ? 'เปลี่ยนไฟล์หลัก (ไม่บังคับ)' : 'ไฟล์หลักสำหรับเปิดดู')}</Label><Input id="training-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,.jpg,.jpeg,.png,.webp,.pptx" onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} className="h-auto min-h-12 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm" /><p className="text-sm text-muted-foreground">{fileName || (material ? `${t('ไฟล์ปัจจุบัน')}: ${material.originalName}` : t('รองรับ PDF, JPG, PNG, WebP และ PowerPoint ขนาดไม่เกิน 25 MB'))}</p></div>
      <div className="grid gap-1.5"><Label htmlFor="training-presentation">{t('ไฟล์ PowerPoint (แนบเดี่ยวได้)')}</Label><Input id="training-presentation" name="presentation" type="file" accept="application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx" className="h-auto min-h-12 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm" /><p className="text-sm text-muted-foreground">{material?.companionOriginalName ? `${t('ไฟล์ปัจจุบัน')}: ${material.companionOriginalName}` : t('หากแนบ PowerPoint อย่างเดียว ระบบจะแปลงเป็น PDF สำหรับเปิดดูบนมือถือ และเก็บไฟล์ต้นฉบับให้ดาวน์โหลด')}</p></div>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div></form>
    </DialogContent></Dialog>
}
