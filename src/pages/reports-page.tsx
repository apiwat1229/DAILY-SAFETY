import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Printer, ShieldCheck, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime } from '@/lib/api'
import { reportApi, type ReportFilters } from '@/lib/requisition-api'
import { usePersistentState } from '@/lib/persistent-state'
import type { CycleReport, IntegritySummary, ReportGroup, ReportOptions, UsageReport } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { html, printDocument } from '@/lib/print-html'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { DatePicker } from '@/components/date-picker'
import { statusLabel } from '@/components/requisitions/status-badge'

const ALL = '__all__'
const bangkokDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const GROUP_LABEL: Record<ReportGroup, string> = { department: 'แผนก', person: 'ผู้เบิก', item: 'สินค้า' }

/** Usage, approval cycle time and (admin) the nightly stock-ledger check. The server narrows every figure to the viewer's role. */
export function ReportsPage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const [from, setFrom] = usePersistentState('reports.from', bangkokDate(-30))
  const [to, setTo] = usePersistentState('reports.to', bangkokDate())
  const [groupBy, setGroupBy] = usePersistentState<ReportGroup>('reports.group', 'department')
  const [type, setType] = usePersistentState('reports.type', ALL)
  const [warehouseId, setWarehouseId] = usePersistentState('reports.warehouse', ALL)
  const [department, setDepartment] = usePersistentState('reports.department', ALL)
  const [options, setOptions] = useState<ReportOptions | null>(null)
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [cycle, setCycle] = useState<CycleReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { reportApi.options().then(setOptions).catch(() => undefined) }, [])

  const filters = useMemo<ReportFilters>(() => ({
    from, to, groupBy, type: type === ALL ? undefined : type,
    warehouseId: warehouseId === ALL ? undefined : warehouseId, department: department === ALL ? undefined : department,
  }), [from, to, groupBy, type, warehouseId, department])

  const load = useCallback(() => {
    if (!from || !to) return
    if (from > to) { toast.error(t('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด')); return }
    setLoading(true)
    Promise.all([reportApi.usage(filters), reportApi.cycleTime(filters)])
      .then(([u, c]) => { setUsage(u); setCycle(c) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [filters, from, to, t])
  useEffect(load, [load])

  const rows = usage?.rows ?? []
  const pagination = useDataPagination(rows)

  function print() {
    if (!usage) return
    const body = html`<h1>${t('รายงานการเบิกใช้')}</h1><p class="muted">${formatDate(usage.from, language)} – ${formatDate(usage.to, language)}</p>
      <table><thead><tr><th>${t(GROUP_LABEL[usage.groupBy])}</th><th class="num">${t('จำนวนใบเบิก')}</th><th class="num">${t('จ่ายออก')}</th><th class="num">${t('รับคืน')}</th><th class="num">${t('ใช้สุทธิ')}</th></tr></thead>
      <tbody>${usage.rows.map((row) => html`<tr><td>${row.label}</td><td class="num">${row.requisitions}</td><td class="num">${row.issued}</td><td class="num">${row.returned}</td><td class="num">${row.net}</td></tr>`)}</tbody>
      <tfoot><tr><th>${t('รวม')}</th><th></th><th class="num">${usage.totals.issued}</th><th class="num">${usage.totals.returned}</th><th class="num">${usage.totals.net}</th></tr></tfoot></table>`
    if (!printDocument(t('รายงานการเบิกใช้'), body, language)) toast.error(t('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป'))
  }

  const statusEntries = Object.entries(cycle?.byStatus ?? {})
  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('รายงานการเบิก')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user.role === 'admin' ? t('ภาพรวมทั้งระบบ') : user.role === 'storekeeper' ? t('เฉพาะคลังที่คุณดูแล') : t('เฉพาะแผนกของคุณ')}</p></div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="gap-2" disabled={!usage || rows.length === 0} onClick={print}><Printer size={16} />{t('พิมพ์')}</Button>
        <Button type="button" variant="outline" className="gap-2" asChild><a href={reportApi.exportUrl(filters)} download><Download size={16} />{t('ส่งออก Excel')}</a></Button>
      </div>
    </div>

    <Card className="rounded-2xl border-border"><CardContent className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <DatePicker value={from} onChange={setFrom} placeholder={t('ตั้งแต่วันที่')} ariaLabel={t('ตั้งแต่วันที่')} />
      <DatePicker value={to} onChange={setTo} placeholder={t('ถึงวันที่')} ariaLabel={t('ถึงวันที่')} />
      <Select value={groupBy} onValueChange={(value) => value && setGroupBy(value as ReportGroup)}><SelectTrigger className="h-10 w-full" aria-label={t('จัดกลุ่มตาม')}><SelectValue>{t('จัดกลุ่มตาม')}: {t(GROUP_LABEL[groupBy])}</SelectValue></SelectTrigger>
        <SelectContent>{(Object.keys(GROUP_LABEL) as ReportGroup[]).map((key) => <SelectItem key={key} value={key}>{t(GROUP_LABEL[key])}</SelectItem>)}</SelectContent></Select>
      <Select value={type} onValueChange={(value) => value && setType(value)}><SelectTrigger className="h-10 w-full" aria-label={t('ประเภท')}><SelectValue>{type === ALL ? t('ทุกประเภท') : type === 'ppe' ? 'PPE' : t('ยารักษาโรค')}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{t('ทุกประเภท')}</SelectItem><SelectItem value="ppe">PPE</SelectItem><SelectItem value="medicine">{t('ยารักษาโรค')}</SelectItem></SelectContent></Select>
      {options && options.warehouses.length > 1 && <Select value={warehouseId} onValueChange={(value) => value && setWarehouseId(value)}><SelectTrigger className="h-10 w-full" aria-label={t('คลัง')}><SelectValue>{warehouseId === ALL ? t('ทุกคลัง') : options.warehouses.find((w) => w.id === warehouseId)?.name ?? t('ทุกคลัง')}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{t('ทุกคลัง')}</SelectItem>{options.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>}
      {options && options.departments.length > 1 && <Select value={department} onValueChange={(value) => value && setDepartment(value)}><SelectTrigger className="h-10 w-full" aria-label={t('แผนก')}><SelectValue>{department === ALL ? t('ทุกแผนก') : department}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{t('ทุกแผนก')}</SelectItem>{options.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>}
    </CardContent></Card>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label={t('จ่ายออก')} value={usage?.totals.issued ?? 0} />
      <Stat label={t('รับคืน')} value={usage?.totals.returned ?? 0} />
      <Stat label={t('ใช้สุทธิ')} value={usage?.totals.net ?? 0} strong />
      <Stat label={t('ใบเบิกในช่วงนี้')} value={cycle?.total ?? 0} />
    </div>

    <Card className="overflow-hidden rounded-2xl border-border">
      <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 size={17} className="text-primary" />{t('การเบิกใช้ตาม')}{t(GROUP_LABEL[groupBy])}</CardTitle></CardHeader>
      {rows.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t(GROUP_LABEL[groupBy])}</TableHead><TableHead className="text-right">{t('จำนวนใบเบิก')}</TableHead><TableHead className="text-right">{t('จ่ายออก')}</TableHead><TableHead className="text-right">{t('รับคืน')}</TableHead><TableHead className="text-right">{t('ใช้สุทธิ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((row) => <TableRow key={row.key}><TableCell className="whitespace-normal font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{row.requisitions}</TableCell><TableCell className="text-right tabular-nums">{row.issued}</TableCell><TableCell className="text-right tabular-nums">{row.returned}</TableCell><TableCell className="text-right font-semibold tabular-nums">{row.net}</TableCell></TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={rows.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-40 place-items-center p-8 text-center text-sm text-muted-foreground">{loading ? t('กำลังโหลด…') : t('ไม่มีการเบิกใช้ในช่วงนี้')}</CardContent>}
    </Card>

    <Card className="rounded-2xl border-border">
      <CardHeader className="px-5 pt-4"><CardTitle className="text-base">{t('ระยะเวลาดำเนินการ')}</CardTitle><CardDescription>{t('นับจากใบเบิกที่ส่งในช่วงวันที่ที่เลือก')}</CardDescription></CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
        <Stat label={t('เวลาอนุมัติเฉลี่ย (ชม.)')} value={cycle?.avgApprovalHours ?? 0} />
        <Stat label={t('เวลาจ่ายของเฉลี่ย (ชม.)')} value={cycle?.avgIssueHours ?? 0} />
        <Stat label={t('ขั้นที่เกิน SLA')} value={cycle?.slaBreaches ?? 0} warn={(cycle?.slaBreaches ?? 0) > 0} />
        {statusEntries.length > 0 && <ul className="flex flex-wrap gap-2 sm:col-span-3">{statusEntries.map(([status, count]) => <li key={status} className="rounded-full border border-border px-3 py-1 text-xs">{t(statusLabel[status as keyof typeof statusLabel] ?? status)} <b className="tabular-nums">{count}</b></li>)}</ul>}
      </CardContent>
    </Card>

    {user.role === 'admin' && <IntegrityCard />}
  </div>
}

function Stat({ label, value, strong, warn }: { label: string; value: number; strong?: boolean; warn?: boolean }) {
  return <Card className="rounded-2xl border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p>
    <p className={`mt-1 text-2xl tabular-nums ${strong ? 'font-bold text-primary' : 'font-semibold'} ${warn ? 'text-warning' : ''}`}>{value}</p></CardContent></Card>
}

/** Admin: result of the nightly ledger-vs-balance check, with a button to run it now. */
function IntegrityCard() {
  const { t, language } = useI18n()
  const [last, setLast] = useState<IntegritySummary | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { reportApi.integrity().then((result) => setLast(result.last)).catch(() => undefined) }, [])
  async function run() {
    setBusy(true)
    try { const result = await reportApi.runIntegrity(); setLast(result.last); toast.success(result.last.ok ? t('สต็อกตรงกับสมุดบัญชีทุกรายการ') : t('พบสต็อกที่ไม่ตรงกับสมุดบัญชี')) }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ตรวจสอบไม่สำเร็จ')) }
    finally { setBusy(false) }
  }
  const Icon = last && !last.ok ? ShieldAlert : ShieldCheck
  return <Card className="rounded-2xl border-border">
    <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><Icon size={17} className={last && !last.ok ? 'text-destructive' : 'text-success'} />{t('ตรวจความถูกต้องของสต็อก')}</CardTitle>
      <CardDescription>{t('เทียบยอดคงเหลือกับสมุดบัญชีเคลื่อนไหวทุกคืน')}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">{last ? <>{last.ok ? t('ตรวจล่าสุด: ไม่พบความผิดปกติ') : `${t('ตรวจล่าสุด: พบรายการไม่ตรงกัน')} ${last.mismatchCount}`} <span className="text-muted-foreground">· {formatDateTime(last.at, language)}</span></> : <span className="text-muted-foreground">{t('ยังไม่เคยตรวจ')}</span>}</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>{t('ตรวจตอนนี้')}</Button>
    </CardContent>
  </Card>
}
