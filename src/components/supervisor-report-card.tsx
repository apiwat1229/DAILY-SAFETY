import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CircleCheck, CircleDashed, ListChecks, LoaderCircle, TriangleAlert, UserCheck, UserX, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate, formatDateWithTime } from '@/lib/api'
import type { SupervisorReport } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Filter = 'all' | 'not_reported' | 'reported' | 'reported_today' | 'not_reported_today' | 'open_tasks' | 'overdue'
const tabFilters: Filter[] = ['not_reported', 'reported', 'all']
const filterLabel: Record<Filter, string> = {
  all: 'ทั้งหมด', not_reported: 'ยังไม่รายงาน', reported: 'รายงานแล้ว', reported_today: 'รายงานวันนี้แล้ว',
  not_reported_today: 'วันนี้ยังไม่รายงาน', open_tasks: 'มีงานแก้ไขค้าง', overdue: 'มีงานเกินกำหนด',
}
type Props = { from: string; to: string; refreshKey?: number }

const statusStyle = {
  reported_today: 'border-success/25 bg-success/10 text-success',
  reported_period: 'border-info/20 bg-info/10 text-info',
  not_reported: 'border-destructive/25 bg-destructive/10 text-destructive',
} as const
const statusLabel = { reported_today: 'รายงานวันนี้แล้ว', reported_period: 'รายงานในช่วงนี้แล้ว', not_reported: 'ยังไม่รายงาน' } as const

/** Leader-and-above reporting status: how many supervisors exist, who has reported, who has not, and their follow-up load. */
export function SupervisorReportCard({ from, to, refreshKey = 0 }: Props) {
  const { language, t } = useI18n()
  const [report, setReport] = useState<SupervisorReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('not_reported')

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
      not_reported: (row) => row.status === 'not_reported',
      reported: (row) => row.status !== 'not_reported',
      reported_today: (row) => row.status === 'reported_today',
      not_reported_today: (row) => row.inspectionsToday === 0,
      open_tasks: (row) => row.openTasks > 0,
      overdue: (row) => row.overdueTasks > 0,
    }
    const rank = { not_reported: 0, reported_period: 1, reported_today: 2 }
    return list.filter(matches[filter]).sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
  }, [report, filter])

  /** Clicking the active tile again clears the filter. */
  const toggle = (next: Filter) => setFilter((current) => (current === next ? 'all' : next))

  const summary = report?.summary
  return <Card className="rounded-2xl border-border">
    <CardHeader className="border-b border-border-subtle px-5 py-4">
      <CardTitle className="flex items-center gap-2"><UsersRound size={18} className="text-primary" />{t('สถานะการรายงานของหัวหน้างาน')}</CardTitle>
      <CardDescription>{t('หัวหน้างานและผู้ดูแลระบบที่เปิดใช้งาน เทียบกับผู้ที่ส่งแบบตรวจแล้ว')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 px-5 pb-5 pt-4">
      {loading && !report ? <div className="grid min-h-32 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div> : summary && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile icon={UsersRound} label={t('หัวหน้างานทั้งหมด')} value={summary.total} active={filter === 'all'} onClick={() => setFilter('all')} />
          <Tile icon={UserCheck} tone="success" label={t('รายงานวันนี้แล้ว')} value={summary.reportedToday} hint={`${summary.rateToday}%`} active={filter === 'reported_today'} onClick={() => toggle('reported_today')} />
          <Tile icon={UserX} tone="danger" label={t('วันนี้ยังไม่รายงาน')} value={summary.notReportedToday} active={filter === 'not_reported_today'} onClick={() => toggle('not_reported_today')} />
          <Tile icon={ListChecks} tone="warning" label={t('งานแก้ไขค้าง')} value={summary.openTasks} active={filter === 'open_tasks'} onClick={() => toggle('open_tasks')} />
          <Tile icon={TriangleAlert} tone="danger" label={t('เกินกำหนด')} value={summary.overdueTasks} active={filter === 'overdue'} onClick={() => toggle('overdue')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RateBar label={t('อัตราการรายงานวันนี้')} done={summary.reportedToday} total={summary.total} percent={summary.rateToday} />
          <RateBar label={`${t('อัตราการรายงานในช่วง')} ${formatDate(report.period.from, language)} – ${formatDate(report.period.to, language)}`} done={summary.reportedPeriod} total={summary.total} percent={summary.ratePeriod} />
        </div>
        <Tabs value={tabFilters.includes(filter) ? filter : ''} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="not_reported">{t('ยังไม่รายงาน')} ({summary.notReportedPeriod})</TabsTrigger>
            <TabsTrigger value="reported">{t('รายงานแล้ว')} ({summary.reportedPeriod})</TabsTrigger>
            <TabsTrigger value="all">{t('ทั้งหมด')} ({summary.total})</TabsTrigger>
          </TabsList>
        </Tabs>
        {filter !== 'all' && !tabFilters.includes(filter) && <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{t('กำลังกรอง')}: <Badge variant="outline" className="border-primary/25 bg-secondary text-primary">{t(filterLabel[filter])} · {rows.length}</Badge><button type="button" onClick={() => setFilter('all')} className="text-primary underline-offset-4 hover:underline">{t('ล้างตัวกรอง')}</button></p>}
        <div className="overflow-hidden rounded-2xl border border-border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t('หัวหน้างาน')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead>{t('ส่งแบบตรวจ (ช่วงนี้)')}</TableHead>
              <TableHead>{t('รายงานล่าสุด')}</TableHead><TableHead>{t('พบ NG')}</TableHead><TableHead>{t('งานค้าง')}</TableHead><TableHead>{t('เกินกำหนด')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => <TableRow key={row.id}>
                <TableCell><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.employeeCode} · {row.role === 'admin' ? 'Admin' : t('หัวหน้างาน')}</p></TableCell>
                <TableCell><Badge variant="outline" className={`gap-1 ${statusStyle[row.status]}`}>{row.status === 'not_reported' ? <CircleDashed size={12} /> : row.status === 'reported_today' ? <CircleCheck size={12} /> : <CalendarCheck size={12} />}{t(statusLabel[row.status])}</Badge></TableCell>
                <TableCell className="tabular-nums">{row.inspectionsPeriod}</TableCell>
                <TableCell>{row.lastReportDate ? formatDateWithTime(row.lastReportDate, row.lastReportTime, language) : '—'}</TableCell>
                <TableCell className="tabular-nums">{row.ngFound}</TableCell>
                <TableCell className="tabular-nums">{row.openTasks}</TableCell>
                <TableCell className={`tabular-nums ${row.overdueTasks ? 'font-semibold text-destructive' : ''}`}>{row.overdueTasks}</TableCell>
              </TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{filter === 'not_reported' || filter === 'not_reported_today' ? t('ทุกคนรายงานแล้ว') : t('ไม่พบข้อมูล')}</TableCell></TableRow>}
            </TableBody>
          </Table>
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
