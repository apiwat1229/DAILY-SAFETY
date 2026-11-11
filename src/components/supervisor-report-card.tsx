import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CircleCheck, CircleDashed, LoaderCircle, TriangleAlert, UserCheck, UserX, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate } from '@/lib/api'
import type { SupervisorReport } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Filter = 'all' | 'not_reported' | 'reported'
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
    const filtered = filter === 'all' ? list : list.filter((row) => (filter === 'reported' ? row.status !== 'not_reported' : row.status === 'not_reported'))
    const rank = { not_reported: 0, reported_period: 1, reported_today: 2 }
    return [...filtered].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
  }, [report, filter])

  const summary = report?.summary
  return <Card className="rounded-2xl border-border">
    <CardHeader className="border-b border-border-subtle px-5 py-4">
      <CardTitle className="flex items-center gap-2"><UsersRound size={18} className="text-primary" />{t('สถานะการรายงานของหัวหน้างาน')}</CardTitle>
      <CardDescription>{t('หัวหน้างานและผู้ดูแลระบบที่เปิดใช้งาน เทียบกับผู้ที่ส่งแบบตรวจแล้ว')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 px-5 pb-5 pt-4">
      {loading && !report ? <div className="grid min-h-32 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div> : summary && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon={UsersRound} label={t('หัวหน้างานทั้งหมด')} value={summary.total} />
          <Tile icon={UserCheck} tone="success" label={t('รายงานวันนี้แล้ว')} value={summary.reportedToday} hint={`${summary.rateToday}%`} />
          <Tile icon={UserX} tone="danger" label={t('วันนี้ยังไม่รายงาน')} value={summary.notReportedToday} />
          <Tile icon={TriangleAlert} tone="warning" label={t('งานแก้ไขค้าง / เกินกำหนด')} value={`${summary.openTasks} / ${summary.overdueTasks}`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RateBar label={t('อัตราการรายงานวันนี้')} done={summary.reportedToday} total={summary.total} percent={summary.rateToday} />
          <RateBar label={`${t('อัตราการรายงานในช่วง')} ${formatDate(report.period.from, language)} – ${formatDate(report.period.to, language)}`} done={summary.reportedPeriod} total={summary.total} percent={summary.ratePeriod} />
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="not_reported">{t('ยังไม่รายงาน')} ({summary.notReportedPeriod})</TabsTrigger>
            <TabsTrigger value="reported">{t('รายงานแล้ว')} ({summary.reportedPeriod})</TabsTrigger>
            <TabsTrigger value="all">{t('ทั้งหมด')} ({summary.total})</TabsTrigger>
          </TabsList>
        </Tabs>
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
                <TableCell>{row.lastReportDate ? `${formatDate(row.lastReportDate, language)} ${row.lastReportTime}` : '—'}</TableCell>
                <TableCell className="tabular-nums">{row.ngFound}</TableCell>
                <TableCell className="tabular-nums">{row.openTasks}</TableCell>
                <TableCell className={`tabular-nums ${row.overdueTasks ? 'font-semibold text-destructive' : ''}`}>{row.overdueTasks}</TableCell>
              </TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{filter === 'not_reported' ? t('ทุกคนรายงานแล้ว') : t('ไม่พบข้อมูล')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </>}
    </CardContent>
  </Card>
}

function Tile({ icon: Icon, label, value, hint, tone }: { icon: typeof UsersRound; label: string; value: number | string; hint?: string; tone?: 'success' | 'danger' | 'warning' }) {
  const color = tone === 'success' ? 'bg-success/10 text-success' : tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-secondary text-primary'
  return <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface-subtle p-3">
    <div className="min-w-0"><p className="truncate text-sm text-muted-foreground">{label}</p><p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}{hint && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{hint}</span>}</p></div>
    <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={17} /></div>
  </div>
}

function RateBar({ label, done, total, percent }: { label: string; done: number; total: number; percent: number }) {
  return <div className="space-y-1.5"><div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{done}/{total} · {percent}%</span></div><Progress value={percent} /></div>
}
