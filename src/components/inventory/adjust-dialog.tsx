import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeftRight, LoaderCircle, Minus, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { Lot, StockRow, Warehouse, WriteOffReason } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm } from '@/components/confirm-provider'

type Mode = 'adjust' | 'writeoff' | 'transfer'
type Props = { mode: Mode | null; row: StockRow | null; warehouses: Warehouse[]; onClose: () => void; onSaved: () => void }

const reasons: WriteOffReason[] = ['expired', 'damaged', 'lost', 'other']
const reasonLabel: Record<WriteOffReason, string> = { expired: 'หมดอายุ', damaged: 'ชำรุด/เสียหาย', lost: 'สูญหาย', other: 'อื่น ๆ' }
const titles: Record<Mode, { title: string; icon: ReactNode }> = {
  adjust: { title: 'ปรับยอดสต็อก', icon: <SlidersHorizontal size={19} /> },
  writeoff: { title: 'ตัดสินค้าทิ้ง', icon: <Minus size={19} /> },
  transfer: { title: 'โอนสินค้าไปคลังอื่น', icon: <ArrowLeftRight size={19} /> },
}

/** One dialog for the three single-lot stock actions; each posts to its own endpoint. */
export function StockActionDialog({ mode, row, warehouses, onClose, onSaved }: Props) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [lots, setLots] = useState<Lot[]>([])
  const [lotId, setLotId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [writeOffReason, setWriteOffReason] = useState<WriteOffReason>('expired')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [busy, setBusy] = useState(false)
  const targets = warehouses.filter((warehouse) => warehouse.isActive && warehouse.id !== row?.warehouseId)

  useEffect(() => {
    if (!mode || !row) return
    inventoryApi.lots(row.warehouseId, row.variantId).then(({ lots: rows }) => { setLots(rows); setLotId(rows[0]?.lotId ?? '') })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดล็อตสินค้าไม่สำเร็จ')))
  }, [mode, row, t])

  if (!mode || !row) return null
  const selected = lots.find((lot) => lot.lotId === lotId)
  const lotText = (lot: Lot) => `${lot.lotNo || t('ไม่มีล็อต')}${lot.expiryDate ? ` · ${t('หมดอายุ')} ${formatDate(lot.expiryDate, language)}` : ''} · ${t('คงเหลือ')} ${lot.onHand}`

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!row || !mode) return
    const value = Number(amount)
    if (!lotId) return toast.error(t('ไม่มีล็อตให้ดำเนินการ'))
    if (!Number.isInteger(value) || value === 0 || (mode !== 'adjust' && value < 0)) return toast.error(t(mode === 'adjust' ? 'จำนวนที่ปรับต้องเป็นจำนวนเต็มและไม่เป็นศูนย์' : 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0'))
    if (mode === 'adjust' && !reason.trim()) return toast.error(t('กรุณาระบุเหตุผล'))
    if (mode === 'transfer' && !toWarehouseId) return toast.error(t('กรุณาเลือกคลังปลายทาง'))
    setBusy(true)
    try {
      if (!(await confirm(mode === 'writeoff' ? { kind: 'danger', title: t('ยืนยันการตัดสินค้าทิ้ง'), description: t('รายการนี้ย้อนกลับไม่ได้ ต้องบันทึกรายการแก้ไขเท่านั้น'), confirmLabel: t('ตัดทิ้ง') } : 'update'))) return
      if (mode === 'adjust') await inventoryApi.adjust({ warehouseId: row.warehouseId, variantId: row.variantId, lotId, delta: value, reason: reason.trim() })
      else if (mode === 'writeoff') await inventoryApi.writeOff({ warehouseId: row.warehouseId, variantId: row.variantId, lotId, qty: value, reason: writeOffReason, note: reason.trim() })
      else await inventoryApi.transfer({ fromWarehouseId: row.warehouseId, toWarehouseId, lines: [{ variantId: row.variantId, lotId, qty: value }] })
      toast.success(t('บันทึกแล้ว'))
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="sm:max-w-lg">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary">{titles[mode].icon}</div>
      <DialogTitle>{t(titles[mode].title)}</DialogTitle>
      <DialogDescription>{row.name}{row.variantLabel ? ` · ${row.variantLabel}` : ''} · {row.warehouseName}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-1.5"><Label>{t('ล็อต')}</Label>
        <Select value={lotId} onValueChange={(value) => value && setLotId(value)} disabled={lots.length === 0}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t('ไม่มีล็อตที่มีสต็อก')}>{selected ? lotText(selected) : undefined}</SelectValue></SelectTrigger>
          <SelectContent>{lots.map((lot) => <SelectItem key={lot.lotId} value={lot.lotId}>{lotText(lot)}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="stock-amount">{mode === 'adjust' ? t('จำนวนที่ปรับ (+เพิ่ม / −ลด)') : t('จำนวน')}</Label>
          <Input id="stock-amount" type="number" step={1} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={mode === 'adjust' ? '-2' : '1'} />
          {selected && mode !== 'adjust' && <p className="text-xs text-muted-foreground">{t('คงเหลือในล็อต')}: {selected.onHand}{mode === 'transfer' ? ` · ${t('โอนได้')} ${selected.onHand - selected.reserved}` : ''}</p>}</div>
        {mode === 'writeoff' && <div className="grid gap-1.5"><Label>{t('เหตุผล')}</Label><Select value={writeOffReason} onValueChange={(value) => setWriteOffReason(value as WriteOffReason)}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{reasons.map((value) => <SelectItem key={value} value={value}>{t(reasonLabel[value])}</SelectItem>)}</SelectContent></Select></div>}
        {mode === 'transfer' && <div className="grid gap-1.5"><Label>{t('คลังปลายทาง')}</Label><Select value={toWarehouseId} onValueChange={(value) => value && setToWarehouseId(value)}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t('เลือกคลัง')} /></SelectTrigger>
          <SelectContent>{targets.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</SelectItem>)}</SelectContent></Select></div>}
      </div>
      {mode !== 'transfer' && <div className="grid gap-1.5"><Label htmlFor="stock-reason">{mode === 'adjust' ? <>{t('เหตุผล')} <span className="text-destructive">*</span></> : t('หมายเหตุ')}</Label><Input id="stock-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={mode === 'adjust' ? t('เช่น นับขาด พบเพิ่ม') : t('รายละเอียดเพิ่มเติม (ถ้ามี)')} /></div>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy || !lotId} variant={mode === 'writeoff' ? 'destructive' : 'default'} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('ยืนยัน')}</Button></div>
    </form>
  </DialogContent></Dialog>
}
