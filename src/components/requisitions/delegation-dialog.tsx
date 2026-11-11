import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, UserRoundCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, localDateString } from '@/lib/api'
import { workflowApi } from '@/lib/requisition-api'
import type { ApproverUser, Delegation } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { useConfirm } from '@/components/confirm-provider'

type Props = { open: boolean; user: User; onClose: () => void }

/** Hand approvals to a colleague for a date range (leave, training). Delegations the user gave or received are listed. */
export function DelegationDialog({ open, user, onClose }: Props) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [approvers, setApprovers] = useState<ApproverUser[]>([])
  const [toUser, setToUser] = useState('')
  const [fromDate, setFromDate] = useState(localDateString())
  const [toDate, setToDate] = useState(localDateString())
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    workflowApi.delegations().then(({ delegations: rows }) => setDelegations(rows))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดการมอบสิทธิ์ไม่สำเร็จ')))
  }, [t])
  useEffect(() => {
    if (!open) return
    reload()
    workflowApi.approvers().then(({ users }) => setApprovers(users.filter((entry) => entry.id !== user.id))).catch(() => undefined)
  }, [open, reload, user.id])

  async function add() {
    if (!toUser) return toast.error(t('กรุณาเลือกผู้รับมอบสิทธิ์'))
    if (!fromDate || !toDate || fromDate > toDate) return toast.error(t('ช่วงวันที่ไม่ถูกต้อง'))
    setBusy(true)
    try {
      if (!(await confirm('create'))) return
      await workflowApi.addDelegation({ toUser, fromDate, toDate })
      toast.success(t('มอบสิทธิ์แล้ว'))
      setToUser('')
      reload()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'มอบสิทธิ์ไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  async function remove(delegation: Delegation) {
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'danger', title: t('ยกเลิกการมอบสิทธิ์'), description: `${delegation.fromName} → ${delegation.toName}`, confirmLabel: t('ยกเลิกการมอบสิทธิ์') }))) return
      await workflowApi.removeDelegation(delegation.id)
      reload()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  const selected = approvers.find((entry) => entry.id === toUser)
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><UserRoundCheck size={19} /></div>
      <DialogTitle>{t('มอบสิทธิ์อนุมัติแทน')}</DialogTitle><DialogDescription>{t('ผู้รับมอบสิทธิ์อนุมัติใบเบิกแทนคุณได้ในช่วงวันที่ที่กำหนด')}</DialogDescription></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2"><Label>{t('ผู้รับมอบสิทธิ์')}</Label>
        <Select value={toUser} onValueChange={(value) => value && setToUser(value)}><SelectTrigger className="h-10 w-full" aria-label={t('ผู้รับมอบสิทธิ์')}><SelectValue placeholder={t('เลือกผู้ใช้')}>{selected?.name}</SelectValue></SelectTrigger>
          <SelectContent>{approvers.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name} · {entry.employeeCode}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1.5"><Label>{t('ตั้งแต่วันที่')}</Label><DatePicker value={fromDate} onChange={setFromDate} minDate={localDateString()} maxDate={toDate || undefined} ariaLabel={t('ตั้งแต่วันที่')} /></div>
      <div className="grid gap-1.5"><Label>{t('ถึงวันที่')}</Label><DatePicker value={toDate} onChange={setToDate} minDate={fromDate || localDateString()} ariaLabel={t('ถึงวันที่')} /></div>
      <div className="sm:col-span-2"><Button type="button" disabled={busy} onClick={() => void add()} className="w-full gap-2"><Plus size={15} />{t('มอบสิทธิ์')}</Button></div>
    </div>
    <section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">{t('การมอบสิทธิ์ที่เกี่ยวข้องกับคุณ')}</h3>
      {delegations.length === 0 ? <p className="text-sm text-muted-foreground">{t('ยังไม่มีการมอบสิทธิ์')}</p>
        : <ul className="space-y-2">{delegations.map((delegation) => <li key={delegation.id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{delegation.fromName} → {delegation.toName}</p><p className="text-xs text-muted-foreground">{formatDate(delegation.fromDate, language)} – {formatDate(delegation.toDate, language)}</p></div>
          {delegation.fromUser === user.id && <Button iconOnly type="button" variant="ghost" size="icon" disabled={busy} className="text-destructive" onClick={() => void remove(delegation)}><Trash2 size={15} />{t('ยกเลิกการมอบสิทธิ์')}</Button>}
        </li>)}</ul>}
    </section>
  </DialogContent></Dialog>
}
