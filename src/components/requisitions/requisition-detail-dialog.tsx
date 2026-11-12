import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, CircleCheck, CircleDashed, Clock, LoaderCircle, Minus, Plus, Printer, ReceiptText, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import { refreshBadges } from '@/lib/use-badges'
import type { RequisitionDetail, RequisitionStep } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { printIssueSlip } from '@/lib/issue-slip'
import { printRequisitionForm } from '@/lib/requisition-form'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImageViewer, ItemThumb } from '@/components/item-thumb'
import { useConfirm } from '@/components/confirm-provider'
import { StatusBadge } from '@/components/requisitions/status-badge'

const eventLabel: Record<string, string> = {
  submitted: 'ส่งใบเบิก', approved: 'อนุมัติ', approved_all: 'อนุมัติครบทุกขั้นตอน', step_skipped: 'ข้ามขั้นตอน', fallback_admin: 'ส่งให้ผู้ดูแลระบบ',
  qty_changed: 'ปรับจำนวนที่อนุมัติ', rejected: 'ไม่อนุมัติ', changes_requested: 'ส่งกลับให้แก้ไข', cancelled: 'ยกเลิก', force_cancelled: 'ผู้ดูแลระบบยกเลิก',
  resubmitted: 'ส่งใหม่หลังแก้ไข', issued: 'จ่ายของ', closed: 'ปิดรายการค้างจ่าย', returned: 'รับคืนของ', received: 'ยืนยันรับของ', reassigned: 'เปลี่ยนผู้อนุมัติ',
  expired: 'หมดอายุ', escalated: 'ส่งต่อเมื่อเกินเวลา', photo_added: 'แนบรูป', photo_removed: 'ลบรูป',
}
const noteLabel: Record<string, string> = { skipped_self: 'ผู้เบิกเป็นผู้อนุมัติเอง จึงข้ามขั้นนี้', skipped_no_approver: 'ไม่มีผู้อนุมัติ จึงข้ามขั้นนี้' }

type Props = {
  id: string | null
  user: User
  onClose: () => void
  /** Called after any change so the list behind the dialog can refresh. */
  onChanged?: () => void
  /** Context-specific buttons (cancel, approve, issue, …). */
  actions?: (ctx: { detail: RequisitionDetail; reload: () => Promise<void>; close: () => void }) => ReactNode
}

