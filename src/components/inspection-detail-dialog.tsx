import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Camera, Check, ChevronRight, ImagePlus, LoaderCircle, RotateCcw, UserRound, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate, formatDateTime } from '@/lib/api'
import type { Assignee, Inspection, InspectionResponse, User } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/i18n'

type Props = { id: string | null; user: User; onOpenChange: (open: boolean) => void; onUpdated?: () => void }

const actionStatuses = ['ยังไม่แก้ไข', 'กำลังแก้ไข', 'แก้ไขแล้ว']

export function InspectionDetailDialog({ id, user, onOpenChange, onUpdated }: Props) {
  const { language, t } = useI18n()
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InspectionResponse | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<InspectionResponse['photos'][number] | null>(null)

  useEffect(() => {
    if (!id) { setInspection(null); return }
    setLoading(true)
    api.inspection(id).then(({ inspection: result }) => setInspection(result)).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [id])

  function handleSaved(updated: Inspection) {
    setInspection(updated)
    setSelectedItem(null)
    onUpdated?.()
  }

  return <Dialog open={Boolean(id)} onOpenChange={onOpenChange}>
    <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-5xl">
      <DialogHeader className="border-b border-border-subtle px-5 py-5 pr-12 sm:px-7 sm:pr-14">
        <div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-secondary text-primary"><Camera size={18} /></div><div><DialogTitle className="text-base">{t('รายละเอียดการตรวจ')}</DialogTitle><DialogDescription className="mt-1 text-xs">{t('ดูผลตรวจ หลักฐาน และความคืบหน้าการแก้ไข')}</DialogDescription></div></div>
      </DialogHeader>
      {loading || !inspection ? <div className="grid min-h-48 place-items-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={16} /> {t('กำลังโหลดรายละเอียด…')}</span></div> : <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-5 sm:px-7">
        <div className="grid gap-3 rounded-xl bg-surface-subtle p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label={t('วันและเวลาตรวจ')} value={`${formatDate(inspection.date, language)} · ${inspection.time || '—'} ${t('น.')}`} />
          <Meta label={t('ผู้ตรวจ')} value={inspection.inspector} />
          <Meta label={t('แผนก / พื้นที่')} value={inspection.area} />
          <Meta label={t('กะ / รหัส')} value={`${inspection.shift} · ${inspection.employeeCode || '—'}`} />
        </div>
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">{t('ผลตรวจรายหัวข้อ')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('บันทึกเมื่อ')} {formatDateTime(inspection.createdAt, language)}</p></div><div className="flex gap-2"><Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-destructive">NG {inspection.items.filter((item) => item.result === 'NG').length}</Badge><Badge variant="outline" className="border-success/25 bg-success/10 text-success">OK {inspection.items.filter((item) => item.result === 'OK').length}</Badge></div></div>
        <div className="space-y-2.5">{inspection.items.map((item) => {
          const isAssignedToUser = item.responsibleUserId === user.id || [user.name, user.employeeCode].some((value) => value && value.trim().toLocaleLowerCase() === item.responsible.trim().toLocaleLowerCase())
          const canManage = user.role === 'admin' || (isAssignedToUser && item.followUpStatus !== 'แก้ไขแล้ว')
          return <ResponseCard key={item.id} item={item} canManage={canManage} manageLabel={user.role === 'admin' ? 'จัดการงาน' : 'อัปเดตงานของฉัน'} onManage={() => setSelectedItem(item)} onPhotoClick={setSelectedPhoto} />
        })}</div>
        <div className="flex justify-end border-t border-border-subtle pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>{t('ปิด')}</Button></div>
      </div>}
      <IssueUpdateDialog item={selectedItem} user={user} onOpenChange={(open) => { if (!open) setSelectedItem(null) }} onSaved={handleSaved} />
    </DialogContent>
    <PhotoPreviewDialog photo={selectedPhoto} onOpenChange={(open) => { if (!open) setSelectedPhoto(null) }} />
  </Dialog>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-medium">{value}</p></div>
}

function ResponseCard({ item, canManage, manageLabel, onManage, onPhotoClick }: { item: InspectionResponse; canManage: boolean; manageLabel: string; onManage: () => void; onPhotoClick: (photo: InspectionResponse['photos'][number]) => void }) {
  const { language, t } = useI18n()
  const isNg = item.result === 'NG'
  const statusClass = item.followUpStatus === 'แก้ไขแล้ว' ? 'border-success/25 bg-success/10 text-success' : item.followUpStatus === 'กำลังแก้ไข' ? 'border-info/20 bg-info/10 text-info' : 'border-warning/25 bg-warning/10 text-warning'
  return <Card className={`rounded-xl p-4 ${isNg ? 'border-destructive/20 bg-card' : 'border-border bg-white'}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-3"><span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold ${isNg ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{item.order}</span><div className="min-w-0"><p className="text-xs font-semibold">{t(item.title)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(item.description)}</p></div></div>
      <Badge variant="outline" className={isNg ? 'border-destructive/25 bg-destructive/10 text-destructive' : item.result === 'OK' ? 'border-success/25 bg-success/10 text-success' : 'border-border bg-surface-subtle text-muted-foreground'}>{item.result}</Badge>
    </div>
    {isNg && <div className="ml-10 mt-3 space-y-3 border-l-2 border-destructive/20 pl-3">
      <p className="text-xs leading-5 text-foreground">{item.issueDetails}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound size={12} /> {item.responsible}</span>{item.dueDate && <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {t('กำหนด')} {formatDate(item.dueDate, language)}</span>}{item.resolutionNote && <span className="inline-flex items-center gap-1"><Check size={12} /> {item.resolutionNote}</span>}</div>
      <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className={statusClass}>{t(item.followUpStatus)}</Badge>{canManage && <Button variant="outline" size="sm" onClick={onManage} className="h-9 gap-1.5 text-xs"><ChevronRight size={15} /> {t(manageLabel)}</Button>}</div>
      {item.photos.length > 0 && <div className="flex flex-wrap gap-2">{item.photos.map((photo) => <button key={photo.id} type="button" onClick={() => onPhotoClick(photo)} aria-label={`${t('เปิดรูปขนาดใหญ่')}: ${photo.name}`} className="group relative block size-20 overflow-hidden rounded-lg border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:size-24"><img src={photo.url} alt={photo.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /><span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-1 text-center text-xs font-medium text-white">{t(photo.type === 'before' ? 'ก่อนแก้ไข' : 'หลังแก้ไข')}</span></button>)}</div>}
    </div>}
  </Card>
}

function PhotoPreviewDialog({ photo, onOpenChange }: { photo: InspectionResponse['photos'][number] | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [photo?.id])

  function changeZoom(delta: number) { setZoom((current) => Math.min(5, Math.max(1, current + delta))) }
  function resetZoom() { setZoom(1); setOffset({ x: 0, y: 0 }) }

  return <Dialog open={Boolean(photo)} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[94dvh] w-[calc(100vw-1rem)] max-w-[calc(100%-1rem)] gap-3 overflow-hidden p-3 sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:p-5">
      <DialogHeader className="flex flex-row items-center justify-between gap-2 pr-10">
        <div className="min-w-0"><DialogTitle className="truncate text-base">{photo ? t(photo.type === 'before' ? 'ก่อนแก้ไข' : 'หลังแก้ไข') : t('รูปภาพ')}</DialogTitle><DialogDescription className="truncate text-sm">{photo?.name}</DialogDescription></div>
        <div className="flex shrink-0 items-center gap-1"><Button type="button" variant="outline" size="icon" aria-label={t('ย่อรูป')} onClick={() => changeZoom(-0.25)} disabled={zoom <= 1}><ZoomOut size={17} /></Button><span className="min-w-12 text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span><Button type="button" variant="outline" size="icon" aria-label={t('ขยายรูป')} onClick={() => changeZoom(0.25)} disabled={zoom >= 5}><ZoomIn size={17} /></Button><Button type="button" variant="ghost" size="icon" aria-label={t('ขนาดพอดี')} onClick={resetZoom}><RotateCcw size={16} /></Button></div>
      </DialogHeader>
      <div className="flex h-[calc(88dvh-5rem)] min-h-[40dvh] touch-none items-center justify-center overflow-auto rounded-lg bg-[#101719] p-2 sm:h-[calc(90dvh-6rem)] sm:p-4" onPointerDown={(event) => { if (zoom > 1) { dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }; event.currentTarget.setPointerCapture(event.pointerId) } }} onPointerMove={(event) => { if (!dragRef.current) return; setOffset({ x: dragRef.current.offsetX + event.clientX - dragRef.current.x, y: dragRef.current.offsetY + event.clientY - dragRef.current.y }) }} onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }}>
        {photo && <img src={photo.url} alt={photo.name} draggable={false} className={`max-h-full max-w-full select-none object-contain ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center' }} onDoubleClick={() => zoom === 1 ? setZoom(2) : resetZoom()} />}
      </div>
    </DialogContent>
  </Dialog>
}

function IssueUpdateDialog({ item, user, onOpenChange, onSaved }: { item: InspectionResponse | null; user: User; onOpenChange: (open: boolean) => void; onSaved: (inspection: Inspection) => void }) {
  const { language, t } = useI18n()
  const [status, setStatus] = useState('ยังไม่แก้ไข')
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (user.role === 'admin') api.assignees().then(({ assignees: rows }) => setAssignees(rows)).catch(() => undefined) }, [user.role])

  useEffect(() => {
    if (!item) return
    setStatus(item.followUpStatus)
    setDueDate(item.dueDate)
    setNote(item.resolutionNote)
    setFiles([])
  }, [item])

  useEffect(() => {
    if (!item) return
    const current = assignees.find((assignee) => assignee.id === item.responsibleUserId || [assignee.name, assignee.employeeCode].some((value) => value && value.trim().toLocaleLowerCase() === item.responsible.trim().toLocaleLowerCase()))
    setResponsibleUserId(item.responsibleUserId || current?.id || '')
  }, [item, assignees])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!item) return
    const body = new FormData()
    body.set('followUpStatus', status)
    body.set('responsibleUserId', responsibleUserId)
    body.set('dueDate', dueDate)
    body.set('resolutionNote', note)
    files.forEach((file) => body.append('photos', file))
    setBusy(true)
    try {
      const { inspection } = await api.updateResponse(item.id, body)
      toast.success(t(status === 'แก้ไขแล้ว' ? 'ปิดรายการแก้ไขแล้ว' : 'บันทึกความคืบหน้าแล้ว'))
      onSaved(inspection)
      onOpenChange(false)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'))
    } finally { setBusy(false) }
  }

  return <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle className="text-base">{t('ติดตามการแก้ไข')}</DialogTitle><DialogDescription className="text-xs">{item && t(item.title)} · {t('แนบรูปหลังแก้ไขเพื่อปิดงาน')}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4 pt-1">
        <div className="grid gap-2"><Label htmlFor="follow-status">{t('สถานะการแก้ไข')}</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="follow-status" className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent>{actionStatuses.map((option) => <SelectItem key={option} value={option}>{t(option)}</SelectItem>)}</SelectContent></Select></div>
        {user.role === 'admin' ? <>
          <div className="grid gap-2"><Label htmlFor="follow-responsible">{t('ผู้รับผิดชอบ')}</Label><Select value={responsibleUserId} onValueChange={setResponsibleUserId}><SelectTrigger id="follow-responsible" className="h-10 w-full"><SelectValue placeholder={t('เลือกบัญชีผู้รับผิดชอบ')} /></SelectTrigger><SelectContent>{assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.employeeCode}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{t('เลือกบัญชีที่ผู้รับผิดชอบใช้เข้าสู่ระบบ')}</p></div>
          <div className="grid gap-2"><Label htmlFor="follow-due">{t('กำหนดเสร็จ')}</Label><DatePicker id="follow-due" ariaLabel={t('กำหนดเสร็จ')} value={dueDate} onChange={setDueDate} clearable placeholder={t('เลือกวัน')} /></div>
        </> : <div className="grid gap-2 sm:grid-cols-2"><div><Label>{t('ผู้รับผิดชอบ')}</Label><p className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">{item?.responsible}</p></div><div><Label>{t('กำหนดเสร็จ')}</Label><p className="mt-2 rounded-md border bg-muted px-3 py-2 text-sm">{item?.dueDate ? formatDate(item.dueDate, language) : '—'}</p></div></div>}
        <div className="grid gap-2"><Label htmlFor="resolution-note">{t('บันทึกการแก้ไข')}</Label><Textarea id="resolution-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={t('อธิบายวิธีแก้ไขหรือสิ่งที่ต้องตรวจซ้ำ')} /></div>
        <div className="grid gap-2"><Label htmlFor="after-photos">{t('รูปหลังแก้ไข')}</Label><label htmlFor="after-photos" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-surface-subtle p-3 text-xs text-muted-foreground hover:border-primary/50"><ImagePlus size={18} className="text-primary" /><span>{files.length ? `${t('เลือกแล้ว')} ${files.length} ${t('รูป')}` : t('เพิ่มรูปจากกล้องหรืออุปกรณ์')}</span><input id="after-photos" type="file" accept="image/*" multiple capture="environment" onChange={(event) => setFiles(Array.from(event.target.files || []))} className="sr-only" /></label>{item?.photos.some((photo) => photo.type === 'after') && <p className="text-xs text-muted-foreground">{t('มีรูปหลังแก้ไขบันทึกไว้แล้ว')}</p>}</div>
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy || (user.role === 'admin' && !responsibleUserId)} className="gap-2">{busy && <LoaderCircle size={14} className="animate-spin" />} {t('บันทึก')}</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}
