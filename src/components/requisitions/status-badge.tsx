import type { RequisitionStatus } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'

export const statusLabel: Record<RequisitionStatus, string> = {
  in_approval: 'รออนุมัติ', returned_for_edit: 'ส่งกลับให้แก้ไข', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก', ready_to_issue: 'รอรับของ',
  partially_issued: 'จ่ายบางส่วน', issued: 'จ่ายครบแล้ว', closed: 'ปิดรายการ', received: 'รับของแล้ว', expired: 'หมดอายุ',
}

export const statusTone: Record<RequisitionStatus, string> = {
  in_approval: 'border-info/20 bg-info/10 text-info', returned_for_edit: 'border-warning/25 bg-warning/10 text-warning', rejected: 'border-destructive/25 bg-destructive/10 text-destructive',
  cancelled: 'border-border bg-surface-subtle text-muted-foreground', ready_to_issue: 'border-primary/25 bg-secondary text-primary', partially_issued: 'border-warning/25 bg-warning/10 text-warning',
  issued: 'border-success/25 bg-success/10 text-success', closed: 'border-border bg-surface-subtle text-muted-foreground', received: 'border-success/25 bg-success/10 text-success',
  expired: 'border-destructive/25 bg-destructive/10 text-destructive',
}

export function StatusBadge({ status }: { status: RequisitionStatus }) {
  const { t } = useI18n()
  return <Badge variant="outline" className={statusTone[status]}>{t(statusLabel[status])}</Badge>
}
