import { useEffect, useState } from 'react'
import { Ban, UserRoundPlus } from 'lucide-react'
import { toast } from 'sonner'
import { requisitionApi, workflowApi } from '@/lib/requisition-api'
import type { ApproverUser, RequisitionDetail } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm-provider'
import { ReasonDialog } from '@/components/requisitions/reason-dialog'

type Props = { detail: RequisitionDetail; reload: () => Promise<void>; close: () => void }

/** Admin overrides: add an approver to the active step, or cancel a requisition for the requester (reason required, audited). */
export function AdminActions({ detail, reload, close }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [reassignOpen, setReassignOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const cancellable = ['in_approval', 'returned_for_edit', 'ready_to_issue'].includes(detail.status) && !detail.lines.some((line) => line.qtyIssued > 0)
  return <>
    {detail.status === 'in_approval' && <Button type="button" variant="outline" className="gap-2" onClick={() => setReassignOpen(true)}><UserRoundPlus size={16} />{t('เพิ่ม/เปลี่ยนผู้อนุมัติ')}</Button>}
    {cancellable && <Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setCancelOpen(true)}><Ban size={16} />{t('ยกเลิกใบเบิก')}</Button>}
    {reassignOpen && <ReassignDialog detail={detail} onClose={() => setReassignOpen(false)} onDone={async () => { setReassignOpen(false); await reload() }} />}
    <ReasonDialog open={cancelOpen} title={t('ผู้ดูแลระบบยกเลิกใบเบิก')} description={detail.number} danger confirmLabel={t('ยกเลิกใบเบิก')} onClose={() => setCancelOpen(false)}
      onSubmit={async (reason) => {
        try {
          if (!(await confirm({ kind: 'danger', title: t('ยืนยันการยกเลิกใบเบิก'), description: t('สต็อกที่จองไว้จะถูกปล่อยคืน และผู้เบิกจะเห็นเหตุผลนี้'), confirmLabel: t('ยกเลิกใบเบิก') }))) throw new Error('cancelled')
          await requisitionApi.forceCancel(detail.id, reason)
          toast.success(t('ยกเลิกใบเบิกแล้ว'))
          setCancelOpen(false)
          await reload()
          close()
        } catch (error) { if (!(error instanceof Error && error.message === 'cancelled')) toast.error(t(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ')); throw error }
      }} />
  </>
}

function ReassignDialog({ detail, onClose, onDone }: { detail: RequisitionDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [users, setUsers] = useState<ApproverUser[]>([])
  const [toUser, setToUser] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { workflowApi.approvers().then(({ users: rows }) => setUsers(rows.filter((row) => row.id !== detail.requesterId))).catch(() => undefined) }, [detail.requesterId])
  const selected = users.find((user) => user.id === toUser)

  async function submit() {
    if (!toUser) return toast.error(t('กรุณาเลือกผู้อนุมัติ'))
    if (!reason.trim()) return toast.error(t('กรุณาระบุเหตุผล'))
    setBusy(true)
    try {
      if (!(await confirm('update'))) return
      await requisitionApi.reassign(detail.id, toUser, reason.trim())
      toast.success(t('เพิ่มผู้อนุมัติแล้ว'))
      await onDone()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>{t('เพิ่ม/เปลี่ยนผู้อนุมัติ')}</DialogTitle><DialogDescription>{detail.number} · {t('ผู้อนุมัติคนใหม่จะอนุมัติขั้นปัจจุบันได้ ผู้อนุมัติเดิมยังอนุมัติได้เช่นเดิม')}</DialogDescription></DialogHeader>
    <div className="grid gap-1.5"><Label>{t('ผู้อนุมัติ')}</Label>
      <Select value={toUser} onValueChange={(value) => value && setToUser(value)}><SelectTrigger className="h-10 w-full" aria-label={t('ผู้อนุมัติ')}><SelectValue placeholder={t('เลือกผู้ใช้')}>{selected?.name}</SelectValue></SelectTrigger>
        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} · {user.employeeCode}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-1.5"><Label htmlFor="reassign-reason">{t('เหตุผล')} <span className="text-destructive">*</span></Label><Textarea id="reassign-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} /></div>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button><Button type="button" disabled={busy} onClick={() => void submit()}>{t('บันทึก')}</Button></div>
  </DialogContent></Dialog>
}
