import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { LoaderCircle, PackagePlus, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { inventoryApi } from '@/lib/inventory-api'
import type { Item, ReceiptLine, Warehouse } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { useConfirm } from '@/components/confirm-provider'

type Line = { key: number; variantId: string; qty: string; lotNo: string; expiryDate: string }
type Props = { open: boolean; warehouses: Warehouse[]; defaultWarehouseId: string; onClose: () => void; onSaved: () => void }

let lineKey = 0
const blankLine = (): Line => ({ key: ++lineKey, variantId: '', qty: '', lotNo: '', expiryDate: '' })

export function ReceiveDialog({ open, warehouses, defaultWarehouseId, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [items, setItems] = useState<Item[]>([])
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || warehouses[0]?.id || '')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    inventoryApi.items({ active: '1' }).then(({ items: rows }) => setItems(rows))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายการสินค้าไม่สำเร็จ')))
  }, [open, t])

  const options = useMemo(() => items.flatMap((item) => item.variants.filter((variant) => variant.isActive).map((variant) => ({
    variantId: variant.id, item, label: `${item.name}${variant.label ? ` · ${variant.label}` : ''} (${item.sku})`,
  }))), [items])
  const optionOf = (variantId: string) => options.find((option) => option.variantId === variantId)

  const update = (key: number, patch: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  async function save(event: FormEvent) {
    event.preventDefault()
    const payload: ReceiptLine[] = []
    for (const [index, line] of lines.entries()) {
      const option = optionOf(line.variantId)
      const qty = Number(line.qty)
      if (!option) return toast.error(`${t('บรรทัดที่')} ${index + 1}: ${t('กรุณาเลือกสินค้า')}`)
      if (!Number.isInteger(qty) || qty <= 0) return toast.error(`${t('บรรทัดที่')} ${index + 1}: ${t('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0')}`)
      if (option.item.trackLot && !line.lotNo.trim()) return toast.error(`${t('บรรทัดที่')} ${index + 1}: ${t('กรุณาระบุเลขล็อต')}`)
      if (option.item.trackExpiry && !line.expiryDate) return toast.error(`${t('บรรทัดที่')} ${index + 1}: ${t('กรุณาระบุวันหมดอายุ')}`)
      payload.push({ variantId: line.variantId, qty, lotNo: option.item.trackLot ? line.lotNo.trim() : undefined, expiryDate: option.item.trackExpiry ? line.expiryDate : undefined })
    }
    if (!warehouseId) return toast.error(t('กรุณาเลือกคลัง'))
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'create', title: t('ยืนยันการรับสินค้าเข้าคลัง'), description: `${payload.length} ${t('รายการ')}` }))) return
      await inventoryApi.receive({ warehouseId, note: note.trim(), lines: payload })
      toast.success(t('รับสินค้าเข้าคลังแล้ว'))
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'รับสินค้าเข้าคลังไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><PackagePlus size={19} /></div>
      <DialogTitle>{t('รับสินค้าเข้าคลัง')}</DialogTitle><DialogDescription>{t('ยาต้องระบุเลขล็อตและวันหมดอายุ เลขล็อตเดิมจะรวมยอดเข้าล็อตเดิม')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>{t('คลัง')}</Label><Select value={warehouseId} onValueChange={setWarehouseId}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t('เลือกคลัง')} /></SelectTrigger>
          <SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label htmlFor="receive-note">{t('หมายเหตุ')}</Label><Input id="receive-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('เช่น เลขที่ใบส่งของ')} /></div>
      </div>
      <ul className="space-y-3">{lines.map((line, index) => {
        const option = optionOf(line.variantId)
        return <li key={line.key} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-6">
          <div className="grid gap-1.5 sm:col-span-4"><Label>{t('สินค้า')} #{index + 1}</Label>
            <Select value={line.variantId} onValueChange={(value) => update(line.key, { variantId: value })}><SelectTrigger className="h-10 w-full" aria-label={t('สินค้า')}><SelectValue placeholder={t('เลือกสินค้า')} /></SelectTrigger>
              <SelectContent>{options.map((entry) => <SelectItem key={entry.variantId} value={entry.variantId}>{entry.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>{t('จำนวน')}{option ? ` (${option.item.unit})` : ''}</Label><Input type="number" min={1} step={1} inputMode="numeric" value={line.qty} onChange={(event) => update(line.key, { qty: event.target.value })} /></div>
          {option?.item.trackLot && <div className="grid gap-1.5 sm:col-span-3"><Label>{t('เลขล็อต')}</Label><Input value={line.lotNo} onChange={(event) => update(line.key, { lotNo: event.target.value })} /></div>}
          {option?.item.trackExpiry && <div className="grid gap-1.5 sm:col-span-3"><Label>{t('วันหมดอายุ')}</Label><DatePicker value={line.expiryDate} onChange={(value) => update(line.key, { expiryDate: value })} placeholder={t('เลือกวันหมดอายุ')} ariaLabel={t('วันหมดอายุ')} /></div>}
          {lines.length > 1 && <div className="flex justify-end sm:col-span-6"><Button iconOnly type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}><Trash2 size={15} />{t('ลบบรรทัด')}</Button></div>}
        </li>
      })}</ul>
      <Button type="button" variant="outline" className="gap-2" onClick={() => setLines((current) => [...current, blankLine()])}><Plus size={15} />{t('เพิ่มบรรทัด')}</Button>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึกการรับเข้า')}</Button></div>
    </form>
  </DialogContent></Dialog>
}
