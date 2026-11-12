import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, CircleDashed, ListChecks, LoaderCircle, RotateCcw, TriangleAlert, UserCheck, UserX, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate, formatDateWithTime, localDateString } from '@/lib/api'
import type { SupervisorReport } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePersistentState } from '@/lib/persistent-state'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'

type Filter = 'all' | 'reported' | 'not_reported' | 'open_tasks' | 'overdue'
const filters: Filter[] = ['all', 'reported', 'not_reported', 'open_tasks', 'overdue']
const filterLabel: Record<Filter, string> = {
  all: 'ทั้งหมด', reported: 'รายงานแล้ว', not_reported: 'ยังไม่รายงาน', open_tasks: 'มีงานแก้ไขค้าง', overdue: 'มีงานเกินกำหนด',
}
type Props = { refreshKey?: number }

const statusStyle = {
  reported: 'border-success/25 bg-success/10 text-success',
  not_reported: 'border-destructive/25 bg-destructive/10 text-destructive',
} as const

/** Leader-and-above reporting status: how many supervisors exist, who has reported, who has not, and their follow-up load. */
export function SupervisorReportCard({ refreshKey = 0 }: Props) {
  const { language, t } = useI18n()
  const [report, setReport] = useState<SupervisorReport | null>(null)
  const [loading, setLoading] = useState(true)
  // One day (today) by default; the range can be widened to any period up to today.
  const today = localDateString()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [storedFilter, setFilter] = usePersistentState<Filter>('supervisors.filter2', 'not_reported')
  const filter = filters.includes(storedFilter) ? storedFilter : 'all'
  const isToday = from === today && to === today

  useEffect(() => {
    let active = true
    setLoading(true)
    api.supervisorReport(from, to)
      .then((result) => { if (active) setReport(result) })
      .catch((error) => { if (active) toast.error(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [from, to, refreshKey])

  const rows = useMemo(() => {
    const list = report?.supervisors ?? []
    const matches: Record<Filter, (row: SupervisorReport['supervisors'][number]) => boolean> = {
      all: () => true,
      reported: (row) => row.inspectionsPeriod > 0,
      not_reported: (row) => row.inspectionsPeriod === 0,
      open_tasks: (row) => row.openTasks > 0,
      overdue: (row) => row.overdueTasks > 0,
    }
    return list.filter(matches[filter]).sort((a, b) => Number(a.inspectionsPeriod > 0) - Number(b.inspectionsPeriod > 0) || a.name.localeCompare(b.name))
  }, [report, filter])

  const pagination = useDataPagination(rows)

  /** Clicking the active tile again clears the filter. */
  const toggle = (next: Filter) => setFilter((current) => (current === next ? 'all' : next))

  const summary = report?.summary
  return <Card className="rounded-2xl border-border">
    <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle className="flex items-center gap-2"><UsersRound size={18} className="text-primary" />{t('สถานะการรายงานของหัวหน้างาน')}</CardTitle>
        <CardDescription className="mt-1">{t('หัวหน้างานที่เปิดใช้งาน เทียบกับผู้ที่ส่งแบบตรวจแล้ว')}</CardDescription>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-2">
        <DatePicker ariaLabel={t('เริ่มวันที่')} value={from} maxDate={to} onChange={(value) => value && setFrom(value)} className="h-8 w-[150px] border-0 bg-transparent px-1 text-xs shadow-none" placeholder={t('เริ่มวันที่')} />
        <span className="text-xs text-muted-foreground">{t('ถึง')}</span>
        <DatePicker ariaLabel={t('ถึงวันที่')} value={to} minDate={from} maxDate={today} onChange={(value) => value && setTo(value)} className="h-8 w-[150px] border-0 bg-transparent px-1 text-xs shadow-none" placeholder={t('ถึงวันที่')} />
        {!isToday && <Button type="button" variant="ghost" size="sm" iconOnly onClick={() => { setFrom(today); setTo(today) }}><RotateCcw size={15} />{t('กลับเป็นวันนี้')}</Button>}
      </div>
    </CardHeader>
    <CardContent className="space-y-4 px-5 pb-5 pt-4">
      {loading && !report ? <div className="grid min-h-32 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div> : summary && <>
        <p className="text-sm text-muted-foreground">{isToday ? t('ข้อมูลของวันนี้') : t('ข้อมูลช่วง')} <span className="font-medium text-foreground">{from === to ? formatDate(from, language) : `${formatDate(from, language)} – ${formatDate(to, language)}`}</span></p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile icon={UsersRound} label={t('หัวหน้างานทั้งหมด')} value={summary.total} active={filter === 'all'} onClick={() => setFilter('all')} />
          <Tile icon={UserCheck} tone="success" label={t('รายงานแล้ว')} value={summary.reportedPeriod} hint={`${summary.ratePeriod}%`} active={filter === 'reported'} onClick={() => toggle('reported')} />
          <Tile icon={UserX} tone="danger" label={t('ยังไม่รายงาน')} value={summary.notReportedPeriod} active={filter === 'not_reported'} onClick={() => toggle('not_reported')} />
          <Tile icon={ListChecks} tone="warning" label={t('งานแก้ไขค้าง')} value={summary.openTasks} active={filter === 'open_tasks'} onClick={() => toggle('open_tasks')} />
          <Tile icon={TriangleAlert} tone="danger" label={t('เกินกำหนด')} value={summary.overdueTasks} active={filter === 'overdue'} onClick={() => toggle('overdue')} />
        </div>
        <RateBar label={t('อัตราการรายงาน')} done={summary.reportedPeriod} total={summary.total} percent={summary.ratePeriod} />
        {filter !== 'all' && <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{t('กำลังกรอง')}: <Badge variant="outline" className="border-primary/25 bg-secondary text-primary">{t(filterLabel[filter])} · {rows.length}</Badge><button type="button" onClick={() => setFilter('all')} className="text-primary underline-offset-4 hover:underline">{t('ล้างตัวกรอง')}</button></p>}
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12 text-center">{t('ลำดับ')}</TableHead>
              <TableHead>{t('หัวหน้างาน')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead>{t('จำนวนที่ส่ง')}</TableHead>
              <TableHead>{t('รายงานล่าสุด')}</TableHead><TableHead>{t('พบ NG')}</TableHead><TableHead>{t('งานค้าง')}</TableHead><TableHead>{t('เกินกำหนด')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pagination.visibleItems.map((row, index) => <TableRow key={row.id}><TableCell className="text-center text-muted-foreground tabular-nums">{(pagination.page - 1) * pagination.pageSize + index + 1}</TableCell>
                <TableCell><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.employeeCode} · {row.role === 'admin' ? 'Admin' : t('หัวหน้างาน')}</p></TableCell>
                <TableCell>{(() => { const key = row.inspectionsPeriod > 0 ? 'reported' : 'not_reported'; return <Badge variant="outline" className={`gap-1 ${statusStyle[key]}`}>{key === 'reported' ? <CircleCheck size={12} /> : <CircleDashed size={12} />}{t(filterLabel[key])}</Badge> })()}</TableCell>
                <TableCell className="tabular-nums">{row.inspectionsPeriod}</TableCell>
                <TableCell>{row.lastReportDate ? formatDateWithTime(row.lastReportDate, row.lastReportTime, language) : '—'}</TableCell>
                <TableCell className="tabular-nums">{row.ngFound}</TableCell>
                <TableCell className="tabular-nums">{row.openTasks}</TableCell>
                <TableCell className={`tabular-nums ${row.overdueTasks ? 'font-semibold text-destructive' : ''}`}>{row.overdueTasks}</TableCell>
              </TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{filter === 'not_reported' ? t('ทุกคนรายงานแล้ว') : t('ไม่พบข้อมูล')}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <DataTablePagination total={rows.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
        </div>
      </>}
    </CardContent>
  </Card>
}

function Tile({ icon: Icon, label, value, hint, tone, active, onClick }: { icon: typeof UsersRound; label: string; value: number | string; hint?: string; tone?: 'success' | 'danger' | 'warning'; active: boolean; onClick: () => void }) {
  const color = tone === 'success' ? 'bg-success/10 text-success' : tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-secondary text-primary'
  return <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-primary ${active ? 'border-primary bg-secondary/60 ring-2 ring-primary/25' : 'border-border bg-surface-subtle'}`}>
    <div className="min-w-0"><p className="truncate text-sm text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}{hint && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{hint}</span>}</p></div>
    <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={17} /></div>
  </button>
}

function RateBar({ label, done, total, percent }: { label: string; done: number; total: number; percent: number }) {
  return <div className="space-y-1.5"><div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{done}/{total} · {percent}%</span></div><Progress value={percent} /></div>
}
