import { request } from './api'
import type {
  ApproverUser, Badges, BulkResult, Cart, CatalogItem, Delegation, DepartmentRow, IssueQueueItem, PreviewStep, RequisitionDetail, RequisitionSummary,
  RequisitionType, WorkflowTemplate, WorkflowTemplateInput, IssueHistoryItem,
} from './requisition-types'

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const qs = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value))
  const text = query.toString()
  return text ? `?${text}` : ''
}
const rq = '/api/requisitions'
const wf = '/api/workflow'
type Detail = { requisition: RequisitionDetail }

/** One method per endpoint in server/requisitions/routes.js. */
export const requisitionApi = {
  catalog: (type: RequisitionType, q?: string) => request<{ items: CatalogItem[] }>(`${rq}/catalog${qs({ type, q })}`),
  cart: (type: RequisitionType) => request<{ cart: Cart }>(`${rq}/cart${qs({ type })}`),
  setCartLine: (type: RequisitionType, variantId: string, qty: number) => request<{ cart: Cart }>(`${rq}/cart/lines`, json('PUT', { type, variantId, qty })),
  clearCart: (type: RequisitionType) => request<{ ok: boolean }>(`${rq}/cart${qs({ type })}`, json('DELETE')),
  checkout: (input: { type: RequisitionType; warehouseId: string; reason: string; neededBy?: string }) => request<Detail>(`${rq}/checkout`, json('POST', input)),
  warehouses: (type: RequisitionType) => request<{ warehouses: { id: string; code: string; name: string; total: number; covered: number }[] }>(`${rq}/warehouses${qs({ type })}`),
  routePreview: (type: RequisitionType, warehouseId: string) => request<{ route: { templateName: string; steps: PreviewStep[] } }>(`${rq}/route-preview${qs({ type, warehouseId })}`),
  mine: (status?: string) => request<{ requisitions: RequisitionSummary[] }>(`${rq}/mine${qs({ status })}`),
  get: (id: string) => request<Detail>(`${rq}/${id}`),
  cancel: (id: string, reason?: string) => request<Detail>(`${rq}/${id}/cancel`, json('POST', { reason })),
  resubmit: (id: string, input: { lines?: { lineId: string; qty: number }[]; reason?: string; neededBy?: string }) => request<Detail>(`${rq}/${id}/resubmit`, json('POST', input)),
  receive: (id: string) => request<Detail>(`${rq}/${id}/receive`, json('POST')),
  addPhotos: (id: string, files: File[]) => {
    const form = new FormData()
    for (const file of files) form.append('photos', file)
    return request<Detail>(`${rq}/${id}/photos`, { method: 'POST', body: form })
  },
  removePhoto: (id: string, photoId: string) => request<Detail>(`${rq}/${id}/photos/${photoId}`, json('DELETE')),

  inbox: () => request<{ requisitions: RequisitionSummary[] }>(`${rq}/inbox`),
  approve: (id: string, input: { comment?: string; lines?: { lineId: string; qty: number }[] } = {}) => request<Detail>(`${rq}/${id}/approve`, json('POST', input)),
  reject: (id: string, reason: string) => request<Detail>(`${rq}/${id}/reject`, json('POST', { reason })),
  requestChanges: (id: string, reason: string) => request<Detail>(`${rq}/${id}/request-changes`, json('POST', { reason })),
  bulkApprove: (ids: string[], comment?: string) => request<{ results: BulkResult[] }>(`${rq}/bulk-approve`, json('POST', { ids, comment })),

  issueQueue: () => request<{ requisitions: IssueQueueItem[] }>(`${rq}/issue-queue`),
  issueHistory: () => request<{ requisitions: IssueHistoryItem[] }>(`${rq}/issue-history`),
  issue: (id: string, lines: { lineId: string; qty: number }[]) => request<Detail>(`${rq}/${id}/issue`, json('POST', { lines })),
  closeRemainder: (id: string, reason: string) => request<Detail>(`${rq}/${id}/close`, json('POST', { reason })),
  recordReturn: (id: string, lines: { lineId: string; lotId: string; qty: number }[], reason?: string) => request<Detail>(`${rq}/${id}/returns`, json('POST', { lines, reason })),

  adminAll: (filters: { status?: string; q?: string; page?: number; pageSize?: number } = {}) => request<{ requisitions: RequisitionSummary[]; total: number; page: number; pageSize: number }>(`${rq}/admin/all${qs(filters)}`),
  reassign: (id: string, toUserId: string, reason: string) => request<Detail>(`${rq}/${id}/admin/reassign`, json('POST', { toUserId, reason })),
  forceCancel: (id: string, reason: string) => request<Detail>(`${rq}/${id}/admin/force-cancel`, json('POST', { reason })),
  badges: () => request<Badges>(`${rq}/badges`),
}

export const workflowApi = {
  templates: () => request<{ templates: WorkflowTemplate[] }>(`${wf}/templates`),
  createTemplate: (input: WorkflowTemplateInput) => request<{ template: WorkflowTemplate }>(`${wf}/templates`, json('POST', input)),
  updateTemplate: (id: string, input: WorkflowTemplateInput) => request<{ template: WorkflowTemplate }>(`${wf}/templates/${id}`, json('PUT', input)),
  deleteTemplate: (id: string) => request<{ ok: boolean }>(`${wf}/templates/${id}`, json('DELETE')),
  approvers: () => request<{ users: ApproverUser[] }>(`${wf}/approvers`),
  departments: () => request<{ departments: DepartmentRow[] }>(`${wf}/departments`),
  setSupervisors: (department: string, entries: { userId: string; isBackup: boolean }[]) => request<{ departments: DepartmentRow[] }>(`${wf}/departments/supervisors`, json('PUT', { department, entries })),
  delegations: () => request<{ delegations: Delegation[] }>(`${wf}/delegations`),
  addDelegation: (input: { toUser: string; fromDate: string; toDate: string; fromUser?: string }) => request<{ delegation: Delegation }>(`${wf}/delegations`, json('POST', input)),
  removeDelegation: (id: string) => request<{ ok: boolean }>(`${wf}/delegations/${id}`, json('DELETE')),
  preview: (input: { templateId: string; requesterId: string; totalQty: number; categoryIds: string[]; warehouseId?: string }) => request<{ department: string; steps: PreviewStep[] }>(`${wf}/preview`, json('POST', input)),
  settings: () => request<{ expireDays: number }>(`${wf}/settings`),
  saveSettings: (expireDays: number) => request<{ expireDays: number }>(`${wf}/settings`, json('PUT', { expireDays })),
}
