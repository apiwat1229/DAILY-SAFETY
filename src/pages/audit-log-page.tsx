import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, formatDateTime } from '@/lib/api'
import type { AuditEntry } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'

const PAGE_SIZE = 25
const ALL = '__all__'

export function AuditLogPage() {
  const { t, language } = useI18n()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [targetTypes, setTargetTypes] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [targetType, setTargetType] = useState(ALL)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    api.auditLog({ q: query, targetType: targetType === ALL ? '' : targetType, from, to, limit: PAGE_SIZE, offset })
      .then((result) => { setEntries(result.entries); setTotal(result.total); setTargetTypes(result.targetTypes) })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false))
  }, [query, targetType, from, to, offset])

  useEffect(() => {
    const timer = window.setTimeout(load, 250)
    return () => window.clearTimeout(timer)
  }, [load])

  function withReset<T>(setter: (value: T) => void) { return (value: T) => { setOffset(0); setter(value) } }
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return <div className="page-stack">
    <div>
      <p className="text-sm font-medium text-primary">{t('สิทธิ์การใช้งาน')}</p>
      <h2 className="page-heading mt-1 font-semibold tracking-tight">{t('บันทึกการใช้งาน')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('ตรวจสอบประวัติการเพิ่ม แก้ไข และลบข้อมูลในระบบ')}</p>
    </div>
    <Card><CardContent className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => withReset(setQuery)(event.target.value)} placeholder={t('ค้นหาการกระทำ ผู้ใช้ หรือรหัสอ้างอิง')} className="pl-9" aria-label={t('ค้นหา')} /></div>
      <Select value={targetType} onValueChange={withReset(setTargetType)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{t('ทุกประเภทข้อมูล')}</SelectItem>{targetTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
      </Select>
      <DatePicker value={from} onChange={withReset(setFrom)} />
      <DatePicker value={to} onChange={withReset(setTo)} />
    </CardContent></Card>
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>{t('วันเวลา')}</TableHead><TableHead>{t('ผู้ดำเนินการ')}</TableHead><TableHead>{t('การกระทำ')}</TableHead><TableHead>{t('ประเภทข้อมูล')}</TableHead><TableHead>{t('รหัสอ้างอิง')}</TableHead><TableHead>{t('รายละเอียด')}</TableHead></TableRow></TableHeader>
        <TableBody>
          {entries.map((entry) => <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt, language, false)}</TableCell>
            <TableCell>{entry.userName || entry.username || '—'}</TableCell>
            <TableCell className="font-medium">{entry.action}</TableCell>
            <TableCell>{entry.targetType}</TableCell>
            <TableCell className="max-w-40 truncate" title={entry.targetId}>{entry.targetId}</TableCell>
            <TableCell className="max-w-96 truncate text-muted-foreground" title={JSON.stringify(entry.details)}>{Object.keys(entry.details).length ? JSON.stringify(entry.details) : '—'}</TableCell>
          </TableRow>)}
          {!loading && entries.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{t('ไม่พบบันทึกการใช้งาน')}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
        <span>{t('ทั้งหมด')} {total} {t('รายการ')}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t('ก่อนหน้า')} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft size={16} /></Button>
          <span>{page} / {pages}</span>
          <Button variant="outline" size="icon" aria-label={t('ถัดไป')} disabled={page >= pages} onClick={() => setOffset(offset + PAGE_SIZE)}><ChevronRight size={16} /></Button>
        </div>
      </div>
    </CardContent></Card>
  </div>
}
