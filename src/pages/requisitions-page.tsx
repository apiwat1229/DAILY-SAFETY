import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReceiptText, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import { usePersistentState } from '@/lib/persistent-state'
import type { RequisitionStatus, RequisitionSummary } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import type { NavigateFn } from '@/components/app-pages'
import { MineActions } from '@/components/requisitions/mine-actions'
import { RequisitionDetailDialog } from '@/components/requisitions/requisition-detail-dialog'
import { StatusBadge } from '@/components/requisitions/status-badge'

type Group = 'all' | 'waiting' | 'edit' | 'issue' | 'done' | 'stopped'
const groups: Record<Group, { label: string; statuses: RequisitionStatus[] | null }> = {
  all: { label: 'ทั้งหมด', statuses: null },
  waiting: { label: 'รออนุมัติ', statuses: ['in_approval'] },
  edit: { label: 'ต้องแก้ไข', statuses: ['returned_for_edit'] },
  issue: { label: 'รอรับของ', statuses: ['ready_to_issue', 'partially_issued'] },
  done: { label: 'เสร็จสิ้น', statuses: ['issued', 'closed', 'received'] },
  stopped: { label: 'ยกเลิก/ไม่อนุมัติ', statuses: ['rejected', 'cancelled', 'expired'] },
}

export function RequisitionsPage({ user, onPage }: { user: User; onPage: NavigateFn }) {
  const { t, language } = useI18n()
  const [rows, setRows] = useState<RequisitionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = usePersistentState<Group>('requisitions.group', 'all')
  const [openId, setOpenId] = useState<string | null>(null)

  const reload = useCallback(() => {
    requisitionApi.mine().then(({ requisitions }) => setRows(requisitions))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดใบเบิกไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [t])
  useEffect(reload, [reload])

  const count = (key: Group) => (groups[key].statuses ? rows.filter((row) => groups[key].statuses!.includes(row.status)).length : rows.length)
  const filtered = useMemo(() => (groups[group].statuses ? rows.filter((row) => groups[group].statuses!.includes(row.status)) : rows), [rows, group])
  const pagination = useDataPagination(filtered)

  return <div className="page-stack">
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('ใบเบิกของฉัน')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('ติดตามสถานะใบเบิกและยืนยันรับของ')}</p></div>
        <Button type="button" className="gap-2" onClick={() => onPage('requisition-new')}><ShoppingCart size={16} />{t('เบิกของ')}</Button>
      </div>
      <div className="overflow-x-auto"><Tabs value={group} onValueChange={(value) => setGroup(value as Group)}><TabsList>{(Object.keys(groups) as Group[]).map((key) => <TabsTrigger key={key} value={key}>{t(groups[key].label)} ({count(key)})</TabsTrigger>)}</TabsList></Tabs></div>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      {filtered.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead className="w-12 text-center">{t('ลำดับ')}</TableHead><TableHead>{t('เลขที่')}</TableHead><TableHead>{t('ส่งเมื่อ')}</TableHead><TableHead>{t('ประเภท')}</TableHead><TableHead>{t('รายการ')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead>{t('ขั้นตอนปัจจุบัน')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((row, index) => <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpenId(row.id)}><TableCell className="text-center text-muted-foreground tabular-nums">{(pagination.page - 1) * pagination.pageSize + index + 1}</TableCell>
            <TableCell><Badge variant="outline" className="font-mono">{row.number}</Badge></TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.submittedAt, language, false)}</TableCell>
            <TableCell>{row.type === 'ppe' ? 'PPE' : t('ยารักษาโรค')}</TableCell>
            <TableCell>{row.lineCount} {t('รายการ')} · {row.totalQty} {t('ชิ้นรวม')}</TableCell>
            <TableCell><StatusBadge status={row.status} /></TableCell>
            <TableCell className="text-sm text-muted-foreground">{row.status === 'in_approval' ? <>{row.stepName}{row.overdue && <Badge variant="outline" className="ml-2 border-warning/25 bg-warning/10 text-warning">{t('เกินเวลา')}</Badge>}</> : '—'}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={filtered.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><ReceiptText className="mx-auto mb-2" size={24} />{loading ? t('กำลังโหลด…') : rows.length === 0 ? t('ยังไม่มีใบเบิก กด "เบิกของ" เพื่อเริ่มต้น') : t('ไม่มีใบเบิกในกลุ่มนี้')}</div></CardContent>}
    </Card>
    <RequisitionDetailDialog id={openId} user={user} onClose={() => setOpenId(null)} onChanged={reload} actions={({ detail, reload: refresh }) => <MineActions detail={detail} reload={refresh} />} />
  </div>
}
