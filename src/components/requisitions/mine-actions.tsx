import { useState } from 'react'
import { PackageCheck, Pencil, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { requisitionApi } from '@/lib/requisition-api'
import type { RequisitionDetail } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm-provider'
import { ItemThumb } from '@/components/item-thumb'
import { QtyStepper } from '@/components/requisitions/qty-stepper'
import { ReasonDialog } from '@/components/requisitions/reason-dialog'

type Props = { detail: RequisitionDetail; reload: () => Promise<void> }

/** What the requester can do with their own requisition, by status. */
export function MineActions({ detail, reload }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const issued = detail.lines.some((line) => line.qtyIssued > 0)
  const canCancel = ['in_approval', 'returned_for_edit', 'ready_to_issue'].includes(detail.status) && !issued
  const canEdit = detail.status === 'returned_for_edit'
  const canReceive = ['issued', 'closed'].includes(detail.status)

  async function receive() {
    if (busy) return
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการรับของ'), description: `${detail.number}`, confirmLabel: t('ยืนยันรับของ') }))) return
      await requisitionApi.receive(detail.id)
      toast.success(t('ยืนยันรับของแล้ว'))
      await reload()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ยืนยันรับของไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <>
    {canCancel && <Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setCancelOpen(true)}><XCircle size={16} />{t('ยกเลิกใบเบิก')}</Button>}
    {canEdit && <Button type="button" className="gap-2" onClick={() => setEditOpen(true)}><Pencil size={16} />{t('แก้ไขและส่งใหม่')}</Button>}
    {canReceive && <Button type="button" disabled={busy} className="gap-2" onClick={() => void receive()}><PackageCheck size={16} />{t('ยืนยันรับของ')}</Button>}
    <ReasonDialog open={cancelOpen} title={t('ยกเลิกใบเบิก')} description={detail.number} label={t('เหตุผล (ไม่บังคับ)')} required={false} danger confirmLabel={t('ยกเลิกใบเบิก')} onClose={() => setCancelOpen(false)}
      onSubmit={async (reason) => {
        try {
          if (!(await confirm({ kind: 'danger', title: t('ยืนยันการยกเลิกใบเบิก'), description: t('สต็อกที่จองไว้จะถูกปล่อยคืน'), confirmLabel: t('ยกเลิกใบเบิก') }))) throw new Error('cancelled')
          await requisitionApi.cancel(detail.id, reason)
          toast.success(t('ยกเลิกใบเบิกแล้ว'))
          setCancelOpen(false)
          await reload()
        } catch (error) { if (!(error instanceof Error && error.message === 'cancelled')) toast.error(t(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ')); throw error }
      }} />
    {editOpen && <EditDialog detail={detail} onClose={() => setEditOpen(false)} onDone={async () => { setEditOpen(false); await reload() }} />}
  </>
}

function EditDialog({ detail, onClose, onDone }: { detail: RequisitionDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(detail.lines.map((line) => [line.id, line.qtyRequested])))
  const [reason, setReason] = useState(detail.reason)
  const [busy, setBusy] = useState(false)
  const remaining = detail.lines.filter((line) => qty[line.id] > 0).length

  async function submit() {
    if (!reason.trim()) return toast.error(t('กรุณาระบุเหตุผลการเบิก'))
    if (remaining === 0) return toast.error(t('ต้องมีสินค้าอย่างน้อย 1 รายการ'))
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการส่งใบเบิกใหม่'), description: detail.number, confirmLabel: t('ส่งใหม่') }))) return
      await requisitionApi.resubmit(detail.id, { lines: detail.lines.map((line) => ({ lineId: line.id, qty: qty[line.id] })), reason: reason.trim() })
      toast.success(t('ส่งใบเบิกใหม่แล้ว'))
      await onDone()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ส่งใหม่ไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{t('แก้ไขและส่งใหม่')}</DialogTitle><DialogDescription>{detail.number} · {t('ปรับจำนวนเป็น 0 เพื่อนำรายการออก')}</DialogDescription></DialogHeader>
    <ul className="space-y-3">{detail.lines.map((line) => <li key={line.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
      <ItemThumb url={line.imageUrl} name={line.name} size={44} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}{line.variantLabel && ` · ${line.variantLabel}`}</p><p className="text-xs text-muted-foreground">{line.sku}</p></div>
      <QtyStepper value={qty[line.id]} min={0} onChange={(value) => setQty((current) => ({ ...current, [line.id]: value }))} label={`${t('จำนวน')} ${line.name}`} />
    </li>)}</ul>
    <div className="grid gap-1.5"><Label htmlFor="edit-reason">{t('เหตุผลการเบิก')} <span className="text-destructive">*</span></Label><Textarea id="edit-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} /></div>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button><Button type="button" disabled={busy} onClick={() => void submit()} className="gap-2"><Send size={15} />{t('ส่งใหม่')}</Button></div>
  </DialogContent></Dialog>
}
