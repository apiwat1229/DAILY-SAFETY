import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FileCheck2, LoaderCircle, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDate, localDateString } from '@/lib/api'
import type { DashboardCategorySummary, DashboardData, User } from '@/lib/types'
import type { PageKey } from '@/components/app-shell'
import { InspectionDetailDialog } from '@/components/inspection-detail-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/i18n'

type Props = { user: User; onPage: (page: PageKey) => void }

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return localDateString(value)
}

export function DashboardPage({ user, onPage }: Props) {
  const { language, t } = useI18n()
  const today = localDateString()
  const [from, setFrom] = useState(() => `${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<'NG' | 'N/A'>('NG')
  const [categorySummary, setCategorySummary] = useState<DashboardCategorySummary | null>(null)
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.dashboard({ from, to, categoryResult: selectedResult }).then(setData).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [from, to, refreshKey, selectedResult])

  useEffect(() => {
    if (!selectedCategory) { setCategorySummary(null); return }
    let active = true
    setCategoryLoading(true)
    api.dashboardCategory(selectedCategory, from, to, selectedResult)
      .then((summary) => { if (active) setCategorySummary(summary) })
      .catch((error) => { if (active) toast.error(error.message) })
      .finally(() => { if (active) setCategoryLoading(false) })
    return () => { active = false }
  }, [selectedCategory, selectedResult, from, to, refreshKey])

  const trend = useMemo(() => {
    const map = new Map((data?.trend || []).map((point) => [point.date, point]))
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(to, index - 6)
      return map.get(date) || { date, ok: 0, ng: 0, na: 0 }
    })
  }, [data?.trend, to])
  const maxBar = Math.max(1, ...trend.map((point) => point.ok + point.ng + point.na))

  const metrics = [
    { title: t('รายการตรวจ'), value: data?.stats.inspections ?? 0, note: t('ครั้งในช่วงเวลาที่เลือก'), icon: FileCheck2, tone: 'mint' },
    { title: t('รายการ NG'), value: data?.stats.ng ?? 0, note: `${data?.stats.open ?? 0} ${t('รายการยังเปิดอยู่')}`, icon: ShieldAlert, tone: 'red' },
    { title: t('แก้ไขแล้ว'), value: data?.stats.resolved ?? 0, note: `${data?.stats.resolutionRate ?? 0}% ${t('ของ NG ทั้งหมด')}`, icon: CheckCircle2, tone: 'green' },
    { title: t('เกินกำหนด'), value: data?.stats.overdue ?? 0, note: t('มีวันครบกำหนดและยังไม่ปิดงาน'), icon: Clock3, tone: 'amber' },
  ] as const

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm font-medium text-primary">{t('รายงานประจำวัน')}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('ภาพรวมการตรวจ')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('ดูผลตรวจ รายการ NG และความคืบหน้าการแก้ไข')}</p></div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e4eaea] bg-white p-2">
          <DatePicker ariaLabel={t('เริ่มวันที่')} value={from} maxDate={to} onChange={setFrom} className="h-8 w-[150px] border-0 bg-transparent px-1 text-xs shadow-none" placeholder={t('เริ่มวันที่')} />
          <span className="text-xs text-muted-foreground">{t('ถึง')}</span>
          <DatePicker ariaLabel={t('ถึงวันที่')} value={to} minDate={from} maxDate={today} onChange={setTo} className="h-8 w-[150px] border-0 bg-transparent px-1 text-xs shadow-none" placeholder={t('ถึงวันที่')} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ title, value, note, icon: Icon, tone }) => <Card key={title} className="metric-card rounded-2xl border-[#e8eeee]">
          <CardContent className="flex items-start justify-between p-5">
            <div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{loading ? '—' : value.toLocaleString('th-TH')}</p><p className="mt-2 text-[11px] text-muted-foreground">{note}</p></div>
            <div className={`grid size-10 place-items-center rounded-xl ${tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#eaf4f1] text-primary'}`}><Icon size={18} /></div>
          </CardContent>
        </Card>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <Card className="rounded-2xl border-[#e8eeee]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div><CardTitle className="text-[15px]">{t('ผลตรวจในแต่ละวัน')}</CardTitle><CardDescription className="mt-1 text-xs">{t('จำนวนผลตรวจแยกตามสถานะ · 7 วันล่าสุด')}</CardDescription></div>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-1 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-600" /> OK</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#e77c68]" /> NG</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-slate-400" /> N/A</span></div>
          </CardHeader>
          <CardContent className="pt-4">
            {data?.stats.checked ? <div className="grid h-[202px] grid-cols-7 items-end gap-2 border-b border-[#edf0f0] pb-2 sm:gap-5">
              {trend.map((point) => {
                const total = point.ok + point.ng + point.na
                const height = total ? Math.max(24, (total / maxBar) * 128) : 4
                const segments = [
                  { key: 'ok', count: point.ok, color: 'bg-emerald-600', label: 'OK' },
                  { key: 'ng', count: point.ng, color: 'bg-[#e77c68]', label: 'NG' },
                  { key: 'na', count: point.na, color: 'bg-slate-400', label: 'N/A' },
                ]
                return <div key={point.date} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5" title={`${point.ok} OK · ${point.ng} NG · ${point.na} N/A`}>
                  <span className="h-4 text-[10px] font-semibold tabular-nums text-foreground">{total || ''}</span>
                  <div className="flex w-full max-w-[36px] flex-col-reverse overflow-hidden rounded-t-md bg-[#f0f3f3]" style={{ height }} aria-label={`${formatDate(point.date, language)}: ${point.ok} OK, ${point.ng} NG, ${point.na} N/A`}>
                    {segments.map((segment) => segment.count > 0 ? <div key={segment.key} className={`flex min-h-0 w-full items-center justify-center overflow-hidden text-[9px] font-semibold leading-none text-white ${segment.color}`} style={{ height: `${(segment.count / total) * 100}%` }}><span>{(segment.count / total) * height >= 17 ? segment.count : null}</span></div> : null)}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', { weekday: 'short' }).format(new Date(`${point.date}T12:00:00`))}</span>
                </div>
              })}
            </div> : <div className="grid h-[190px] place-items-center rounded-xl border border-dashed border-[#dfe7e6] bg-[#fafcfc] text-center"><div><div className="mx-auto mb-2 grid size-9 place-items-center rounded-full bg-[#edf5f3] text-primary"><Activity size={17} /></div><p className="text-xs font-medium">{t('ยังไม่มีข้อมูลในช่วงวันที่นี้')}</p><p className="mt-1 text-[11px] text-muted-foreground">{t('ข้อมูลจะแสดงหลังมีการส่งแบบตรวจ')}</p></div></div>}
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{formatDate(from, language)} – {formatDate(to, language)}</span><Button variant="link" size="sm" onClick={() => onPage('inspections')} className="h-auto gap-1 p-0 text-xs">{t('ดูรายการตรวจ')} <ArrowRight size={14} /></Button></div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#e8eeee]">
          <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle className="text-[15px]">{t('หัวข้อที่พบปัญหาบ่อย')}</CardTitle><CardDescription className="mt-1 text-xs">{t(selectedResult === 'NG' ? 'เรียงตามจำนวนรายการ NG' : 'เรียงตามจำนวนรายการ N/A')}</CardDescription></div>
            <div className="flex w-full items-center gap-2 sm:w-auto"><span className="shrink-0 text-xs text-muted-foreground">{t('แสดงสถานะ')}</span><Select value={selectedResult} onValueChange={(value: 'NG' | 'N/A') => setSelectedResult(value)}><SelectTrigger aria-label={t('แสดงสถานะ')} className="h-10 w-full bg-white sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NG">NG</SelectItem><SelectItem value="N/A">N/A</SelectItem></SelectContent></Select></div>
          </CardHeader>
          <CardContent className="pt-3">
            {data?.categories.length ? <div className="space-y-4">{data.categories.map((category, index) => {
              const max = Math.max(...data.categories.map((item) => item.count), 1)
              return <button key={category.title} type="button" onClick={() => setSelectedCategory(category.title)} aria-label={`${t('ดูรายละเอียด')}: ${t(category.title)}`} className="group w-full rounded-lg px-1 py-1 text-left transition hover:bg-[#f7faf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <div className="mb-1.5 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-[#f1f5f4] text-[10px] text-muted-foreground">{index + 1}</span><span className="truncate text-xs font-medium group-hover:text-primary">{t(category.title)}</span></div><span className="flex shrink-0 items-center gap-2 text-xs font-semibold">{category.count}<ArrowRight size={14} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></span></div>
                <div className="ml-8 h-2 overflow-hidden rounded-full bg-[#eef2f1]"><div className={`h-full rounded-full ${selectedResult === 'NG' ? 'bg-[#e79b60]' : 'bg-slate-500'}`} style={{ width: `${(category.count / max) * 100}%` }} /></div>
              </button>
            })}</div> : <div className="grid h-[168px] place-items-center text-xs text-muted-foreground">{t(selectedResult === 'NG' ? 'ยังไม่มีรายการ NG' : 'ยังไม่มีรายการ N/A')}</div>}
            <div className="mt-5 flex items-center justify-between border-t border-[#edf0f0] pt-4"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldAlert size={14} className="text-amber-600" /> {t('ใช้ข้อมูลตามผลตรวจที่บันทึก')}</div><Button variant="link" size="sm" onClick={() => onPage('inspections')} className="h-auto p-0 text-[11px]">{t('เปิดรายงาน')}</Button></div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-[#e8eeee]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div><CardTitle className="text-[15px]">{t('รายการตรวจล่าสุด')}</CardTitle><CardDescription className="mt-1 text-xs">{t('ตรวจสอบพื้นที่และติดตามรายการที่ยังไม่ปิด')}</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => onPage('inspections')} className="h-8 gap-1.5 text-xs">{t('ดูทั้งหมด')} <ArrowRight size={14} /></Button>
        </CardHeader>
        <CardContent className="p-0">
          {data?.recent.length ? <div className="divide-y divide-[#edf0f0]">{data.recent.map((record) => <Button key={record.id} variant="ghost" onClick={() => onPage('inspections')} className="grid h-auto w-full grid-cols-[1fr_auto] justify-stretch gap-3 rounded-none px-5 py-3.5 text-left whitespace-normal transition hover:bg-[#fafcfc] sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="min-w-0"><p className="truncate text-xs font-medium">{record.area}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{record.inspector} · {record.shift}</p></div>
            <div className="hidden text-xs text-muted-foreground sm:block">{formatDate(record.date, language)} · {record.time || '—'} {t('น.')}</div>
            <div className="hidden text-xs text-muted-foreground sm:block">{record.ngCount} {t('รายการ NG')}</div>
            <div className="flex items-center gap-2">{record.openCount > 0 ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">{t('ค้าง')} {record.openCount}</Badge> : record.ngCount > 0 ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">{t('ปิดครบ')}</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">{t('ปกติ')}</Badge>}<ArrowRight size={14} className="text-muted-foreground" /></div>
          </Button>)}</div> : <div className="px-5 py-10 text-center"><p className="text-sm font-medium">{t('ยังไม่มีรายการตรวจ')}</p><p className="mt-1 text-xs text-muted-foreground">{t('เริ่มบันทึกแบบตรวจครั้งแรกได้เลย')}</p><Button className="mt-4 gap-2" size="sm" onClick={() => onPage('new')}><ArrowUpRight size={15} /> {t('บันทึกการตรวจ')}</Button></div>}
        </CardContent>
      </Card>
      <div className="flex items-center justify-center gap-2 pb-2 text-[10px] text-muted-foreground"><ArrowDownRight size={13} /> {t('ช่วงเวลาที่เลือก:')} {formatDate(from, language)} {t('ถึง')} {formatDate(to, language)}</div>

      <Dialog open={Boolean(selectedCategory)} onOpenChange={(open) => { if (!open) setSelectedCategory(null) }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-[#edf0f0] px-5 py-5 pr-12 sm:px-7">
            <DialogTitle className="text-lg">{selectedCategory ? t(selectedCategory) : ''}</DialogTitle>
            <DialogDescription>{t('สรุปผลตรวจหัวข้อนี้')} · {formatDate(from, language)} – {formatDate(to, language)}</DialogDescription>
          </DialogHeader>
          {categoryLoading || !categorySummary ? <div className="grid min-h-48 place-items-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={16} /> {t('กำลังโหลดข้อมูล…')}</span></div> : <div className="space-y-5 px-5 py-5 sm:px-7">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <StatusCount label="NG" count={categorySummary.counts.ng} color="red" />
              <StatusCount label="N/A" count={categorySummary.counts.na} color="slate" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t('สัดส่วนผลตรวจ NG และ N/A')}</h3><span className="text-xs text-muted-foreground">{t('รวม')} {(categorySummary.counts.ng + categorySummary.counts.na).toLocaleString('th-TH')} {t('ผลตรวจ')}</span></div>
              <div className="flex h-9 w-full overflow-hidden rounded-lg bg-[#eef2f1]" aria-label={`NG ${categorySummary.counts.ng}, N/A ${categorySummary.counts.na}`}>
                {[
                  { label: 'NG', count: categorySummary.counts.ng, color: 'bg-[#e77c68]' },
                  { label: 'N/A', count: categorySummary.counts.na, color: 'bg-slate-500' },
                ].filter((status) => status.count > 0).map((status) => <div key={status.label} className={`flex min-w-0 items-center justify-center gap-1.5 px-2 text-xs font-semibold text-white ${status.color}`} style={{ flex: `${status.count} 1 0%` }}><span>{status.label}</span><span>{status.count}</span></div>)}
              </div>
            </div>
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold">{t('รายการตรวจหัวข้อนี้')}</h3>
                <div className="flex items-center gap-2">
                  <label htmlFor="dashboard-result-filter" className="text-xs text-muted-foreground">{t('สถานะที่แสดง')}</label>
                  <Select value={selectedResult} onValueChange={(value: 'NG' | 'N/A') => setSelectedResult(value)}>
                    <SelectTrigger id="dashboard-result-filter" className="h-9 w-28 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="NG">NG</SelectItem><SelectItem value="N/A">N/A</SelectItem></SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{categorySummary.recordTotal.toLocaleString('th-TH')} {t('รายการ')}</span>
                </div>
              </div>
              {categorySummary.records.length ? <div className="space-y-2">{categorySummary.records.map((record) => <div key={record.id} className="flex flex-col gap-3 rounded-xl border border-[#e8eeee] bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{record.area || '—'}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(record.date, language)} · {record.time || '—'} {t('น.')} · {record.inspector} · {record.shift}</p>{record.result === 'NG' && <p className="mt-1 text-xs text-muted-foreground">{t(record.followUpStatus)}</p>}</div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><Badge variant="outline" className={record.result === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : record.result === 'NG' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{record.result}</Badge><Button variant="outline" size="sm" onClick={() => { setSelectedCategory(null); setSelectedInspectionId(record.id) }} className="gap-1.5">{t('ดูรายละเอียด')} <ArrowRight size={14} /></Button></div>
              </div>)}</div> : <div className="rounded-xl border border-dashed border-[#dfe7e6] px-4 py-8 text-center text-sm text-muted-foreground">{t('ไม่พบข้อมูลในช่วงวันที่เลือก')}</div>}
              {categorySummary.recordTotal > categorySummary.records.length && <p className="mt-2 text-xs text-muted-foreground">{t('แสดงข้อมูลล่าสุด')} {categorySummary.records.length} {t('จาก')} {categorySummary.recordTotal}</p>}
            </div>
          </div>}
        </DialogContent>
      </Dialog>
      <InspectionDetailDialog id={selectedInspectionId} user={user} onOpenChange={(open) => { if (!open) setSelectedInspectionId(null) }} onUpdated={() => setRefreshKey((current) => current + 1)} />
    </div>
  )
}

function StatusCount({ label, count, color }: { label: string; count: number; color: 'emerald' | 'red' | 'slate' }) {
  const tone = color === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : color === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'
  return <div className={`rounded-xl border p-3 text-center sm:p-4 ${tone}`}><p className="text-xs font-medium">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{count.toLocaleString('th-TH')}</p></div>
}
