import { useEffect, useState } from 'react'
import { CheckCheck, ClipboardList, LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { CountSheet } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { useConfirm } from '@/components/confirm-provider'

type Props = { countId: string | null; onClose: () => void; onChanged: () => void }
const lineKey = (line: { variantId: string; lotId: string }) => `${line.variantId}|${line.lotId}`

/** Enter counted quantities per lot; difference = counted − system. Posting writes the differences as stock adjustments. */
export function CountSheetDialog({ countId, onClose, onChanged }: Props) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<CountSheet | null>(null)
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const lines = sheet?.lines ?? []
  const pagination = useDataPagination(lines)
  const posted = sheet?.status === 'posted'

  useEffect(() => {
    if (!countId) { setSheet(null); return }
    inventoryApi.count(countId).then(({ count }) => {
      setSheet(count)
      setEntries(Object.fromEntries(count.lines.filter((line) => line.countedQty !== null).map((line) => [lineKey(line), String(line.countedQty)])))
    }).catch((error) => { toast.error(t(error instanceof Error ? error.message : 'โหลดใบนับสต็อกไม่สำเร็จ')); onClose() })
  }, [countId, onClose, t])

  /** Entered lines only; returns null (after a toast) when any entry is not a whole number from 0. */
  function collect() {
    const result: { variantId: string; lotId: string; countedQty: number }[] = []
    for (const line of lines) {
      const text = entries[lineKey(line)]
      if (text === undefined || text.trim() === '') continue
      const value = Number(text)
      if (!Number.isInteger(value) || value < 0) { toast.error(`${line.itemName}: ${t('จำนวนที่นับต้องเป็นจำนวนเต็มตั้งแต่ 0')}`); return null }
      result.push({ variantId: line.variantId, lotId: line.lotId, countedQty: value })
    }
    return result
  }

  async function saveDraft() {
    if (!sheet || busy) return
    const payload = collect()
    if (!payload) return
    setBusy(true)
    try {
      await inventoryApi.saveCountLines(sheet.id, payload)
      toast.success(t('บันทึกผลการนับแล้ว'))
      onChanged()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  async function post() {
    if (!sheet || busy) return
    const payload = collect()
    if (!payload) return
    const differences = payload.filter((entry) => entry.countedQty !== lines.find((line) => lineKey(line) === lineKey(entry))?.systemQty).length
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'danger', title: t('ยืนยันการปรับยอดตามที่นับ'), description: `${t('นับแล้ว')} ${payload.length}/${lines.length} ${t('รายการ')} · ${t('จะปรับยอดประมาณ')} ${differences} ${t('รายการ ย้อนกลับไม่ได้')}`, confirmLabel: t('ปรับยอด') }))) return
      await inventoryApi.saveCountLines(sheet.id, payload)
      const { adjustments } = await inventoryApi.postCount(sheet.id)
      toast.success(`${t('ปรับยอดแล้ว')} ${adjustments} ${t('รายการ')}`)
      onChanged()
      onClose()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ปรับยอดไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={Boolean(countId)} onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><ClipboardList size={19} /></div>
      <DialogTitle>{t('ใบนับสต็อก')}{sheet ? ` · ${sheet.warehouseName}` : ''}</DialogTitle>
      <DialogDescription>{sheet && <>{posted ? <Badge variant="outline" className="border-success/25 bg-success/10 text-success">{t('ปรับยอดแล้ว')}</Badge> : t('กรอกจำนวนที่นับได้จริง รายการที่เว้นว่างจะไม่ถูกปรับ')}</>}</DialogDescription></DialogHeader>
    {!sheet ? <div className="grid min-h-40 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div> : <>
      {!posted && <div className="flex justify-end"><Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setEntries(Object.fromEntries(lines.map((line) => [lineKey(line), String(line.systemQty)])))}><CheckCheck size={15} />{t('ใช้ยอดระบบทั้งหมด')}</Button></div>}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead className="w-12 text-center">{t('ลำดับ')}</TableHead><TableHead>{t('สินค้า')}</TableHead><TableHead>{t('ล็อต')}</TableHead><TableHead className="text-right">{t('ยอดระบบ')}</TableHead><TableHead className="w-36 text-right">{t('นับได้')}</TableHead><TableHead className="text-right">{t('ผลต่าง')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((line, index) => {
            const key = lineKey(line)
            const text = entries[key]
            const counted = text === undefined || text.trim() === '' ? null : Number(text)
            const diff = counted === null || !Number.isInteger(counted) ? null : counted - line.systemQty
            return <TableRow key={key}><TableCell className="text-center text-muted-foreground tabular-nums">{(pagination.page - 1) * pagination.pageSize + index + 1}</TableCell>
              <TableCell><p className="font-medium">{line.itemName}{line.variantLabel && <span className="font-normal text-muted-foreground"> · {line.variantLabel}</span>}</p><p className="text-xs text-muted-foreground">{line.sku}</p></TableCell>
              <TableCell>{line.lotNo ? <>{line.lotNo}{line.expiryDate && <span className="block text-xs text-muted-foreground">{t('หมดอายุ')} {formatDate(line.expiryDate, language)}</span>}</> : '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{line.systemQty}</TableCell>
              <TableCell className="text-right">{posted ? <span className="tabular-nums">{line.countedQty ?? '—'}</span> : <Input type="number" min={0} step={1} inputMode="numeric" value={text ?? ''} onChange={(event) => setEntries((current) => ({ ...current, [key]: event.target.value }))} aria-label={`${t('นับได้')} ${line.itemName}`} className="ml-auto h-9 w-28 text-right" />}</TableCell>
              <TableCell className={`text-right font-semibold tabular-nums ${diff === null || diff === 0 ? 'text-muted-foreground' : diff < 0 ? 'text-destructive' : 'text-success'}`}>{posted ? (line.countedQty === null ? '—' : line.countedQty - line.systemQty) : diff === null ? '—' : diff > 0 ? `+${diff}` : diff}</TableCell>
            </TableRow>
          })}
          {lines.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t('คลังนี้ยังไม่มีสต็อกให้นับ')}</TableCell></TableRow>}</TableBody>
        </Table>
        <DataTablePagination total={lines.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </div>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ปิด')}</Button>
        {!posted && <><Button type="button" variant="outline" onClick={saveDraft} disabled={busy} className="gap-2"><Save size={15} />{t('บันทึกร่าง')}</Button><Button type="button" onClick={post} disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('ปรับยอดตามที่นับ')}</Button></>}</div>
    </>}
  </DialogContent></Dialog>
}
