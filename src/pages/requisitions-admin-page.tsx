import { useCallback, useEffect, useState } from 'react'
import { ListOrdered, Search } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import { usePersistentState } from '@/lib/persistent-state'
import type { RequisitionStatus, RequisitionSummary } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table-pagination'
import { AdminActions } from '@/components/requisitions/admin-actions'
import { RequisitionDetailDialog } from '@/components/requisitions/requisition-detail-dialog'
import { StatusBadge, statusLabel } from '@/components/requisitions/status-badge'

const ALL = '__all__'

/** Every requisition in the system, with admin overrides on the detail. */
export function RequisitionsAdminPage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const [status, setStatus] = usePersistentState('requisitions.admin.status', ALL)
  const [query, setQuery] = usePersistentState('requisitions.admin.query', '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistentState('table.pageSize', 10, 'local')
  const [rows, setRows] = useState<RequisitionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    requisitionApi.adminAll({ status: status === ALL ? undefined : status, q: query.trim() || undefined, page, pageSize })
      .then((result) => { setRows(result.requisitions); setTotal(result.total) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดใบเบิกไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [status, query, page, pageSize, t])
  useEffect(() => {
    const timer = window.setTimeout(load, 250)
    return () => window.clearTimeout(timer)
  }, [load, reloadKey])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return <div className="page-stack">
    <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('ใบเบิกทั้งหมด')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('ดูทุกใบเบิกในระบบ เปลี่ยนผู้อนุมัติ หรือยกเลิกแทนผู้เบิกได้')}</p></div>
    <Card className="overflow-hidden rounded-2xl border-border">
      <CardContent className="grid gap-3 border-b border-border-subtle p-4 sm:grid-cols-[1fr_14rem]">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value) }} placeholder={t('ค้นหาเลขที่ ผู้เบิก แผนก หรือเหตุผล')} aria-label={t('ค้นหา')} className="pl-9" /></div>
        <Select value={status} onValueChange={(value) => { if (value) { setPage(1); setStatus(value) } }}><SelectTrigger className="h-10 w-full" aria-label={t('สถานะ')}><SelectValue>{status === ALL ? t('ทุกสถานะ') : t(statusLabel[status as RequisitionStatus] ?? status)}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>{t('ทุกสถานะ')}</SelectItem>{(Object.keys(statusLabel) as RequisitionStatus[]).map((key) => <SelectItem key={key} value={key}>{t(statusLabel[key])}</SelectItem>)}</SelectContent></Select>
      </CardContent>
      {rows.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t('เลขที่')}</TableHead><TableHead>{t('ผู้เบิก')}</TableHead><TableHead>{t('คลัง')}</TableHead><TableHead>{t('รายการ')}</TableHead><TableHead>{t('ส่งเมื่อ')}</TableHead><TableHead>{t('สถานะ')}</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}>
            <TableCell><Badge variant="outline" className="font-mono">{row.number}</Badge></TableCell>
            <TableCell><p className="font-medium">{row.requesterName}</p><p className="text-xs text-muted-foreground">{row.department || '—'}</p></TableCell>
            <TableCell>{row.warehouseName}</TableCell>
            <TableCell>{row.lineCount} {t('รายการ')} · {row.totalQty} {t('ชิ้นรวม')}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.submittedAt, language, false)}</TableCell>
            <TableCell><StatusBadge status={row.status} />{row.overdue && <Badge variant="outline" className="ml-2 border-warning/25 bg-warning/10 text-warning">{t('เกินเวลา')}</Badge>}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={total} page={Math.min(page, totalPages)} pageSize={pageSize} totalPages={totalPages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><ListOrdered className="mx-auto mb-2" size={24} />{loading ? t('กำลังโหลด…') : t('ไม่พบใบเบิก')}</div></CardContent>}
    </Card>
    <RequisitionDetailDialog id={openId} user={user} onClose={() => setOpenId(null)} onChanged={() => setReloadKey((key) => key + 1)}
      actions={({ detail, reload, close }) => <AdminActions detail={detail} reload={reload} close={close} />} />
  </div>
}
