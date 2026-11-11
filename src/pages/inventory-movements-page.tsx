import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Download } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { Movement, MovementType, Warehouse } from '@/lib/inventory-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { usePersistentState } from '@/lib/persistent-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table-pagination'
import { DatePicker } from '@/components/date-picker'

const ALL = '__all__'
const typeLabel: Record<MovementType, string> = {
  receive: 'รับเข้า', issue: 'จ่ายออก', return: 'รับคืน', transfer_out: 'โอนออก', transfer_in: 'โอนเข้า', adjust: 'ปรับยอด', count_adjust: 'ปรับจากการนับ', write_off: 'ตัดทิ้ง',
}
const typeTone: Record<MovementType, string> = {
  receive: 'border-success/25 bg-success/10 text-success', return: 'border-success/25 bg-success/10 text-success', transfer_in: 'border-info/20 bg-info/10 text-info',
  issue: 'border-border bg-surface-subtle', transfer_out: 'border-info/20 bg-info/10 text-info', adjust: 'border-warning/25 bg-warning/10 text-warning',
  count_adjust: 'border-warning/25 bg-warning/10 text-warning', write_off: 'border-destructive/25 bg-destructive/10 text-destructive',
}

/** The append-only stock ledger: every receipt, issue, transfer, adjustment and write-off. */
export function InventoryMovementsPage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = usePersistentState('inventory.movements.warehouse', ALL)
  const [type, setType] = usePersistentState('inventory.movements.type', ALL)
  const [from, setFrom] = usePersistentState('inventory.movements.from', '')
  const [to, setTo] = usePersistentState('inventory.movements.to', '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistentState('table.pageSize', 10, 'local')
  const [rows, setRows] = useState<Movement[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryApi.warehouses().then(({ warehouses: list }) => setWarehouses(list))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดคลังไม่สำเร็จ')))
  }, [t])

  const filters = useCallback(() => ({
    warehouseId: warehouseId === ALL ? undefined : warehouseId, type: type === ALL ? undefined : type, from: from || undefined, to: to || undefined,
  }), [warehouseId, type, from, to])

  useEffect(() => {
    setLoading(true)
    inventoryApi.movements({ ...filters(), page, pageSize })
      .then((result) => { setRows(result.rows); setTotal(result.total) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดประวัติสต็อกไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [filters, page, pageSize, t])

  const change = <T,>(setter: (value: T) => void) => (value: T) => { setPage(1); setter(value) }
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const warehouseName = warehouseId === ALL ? t('ทุกคลัง') : warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? t('ทุกคลัง')

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('คลังสินค้า')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('ประวัติสต็อก')}</h2><p className="mt-1 text-sm text-muted-foreground">{user.role === 'admin' ? t('ทุกการเคลื่อนไหวของสต็อก แก้ไขย้อนหลังไม่ได้') : t('การเคลื่อนไหวของสต็อกในคลังที่คุณดูแล')}</p></div>
      <Button iconOnly variant="outline" onClick={() => window.location.assign(inventoryApi.movementsExportUrl(filters()))}><Download size={16} />{t('ส่งออก Excel')}</Button>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      <CardContent className="grid gap-3 border-b border-border-subtle p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Select value={warehouseId} onValueChange={(value) => value && change(setWarehouseId)(value)}><SelectTrigger className="h-10 w-full" aria-label={t('คลัง')}><SelectValue>{warehouseName}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>{t('ทุกคลัง')}</SelectItem>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</SelectItem>)}</SelectContent></Select>
        <Select value={type} onValueChange={(value) => value && change(setType)(value)}><SelectTrigger className="h-10 w-full" aria-label={t('ประเภทรายการ')}><SelectValue>{type === ALL ? t('ทุกประเภท') : t(typeLabel[type as MovementType] ?? type)}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>{t('ทุกประเภท')}</SelectItem>{(Object.keys(typeLabel) as MovementType[]).map((value) => <SelectItem key={value} value={value}>{t(typeLabel[value])}</SelectItem>)}</SelectContent></Select>
        <DatePicker value={from} onChange={change(setFrom)} maxDate={to || undefined} placeholder={t('ตั้งแต่วันที่')} ariaLabel={t('ตั้งแต่วันที่')} clearable />
        <DatePicker value={to} onChange={change(setTo)} minDate={from || undefined} placeholder={t('ถึงวันที่')} ariaLabel={t('ถึงวันที่')} clearable />
      </CardContent>
      {rows.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t('วันเวลา')}</TableHead><TableHead>{t('ประเภท')}</TableHead><TableHead>{t('คลัง')}</TableHead><TableHead>{t('สินค้า')}</TableHead><TableHead>{t('ล็อต')}</TableHead><TableHead className="text-right">{t('จำนวน')}</TableHead><TableHead>{t('เหตุผล')}</TableHead><TableHead>{t('ผู้ดำเนินการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row) => <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.createdAt, language, false)}</TableCell>
            <TableCell><Badge variant="outline" className={typeTone[row.type]}>{t(typeLabel[row.type] ?? row.type)}</Badge></TableCell>
            <TableCell>{row.warehouseName}</TableCell>
            <TableCell><p className="font-medium">{row.itemName}{row.variantLabel && <span className="font-normal text-muted-foreground"> · {row.variantLabel}</span>}</p><p className="text-xs text-muted-foreground">{row.sku}</p></TableCell>
            <TableCell>{row.lotNo ? <>{row.lotNo}{row.expiryDate && <span className="block text-xs text-muted-foreground">{t('หมดอายุ')} {formatDate(row.expiryDate, language)}</span>}</> : '—'}</TableCell>
            <TableCell className={`text-right font-semibold tabular-nums ${row.qty < 0 ? 'text-destructive' : 'text-success'}`}>{row.qty > 0 ? `+${row.qty}` : row.qty}</TableCell>
            <TableCell className="max-w-56 whitespace-normal text-sm text-muted-foreground">{row.reason || '—'}</TableCell>
            <TableCell>{row.userName || '—'}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={total} page={Math.min(page, totalPages)} pageSize={pageSize} totalPages={totalPages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} t={t} />
      </> : <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><ArrowLeftRight className="mx-auto mb-2" size={22} />{loading ? t('กำลังโหลด…') : t('ไม่พบรายการเคลื่อนไหวสต็อก')}</div></div>}
    </Card>
  </div>
}
