import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ClipboardList, Eye, FileDown, FileSpreadsheet, Pencil, Printer, RotateCw, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, exportExcelUrl, formatDate, formatDateTime, formatDateWithTime, localDateString } from '@/lib/api'
import type { Filters, InspectionSummary, MyTask, User } from '@/lib/types'
import { InspectionDetailDialog } from '@/components/inspection-detail-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'
import { isManager } from '@/lib/roles'
import { useI18n } from '@/lib/i18n'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { ConfirmActionDialog } from '@/components/confirm-action-dialog'
import { createPrintWindow, inspectionPrintMarkup, renderPrintWindow } from '@/lib/print-documents'
import { usePersistentState } from '@/lib/persistent-state'

type Props = { user: User; initialFilter: Pick<Filters, 'from' | 'to' | 'category'> | null; onInitialFilterApplied: () => void }

function dateBack(days: number) {
  const [year, month, day] = localDateString().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - days))
  return date.toISOString().slice(0, 10)
}

const emptyFilters: Filters = { from: dateBack(30), to: localDateString(), area: '', inspector: '', employeeCode: '', shift: '', result: '', status: '', category: '' }

export function InspectionsPage({ user, initialFilter, onInitialFilterApplied }: Props) {
  const { language, t } = useI18n()
  const [filters, setFilters] = usePersistentState<Filters>('inspections.filters', emptyFilters)
  const [records, setRecords] = useState<InspectionSummary[]>([])
  const [query, setQuery] = usePersistentState('inspections.query', '')
  const [myTasks, setMyTasks] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(user.role !== 'admin')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editInspectionId, setEditInspectionId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InspectionSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
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
  const activeSummary = filters.status === 'open' ? 'open' : filters.result === 'NG' ? 'ng' : 'all'
  const setSummaryFilter = (scope: 'all' | 'ng' | 'open') => setFilters((current) => ({ ...current, result: scope === 'all' ? '' : 'NG', status: scope === 'open' ? 'open' : '', category: '' }))

  function printInspection(id: string, mode: 'pdf' | 'print') {
    const popup = createPrintWindow()
    if (!popup) { toast.error(t('เบราว์เซอร์บล็อกหน้าต่าง PDF โปรดอนุญาตป๊อปอัปแล้วลองอีกครั้ง')); return }
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Loading report…</title></head><body style="font:16px sans-serif;padding:24px">Loading report…</body></html>')
    api.inspection(id).then(({ inspection }) => {
      const title = `${mode === 'pdf' ? 'inspection-report' : 'inspection-print'}-${inspection.date}-${inspection.id}`
      renderPrintWindow(popup, title, inspectionPrintMarkup(inspection, language, formatDate, formatDateTime, t))
    }).catch((error) => { popup.close(); toast.error(t(error instanceof Error ? error.message : 'เปิดรายงานไม่สำเร็จ')) })
  }

  async function deleteInspection() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteInspection(deleteTarget.id)
      setDeleteTarget(null)
      toast.success(t('ลบรายการตรวจแล้ว'))
      refresh()
      refreshTasks()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบรายการไม่สำเร็จ')) }
    finally { setDeleting(false) }
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">{t('ศูนย์ติดตาม')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('รายการตรวจ')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('ค้นหาผลตรวจและติดตามการแก้ไขพร้อมหลักฐาน')}</p></div>
        {isManager(user) && <div className="grid w-full gap-2 sm:flex sm:w-auto sm:items-center"><div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} aria-label={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-10 pl-9" /></div>{user.role === 'admin' && <Button iconOnly asChild variant="outline" className="h-10 w-full gap-2 sm:w-auto"><a href={exportExcelUrl(filters, language)}><FileSpreadsheet size={16} /> {t('ส่งออก Excel พร้อมรูป')}</a></Button>}</div>}
      </div>

      {user.role !== 'admin' && <MyTasksCard tasks={myTasks} loading={tasksLoading} language={language} onOpen={(inspectionId) => setSelectedId(inspectionId)} />}

      <Card className="rounded-2xl border-border py-0">
        <CardContent className="grid gap-2 p-2 xl:grid-cols-[minmax(0,1fr)_350px] xl:items-center">
          <div className="grid divide-y divide-border-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SummaryTile label={t('รายการตรวจ')} value={totals.count} detail={t('ตามตัวกรองปัจจุบัน')} tone="neutral" language={language} active={activeSummary === 'all'} onClick={() => setSummaryFilter('all')} />
            <SummaryTile label={t('รายการ NG')} value={totals.ng} detail={t('พบจากรายการตรวจ')} tone="red" language={language} active={activeSummary === 'ng'} onClick={() => setSummaryFilter(activeSummary === 'ng' ? 'all' : 'ng')} />
            <SummaryTile label={t('รอแก้ไข')} value={totals.open} detail={t('ยังไม่ปิดงาน')} tone="amber" language={language} active={activeSummary === 'open'} onClick={() => setSummaryFilter(activeSummary === 'open' ? 'all' : 'open')} />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-border-subtle pt-2 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
            <div className="grid min-w-0 gap-1"><Label htmlFor="filter-from" className="text-xs text-muted-foreground">{t('ตั้งแต่วันที่')}</Label><DatePicker id="filter-from" ariaLabel={t('ตั้งแต่วันที่')} value={filters.from} maxDate={filters.to} onChange={(value) => setDateFilter('from', value)} className="h-9 text-xs" /></div>
            <div className="grid min-w-0 gap-1"><Label htmlFor="filter-to" className="text-xs text-muted-foreground">{t('ถึงวันที่')}</Label><DatePicker id="filter-to" ariaLabel={t('ถึงวันที่')} value={filters.to} minDate={filters.from} maxDate={localDateString()} onChange={(value) => setDateFilter('to', value)} className="h-9 text-xs" /></div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border">
        {!isManager(user) && <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-sm">{t('ผลการค้นหา')}</CardTitle><CardDescription className="mt-1 text-xs">{t('แสดง')} {filteredRecords.length} {t('รายการ')}</CardDescription></div><div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} aria-label={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-9 pl-9" /></div></CardHeader>}
        {filteredRecords.length ? <>
          <div className="hidden overflow-x-auto md:block"><Table>
            <TableHeader><TableRow className="bg-surface-subtle hover:bg-surface-subtle"><TableHead className="w-12 text-center">{t('ลำดับ')}</TableHead><TableHead className="pl-5 text-xs">{t('วันที่ / เวลา')}</TableHead><TableHead className="text-xs">{t('พื้นที่ / แผนก')}</TableHead><TableHead className="text-xs">{t('ผู้ตรวจ')}</TableHead><TableHead className="text-xs">{t('กะ')}</TableHead><TableHead className="text-center text-xs">NG</TableHead><TableHead className="text-center text-xs">{t('ค้างงาน')}</TableHead><TableHead className="pr-5 text-right text-xs">{t(user.role === 'admin' ? 'การทำรายการ' : 'รายละเอียด')}</TableHead></TableRow></TableHeader>
            <TableBody>{pagination.visibleItems.map((record, index) => <TableRow key={record.id} className="cursor-pointer" onClick={() => { setEditInspectionId(null); setSelectedId(record.id) }}><TableCell className="text-center text-muted-foreground tabular-nums">{(pagination.page - 1) * pagination.pageSize + index + 1}</TableCell>
              <TableCell className="whitespace-nowrap pl-5"><p className="text-xs font-medium">{formatDateWithTime(record.date, record.time, language)}</p></TableCell><TableCell className="max-w-[220px] truncate text-xs">{record.area}</TableCell><TableCell className="text-xs">{record.inspector}<span className="ml-1 text-xs text-muted-foreground">{record.employeeCode}</span></TableCell><TableCell className="text-xs">{record.shift}</TableCell>
              <TableCell className="text-center">{record.ngCount ? <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-xs text-destructive">{record.ngCount}</Badge> : <span className="text-xs text-muted-foreground">0</span>}</TableCell>
              <TableCell className="text-center">{record.openCount ? <Badge variant="outline" className="border-warning/25 bg-warning/10 text-xs text-warning">{record.openCount}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell><TableCell className="pr-5"><div className="flex justify-end gap-0.5"><Button iconOnly type="button" variant="ghost" size="icon" aria-label={t('ดูข้อมูล')} title={t('ดูข้อมูล')} onClick={(event) => { event.stopPropagation(); setEditInspectionId(null); setSelectedId(record.id) }}><Eye size={15} /></Button><Button iconOnly type="button" variant="ghost" size="icon" aria-label={t('ดาวน์โหลด PDF')} title={`${t('ดาวน์โหลด PDF')} · ${t('เปิดหน้าพิมพ์ แล้วเลือกบันทึกเป็น PDF')}`} onClick={(event) => { event.stopPropagation(); printInspection(record.id, 'pdf') }}><FileDown size={15} /></Button><Button iconOnly type="button" variant="ghost" size="icon" aria-label={t('พิมพ์')} title={t('พิมพ์')} onClick={(event) => { event.stopPropagation(); printInspection(record.id, 'print') }}><Printer size={15} /></Button>{user.role === 'admin' && <><Button iconOnly type="button" variant="ghost" size="icon" aria-label={t('แก้ไข')} title={t('แก้ไข')} onClick={(event) => { event.stopPropagation(); setEditInspectionId(record.id); setSelectedId(record.id) }}><Pencil size={15} /></Button><Button iconOnly type="button" variant="ghost" size="icon" aria-label={t('ลบ')} title={t('ลบ')} className="text-destructive hover:text-destructive" onClick={(event) => { event.stopPropagation(); setDeleteTarget(record) }}><Trash2 size={15} /></Button></>}</div></TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
          <div className="divide-y divide-border-subtle md:hidden">{pagination.visibleItems.map((record) => <div key={record.id} className="space-y-2 px-4 py-3"><button type="button" onClick={() => { setEditInspectionId(null); setSelectedId(record.id) }} className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary">
            <div className="min-w-0"><p className="truncate text-xs font-semibold">{record.area}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatDateWithTime(record.date, record.time, language)} · {record.shift} · {record.inspector}</p><div className="mt-2 flex gap-1.5">{record.ngCount ? <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-xs text-destructive">NG {record.ngCount}</Badge> : <Badge variant="outline" className="text-xs text-muted-foreground">{t('ปกติ')}</Badge>}{record.openCount > 0 && <Badge variant="outline" className="border-warning/25 bg-warning/10 text-xs text-warning">{t('ค้าง')} {record.openCount}</Badge>}</div></div>
            <ChevronRightIcon />
          </button><div className="flex justify-end gap-1"><Button iconOnly type="button" variant="ghost" size="icon" className="size-8" aria-label={t('ดาวน์โหลด PDF')} title={t('ดาวน์โหลด PDF')} onClick={() => printInspection(record.id, 'pdf')}><FileDown size={15} /></Button><Button iconOnly type="button" variant="ghost" size="icon" className="size-8" aria-label={t('พิมพ์')} title={t('พิมพ์')} onClick={() => printInspection(record.id, 'print')}><Printer size={15} /></Button>{user.role === 'admin' && <><Button iconOnly type="button" variant="ghost" size="icon" className="size-8" aria-label={t('แก้ไข')} title={t('แก้ไข')} onClick={() => { setEditInspectionId(record.id); setSelectedId(record.id) }}><Pencil size={15} /></Button><Button iconOnly type="button" variant="ghost" size="icon" className="size-8 text-destructive" aria-label={t('ลบ')} title={t('ลบ')} onClick={() => setDeleteTarget(record)}><Trash2 size={15} /></Button></>}</div></div>)}</div>
          <DataTablePagination total={filteredRecords.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
        </> : <CardContent className="grid min-h-56 place-items-center text-center"><div><div className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-secondary text-primary"><ClipboardList size={19} /></div><p className="text-sm font-medium">{loading ? t('กำลังค้นหารายการ…') : records.length ? t('ไม่พบรายการตรวจที่ตรงกับคำค้น') : t('ไม่พบรายการตรวจ')}</p><p className="mt-1 text-xs text-muted-foreground">{records.length ? t('ปรับคำค้นหาหรือตัวกรองแล้วลองอีกครั้ง') : t('ปรับตัวกรองหรือเลือกช่วงวันที่อื่น')}</p></div></CardContent>}
      </Card>
      <InspectionDetailDialog id={selectedId} user={user} startInEditMode={editInspectionId === selectedId} onOpenChange={(open) => { if (!open) { setSelectedId(null); setEditInspectionId(null) } }} onUpdated={() => { refresh(); refreshTasks() }} />
      <ConfirmActionDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }} title={t('ลบรายการตรวจนี้หรือไม่')} description={deleteTarget ? `${formatDate(deleteTarget.date, language)} · ${deleteTarget.area} · ${t('การลบจะนำรายการตรวจและหลักฐานที่แนบออกจากระบบอย่างถาวร')}` : ''} confirmLabel={t('ลบรายการ')} cancelLabel={t('ยกเลิก')} pending={deleting} onConfirm={() => void deleteInspection()} />
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

function SummaryTile({ label, value, detail, tone, language, active, onClick }: { label: string; value: number; detail: string; tone: 'neutral' | 'red' | 'amber'; language: 'th' | 'en'; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} title={language === 'th' ? 'กดเพื่อกรองรายการ' : 'Click to filter records'} onClick={onClick} className={`min-w-0 rounded-xl px-2 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:px-3 sm:py-1.5 ${active ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-surface-subtle'}`}><p className="text-xs text-muted-foreground">{label}</p><div className="mt-0.5 flex min-w-0 items-baseline justify-between gap-2"><p className={`shrink-0 text-xl font-semibold tabular-nums ${tone === 'red' ? 'text-destructive' : tone === 'amber' ? 'text-warning' : ''}`}>{value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</p><span className="truncate text-xs text-muted-foreground">{detail}</span></div></button>
}

function ChevronRightIcon() {
  return <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-white text-muted-foreground"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></span>
}
