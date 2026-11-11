import { useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import type { IssueQueueItem } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/confirm-provider'
import { ItemThumb } from '@/components/item-thumb'
import { QtyStepper } from '@/components/requisitions/qty-stepper'

type Props = { item: IssueQueueItem; onClose: () => void; onDone: () => Promise<void> }

/** Pick and hand over goods: quantity per line (default = everything still owed). Stock comes from the lots reserved at approval. */
export function IssueDialog({ item, onClose, onDone }: Props) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(item.lines.map((line) => [line.id, line.remaining])))
  const [busy, setBusy] = useState(false)
  const chosen = item.lines.filter((line) => qty[line.id] > 0)

  async function submit() {
    if (chosen.length === 0) return toast.error(t('กรุณาระบุจำนวนที่จ่ายอย่างน้อย 1 รายการ'))
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการจ่ายของ'), description: `${item.number} · ${chosen.length} ${t('รายการ')}`, confirmLabel: t('จ่ายของ') }))) return
      await requisitionApi.issue(item.id, chosen.map((line) => ({ lineId: line.id, qty: qty[line.id] })))
      toast.success(t('จ่ายของแล้ว'))
      await onDone()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'จ่ายของไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><PackageCheck size={19} /></div>
      <DialogTitle>{t('จ่ายของ')} · {item.number}</DialogTitle><DialogDescription>{item.requesterName}{item.department ? ` · ${item.department}` : ''} · {item.warehouseName}</DialogDescription></DialogHeader>
    <ul className="space-y-3">{item.lines.map((line) => <li key={line.id} className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-3">
        <ItemThumb url={line.imageUrl} name={line.name} size={52} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}{line.variantLabel && ` · ${line.variantLabel}`}</p>
          <p className="text-xs text-muted-foreground">{line.sku} · {t('ค้างจ่าย')} {line.remaining}/{line.qtyApproved} {line.unit}</p></div>
        <QtyStepper value={qty[line.id]} min={0} max={line.remaining} onChange={(value) => setQty((current) => ({ ...current, [line.id]: value }))} label={`${t('จ่าย')} ${line.name}`} />
      </div>
      {line.picks.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">{t('หยิบจาก')}: {line.picks.map((pick) => <span key={pick.lotId} className="rounded-md border border-border px-1.5 py-0.5">{pick.lotNo || t('ไม่มีล็อต')}{pick.expiryDate ? ` · ${t('หมดอายุ')} ${formatDate(pick.expiryDate, language)}` : ''} × {pick.qty}</span>)}</p>}
    </li>)}</ul>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button><Button type="button" disabled={busy} onClick={() => void submit()} className="gap-2"><PackageCheck size={15} />{t('ยืนยันการจ่าย')}</Button></div>
  </DialogContent></Dialog>
}