/** Read view of one requisition: lines, photos, approval steps and the timeline, with caller-supplied actions. */
export function RequisitionDetailDialog({ id, user, onClose, onChanged, actions }: Props) {
  const { t, language } = useI18n()
  const [detail, setDetail] = useState<RequisitionDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    try { setDetail((await requisitionApi.get(id)).requisition); onChanged?.(); refreshBadges() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'โหลดใบเบิกไม่สำเร็จ')) }
  }, [id, onChanged, t])

  useEffect(() => {
    setDetail(null)
    if (!id) return
    setLoading(true)
    requisitionApi.get(id).then(({ requisition }) => setDetail(requisition))
      .catch((error) => { toast.error(t(error instanceof Error ? error.message : 'โหลดใบเบิกไม่สำเร็จ')); onClose() })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return <Dialog open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader>
      <div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><ReceiptText size={19} /></div>
      <DialogTitle className="flex flex-wrap items-center gap-2">{detail?.number ?? t('ใบเบิก')}{detail && <StatusBadge status={detail.status} />}</DialogTitle>
      <DialogDescription>{detail ? `${detail.requesterName}${detail.department ? ` · ${detail.department}` : ''} · ${detail.warehouseName}` : ''}</DialogDescription>
    </DialogHeader>
    {!detail || loading ? <div className="grid min-h-40 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div> : <div className="space-y-5">
      <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent" onClick={() => { if (!printRequisitionForm(detail, t, language)) toast.error(t('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป')) }}><Printer size={15} />{t('พิมพ์แบบฟอร์มเบิก')}</button>
      {detail.lines.some((line) => line.qtyIssued > 0) && <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent" onClick={() => { if (!printIssueSlip(detail, t, language)) toast.error(t('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป')) }}><Printer size={15} />{t('พิมพ์ใบจ่ายของ')}</button>}
      <section className="grid gap-2 rounded-xl border border-border bg-surface-subtle p-3 text-sm sm:grid-cols-2">
        <div><p className="text-xs text-muted-foreground">{t('เหตุผลการเบิก')}</p><p className="whitespace-pre-wrap">{detail.reason}</p></div>
        <div className="grid grid-cols-2 gap-2">
          <div><p className="text-xs text-muted-foreground">{t('ส่งเมื่อ')}</p><p>{formatDateTime(detail.submittedAt, language, false)}</p></div>
          <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock size={12} />{t('ต้องการภายใน')}</p><p>{detail.neededBy ? formatDate(detail.neededBy, language) : '—'}</p></div>
        </div>
      </section>

      <section className="space-y-2"><h3 className="text-sm font-semibold">{t('รายการสินค้า')}</h3>
        <ul className="divide-y divide-border-subtle rounded-xl border border-border">{detail.lines.map((line) => <li key={line.id} className="flex items-center gap-3 p-3">
          <ItemThumb url={line.imageUrl} name={line.name} size={48} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}{line.variantLabel && <span className="font-normal text-muted-foreground"> · {line.variantLabel}</span>}</p>
            <p className="text-xs text-muted-foreground">{line.sku} · {line.unit}</p></div>
          <div className="flex flex-wrap justify-end gap-1 text-xs">
            <Badge variant="outline">{t('ขอ')} {line.qtyRequested}</Badge>
            {line.qtyApproved !== line.qtyRequested && <Badge variant="outline" className="border-warning/25 bg-warning/10 text-warning">{t('อนุมัติ')} {line.qtyApproved}</Badge>}
            {line.qtyIssued > 0 && <Badge variant="outline" className="border-success/25 bg-success/10 text-success">{t('จ่ายแล้ว')} {line.qtyIssued}</Badge>}
            {line.qtyReturned > 0 && <Badge variant="outline" className="border-info/20 bg-info/10 text-info">{t('คืน')} {line.qtyReturned}</Badge>}
          </div>
        </li>)}</ul></section>

      <PhotoGallery detail={detail} user={user} onChanged={reload} />

      <section className="space-y-2"><h3 className="text-sm font-semibold">{t('ขั้นตอนการอนุมัติ')}</h3>
        <ol className="space-y-2">{detail.steps.map((step) => <StepRow key={step.position} step={step} />)}</ol></section>

      <section className="space-y-2"><h3 className="text-sm font-semibold">{t('ประวัติการดำเนินการ')}</h3>
        <ol className="space-y-3 border-l border-border pl-4">{detail.events.map((event) => <li key={event.id} className="relative text-sm">
          <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
          <p><span className="font-medium">{t(eventLabel[event.action] ?? event.action)}</span>{event.actorName && <span className="text-muted-foreground"> · {event.actorName}</span>}</p>
          {event.comment && <p className="whitespace-pre-wrap text-muted-foreground">{noteLabel[event.comment] ? t(noteLabel[event.comment]) : event.comment}</p>}
          <p className="text-xs text-muted-foreground">{formatDateTime(event.at, language, false)}</p>
        </li>)}</ol></section>

      {actions && <div className="flex flex-wrap justify-end gap-2 border-t pt-4">{actions({ detail, reload, close: onClose })}</div>}
    </div>}
  </DialogContent></Dialog>
}

function StepRow({ step }: { step: RequisitionStep }) {
  const { t } = useI18n()
  const done = step.mode === 'all' ? step.approvals.length : undefined
  const Icon = step.status === 'approved' ? CircleCheck : step.status === 'active' ? Clock : step.status === 'skipped' ? Minus : CircleDashed
  const tone = step.status === 'approved' ? 'text-success' : step.status === 'active' ? (step.overdue ? 'text-warning' : 'text-info') : 'text-muted-foreground'
  return <li className="flex items-start gap-3 rounded-xl border border-border p-3">
    <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
    <div className="min-w-0 flex-1 text-sm">
      <p className="font-medium">{step.position}. {step.name}{step.status === 'skipped' && <span className="font-normal text-muted-foreground"> · {t('ข้าม')}</span>}</p>
      {step.status !== 'skipped' && step.approvers.length > 0 && <p className="text-xs text-muted-foreground">{step.approvers.map((approver) => approver.name).join(', ')}{done !== undefined && step.status === 'active' ? ` · ${t('อนุมัติแล้ว')} ${done}/${step.approvers.length}` : ''}</p>}
      {step.status === 'active' && step.overdue && <Badge variant="outline" className="mt-1 border-warning/25 bg-warning/10 text-warning">{t('เกินเวลาที่กำหนด')}</Badge>}
      {step.escalated && <Badge variant="outline" className="mt-1 ml-1">{t('ส่งต่อแล้ว')}</Badge>}
    </div>
  </li>
}

function PhotoGallery({ detail, user, onChanged }: { detail: RequisitionDetail; user: User; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [view, setView] = useState<{ url: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const editable = detail.requesterId === user.id && ['in_approval', 'returned_for_edit'].includes(detail.status)
  if (detail.photos.length === 0 && !editable) return null

  async function add(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length || busy) return
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'create', title: t('ยืนยันการแนบรูป'), description: `${files.length} ${t('รูป')}` }))) return
      await requisitionApi.addPhotos(detail.id, files)
      toast.success(t('แนบรูปแล้ว'))
      await onChanged()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'แนบรูปไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  async function remove(photoId: string) {
    if (busy) return
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'danger', title: t('ลบรูป'), description: t('รูปนี้จะถูกลบออกจากใบเบิก'), confirmLabel: t('ลบรูป') }))) return
      await requisitionApi.removePhoto(detail.id, photoId)
      await onChanged()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบรูปไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <section className="space-y-2"><h3 className="text-sm font-semibold">{t('รูปแนบ')} ({detail.photos.length}/6)</h3>
    <div className="flex flex-wrap gap-2">
      {detail.photos.map((photo) => <div key={photo.id} className="relative size-20 overflow-hidden rounded-lg border border-border">
        <button type="button" onClick={() => setView({ url: photo.url, name: photo.originalName })} className="size-full" aria-label={photo.originalName}><img src={photo.thumbUrl} alt={photo.originalName} loading="lazy" className="size-full object-cover" /></button>
        {editable && <button type="button" disabled={busy} onClick={() => void remove(photo.id)} aria-label={t('ลบรูป')} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X size={13} /></button>}
      </div>)}
      {editable && detail.photos.length < 6 && <label className={`grid size-20 cursor-pointer place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-surface-subtle ${busy ? 'opacity-50' : ''}`}>
        <span className="grid place-items-center gap-1 text-xs"><Plus size={18} />{t('เพิ่มรูป')}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden disabled={busy} onChange={(event) => { void add(event.target.files); event.target.value = '' }} /></label>}
    </div>
    {view && <ImageViewer open onOpenChange={(open) => !open && setView(null)} url={view.url} title={view.name} />}
  </section>
}
