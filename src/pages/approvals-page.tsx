import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, CircleCheck, UserRoundCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import { refreshBadges } from '@/lib/use-badges'
import type { RequisitionSummary } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { useConfirm } from '@/components/confirm-provider'
import { ApprovalActions } from '@/components/requisitions/approval-actions'
import { DelegationDialog } from '@/components/requisitions/delegation-dialog'
import { RequisitionDetailDialog } from '@/components/requisitions/requisition-detail-dialog'

export function ApprovalsPage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [rows, setRows] = useState<RequisitionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [delegationOpen, setDelegationOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    requisitionApi.inbox().then(({ requisitions }) => {
      setRows(requisitions)
      setSelected((current) => new Set([...current].filter((id) => requisitions.some((row) => row.id === id))))
    }).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายการรออนุมัติไม่สำเร็จ')))
      .finally(() => setLoading(false))
    refreshBadges()
  }, [t])
  useEffect(reload, [reload])
  const pagination = useDataPagination(rows)
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const allOnPage = pagination.visibleItems.length > 0 && pagination.visibleItems.every((row) => selected.has(row.id))

  async function bulkApprove() {
    if (busy || selected.size === 0) return
    setBusy(true)
    try {
      if (!(await confirm({ kind: 'submit', title: t('ยืนยันการอนุมัติหลายใบ'), description: `${selected.size} ${t('ใบเบิก')}`, confirmLabel: t('อนุมัติ') }))) return
      const { results } = await requisitionApi.bulkApprove([...selected])
      const failed = results.filter((result) => !result.ok)
      if (failed.length) toast.warning(`${t('อนุมัติสำเร็จ')} ${results.length - failed.length}/${results.length}`, { description: failed.slice(0, 3).map((result) => result.error).join(' · ') })
      else toast.success(`${t('อนุมัติแล้ว')} ${results.length} ${t('ใบเบิก')}`)
      setSelected(new Set())
      reload()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'อนุมัติไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('รออนุมัติ')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('ใบเบิกที่รอการพิจารณาของคุณ')}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={() => setDelegationOpen(true)}><UserRoundCheck size={16} />{t('มอบสิทธิ์แทน')}</Button>
        <Button type="button" disabled={selected.size === 0 || busy} className="gap-2" onClick={() => void bulkApprove()}><CircleCheck size={16} />{t('อนุมัติที่เลือก')}{selected.size > 0 ? ` (${selected.size})` : ''}</Button>
      </div>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      {rows.length ? <>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10"><Checkbox checked={allOnPage} aria-label={t('เลือกทั้งหน้า')} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); for (const row of pagination.visibleItems) { if (checked === true) next.add(row.id); else next.delete(row.id) } return next })} /></TableHead>
            <TableHead>{t('เลขที่')}</TableHead><TableHead>{t('ผู้เบิก')}</TableHead><TableHead>{t('รายการ')}</TableHead><TableHead>{t('ส่งเมื่อ')}</TableHead><TableHead>{t('ขั้นตอน')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((row) => <TableRow key={row.id} className="cursor-pointer" data-selected={selected.has(row.id) || undefined} onClick={() => setOpenId(row.id)}>
            <TableCell data-label="" onClick={(event) => event.stopPropagation()}><Checkbox checked={selected.has(row.id)} aria-label={`${t('เลือก')} ${row.number}`} onCheckedChange={() => toggle(row.id)} /></TableCell>
            <TableCell><Badge variant="outline" className="font-mono">{row.number}</Badge></TableCell>
            <TableCell><p className="font-medium">{row.requesterName}</p><p className="text-xs text-muted-foreground">{row.department || '—'}</p></TableCell>
            <TableCell>{row.lineCount} {t('รายการ')} · {row.totalQty} {t('ชิ้นรวม')}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.submittedAt, language, false)}</TableCell>
            <TableCell className="text-sm">{row.stepName}{row.overdue && <Badge variant="outline" className="ml-2 border-warning/25 bg-warning/10 text-warning">{t('เกินเวลา')}</Badge>}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={rows.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><BadgeCheck className="mx-auto mb-2" size={24} />{loading ? t('กำลังโหลด…') : t('ไม่มีใบเบิกที่รอคุณอนุมัติ')}</div></CardContent>}
    </Card>
    <RequisitionDetailDialog id={openId} user={user} onClose={() => setOpenId(null)} onChanged={reload}
      actions={({ detail, reload: refresh, close }) => <ApprovalActions detail={detail} user={user} reload={refresh} close={close} />} />
    <DelegationDialog open={delegationOpen} user={user} onClose={() => setDelegationOpen(false)} />
  </div>
}
