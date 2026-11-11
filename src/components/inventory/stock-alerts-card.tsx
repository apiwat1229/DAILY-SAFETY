import { useEffect, useState } from 'react'
import { CalendarX2, PackageMinus, TriangleAlert } from 'lucide-react'
import { inventoryApi } from '@/lib/inventory-api'
import type { StockAlerts } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Selection = 'low' | 'expiring'
type Props = { alerts: StockAlerts | null; onSelect?: (kind: Selection) => void }

/** Counts for the stock page: items below their reorder point and lots inside each expiry window. */
export function StockAlertsCard({ alerts, onSelect }: Props) {
  const { t } = useI18n()
  if (!alerts) return null
  const windows = [...alerts.expiryWarnDays].sort((a, b) => a - b)
  const expired = alerts.expiring.filter((row) => row.daysLeft < 0).length
  const buckets = windows.map((days, index) => ({ days, count: alerts.expiring.filter((row) => row.daysLeft >= 0 && row.daysLeft <= days && (index === 0 || row.daysLeft > windows[index - 1])).length }))
  const tile = (icon: typeof PackageMinus, label: string, value: number, tone: string, kind?: Selection, key?: number) => {
    const Icon = icon
    return <button key={key ?? label} type="button" disabled={!onSelect || !kind} onClick={() => kind && onSelect?.(kind)} className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-border bg-surface-subtle p-3 text-left transition-colors enabled:hover:border-primary/40 enabled:hover:bg-secondary/40 disabled:cursor-default">
      <div className="min-w-0"><p className="text-sm leading-tight text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p></div>
      <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={17} /></div></button>
  }
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
    {tile(PackageMinus, t('ใกล้หมด (ต่ำกว่าจุดสั่งซื้อซ้ำ)'), alerts.lowStock.length, 'bg-warning/10 text-warning', 'low')}
    {tile(CalendarX2, t('หมดอายุแล้ว'), expired, 'bg-destructive/10 text-destructive', 'expiring')}
    {buckets.map((bucket) => tile(TriangleAlert, `${t('หมดอายุใน')} ${bucket.days} ${t('วัน')}`, bucket.count, 'bg-info/10 text-info', 'expiring', bucket.days))}
  </div>
}

/** Self-loading summary for the admin dashboard. */
export function DashboardStockAlerts({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  const [alerts, setAlerts] = useState<StockAlerts | null>(null)
  useEffect(() => { inventoryApi.alerts().then(setAlerts).catch(() => setAlerts(null)) }, [])
  if (!alerts || (alerts.lowStock.length === 0 && alerts.expiring.length === 0)) return null
  return <Card className="rounded-2xl border-border">
    <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><PackageMinus size={17} className="text-warning" />{t('แจ้งเตือนคลังสินค้า')}</CardTitle></CardHeader>
    <CardContent className="px-5 pb-5"><StockAlertsCard alerts={alerts} onSelect={onOpen} /></CardContent>
  </Card>
}
