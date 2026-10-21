import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ClipboardList, FileSpreadsheet, Filter, RotateCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, exportExcelUrl, formatDate, localDateString } from '@/lib/api'
import type { Filters, InspectionSummary, MyTask, User } from '@/lib/types'
import { InspectionDetailDialog } from '@/components/inspection-detail-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'
import { useI18n } from '@/lib/i18n'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'

type Props = { user: User; initialFilter: Pick<Filters, 'from' | 'to' | 'category'> | null; onInitialFilterApplied: () => void }

function dateBack(days: number) {
  const [year, month, day] = localDateString().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - days))
  return date.toISOString().slice(0, 10)
}

const emptyFilters: Filters = { from: dateBack(30), to: localDateString(), area: '', inspector: '', employeeCode: '', shift: '', result: '', status: '', category: '' }

export function InspectionsPage({ user, initialFilter, onInitialFilterApplied }: Props) {
  const { language, t } = useI18n()
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [records, setRecords] = useState<InspectionSummary[]>([])
  const [query, setQuery] = useState('')
  const [myTasks, setMyTasks] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(user.role !== 'admin')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!initialFilter) return
    setFilters((current) => ({ ...current, ...initialFilter }))
    onInitialFilterApplied()
  }, [initialFilter, onInitialFilterApplied])

  const refresh = useCallback(() => {
    setLoading(true)
    api.inspections(filters).then(({ inspections }) => setRecords(inspections)).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [filters])
  useEffect(refresh, [refresh])

  const refreshTasks = useCallback(() => {
    if (user.role === 'admin') return
    setTasksLoading(true)
    api.myTasks().then(({ tasks }) => setMyTasks(tasks)).catch((error) => toast.error(error.message)).finally(() => setTasksLoading(false))
  }, [user.role])
  useEffect(refreshTasks, [refreshTasks])

  const totals = useMemo(() => records.reduce((summary, record) => ({
    count: summary.count + 1,
    ng: summary.ng + record.ngCount,
    open: summary.open + record.openCount,
  }), { count: 0, ng: 0, open: 0 }), [records])
  const filteredRecords = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return records
    return records.filter((record) => [
      record.id, record.date, formatDate(record.date, language), record.time, record.area,
      record.inspector, record.employeeCode, record.shift, record.ngCount, record.openCount,
    ].some((value) => String(value ?? '').toLocaleLowerCase().includes(search)))
  }, [language, query, records])
  const pagination = useDataPagination(filteredRecords)

  const setDateFilter = (key: 'from' | 'to', value: string) => setFilters((current) => ({ ...current, [key]: value }))

  return (
    <div className="page-stack">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">{t('ศูนย์ติดตาม')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('รายการตรวจ')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('ค้นหาผลตรวจและติดตามการแก้ไขพร้อมหลักฐาน')}</p></div>
        {user.role === 'admin' && <div className="grid w-full gap-2 sm:flex sm:w-auto"><Button asChild variant="outline" className="h-11 w-full gap-2 sm:w-auto"><a href={exportExcelUrl(filters, language)}><FileSpreadsheet size={16} /> {t('ส่งออก Excel พร้อมรูป')}</a></Button></div>}
      </div>

      {user.role !== 'admin' && <MyTasksCard tasks={myTasks} loading={tasksLoading} language={language} onOpen={(inspectionId) => setSelectedId(inspectionId)} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label={t('รายการตรวจ')} value={totals.count} detail={t('ตามตัวกรองปัจจุบัน')} tone="neutral" language={language} />
        <SummaryTile label={t('รายการ NG')} value={totals.ng} detail={t('พบจากรายการตรวจ')} tone="red" language={language} />
        <SummaryTile label={t('รอแก้ไข')} value={totals.open} detail={t('ยังไม่ปิดงาน')} tone="amber" language={language} />
      </div>

      <Card className="rounded-2xl border-border">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-secondary text-primary"><Filter size={15} /></div><div><CardTitle className="text-sm">{t('ช่วงวันที่')}</CardTitle><CardDescription className="mt-0.5 text-[11px]">{t('เลือกช่วงวันที่ที่ต้องการดู')}</CardDescription></div></div><div className="grid grid-cols-2 gap-2 sm:w-[340px]"><div className="grid gap-1"><Label htmlFor="filter-from" className="text-[10px] text-muted-foreground">{t('ตั้งแต่วันที่')}</Label><DatePicker id="filter-from" ariaLabel={t('ตั้งแต่วันที่')} value={filters.from} maxDate={filters.to} onChange={(value) => setDateFilter('from', value)} className="h-9 text-xs" /></div><div className="grid gap-1"><Label htmlFor="filter-to" className="text-[10px] text-muted-foreground">{t('ถึงวันที่')}</Label><DatePicker id="filter-to" ariaLabel={t('ถึงวันที่')} value={filters.to} minDate={filters.from} maxDate={localDateString()} onChange={(value) => setDateFilter('to', value)} className="h-9 text-xs" /></div></div></CardHeader>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border">
        <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-sm">{t('ผลการค้นหา')}</CardTitle><CardDescription className="mt-1 text-[11px]">{t('แสดง')} {filteredRecords.length} {t('รายการ')}</CardDescription></div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"><div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} aria-label={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-9 pl-9" /></div></div>
        </CardHeader>
        {filteredRecords.length ? <>
          <div className="hidden overflow-x-auto md:block"><Table>
            <TableHeader><TableRow className="bg-surface-subtle hover:bg-surface-subtle"><TableHead className="pl-5 text-[10px]">{t('วันที่ / เวลา')}</TableHead><TableHead className="text-[10px]">{t('พื้นที่ / แผนก')}</TableHead><TableHead className="text-[10px]">{t('ผู้ตรวจ')}</TableHead><TableHead className="text-[10px]">{t('กะ')}</TableHead><TableHead className="text-center text-[10px]">NG</TableHead><TableHead className="text-center text-[10px]">{t('ค้างงาน')}</TableHead><TableHead className="pr-5 text-right text-[10px]">{t('รายละเอียด')}</TableHead></TableRow></TableHeader>
            <TableBody>{pagination.visibleItems.map((record) => <TableRow key={record.id} className="cursor-pointer" onClick={() => setSelectedId(record.id)}>
              <TableCell className="whitespace-nowrap pl-5"><p className="text-xs font-medium">{formatDate(record.date, language)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{record.time || '—'} {t('น.')}</p></TableCell><TableCell className="max-w-[220px] truncate text-xs">{record.area}</TableCell><TableCell className="text-xs">{record.inspector}<span className="ml-1 text-[10px] text-muted-foreground">{record.employeeCode}</span></TableCell><TableCell className="text-xs">{record.shift}</TableCell>
              <TableCell className="text-center">{record.ngCount ? <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-[10px] text-destructive">{record.ngCount}</Badge> : <span className="text-xs text-muted-foreground">0</span>}</TableCell>
              <TableCell className="text-center">{record.openCount ? <Badge variant="outline" className="border-warning/25 bg-warning/10 text-[10px] text-warning">{record.openCount}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell><TableCell className="pr-5 text-right text-xs font-medium text-primary">{t('ดูข้อมูล')}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
          <div className="divide-y divide-border-subtle md:hidden">{pagination.visibleItems.map((record) => <Button key={record.id} variant="ghost" onClick={() => setSelectedId(record.id)} className="h-auto w-full justify-between gap-3 rounded-none px-4 py-4 text-left whitespace-normal hover:bg-surface-subtle">
            <div className="min-w-0"><p className="truncate text-xs font-semibold">{record.area}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{formatDate(record.date, language)} · {record.time || '—'} {t('น.')} · {record.shift} · {record.inspector}</p><div className="mt-2 flex gap-1.5">{record.ngCount ? <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-[9px] text-destructive">NG {record.ngCount}</Badge> : <Badge variant="outline" className="text-[9px] text-muted-foreground">{t('ปกติ')}</Badge>}{record.openCount > 0 && <Badge variant="outline" className="border-warning/25 bg-warning/10 text-[9px] text-warning">{t('ค้าง')} {record.openCount}</Badge>}</div></div>
            <ChevronRightIcon />
          </Button>)}</div>
          <DataTablePagination total={filteredRecords.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
        </> : <CardContent className="grid min-h-56 place-items-center text-center"><div><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-secondary text-primary"><ClipboardList size={19} /></div><p className="text-sm font-medium">{loading ? t('กำลังค้นหารายการ…') : records.length ? t('ไม่พบรายการตรวจที่ตรงกับคำค้น') : t('ไม่พบรายการตรวจ')}</p><p className="mt-1 text-xs text-muted-foreground">{records.length ? t('ปรับคำค้นหาหรือตัวกรองแล้วลองอีกครั้ง') : t('ปรับตัวกรองหรือเลือกช่วงวันที่อื่น')}</p></div></CardContent>}
      </Card>
      <InspectionDetailDialog id={selectedId} user={user} onOpenChange={(open) => !open && setSelectedId(null)} onUpdated={() => { refresh(); refreshTasks() }} />
    </div>
  )
}

function MyTasksCard({ tasks, loading, language, onOpen }: { tasks: MyTask[]; loading: boolean; language: 'th' | 'en'; onOpen: (inspectionId: string) => void }) {
  const { t } = useI18n()
  const notStarted = tasks.filter((task) => task.followUpStatus === 'ยังไม่แก้ไข').length
  const inProgress = tasks.filter((task) => task.followUpStatus === 'กำลังแก้ไข').length
  const overdue = tasks.filter((task) => task.overdue).length
  return <Card className="overflow-hidden rounded-2xl border-warning/25 bg-card">
    <CardHeader className="border-b border-warning/20 bg-warning/10 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning"><AlertTriangle size={19} /></div><div><CardTitle className="text-base">{t('งานของฉันที่ยังไม่เสร็จ')}</CardTitle><CardDescription className="mt-1 text-sm">{t('เปิดรายการเพื่ออัปเดตความคืบหน้าและแนบรูปหลังแก้ไข')}</CardDescription></div></div>
        <div className="flex flex-wrap gap-2 text-xs font-medium"><Badge variant="outline" className="border-warning/25 bg-white text-warning">{t('ยังไม่แก้ไข')} {notStarted}</Badge><Badge variant="outline" className="border-info/20 bg-white text-info">{t('กำลังแก้ไข')} {inProgress}</Badge>{overdue > 0 && <Badge variant="outline" className="border-destructive/25 bg-white text-destructive">{t('เกินกำหนด')} {overdue}</Badge>}</div>
      </div>
    </CardHeader>
    {loading ? <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><RotateCw size={16} className="animate-spin" /> {t('กำลังโหลดงาน…')}</CardContent> : tasks.length ? <div className="divide-y divide-warning/20">{tasks.map((task) => <button key={task.id} type="button" onClick={() => onOpen(task.inspectionId)} className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-warning/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-warning sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{task.title}</span><Badge variant="outline" className={task.overdue ? 'border-destructive/25 bg-destructive/10 text-destructive' : task.followUpStatus === 'กำลังแก้ไข' ? 'border-info/20 bg-info/10 text-info' : 'border-warning/25 bg-warning/10 text-warning'}>{t(task.overdue ? 'เกินกำหนด' : task.followUpStatus)}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.issueDetails}</p><p className="mt-1 truncate text-xs text-muted-foreground">{task.area} · {formatDate(task.date, language)} · {task.inspector}{task.dueDate ? ` · ${t('กำหนด')} ${formatDate(task.dueDate, language)}` : ''}</p></div>
      <span className="inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:self-auto">{t('เปิดเพื่ออัปเดต')} <ArrowRight size={15} /></span>
    </button>)}</div> : <CardContent className="px-5 py-7 text-center"><p className="text-sm font-semibold text-success">{t('ไม่มีงานแก้ไขที่มอบหมายให้คุณ')}</p><p className="mt-1 text-sm text-muted-foreground">{t('รายการ NG ที่มอบหมายให้คุณจะแสดงที่นี่')}</p><p className="mx-auto mt-3 max-w-xl rounded-lg bg-white px-3 py-2 text-xs text-muted-foreground">{t('หากมีงานค้าง ให้ผู้ดูแลระบบเลือกบัญชีของคุณเป็นผู้รับผิดชอบในรายการ NG')}</p></CardContent>}
  </Card>
}

function SummaryTile({ label, value, detail, tone, language }: { label: string; value: number; detail: string; tone: 'neutral' | 'red' | 'amber'; language: 'th' | 'en' }) {
  return <Card className="rounded-xl border-border py-0"><CardContent className="px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><div className="mt-0.5 flex items-end justify-between gap-2"><p className={`text-xl font-semibold tabular-nums ${tone === 'red' ? 'text-destructive' : tone === 'amber' ? 'text-warning' : ''}`}>{value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</p><span className="text-[10px] text-muted-foreground">{detail}</span></div></CardContent></Card>
}

function ChevronRightIcon() {
  return <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-white text-muted-foreground"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></span>
}
