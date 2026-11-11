export type RequisitionType = 'ppe' | 'medicine'
export type RequisitionStatus =
  | 'in_approval' | 'returned_for_edit' | 'rejected' | 'cancelled' | 'ready_to_issue' | 'partially_issued' | 'issued' | 'closed' | 'received' | 'expired'

export type CatalogVariant = { variantId: string; label: string; available: number }
export type CatalogItem = {
  itemId: string; sku: string; name: string; type: RequisitionType; unit: string; categoryId: string; categoryName: string
  imageUrl: string | null; variants: CatalogVariant[]
}
export type CartLine = {
  variantId: string; qty: number; itemId: string; sku: string; name: string; variantLabel: string; unit: string
  imageUrl: string | null; available: number; active: boolean
}
export type Cart = { type: RequisitionType; lines: CartLine[] }

export type RequisitionSummary = {
  id: string; number: string; type: RequisitionType; status: RequisitionStatus; requesterId: string; requesterName: string; department: string
  warehouseId: string; warehouseName: string; reason: string; neededBy: string; createdAt: string; submittedAt: string; approvedAt: string
  lineCount: number; totalQty: number; stepName: string; dueAt: string; overdue: boolean
}
export type RequisitionLine = {
  id: string; variantId: string; itemId: string; sku: string; name: string; variantLabel: string; unit: string; imageUrl: string | null
  qtyRequested: number; qtyApproved: number; qtyIssued: number; qtyReturned: number; note: string
}
export type RequisitionStep = {
  position: number; name: string; approverType: string; mode: 'any' | 'all'; status: 'waiting' | 'active' | 'approved' | 'skipped'
  allowEditQty: boolean; approvers: { userId: string; name: string }[]; approvals: string[]; dueAt: string; overdue: boolean; escalated: boolean; slaHours: number
}
export type RequisitionEvent = { id: string; step: number; actorId: string; actorName: string; action: string; comment: string; at: string }
export type RequisitionPhoto = { id: string; originalName: string; url: string; thumbUrl: string }
export type RequisitionDetail = {
  id: string; number: string; type: RequisitionType; status: RequisitionStatus; requesterId: string; requesterName: string; department: string
  warehouseId: string; warehouseName: string; reason: string; neededBy: string; currentStep: number; createdAt: string; submittedAt: string; approvedAt: string
  lines: RequisitionLine[]; steps: RequisitionStep[]; events: RequisitionEvent[]; photos: RequisitionPhoto[]
}
export type IssueQueueLine = {
  id: string; variantId: string; itemId: string; sku: string; name: string; variantLabel: string; unit: string; imageUrl: string | null
  qtyApproved: number; qtyIssued: number; remaining: number; picks: { lotId: string; lotNo: string; expiryDate: string; qty: number }[]
}
export type IssueQueueItem = RequisitionSummary & { lines: IssueQueueLine[] }
export type IssueHistoryLine = {
  id: string; variantId: string; itemId: string; sku: string; name: string; variantLabel: string; unit: string; imageUrl: string | null
  qtyApproved: number; qtyIssued: number; qtyReturned: number; issuedLots: { lotId: string; lotNo: string; expiryDate: string; qty: number }[]
}
export type IssueHistoryItem = RequisitionSummary & { lines: IssueHistoryLine[] }
export type Badges = { approvals: number; issue: number; cart: number }
export type BulkResult = { id: string; ok: boolean; code?: string; error?: string }

// ---- workflow settings ----
export type ApproverType = 'dept_supervisor' | 'role' | 'user' | 'warehouse_staff'
export type WorkflowStep = {
  position?: number; name: string; approverType: ApproverType; approverRef: string
  condition: { minTotalQty?: number; categoryIds?: string[] }; mode: 'any' | 'all'; slaHours: number
  escalateType: 'none' | 'role' | 'user'; escalateRef: string; allowEditQty: boolean
}
export type WorkflowTemplate = {
  id: string; name: string; appliesType: 'ppe' | 'medicine' | 'any'; warehouseId: string; version: number; isActive: boolean; steps: WorkflowStep[]; inFlight: number
}
export type WorkflowTemplateInput = Pick<WorkflowTemplate, 'name' | 'appliesType' | 'warehouseId' | 'isActive' | 'steps'>
export type DepartmentRow = { department: string; entries: { userId: string; name: string; isBackup: boolean }[] }
export type Delegation = { id: string; fromUser: string; fromName: string; toUser: string; toName: string; fromDate: string; toDate: string }
export type ApproverUser = { id: string; name: string; employeeCode: string; role: 'admin' | 'leader' | 'storekeeper' }
export type PreviewStep = {
  position: number; name: string; approverType: string; mode: 'any' | 'all'; slaHours: number; applies: boolean
  note: '' | 'skipped_self' | 'fallback_admin' | 'skipped_no_approver'; approvers: { userId: string; name: string }[]
}

// ---- reports ----
export type ReportGroup = 'department' | 'person' | 'item'
export type UsageRow = { key: string; label: string; issued: number; returned: number; net: number; requisitions: number }
export type UsageReport = { from: string; to: string; groupBy: ReportGroup; rows: UsageRow[]; totals: { issued: number; returned: number; net: number } }
export type CycleReport = { from: string; to: string; total: number; byStatus: Record<string, number>; avgApprovalHours: number; avgIssueHours: number; slaBreaches: number }
export type ReportOptions = { warehouses: { id: string; code: string; name: string }[]; departments: string[]; scope: string }
export type IntegritySummary = { at: string; ok: boolean; mismatchCount: number }
