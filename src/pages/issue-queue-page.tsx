import { useCallback, useEffect, useState } from 'react'
import { PackageCheck, PackageOpen, Undo2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime } from '@/lib/api'
import { requisitionApi } from '@/lib/requisition-api'
import { refreshBadges } from '@/lib/use-badges'
import { usePersistentState } from '@/lib/persistent-state'
import type { IssueHistoryItem, IssueQueueItem } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { ItemThumb } from '@/components/item-thumb'
import { IssueDialog } from '@/components/requisitions/issue-dialog'
import { ReasonDialog } from '@/components/requisitions/reason-dialog'
import { RequisitionDetailDialog } from '@/components/requisitions/requisition-detail-dialog'
import { ReturnsDialog } from '@/components/requisitions/returns-dialog'
import { StatusBadge } from '@/components/requisitions/status-badge'
import { useConfirm } from '@/components/confirm-provider'

type Tab = 'queue' | 'history'

export function IssueQueuePage({ user }: { user: User }) {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [tab, setTab] = usePersistentState<Tab>('issue.tab', 'queue')
  const [queue, setQueue] = useState<IssueQueueItem[]>([])
  const [history, setHistory] = useState<IssueHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [issueTarget, setIssueTarget] = useState<IssueQueueItem | null>(null)
  const [closeTarget, setCloseTarget] = useState<IssueQueueItem | null>(null)
  const [returnTarget, setReturnTarget] = useState<IssueHistoryItem | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [q, h] = await Promise.all([requisitionApi.issueQueue(), requisitionApi.issueHistory()])
      setQueue(q.requisitions); setHistory(h.requisitions)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'โหลดคิวจ่ายของไม่สำเร็จ')) }
    finally { setLoading(false) }
    refreshBadges()
  }, [t])
  useEffect(() => { void reload() }, [reload])

  const shownQueue = useDataPagination(queue)
  const shownHistory = useDataPagination(history)
  const list = tab === 'queue' ? shownQueue : shownHistory
  const total = tab === 'queue' ? queue.length : history.length

  return <div className="page-stack">
    <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('จ่ายของ')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{user.role === 'admin' ? t('ใบเบิกที่อนุมัติแล้วทุกคลัง') : t('ใบเบิกที่อนุมัติแล้วของคลังที่คุณดูแล')}</p></div>
    <Card className="overflow-hidden rounded-2xl border-border">
      <CardContent className="overflow-x-auto border-b border-border-subtle p-4">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}><TabsList><TabsTrigger value="queue">{t('รอจ่าย')} ({queue.length})</TabsTrigger><TabsTrigger value="history">{t('จ่ายแล้ว')} ({history.length})</TabsTrigger></TabsList></Tabs>
      </CardContent>
      {total === 0 ? <CardContent className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><PackageOpen className="mx-auto mb-2" size={24} />{loading ? t('กำลังโหลด…') : tab === 'queue' ? t('ไม่มีใบเบิกที่รอจ่าย') : t('ยังไม่มีใบเบิกที่จ่ายแล้ว')}</div></CardContent> : <>
        <div className="divide-y divide-border-subtle">
          {tab === 'queue' ? shownQueue.visibleItems.map((item) => <div key={item.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><button type="button" onClick={() => setOpenId(item.id)} className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline">{item.number}</button>
                <p className="text-sm">{item.requesterName}{item.department ? ` · ${item.department}` : ''}</p>
                <p className="text-xs text-muted-foreground">{item.warehouseName} · {t('อนุมัติเมื่อ')} {formatDateTime(item.approvedAt, language, false)}{item.neededBy ? ` · ${t('ต้องการภายใน')} ${formatDate(item.neededBy, language)}` : ''}</p></div>
              <StatusBadge status={item.status} />
            </div>
            <ul className="space-y-2">{item.lines.map((line) => <li key={line.id} className="flex items-center gap-3 text-sm">
              <ItemThumb url={line.imageUrl} name={line.name} size={40} />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{line.name}{line.variantLabel && ` · ${line.variantLabel}`}</p>
                <p className="truncate text-xs text-muted-foreground">{line.picks.map((pick) => `${pick.lotNo || t('ไม่มีล็อต')}${pick.expiryDate ? ` (${formatDate(pick.expiryDate, language)})` : ''} × ${pick.qty}`).join(', ') || '—'}</p></div>
              <Badge variant="outline">{line.remaining} {line.unit}</Badge>
            </li>)}</ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2 text-destructive" onClick={() => setCloseTarget(item)}><XCircle size={15} />{t('ปิดรายการที่ค้าง')}</Button>
              <Button type="button" size="sm" className="gap-2" onClick={() => setIssueTarget(item)}><PackageCheck size={15} />{t('จ่ายของ')}</Button>
            </div>
          </div>) : shownHistory.visibleItems.map((item) => <div key={item.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><button type="button" onClick={() => setOpenId(item.id)} className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline">{item.number}</button>
                <p className="text-sm">{item.requesterName}{item.department ? ` · ${item.department}` : ''}</p>
                <p className="text-xs text-muted-foreground">{item.warehouseName} · {item.lines.map((line) => `${line.name} ${line.qtyIssued}${line.qtyReturned ? ` (${t('คืน')} ${line.qtyReturned})` : ''}`).join(', ')}</p></div>
              <div className="flex items-center gap-2"><StatusBadge status={item.status} />
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={item.lines.every((line) => line.qtyReturned >= line.qtyIssued)} onClick={() => setReturnTarget(item)}><Undo2 size={15} />{t('รับคืน')}</Button></div>
            </div>
          </div>)}
        </div>
        <DataTablePagination total={total} page={list.page} pageSize={list.pageSize} totalPages={list.totalPages} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} t={t} />
      </>}
    </Card>
    {issueTarget && <IssueDialog item={issueTarget} onClose={() => setIssueTarget(null)} onDone={async () => { setIssueTarget(null); await reload() }} />}
    {returnTarget && <ReturnsDialog item={returnTarget} onClose={() => setReturnTarget(null)} onDone={async () => { setReturnTarget(null); await reload() }} />}
    <ReasonDialog open={Boolean(closeTarget)} title={t('ปิดรายการที่ค้างจ่าย')} description={closeTarget?.number} danger label={t('เหตุผล เช่น ของหมด')} confirmLabel={t('ปิดรายการ')} onClose={() => setCloseTarget(null)}
      onSubmit={async (reason) => {
        if (!closeTarget) return
        try {
          if (!(await confirm({ kind: 'danger', title: t('ยืนยันการปิดรายการที่ค้าง'), description: t('สต็อกที่จองไว้สำหรับรายการที่ค้างจะถูกปล่อยคืน'), confirmLabel: t('ปิดรายการ') }))) throw new Error('cancelled')
          await requisitionApi.closeRemainder(closeTarget.id, reason)
          toast.success(t('ปิดรายการที่ค้างแล้ว'))
          setCloseTarget(null)
          await reload()
        } catch (error) { if (!(error instanceof Error && error.message === 'cancelled')) toast.error(t(error instanceof Error ? error.message : 'ปิดรายการไม่สำเร็จ')); throw error }
      }} />
    <RequisitionDetailDialog id={openId} user={user} onClose={() => setOpenId(null)} onChanged={() => void reload()} />
  </div>
}
