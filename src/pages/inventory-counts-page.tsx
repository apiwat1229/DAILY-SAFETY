import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Eye, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { CountStatus, CountSummary, Warehouse } from '@/lib/inventory-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { useConfirm } from '@/components/confirm-provider'
import { CountSheetDialog } from '@/components/inventory/count-sheet-dialog'

const statusLabel: Record<CountStatus, string> = { draft: 'ร่าง', counting: 'กำลังนับ', posted: 'ปรับยอดแล้ว' }
const statusTone: Record<CountStatus, string> = {
  draft: 'text-muted-foreground', counting: 'border-info/20 bg-info/10 text-info', posted: 'border-success/25 bg-success/10 text-success',
}

export function InventoryCountsPage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [counts, setCounts] = useState<CountSummary[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [startWarehouse, setStartWarehouse] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    Promise.all([inventoryApi.counts(), inventoryApi.warehouses()])
      .then(([countResult, warehouseResult]) => { setCounts(countResult.counts); setWarehouses(warehouseResult.warehouses.filter((warehouse) => warehouse.isActive)) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดใบนับสต็อกไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [t])
  useEffect(reload, [reload])
  const pagination = useDataPagination(counts)

  async function start() {
    if (!startWarehouse || busy) return toast.error(t('กรุณาเลือกคลัง'))
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'create', title: t('ยืนยันการเริ่มนับสต็อก'), description: t('ระบบจะบันทึกยอดตามระบบของคลังนี้ไว้เป็นฐานสำหรับการนับ') }))) return
      const { id } = await inventoryApi.createCount(startWarehouse)
      setStartOpen(false)
      reload()
      setOpenId(id)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'เริ่มนับสต็อกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('คลังสินค้า')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('นับสต็อก')}</h2><p className="mt-1 text-sm text-muted-foreground">{user.role === 'admin' ? t('ตรวจนับสต็อกทุกคลังและปรับยอดให้ตรงกับของจริง') : t('ตรวจนับสต็อกของคลังที่คุณดูแล')}</p></div>
      <Button iconOnly disabled={warehouses.length === 0} onClick={() => { setStartWarehouse(warehouses[0]?.id ?? ''); setStartOpen(true) }}><Plus size={16} />{t('เริ่มนับสต็อก')}</Button>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      {counts.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t('เริ่มเมื่อ')}</TableHead><TableHead>{t('คลัง')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="text-right">{t('รายการ')}</TableHead><TableHead>{t('ผู้เริ่ม')}</TableHead><TableHead className="text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((count) => <TableRow key={count.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(count.createdAt, language, false)}</TableCell>
            <TableCell className="font-medium">{count.warehouseName}</TableCell>
            <TableCell><Badge variant="outline" className={statusTone[count.status]}>{t(statusLabel[count.status])}</Badge></TableCell>
            <TableCell className="text-right tabular-nums">{count.lineCount}</TableCell>
            <TableCell>{count.createdByName || '—'}</TableCell>
            <TableCell><div className="flex justify-end"><Button iconOnly variant="ghost" size="sm" onClick={() => setOpenId(count.id)}><Eye size={15} />{count.status === 'posted' ? t('ดูใบนับ') : t('นับต่อ')}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={counts.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><ClipboardList className="mx-auto mb-2" size={22} />{loading ? t('กำลังโหลด…') : warehouses.length === 0 ? t('ยังไม่มีคลังที่คุณดูแล กรุณาติดต่อผู้ดูแลระบบ') : t('ยังไม่มีใบนับสต็อก กด "เริ่มนับสต็อก" เพื่อเริ่มต้น')}</div></CardContent>}
    </Card>
    <Dialog open={startOpen} onOpenChange={(open) => { if (!busy) setStartOpen(open) }}><DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t('เริ่มนับสต็อก')}</DialogTitle><DialogDescription>{t('เลือกคลังที่ต้องการนับ')}</DialogDescription></DialogHeader>
      <Select value={startWarehouse} onValueChange={(value) => value && setStartWarehouse(value)}><SelectTrigger className="h-10 w-full" aria-label={t('คลัง')}><SelectValue>{warehouses.find((warehouse) => warehouse.id === startWarehouse)?.name}</SelectValue></SelectTrigger>
        <SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</SelectItem>)}</SelectContent></Select>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setStartOpen(false)} disabled={busy}>{t('ยกเลิก')}</Button><Button onClick={start} disabled={busy || !startWarehouse}>{t('เริ่มนับ')}</Button></div>
    </DialogContent></Dialog>
    <CountSheetDialog countId={openId} onClose={() => setOpenId(null)} onChanged={reload} />
  </div>
}
