import { useEffect, useState } from 'react'
import { ArrowRight, LoaderCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { localDateString } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import { refreshBadges } from '@/lib/use-badges'
import type { Cart, RequisitionDetail, RequisitionType } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { useConfirm } from '@/components/confirm-provider'
import { PhotoPicker } from '@/components/requisitions/photo-picker'

type WarehouseOption = { id: string; code: string; name: string; total: number; covered: number }
type Route = Awaited<ReturnType<typeof requisitionApi.routePreview>>['route']
type Props = { open: boolean; type: RequisitionType; cart: Cart | null; onClose: () => void; onDone: (detail: RequisitionDetail) => void }

const noteText: Record<string, string> = {
  fallback_admin: 'ไม่พบหัวหน้างานของแผนกคุณ จึงส่งให้ผู้ดูแลระบบอนุมัติ',
  skipped_self: 'ขั้นนี้ข้ามไปเพราะคุณเป็นผู้อนุมัติเอง',
  skipped_no_approver: 'ไม่มีผู้อนุมัติ ขั้นนี้จะถูกข้าม',
}

export function CheckoutDialog({ open, type, cart, onClose, onDone }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [reason, setReason] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [route, setRoute] = useState<Route | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    requisitionApi.warehouses(type).then(({ warehouses: rows }) => {
      setWarehouses(rows)
      setWarehouseId((current) => (rows.some((row) => row.id === current) ? current : rows[0]?.id ?? ''))
    }).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายชื่อคลังไม่สำเร็จ')))
  }, [open, type, t])

  useEffect(() => {
    if (!open || !warehouseId) { setRoute(null); return }
    requisitionApi.routePreview(type, warehouseId).then(({ route: result }) => setRoute(result)).catch(() => setRoute(null))
  }, [open, type, warehouseId])

  const selected = warehouses.find((warehouse) => warehouse.id === warehouseId)
  const lines = cart?.lines ?? []

  async function submit() {
    if (busy) return
    if (!warehouseId) return toast.error(t('กรุณาเลือกคลัง'))
    if (!reason.trim()) return toast.error(t('กรุณาระบุเหตุผลการเบิก'))
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการส่งใบเบิก'), description: `${lines.length} ${t('รายการ')} · ${t('ส่งให้ผู้อนุมัติพิจารณา')}`, confirmLabel: t('ส่งใบเบิก') }))) return
      const { requisition } = await requisitionApi.checkout({ type, warehouseId, reason: reason.trim(), neededBy })
      let detail = requisition
      if (photos.length) {
        try { detail = (await requisitionApi.addPhotos(requisition.id, photos)).requisition } catch (error) {
          toast.warning(t(error instanceof Error ? error.message : 'ส่งใบเบิกแล้ว แต่แนบรูปไม่สำเร็จ'), { description: t('เปิดใบเบิกเพื่อแนบรูปอีกครั้ง') })
        }
      }
      toast.success(`${t('ส่งใบเบิกแล้ว')} ${detail.number}`)
      refreshBadges()
      setReason(''); setNeededBy(''); setPhotos([])
      onDone(detail)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ส่งใบเบิกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Send size={19} /></div>
      <DialogTitle>{t('ส่งใบเบิก')}</DialogTitle><DialogDescription>{lines.length} {t('รายการ')} · {lines.reduce((sum, line) => sum + line.qty, 0)} {t('ชิ้นรวม')}</DialogDescription></DialogHeader>
    <div className="grid gap-4">
      <div className="grid gap-1.5"><Label>{t('เบิกจากคลัง')}</Label>
        <Select value={warehouseId} onValueChange={(value) => value && setWarehouseId(value)}><SelectTrigger className="h-10 w-full" aria-label={t('เบิกจากคลัง')}><SelectValue placeholder={t('เลือกคลัง')}>{selected ? `${selected.code} · ${selected.name}` : undefined}</SelectValue></SelectTrigger>
          <SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name} ({warehouse.covered}/{warehouse.total} {t('รายการมีสต็อก')})</SelectItem>)}</SelectContent></Select>
        {selected && selected.covered < selected.total && <p className="text-xs text-warning">{t('คลังนี้มีสต็อกไม่ครบทุกรายการ หัวหน้างานอาจลดจำนวนหรือรอสต็อกเพิ่ม')}</p>}
        {warehouses.length === 0 && <p className="text-xs text-destructive">{t('ยังไม่มีคลังที่เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ')}</p>}</div>
      <div className="grid gap-1.5"><Label htmlFor="req-reason">{t('เหตุผลการเบิก')} <span className="text-destructive">*</span></Label>
        <Textarea id="req-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} placeholder={t('เช่น ถุงมือเดิมชำรุด ต้องใช้ในไลน์ผลิต')} /></div>
      <div className="grid gap-1.5"><Label>{t('ต้องการใช้ภายในวันที่')} ({t('ไม่บังคับ')})</Label>
        <DatePicker value={neededBy} onChange={setNeededBy} minDate={localDateString()} placeholder={t('เลือกวันที่')} ariaLabel={t('ต้องการใช้ภายในวันที่')} clearable /></div>
      <div className="grid gap-1.5"><Label>{t('แนบรูป')} ({t('ไม่บังคับ')})</Label><PhotoPicker files={photos} onChange={setPhotos} disabled={busy} /></div>
      {route && route.steps.length > 0 && <section className="rounded-xl border border-border bg-surface-subtle p-3">
        <h3 className="mb-2 text-sm font-semibold">{t('เส้นทางการอนุมัติ')}</h3>
        <ol className="space-y-1.5 text-sm">{route.steps.filter((step) => step.applies).map((step) => <li key={step.position} className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{step.name}</span><ArrowRight size={13} className="text-muted-foreground" />
          <span className="text-muted-foreground">{step.approvers.length ? step.approvers.map((approver) => approver.name).join(', ') : t('ข้ามขั้นนี้')}</span>
          {step.note && <span className="w-full text-xs text-warning">{t(noteText[step.note] ?? '')}</span>}</li>)}</ol>
      </section>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</Button>
        <Button type="button" onClick={submit} disabled={busy || !warehouseId} className="gap-2">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}{t('ส่งใบเบิก')}</Button></div>
    </div>
  </DialogContent></Dialog>
}
