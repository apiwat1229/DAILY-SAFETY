import type { User } from '@/lib/types'

export const PAGE_KEYS = [
  'dashboard', 'inspections', 'new', 'users', 'employees', 'checklist', 'assessments',
  'assessment-reports', 'training-materials', 'hiyari', 'hiyari-reports', 'audit-log',
  'inventory-stock', 'inventory-items', 'inventory-warehouses', 'inventory-counts', 'inventory-movements',
  'requisition-new', 'requisitions', 'approvals', 'issue-queue', 'workflow-admin', 'requisitions-admin',
] as const
export type PageKey = (typeof PAGE_KEYS)[number]

const leaderPages: PageKey[] = ['dashboard', 'inspections', 'new', 'requisition-new', 'requisitions', 'approvals']
const employeePages: PageKey[] = ['new', 'inspections', 'requisition-new', 'requisitions']
const storekeeperPages: PageKey[] = ['inventory-stock', 'inventory-movements', 'inventory-counts', 'new', 'inspections', 'requisition-new', 'requisitions', 'approvals', 'issue-queue']

/** Pages a role may open (the server enforces the same rules on every API call). */
export function pagesFor(role: User['role']): readonly PageKey[] {
  return role === 'admin' ? PAGE_KEYS : role === 'leader' ? leaderPages : role === 'storekeeper' ? storekeeperPages : employeePages
}

export const defaultPage = (role: User['role']): PageKey => (role === 'employee' ? 'new' : role === 'storekeeper' ? 'inventory-stock' : 'dashboard')

/** Signed-in screens live under /app/<page> so reload, back/forward and bookmarks keep working. */
export const pagePath = (page: PageKey) => `/app/${page}`

export function pageFromPath(pathname: string): PageKey | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/app\/([a-z-]+)$/)
  const key = match?.[1]
  return key && (PAGE_KEYS as readonly string[]).includes(key) ? (key as PageKey) : null
}

export function resolvePage(role: User['role'], requested: PageKey | null): PageKey {
  return requested && pagesFor(role).includes(requested) ? requested : defaultPage(role)
}
