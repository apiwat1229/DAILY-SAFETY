import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import type { IssueHistoryItem } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/confirm-provider'
import { ItemThumb } from '@/components/item-thumb'
import { QtyStepper } from '@/components/requisitions/qty-stepper'

type Props = { item: IssueHistoryItem; onClose: () => void; onDone: () => Promise<void> }

/** Take unused goods back into the lot they were issued from. */
export function ReturnsDialog({ item, onClose, onDone }: Props) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [qty, setQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const key = (lineId: string, lotId: string) => `${lineId}|${lotId}`
  const sumFor = (lineId: string) => Object.entries(qty).filter(([k]) => k.startsWith(`${lineId}|`)).reduce((sum, [, value]) => sum + value, 0)
  const entries = item.lines.flatMap((line) => line.issuedLots.map((lot) => ({ line, lot, value: qty[key(line.id, lot.lotId)] ?? 0 }))).filter((entry) => entry.value > 0)

  async function submit() {
    if (entries.length === 0) return toast.error(t('กรุณาระบุจำนวนที่รับคืนอย่างน้อย 1 รายการ'))
    const over = item.lines.find((line) => sumFor(line.id) > line.qtyIssued - line.qtyReturned)
    if (over) return toast.error(`${over.name}: ${t('รับคืนได้ไม่เกินที่จ่ายไปและยังไม่ได้คืน')} ${over.qtyIssued - over.qtyReturned}`)
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการรับคืนของ'), description: `${item.number} · ${entries.length} ${t('รายการ')}`, confirmLabel: t('รับคืน') }))) return
      await requisitionApi.recordReturn(item.id, entries.map((entry) => ({ lineId: entry.line.id, lotId: entry.lot.lotId, qty: entry.value })), reason.trim())
      toast.success(t('รับคืนของแล้ว'))
      await onDone()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'รับคืนไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Undo2 size={19} /></div>
      <DialogTitle>{t('รับคืนของ')} · {item.number}</DialogTitle><DialogDescription>{t('ของที่คืนจะกลับเข้าล็อตเดิมในคลัง')}</DialogDescription></DialogHeader>
    <ul className="space-y-3">{item.lines.map((line) => <li key={line.id} className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-3"><ItemThumb url={line.imageUrl} name={line.name} size={44} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}{line.variantLabel && ` · ${line.variantLabel}`}</p>
          <p className="text-xs text-muted-foreground">{t('จ่ายแล้ว')} {line.qtyIssued} · {t('คืนแล้ว')} {line.qtyReturned} {line.unit}</p></div></div>
      <ul className="mt-2 space-y-2">{line.issuedLots.map((lot) => <li key={lot.lotId} className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{lot.lotNo || t('ไม่มีล็อต')}{lot.expiryDate ? ` · ${formatDate(lot.expiryDate, language)}` : ''} · {t('จ่ายจากล็อตนี้')} {lot.qty}</span>
        <QtyStepper value={qty[key(line.id, lot.lotId)] ?? 0} min={0} max={lot.qty} onChange={(value) => setQty((current) => ({ ...current, [key(line.id, lot.lotId)]: value }))} label={`${t('คืน')} ${line.name}`} />
      </li>)}</ul>
    </li>)}</ul>
    <div className="grid gap-1.5"><Label htmlFor="return-reason">{t('เหตุผลที่รับคืน (ไม่บังคับ)')}</Label><Textarea id="return-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} /></div>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button><Button type="button" disabled={busy} onClick={() => void submit()} className="gap-2"><Undo2 size={15} />{t('รับคืน')}</Button></div>
  </DialogContent></Dialog>
}
