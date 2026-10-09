import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardList, FileSpreadsheet, Filter, RotateCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, exportExcelUrl, formatDate, localDateString } from '@/lib/api'
import type { ChecklistItem, Filters, InspectionSuggestions, InspectionSummary, MyTask, User } from '@/lib/types'
import { InspectionDetailDialog } from '@/components/inspection-detail-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'
import { useI18n } from '@/lib/i18n'
import { AutocompleteInput } from '@/components/autocomplete-input'

type Props = { user: User; initialFilter: Pick<Filters, 'from' | 'to' | 'category'> | null; onInitialFilterApplied: () => void }

function dateBack(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return localDateString(date)
}

const emptyFilters: Filters = { from: dateBack(30), to: localDateString(), area: '', inspector: '', employeeCode: '', shift: '', result: '', status: '', category: '' }

export function InspectionsPage({ user, initialFilter, onInitialFilterApplied }: Props) {
  const { language, t } = useI18n()
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [records, setRecords] = useState<InspectionSummary[]>([])
  const [myTasks, setMyTasks] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(user.role !== 'admin')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<InspectionSuggestions>({ areas: [], shifts: [], inspectors: [], employeeCodes: [], responsibles: [] })
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])

  useEffect(() => { api.suggestions(language).then(setSuggestions).catch(() => undefined) }, [language])
  useEffect(() => { api.checklist().then(({ items }) => setChecklist(items)).catch(() => undefined) }, [])
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

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const resetFilters = () => setFilters({ ...emptyFilters, to: localDateString() })

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">{t('ศูนย์ติดตาม')}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('รายการตรวจ')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('ค้นหาผลตรวจและติดตามการแก้ไขพร้อมหลักฐาน')}</p></div>
        {user.role === 'admin' && <div className="grid w-full gap-2 sm:flex sm:w-auto"><Button asChild variant="outline" className="h-11 w-full gap-2 sm:w-auto"><a href={exportExcelUrl(filters, language)}><FileSpreadsheet size={16} /> {t('ส่งออก Excel พร้อมรูป')}</a></Button></div>}
      </div>

      {user.role !== 'admin' && <MyTasksCard tasks={myTasks} loading={tasksLoading} language={language} onOpen={(inspectionId) => setSelectedId(inspectionId)} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label={t('รายการตรวจ')} value={totals.count} detail={t('ตามตัวกรองปัจจุบัน')} tone="neutral" language={language} />
        <SummaryTile label={t('รายการ NG')} value={totals.ng} detail={t('พบจากรายการตรวจ')} tone="red" language={language} />
        <SummaryTile label={t('รอแก้ไข')} value={totals.open} detail={t('ยังไม่ปิดงาน')} tone="amber" language={language} />
      </div>

      <Card className="rounded-2xl border-[#e8eeee]">
        <CardHeader className="pb-3"><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-[#edf5f3] text-primary"><Filter size={15} /></div><div><CardTitle className="text-sm">{t('ตัวกรองรายงาน')}</CardTitle><CardDescription className="mt-0.5 text-[11px]">{t('เลือกช่วงวันที่ พื้นที่ ผู้ตรวจ และสถานะที่ต้องการดู')}</CardDescription></div></div></CardHeader>
        <CardContent className="grid gap-3 border-t border-[#eff2f2] pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
          <div className="grid gap-1.5"><Label htmlFor="filter-from" className="text-[10px] text-muted-foreground">{t('ตั้งแต่วันที่')}</Label><DatePicker id="filter-from" ariaLabel={t('ตั้งแต่วันที่')} value={filters.from} maxDate={filters.to} onChange={(value) => setFilter('from', value)} className="h-9 text-xs" /></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-to" className="text-[10px] text-muted-foreground">{t('ถึงวันที่')}</Label><DatePicker id="filter-to" ariaLabel={t('ถึงวันที่')} value={filters.to} minDate={filters.from} maxDate={localDateString()} onChange={(value) => setFilter('to', value)} className="h-9 text-xs" /></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-area" className="text-[10px] text-muted-foreground">{t('แผนก / พื้นที่')}</Label><AutocompleteInput id="filter-area" value={filters.area} onValueChange={(value) => setFilter('area', value)} suggestions={suggestions.areas} placeholder={t('ค้นหาพื้นที่')} className="h-9 text-xs" /></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-inspector" className="text-[10px] text-muted-foreground">{t('ผู้ตรวจ / ชื่อพนักงาน')}</Label><AutocompleteInput id="filter-inspector" value={filters.inspector} onValueChange={(value) => setFilter('inspector', value)} suggestions={suggestions.inspectors} placeholder={t('ค้นหาชื่อพนักงาน')} className="h-9 text-xs" /></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-employee-code" className="text-[10px] text-muted-foreground">{t('รหัสพนักงาน')}</Label><AutocompleteInput id="filter-employee-code" value={filters.employeeCode} onValueChange={(value) => setFilter('employeeCode', value)} suggestions={suggestions.employeeCodes} placeholder={t('ค้นหารหัสพนักงาน')} className="h-9 text-xs" /></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-shift" className="text-[10px] text-muted-foreground">{t('กะ')}</Label><AutocompleteInput id="filter-shift" value={filters.shift} onValueChange={(value) => setFilter('shift', value)} suggestions={suggestions.shifts} placeholder={t('ทุกกะ')} className="h-9 text-xs" /></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-result" className="text-[10px] text-muted-foreground">{t('ผลตรวจ')}</Label><Select value={filters.result || 'all'} onValueChange={(value) => setFilter('result', value === 'all' ? '' : value)}><SelectTrigger id="filter-result" className="h-9 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('ทุกผลตรวจ')}</SelectItem><SelectItem value="NG">{t('มี NG')}</SelectItem><SelectItem value="OK">{t('มี OK')}</SelectItem><SelectItem value="N/A">{t('มี N/A')}</SelectItem></SelectContent></Select></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-status" className="text-[10px] text-muted-foreground">{t('สถานะงาน')}</Label><Select value={filters.status || 'all'} onValueChange={(value) => setFilter('status', value === 'all' ? '' : value)}><SelectTrigger id="filter-status" className="h-9 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('ทุกสถานะ')}</SelectItem><SelectItem value="ยังไม่แก้ไข">{t('ยังไม่แก้ไข')}</SelectItem><SelectItem value="กำลังแก้ไข">{t('กำลังแก้ไข')}</SelectItem><SelectItem value="แก้ไขแล้ว">{t('แก้ไขแล้ว')}</SelectItem></SelectContent></Select></div>
          <div className="grid gap-1.5"><Label htmlFor="filter-category" className="text-[10px] text-muted-foreground">{t('หัวข้อตรวจ')}</Label><Select value={filters.category || 'all'} onValueChange={(value) => setFilter('category', value === 'all' ? '' : value)}><SelectTrigger id="filter-category" className="h-9 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('ทุกหัวข้อ')}</SelectItem>{checklist.map((item) => <SelectItem key={item.key} value={item.title}>{t(item.title)}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end xl:col-span-9"><Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"><X size={13} /> {t('ล้างตัวกรอง')}</Button></div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-[#e8eeee]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-[#edf0f0] px-5 py-4">
          <div><CardTitle className="text-sm">{t('ผลการค้นหา')}</CardTitle><CardDescription className="mt-1 text-[11px]">{t('แสดง')} {records.length} {t('รายการ')}{records.length >= 200 ? ` · ${t('จำกัด 200 รายการต่อครั้ง')}` : ''}</CardDescription></div>
          <Badge variant="outline" className="gap-1.5 border-[#e4ecea] bg-[#f8fbfa] text-[10px] text-muted-foreground"><CalendarDays size={12} /> {formatDate(filters.from, language)} – {formatDate(filters.to, language)}</Badge>
        </CardHeader>
        {records.length ? <>
          <div className="hidden overflow-x-auto md:block"><Table>
            <TableHeader><TableRow className="bg-[#fafcfc] hover:bg-[#fafcfc]"><TableHead className="pl-5 text-[10px]">{t('วันที่ / เวลา')}</TableHead><TableHead className="text-[10px]">{t('พื้นที่ / แผนก')}</TableHead><TableHead className="text-[10px]">{t('ผู้ตรวจ')}</TableHead><TableHead className="text-[10px]">{t('กะ')}</TableHead><TableHead className="text-center text-[10px]">NG</TableHead><TableHead className="text-center text-[10px]">{t('ค้างงาน')}</TableHead><TableHead className="pr-5 text-right text-[10px]">{t('รายละเอียด')}</TableHead></TableRow></TableHeader>
            <TableBody>{records.map((record) => <TableRow key={record.id} className="cursor-pointer" onClick={() => setSelectedId(record.id)}>
              <TableCell className="whitespace-nowrap pl-5"><p className="text-xs font-medium">{formatDate(record.date, language)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{record.time || '—'} {t('น.')}</p></TableCell><TableCell className="max-w-[220px] truncate text-xs">{record.area}</TableCell><TableCell className="text-xs">{record.inspector}<span className="ml-1 text-[10px] text-muted-foreground">{record.employeeCode}</span></TableCell><TableCell className="text-xs">{record.shift}</TableCell>
              <TableCell className="text-center">{record.ngCount ? <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-700">{record.ngCount}</Badge> : <span className="text-xs text-muted-foreground">0</span>}</TableCell>
              <TableCell className="text-center">{record.openCount ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">{record.openCount}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell><TableCell className="pr-5 text-right text-xs font-medium text-primary">{t('ดูข้อมูล')}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
          <div className="divide-y divide-[#edf0f0] md:hidden">{records.map((record) => <Button key={record.id} variant="ghost" onClick={() => setSelectedId(record.id)} className="h-auto w-full justify-between gap-3 rounded-none px-4 py-4 text-left whitespace-normal hover:bg-[#fafcfc]">
            <div className="min-w-0"><p className="truncate text-xs font-semibold">{record.area}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{formatDate(record.date, language)} · {record.time || '—'} {t('น.')} · {record.shift} · {record.inspector}</p><div className="mt-2 flex gap-1.5">{record.ngCount ? <Badge variant="outline" className="border-red-200 bg-red-50 text-[9px] text-red-700">NG {record.ngCount}</Badge> : <Badge variant="outline" className="text-[9px] text-muted-foreground">{t('ปกติ')}</Badge>}{record.openCount > 0 && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[9px] text-amber-700">{t('ค้าง')} {record.openCount}</Badge>}</div></div>
            <ChevronRightIcon />
          </Button>)}</div>
        </> : <CardContent className="grid min-h-56 place-items-center text-center"><div><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-[#eff5f3] text-primary"><ClipboardList size={19} /></div><p className="text-sm font-medium">{loading ? t('กำลังค้นหารายการ…') : t('ไม่พบรายการตรวจ')}</p><p className="mt-1 text-xs text-muted-foreground">{t('ปรับตัวกรองหรือเลือกช่วงวันที่อื่น')}</p></div></CardContent>}
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
  return <Card className="overflow-hidden rounded-2xl border-amber-200 bg-[#fffefa]">
    <CardHeader className="border-b border-amber-100 bg-amber-50/60 pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><AlertTriangle size={19} /></div><div><CardTitle className="text-base">{t('งานของฉันที่ยังไม่เสร็จ')}</CardTitle><CardDescription className="mt-1 text-sm">{t('เปิดรายการเพื่ออัปเดตความคืบหน้าและแนบรูปหลังแก้ไข')}</CardDescription></div></div>
        <div className="flex flex-wrap gap-2 text-xs font-medium"><Badge variant="outline" className="border-amber-200 bg-white text-amber-800">{t('ยังไม่แก้ไข')} {notStarted}</Badge><Badge variant="outline" className="border-sky-200 bg-white text-sky-800">{t('กำลังแก้ไข')} {inProgress}</Badge>{overdue > 0 && <Badge variant="outline" className="border-red-200 bg-white text-red-700">{t('เกินกำหนด')} {overdue}</Badge>}</div>
      </div>
    </CardHeader>
    {loading ? <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><RotateCw size={16} className="animate-spin" /> {t('กำลังโหลดงาน…')}</CardContent> : tasks.length ? <div className="divide-y divide-amber-100">{tasks.map((task) => <button key={task.id} type="button" onClick={() => onOpen(task.inspectionId)} className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-amber-50/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-600 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{task.title}</span><Badge variant="outline" className={task.overdue ? 'border-red-200 bg-red-50 text-red-700' : task.followUpStatus === 'กำลังแก้ไข' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-amber-200 bg-amber-50 text-amber-800'}>{t(task.overdue ? 'เกินกำหนด' : task.followUpStatus)}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.issueDetails}</p><p className="mt-1 truncate text-xs text-muted-foreground">{task.area} · {formatDate(task.date, language)} · {task.inspector}{task.dueDate ? ` · ${t('กำหนด')} ${formatDate(task.dueDate, language)}` : ''}</p></div>
      <span className="inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:self-auto">{t('เปิดเพื่ออัปเดต')} <ArrowRight size={15} /></span>
    </button>)}</div> : <CardContent className="px-5 py-7 text-center"><p className="text-sm font-semibold text-emerald-800">{t('ไม่มีงานแก้ไขที่มอบหมายให้คุณ')}</p><p className="mt-1 text-sm text-muted-foreground">{t('รายการ NG ที่มอบหมายให้คุณจะแสดงที่นี่')}</p></CardContent>}
  </Card>
}

function SummaryTile({ label, value, detail, tone, language }: { label: string; value: number; detail: string; tone: 'neutral' | 'red' | 'amber'; language: 'th' | 'en' }) {
  return <Card className="rounded-xl border-[#e8eeee]"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground">{label}</p><div className="mt-1 flex items-end justify-between"><p className={`text-2xl font-semibold ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : ''}`}>{value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</p><span className="text-[10px] text-muted-foreground">{detail}</span></div></CardContent></Card>
}

function ChevronRightIcon() {
  return <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-white text-muted-foreground"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></span>
}
