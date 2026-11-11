import { useState } from 'react'
import { CircleCheck, CornerUpLeft, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { requisitionApi } from '@/lib/requisition-api'
import type { RequisitionDetail } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm-provider'
import { ItemThumb } from '@/components/item-thumb'
import { QtyStepper } from '@/components/requisitions/qty-stepper'
import { ReasonDialog } from '@/components/requisitions/reason-dialog'

type Props = { detail: RequisitionDetail; user: User; reload: () => Promise<void>; close: () => void }

/** Approve (optionally lowering quantities), reject, or send back for edit. */
export function ApprovalActions({ detail, user, reload, close }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  if (detail.status !== 'in_approval' || detail.requesterId === user.id) return null

  const stopWith = (kind: 'reject' | 'changes') => async (reason: string) => {
    const reject = kind === 'reject'
    try {
      if (!(await confirm({ kind: 'danger', title: t(reject ? 'ยืนยันการไม่อนุมัติ' : 'ยืนยันการส่งกลับให้แก้ไข'), description: detail.number, confirmLabel: t(reject ? 'ไม่อนุมัติ' : 'ส่งกลับ') }))) throw new Error('cancelled')
      if (reject) await requisitionApi.reject(detail.id, reason)
      else await requisitionApi.requestChanges(detail.id, reason)
      toast.success(t(reject ? 'ไม่อนุมัติใบเบิกแล้ว' : 'ส่งใบเบิกกลับให้แก้ไขแล้ว'))
      setRejectOpen(false); setChangesOpen(false)
      await reload()
      close()
    } catch (error) { if (!(error instanceof Error && error.message === 'cancelled')) toast.error(t(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ')); throw error }
  }

  return <>
    <Button type="button" variant="outline" className="gap-2" onClick={() => setChangesOpen(true)}><CornerUpLeft size={16} />{t('ส่งกลับให้แก้ไข')}</Button>
    <Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setRejectOpen(true)}><XCircle size={16} />{t('ไม่อนุมัติ')}</Button>
    <Button type="button" className="gap-2" onClick={() => setApproveOpen(true)}><CircleCheck size={16} />{t('อนุมัติ')}</Button>
    <ReasonDialog open={rejectOpen} title={t('ไม่อนุมัติใบเบิก')} description={detail.number} danger confirmLabel={t('ไม่อนุมัติ')} onClose={() => setRejectOpen(false)} onSubmit={stopWith('reject')} />
    <ReasonDialog open={changesOpen} title={t('ส่งกลับให้ผู้เบิกแก้ไข')} description={detail.number} label={t('สิ่งที่ต้องแก้ไข')} confirmLabel={t('ส่งกลับ')} onClose={() => setChangesOpen(false)} onSubmit={stopWith('changes')} />
    {approveOpen && <ApproveDialog detail={detail} user={user} onClose={() => setApproveOpen(false)} onDone={async () => { setApproveOpen(false); await reload(); close() }} />}
  </>
}

function ApproveDialog({ detail, user, onClose, onDone }: { detail: RequisitionDetail; user: User; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const step = detail.steps.find((entry) => entry.status === 'active')
  const canEdit = Boolean(step?.allowEditQty) || user.role === 'admin'
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(detail.lines.map((line) => [line.id, line.qtyApproved])))
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const changed = detail.lines.filter((line) => qty[line.id] !== line.qtyApproved)

  async function submit() {
    if (changed.length && !comment.trim()) return toast.error(t('กรุณาระบุเหตุผลที่ปรับจำนวน'))
    if (detail.lines.every((line) => qty[line.id] === 0)) return toast.error(t('ต้องอนุมัติอย่างน้อย 1 รายการ หากไม่อนุมัติทั้งหมดให้ใช้การไม่อนุมัติ'))
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการอนุมัติ'), description: `${detail.number}${changed.length ? ` · ${t('มีการปรับจำนวน')} ${changed.length} ${t('รายการ')}` : ''}`, confirmLabel: t('อนุมัติ') }))) return
      await requisitionApi.approve(detail.id, { comment: comment.trim(), lines: changed.map((line) => ({ lineId: line.id, qty: qty[line.id] })) })
      toast.success(t('อนุมัติแล้ว'))
      await onDone()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'อนุมัติไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{t('อนุมัติใบเบิก')}</DialogTitle><DialogDescription>{detail.number}{step ? ` · ${step.name}` : ''}</DialogDescription></DialogHeader>
    <ul className="space-y-3">{detail.lines.map((line) => <li key={line.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
      <ItemThumb url={line.imageUrl} name={line.name} size={44} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}{line.variantLabel && ` · ${line.variantLabel}`}</p><p className="text-xs text-muted-foreground">{t('ขอ')} {line.qtyRequested} {line.unit}</p></div>
      {canEdit ? <QtyStepper value={qty[line.id]} min={0} max={line.qtyRequested} onChange={(value) => setQty((current) => ({ ...current, [line.id]: value }))} label={`${t('อนุมัติ')} ${line.name}`} />
        : <span className="text-sm font-medium tabular-nums">{line.qtyApproved}</span>}
    </li>)}</ul>
    {!canEdit && <p className="text-xs text-muted-foreground">{t('ขั้นตอนนี้ไม่อนุญาตให้ปรับจำนวน')}</p>}
    <div className="grid gap-1.5"><Label htmlFor="approve-comment">{changed.length ? <>{t('เหตุผลที่ปรับจำนวน')} <span className="text-destructive">*</span></> : t('ความเห็น (ไม่บังคับ)')}</Label>
      <Textarea id="approve-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={500} /></div>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button><Button type="button" disabled={busy} onClick={() => void submit()} className="gap-2"><CircleCheck size={15} />{t('อนุมัติ')}</Button></div>
  </DialogContent></Dialog>
}
