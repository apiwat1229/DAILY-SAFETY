import { useEffect, useMemo, useState } from 'react'
import { Download, LoaderCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDateTime } from '@/lib/api'
import type { TrainingViewReport } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Props = { materialId: string | null; title: string; onOpenChange: (open: boolean) => void }

function csvCell(value: string) {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${text.replace(/"/g, '""')}"`
}

export function TrainingViewsDialog({ materialId, title, onOpenChange }: Props) {
  const { language, t } = useI18n()
  const [report, setReport] = useState<TrainingViewReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'viewed' | 'notViewed'>('notViewed')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!materialId) { setReport(null); return }
    setLoading(true)
    setSearch('')
    api.trainingViews(materialId).then(setReport).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [materialId])

  const rows = useMemo(() => {
    if (!report) return []
    const query = search.trim().toLocaleLowerCase()
    const list = tab === 'viewed' ? report.viewed : report.notViewed
    return list.filter((row) => !query || [row.employeeCode, row.employeeName, row.department].some((value) => value.toLocaleLowerCase().includes(query)))
  }, [report, search, tab])

  const pagination = useDataPagination(rows)
  const viewedCount = report?.viewed.length ?? 0
  const total = viewedCount + (report?.notViewed.length ?? 0)
  const percent = total ? Math.round((viewedCount / total) * 100) : 0

  function exportCsv() {
    if (!report) return
    const lines = [['status', 'employee_code', 'name', 'department', 'viewed_at'].join(',')]
    for (const row of report.viewed) lines.push(['viewed', row.employeeCode, row.employeeName, row.department, row.viewedAt].map(csvCell).join(','))
    for (const row of report.notViewed) lines.push(['not_viewed', row.employeeCode, row.employeeName, row.department, ''].map(csvCell).join(','))
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `training-readers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.append(anchor); anchor.click(); anchor.remove()
    URL.revokeObjectURL(url)
  }

  return <Dialog open={Boolean(materialId)} onOpenChange={onOpenChange}>
    <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden sm:max-w-3xl">
      <DialogHeader><DialogTitle>{t('ผู้อ่านสื่ออบรม')}</DialogTitle><DialogDescription>{title}</DialogDescription></DialogHeader>
      {loading || !report ? <div className="grid min-h-40 place-items-center text-sm text-muted-foreground"><LoaderCircle className="animate-spin" /></div> : <>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm"><span>{t('อ่านแล้ว')} {viewedCount} / {total} {t('คน')} ({percent}%)</span>
            <Button iconOnly type="button" variant="outline" className="gap-2" onClick={exportCsv}><Download size={15} />{t('ส่งออก CSV')}</Button></div>
          <Progress value={percent} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={(value) => setTab(value as 'viewed' | 'notViewed')}><TabsList>
              <TabsTrigger value="notViewed">{t('ยังไม่อ่าน')} ({report.notViewed.length})</TabsTrigger>
              <TabsTrigger value="viewed">{t('อ่านแล้ว')} ({viewedCount})</TabsTrigger></TabsList></Tabs>
            <div className="relative sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} aria-label={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="pl-9" /></div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
          <div className="min-h-0 flex-1 overflow-auto"><Table>
            <TableHeader><TableRow><TableHead>{t('รหัสพนักงาน')}</TableHead><TableHead>{t('ชื่อพนักงาน')}</TableHead><TableHead>{t('แผนก')}</TableHead>{tab === 'viewed' && <TableHead>{t('อ่านเมื่อ')}</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {pagination.visibleItems.map((row) => <TableRow key={row.employeeCode}><TableCell>{row.employeeCode}</TableCell><TableCell>{row.employeeName}</TableCell><TableCell>{row.department || '—'}</TableCell>{tab === 'viewed' && <TableCell className="whitespace-nowrap">{formatDateTime((row as { viewedAt?: string }).viewedAt ?? '', language, false)}</TableCell>}</TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t('ไม่พบข้อมูล')}</TableCell></TableRow>}
            </TableBody>
          </Table></div>
          <DataTablePagination total={rows.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
        </div>
      </>}
    </DialogContent>
  </Dialog>
}
