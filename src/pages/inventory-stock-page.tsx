import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Boxes, LayoutGrid, Minus, PackagePlus, Search, SlidersHorizontal, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { InventoryType, StockAlerts, StockRow, Warehouse } from '@/lib/inventory-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { usePersistentState } from '@/lib/persistent-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { ReceiveDialog } from '@/components/inventory/receive-dialog'
import { StockActionDialog } from '@/components/inventory/adjust-dialog'
import { StockAlertsCard } from '@/components/inventory/stock-alerts-card'
import { daysUntil, expiryTone, toneClass } from '@/components/inventory/expiry'
import { ItemThumb } from '@/components/item-thumb'
import { ViewToggle, type ViewOption } from '@/components/view-toggle'

const ALL = '__all__'
type StockView = 'table' | 'tiles'
const VIEWS: ViewOption<StockView>[] = [{ value: 'table', label: 'แบบตาราง', icon: Table2 }, { value: 'tiles', label: 'แบบรูปใหญ่', icon: LayoutGrid }]
type Action = { mode: 'adjust' | 'writeoff' | 'transfer'; row: StockRow } | null

export function InventoryStockPage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [view, setView] = usePersistentState<StockView>('inventory.stock.view', 'table', 'local')
  const [warehouseId, setWarehouseId] = usePersistentState('inventory.stock.warehouse', ALL)
  const [type, setType] = usePersistentState<'all' | InventoryType>('inventory.stock.type', 'all')
  const [query, setQuery] = usePersistentState('inventory.stock.query', '')
  const [filter, setFilter] = usePersistentState<'' | 'low' | 'expiring'>('inventory.stock.filter', '')
  const [rows, setRows] = useState<StockRow[]>([])
  const [alerts, setAlerts] = useState<StockAlerts | null>(null)
  const [loading, setLoading] = useState(true)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [action, setAction] = useState<Action>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [warehousesLoaded, setWarehousesLoaded] = useState(false)
  const [wantReceive, setWantReceive] = useState(false)

  // The mobile "Receive" action opens this page with ?action=receive; consume the query so a reload does not reopen the dialog.
  useEffect(() => {
    const check = () => {
      if (new URLSearchParams(window.location.search).get('action') !== 'receive') return
      window.history.replaceState(null, '', window.location.pathname)
      setWantReceive(true)
    }
    check()
    window.addEventListener('ds:navigate', check)
    return () => window.removeEventListener('ds:navigate', check)
  }, [])

  useEffect(() => {
    inventoryApi.warehouses().then(({ warehouses: list }) => {
      setWarehouses(list)
      setWarehousesLoaded(true)
      setWarehouseId((current) => (current !== ALL && !list.some((warehouse) => warehouse.id === current) ? ALL : current))
    }).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดคลังไม่สำเร็จ')))
  }, [t, setWarehouseId])

  const load = useCallback(() => {
    const scope = warehouseId === ALL ? undefined : warehouseId
    setLoading(true)
    Promise.all([
      inventoryApi.stock({ warehouseId: scope, type: type === 'all' ? undefined : type, q: query.trim() || undefined, filter: filter || undefined }),
      inventoryApi.alerts(scope),
    ]).then(([stock, summary]) => { setRows(stock.rows); setAlerts(summary) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดสต็อกไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [warehouseId, type, query, filter, t])
  useEffect(() => {
    const timer = window.setTimeout(load, 250)
    return () => window.clearTimeout(timer)
  }, [load, reloadKey])

  const pagination = useDataPagination(rows)
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive)
  useEffect(() => {
    if (!wantReceive || !warehousesLoaded) return
    setWantReceive(false)
    if (activeWarehouses.length > 0) setReceiveOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantReceive, warehousesLoaded, warehouses])
  const warnDays = alerts?.expiryWarnDays ?? [30, 60, 90]
  const toggleFilter = (kind: 'low' | 'expiring') => setFilter((current) => (current === kind ? '' : kind))
  const done = () => { setAction(null); setReceiveOpen(false); setReloadKey((key) => key + 1) }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('คลังสินค้า')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('สต็อกคงเหลือ')}</h2><p className="mt-1 text-sm text-muted-foreground">{user.role === 'admin' ? t('ดูและจัดการสต็อกทุกคลัง') : t('สต็อกของคลังที่คุณดูแล')}</p></div>
      <div className="flex flex-wrap items-center gap-2"><Tabs value={type} onValueChange={(value) => setType(value as 'all' | InventoryType)}><TabsList><TabsTrigger value="all">{t('ทั้งหมด')}</TabsTrigger><TabsTrigger value="ppe">PPE</TabsTrigger><TabsTrigger value="medicine">{t('ยารักษาโรค')}</TabsTrigger></TabsList></Tabs><Button iconOnly disabled={activeWarehouses.length === 0} onClick={() => setReceiveOpen(true)}><PackagePlus size={16} />{t('รับสินค้าเข้าคลัง')}</Button></div>
    </div>
    <StockAlertsCard alerts={alerts} onSelect={toggleFilter} />
    <Card className="overflow-hidden rounded-2xl border-border">
      <CardContent className="grid gap-3 border-b border-border-subtle p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหารหัสหรือชื่อสินค้า')} aria-label={t('ค้นหา')} className="pl-9" /></div>
        <Select value={warehouseId} onValueChange={(value) => value && setWarehouseId(value)}><SelectTrigger className="h-10 w-full lg:w-56" aria-label={t('คลัง')}><SelectValue>{warehouseId === ALL ? t('ทุกคลัง') : warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? t('ทุกคลัง')}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>{t('ทุกคลัง')}</SelectItem>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</SelectItem>)}</SelectContent></Select>
        <ViewToggle value={view} onChange={setView} options={VIEWS} />
        {filter && <p className="flex items-center gap-2 text-sm text-muted-foreground lg:col-span-3">{t('กำลังกรอง')}: <Badge variant="outline" className="border-primary/25 bg-secondary text-primary">{filter === 'low' ? t('ใกล้หมด') : t('ใกล้หมดอายุ')} · {rows.length}</Badge><button type="button" onClick={() => setFilter('')} className="text-primary underline-offset-4 hover:underline">{t('ล้างตัวกรอง')}</button></p>}
      </CardContent>
      {rows.length ? <>
        {view === 'tiles' ? <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">{pagination.visibleItems.map((row) => {
          const days = row.nearestExpiry ? daysUntil(row.nearestExpiry) : null
          return <div key={`${row.variantId}:${row.warehouseId}`} className="flex flex-col overflow-hidden rounded-2xl border border-border">
            <ItemThumb url={row.imageUrl} name={row.name} fill className="!rounded-none !border-0" />
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div><p className="font-medium leading-tight">{row.name}{row.variantLabel && <span className="font-normal text-muted-foreground"> · {row.variantLabel}</span>}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{row.sku} · {row.unit} · {row.warehouseName}</p></div>
              <dl className="grid grid-cols-3 gap-1 text-center text-xs"><div className="rounded-lg bg-surface-subtle p-1.5"><dt className="text-muted-foreground">{t('คงเหลือ')}</dt><dd className="text-sm font-semibold tabular-nums">{row.onHand}</dd></div><div className="rounded-lg bg-surface-subtle p-1.5"><dt className="text-muted-foreground">{t('ถูกจอง')}</dt><dd className="text-sm font-semibold tabular-nums">{row.reserved}</dd></div><div className="rounded-lg bg-secondary p-1.5"><dt className="text-muted-foreground">{t('เบิกได้')}</dt><dd className="text-sm font-bold tabular-nums text-primary">{row.available}</dd></div></dl>
              <div className="flex flex-wrap gap-1">{row.isLow && <Badge variant="outline" className="border-warning/25 bg-warning/10 text-warning">{t('ใกล้หมด')}</Badge>}{row.nearestExpiry && days !== null && <Badge variant="outline" className={toneClass[expiryTone(days, warnDays)]}>{formatDate(row.nearestExpiry, language)} · {days < 0 ? t('หมดอายุแล้ว') : `${days} ${t('วัน')}`}</Badge>}</div>
              <div className="mt-auto flex justify-end gap-1 border-t border-border-subtle pt-2">
                <Button iconOnly variant="ghost" size="sm" onClick={() => setAction({ mode: 'adjust', row })}><SlidersHorizontal size={15} />{t('ปรับยอด')}</Button>
                <Button iconOnly variant="ghost" size="sm" onClick={() => setAction({ mode: 'writeoff', row })}><Minus size={15} />{t('ตัดจำหน่าย')}</Button>
                {warehouses.length > 1 && <Button iconOnly variant="ghost" size="sm" onClick={() => setAction({ mode: 'transfer', row })}><ArrowLeftRight size={15} />{t('โอนคลัง')}</Button>}
              </div>
            </div>
          </div>
        })}</div> : <Table>
          <TableHeader><TableRow><TableHead className="w-12 text-center">{t('ลำดับ')}</TableHead><TableHead>{t('สินค้า')}</TableHead><TableHead>{t('คลัง')}</TableHead><TableHead className="text-right">{t('คงเหลือ')}</TableHead><TableHead className="text-right">{t('ถูกจอง')}</TableHead><TableHead className="text-right">{t('เบิกได้')}</TableHead><TableHead>{t('วันหมดอายุใกล้สุด')}</TableHead><TableHead className="text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((row, index) => {
            const days = row.nearestExpiry ? daysUntil(row.nearestExpiry) : null
            return <TableRow key={`${row.variantId}:${row.warehouseId}`}>
              <TableCell className="text-center text-muted-foreground tabular-nums">{(pagination.page - 1) * pagination.pageSize + index + 1}</TableCell>
              <TableCell><div className="flex items-center gap-3"><ItemThumb url={row.imageUrl} name={row.name} size={40} /><div className="min-w-0"><p className="font-medium">{row.name}{row.variantLabel && <span className="ml-1 font-normal text-muted-foreground">· {row.variantLabel}</span>}</p><p className="text-xs text-muted-foreground">{row.sku} · {row.unit}</p></div></div></TableCell>
              <TableCell>{row.warehouseName}</TableCell>
              <TableCell className="text-right tabular-nums">{row.onHand}{row.isLow && <Badge variant="outline" className="ml-2 border-warning/25 bg-warning/10 text-warning">{t('ใกล้หมด')}</Badge>}</TableCell>
              <TableCell className="text-right tabular-nums">{row.reserved}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{row.available}</TableCell>
              <TableCell>{row.nearestExpiry && days !== null ? <Badge variant="outline" className={toneClass[expiryTone(days, warnDays)]}>{formatDate(row.nearestExpiry, language)} · {days < 0 ? t('หมดอายุแล้ว') : `${days} ${t('วัน')}`}</Badge> : '—'}</TableCell>
              <TableCell><div className="flex justify-end gap-1">
                <Button iconOnly variant="ghost" size="sm" onClick={() => setAction({ mode: 'adjust', row })}><SlidersHorizontal size={15} />{t('ปรับยอด')}</Button>
                <Button iconOnly variant="ghost" size="sm" onClick={() => setAction({ mode: 'writeoff', row })}><Minus size={15} />{t('ตัดจำหน่าย')}</Button>
                {warehouses.length > 1 && <Button iconOnly variant="ghost" size="sm" onClick={() => setAction({ mode: 'transfer', row })}><ArrowLeftRight size={15} />{t('โอนคลัง')}</Button>}
              </div></TableCell>
            </TableRow>
          })}</TableBody>
        </Table>}
        <DataTablePagination total={rows.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><Boxes className="mx-auto mb-2" size={22} />
        {loading ? t('กำลังโหลด…') : warehouses.length === 0 ? t('ยังไม่มีคลังที่คุณดูแล กรุณาติดต่อผู้ดูแลระบบ') : filter || query ? t('ไม่พบรายการที่ตรงกับเงื่อนไข') : t('ยังไม่มีสต็อก กด "รับสินค้าเข้าคลัง" เพื่อเริ่มต้น')}</div></div>}
    </Card>
    {receiveOpen && <ReceiveDialog open warehouses={activeWarehouses} defaultWarehouseId={warehouseId === ALL ? '' : warehouseId} onClose={() => setReceiveOpen(false)} onSaved={done} />}
    <StockActionDialog mode={action?.mode ?? null} row={action?.row ?? null} warehouses={warehouses} onClose={() => setAction(null)} onSaved={done} />
  </div>
}
