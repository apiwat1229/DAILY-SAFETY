import { useCallback, useEffect, useState } from 'react'
import { DataTablePagination } from '@/components/data-table-pagination'
import { Eye, History, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDateTime } from '@/lib/api'
import type { AuditEntry } from '@/lib/types'
import { actionKind, detailRows, summarize, targetLabel, type ActionKind } from '@/lib/audit-format'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'
import { usePersistentState } from '@/lib/persistent-state'

const ALL = '__all__'

const kindStyle: Record<ActionKind, { className: string; icon: typeof Plus }> = {
  create: { className: 'border-success/25 bg-success/10 text-success', icon: Plus },
  update: { className: 'border-info/20 bg-info/10 text-info', icon: Pencil },
  delete: { className: 'border-destructive/25 bg-destructive/10 text-destructive', icon: Trash2 },
  other: { className: 'border-border bg-surface-subtle text-muted-foreground', icon: History },
}

export function AuditLogPage() {
  const { t, language } = useI18n()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [targetTypes, setTargetTypes] = useState<string[]>([])
  const [query, setQuery] = usePersistentState('audit.query', '')
  const [targetType, setTargetType] = usePersistentState('audit.type', ALL)
  const [from, setFrom] = usePersistentState('audit.from', '')
  const [to, setTo] = usePersistentState('audit.to', '')
  const [pageSize, setPageSize] = usePersistentState('table.pageSize', 10, 'local')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AuditEntry | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.auditLog({ q: query, targetType: targetType === ALL ? '' : targetType, from, to, limit: pageSize, offset })
      .then((result) => { setEntries(result.entries); setTotal(result.total); setTargetTypes(result.targetTypes) })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false))
  }, [query, targetType, from, to, offset, pageSize])

  useEffect(() => {
    const timer = window.setTimeout(load, 250)
    return () => window.clearTimeout(timer)
  }, [load])

  function withReset<T>(setter: (value: T) => void) { return (value: T) => { setOffset(0); setter(value) } }
  const page = Math.floor(offset / pageSize) + 1
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return <div className="page-stack">
    <div>
      <p className="text-sm font-medium text-primary">{t('สิทธิ์การใช้งาน')}</p>
      <h2 className="page-heading mt-1 font-semibold tracking-tight">{t('บันทึกการใช้งาน')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('ตรวจสอบประวัติการเพิ่ม แก้ไข และลบข้อมูลในระบบ')}</p>
    </div>
    <Card><CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => withReset(setQuery)(event.target.value)} placeholder={t('ค้นหาการกระทำ หรือชื่อผู้ใช้')} className="pl-9" aria-label={t('ค้นหา')} /></div>
      <Select value={targetType} onValueChange={withReset(setTargetType)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{t('ทุกประเภทข้อมูล')}</SelectItem>{targetTypes.map((type) => <SelectItem key={type} value={type}>{t(targetLabel(type))}</SelectItem>)}</SelectContent>
      </Select>
      <DatePicker value={from} onChange={withReset(setFrom)} placeholder={t('ตั้งแต่วันที่')} ariaLabel={t('ตั้งแต่วันที่')} />
      <DatePicker value={to} onChange={withReset(setTo)} placeholder={t('ถึงวันที่')} ariaLabel={t('ถึงวันที่')} />
    </CardContent></Card>
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>{t('วันเวลา')}</TableHead><TableHead>{t('ผู้ดำเนินการ')}</TableHead><TableHead>{t('การกระทำ')}</TableHead><TableHead>{t('เรื่องที่เกี่ยวข้อง')}</TableHead><TableHead className="w-12"><span className="sr-only">{t('ดูรายละเอียด')}</span></TableHead></TableRow></TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const kind = kindStyle[actionKind(entry.action)]
            const Icon = kind.icon
            const summary = summarize(entry)
            return <TableRow key={entry.id} className="cursor-pointer" onClick={() => setSelected(entry)}>
              <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt, language, false)}</TableCell>
              <TableCell>{entry.userName || entry.username || '—'}</TableCell>
              <TableCell><Badge variant="outline" className={`gap-1 ${kind.className}`}><Icon size={12} />{entry.action}</Badge></TableCell>
              <TableCell className="max-w-md whitespace-normal"><p className="text-sm font-medium">{t(targetLabel(entry.targetType))}</p>{summary && <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>}</TableCell>
              <TableCell><Button iconOnly variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setSelected(entry) }}><Eye size={15} />{t('ดูรายละเอียด')}</Button></TableCell>
            </TableRow>
          })}
          {!loading && entries.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{t('ไม่พบบันทึกการใช้งาน')}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <DataTablePagination total={total} page={page} pageSize={pageSize} totalPages={pages} onPageChange={(next) => setOffset((next - 1) * pageSize)} onPageSizeChange={(size) => { setPageSize(size); setOffset(0) }} t={t} />
    </CardContent></Card>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected?.action}</DialogTitle>
          <DialogDescription>{selected && `${formatDateTime(selected.createdAt, language, false)} · ${selected.userName || selected.username || '—'}`}</DialogDescription>
        </DialogHeader>
        {selected && <div className="grid gap-4">
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('เรื่องที่เกี่ยวข้อง')}</dt><dd className="font-medium">{t(targetLabel(selected.targetType))}</dd>
            {detailRows(selected.details).filter((row) => row.value !== '—').map((row, index) => <div key={index} className="col-span-2 grid grid-cols-subgrid border-t border-border-subtle pt-2">
              <dt className="text-muted-foreground">{t(row.label)}</dt><dd className="break-words">{row.value}</dd>
            </div>)}
          </dl>
          <p className="break-all rounded-md bg-surface-subtle p-2 text-xs text-muted-foreground">{t('รหัสอ้างอิงระบบ')}: {selected.targetId}</p>
        </div>}
      </DialogContent>
    </Dialog>
  </div>
}
