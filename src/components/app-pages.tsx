import type { ReactNode } from 'react'
import type { User } from '@/lib/types'
import type { PageKey } from '@/lib/pages'
import { isManager, isStockStaff } from '@/lib/roles'
import { DashboardPage } from '@/pages/dashboard-page'
import { InspectionFormPage } from '@/pages/inspection-form-page'
import { InspectionsPage } from '@/pages/inspections-page'
import { UsersPage } from '@/pages/users-page'
import { ChecklistAdminPage } from '@/pages/checklist-admin-page'
import { EmployeesPage } from '@/pages/employees-page'
import { AssessmentsPage } from '@/pages/assessments-page'
import { AssessmentReportsPage } from '@/pages/assessment-reports-page'
import { TrainingMaterialsPage } from '@/pages/training-materials-page'
import { HiyariPage } from '@/pages/hiyari-page'
import { HiyariReportsPage } from '@/pages/hiyari-reports-page'
import { AuditLogPage } from '@/pages/audit-log-page'
import { InventoryStockPage } from '@/pages/inventory-stock-page'
import { InventoryItemsPage } from '@/pages/inventory-items-page'
import { InventoryWarehousesPage } from '@/pages/inventory-warehouses-page'
import { InventoryCountsPage } from '@/pages/inventory-counts-page'
import { InventoryMovementsPage } from '@/pages/inventory-movements-page'
import { RequisitionNewPage } from '@/pages/requisition-new-page'
import { RequisitionsPage } from '@/pages/requisitions-page'
import { ApprovalsPage } from '@/pages/approvals-page'
import { IssueQueuePage } from '@/pages/issue-queue-page'
import { WorkflowAdminPage } from '@/pages/workflow-admin-page'
import { RequisitionsAdminPage } from '@/pages/requisitions-admin-page'

export type NavigateFn = (page: PageKey, query?: string) => void
type PageArgs = { user: User; page: PageKey; onPage: NavigateFn; onUserChange: (user: User | null) => void }

/** The screen for a page key. Both shells render it, so a role sees the same page whichever shell is active. */
export function renderPage({ user, page, onPage, onUserChange }: PageArgs): ReactNode {
  const admin = user.role === 'admin'
  return <>
    {page === 'dashboard' && isManager(user) ? <DashboardPage user={user} onPage={onPage} /> : null}
    {page === 'inspections' ? <InspectionsPage user={user} initialFilter={null} onInitialFilterApplied={() => undefined} /> : null}
    {page === 'new' ? <InspectionFormPage user={user} onCreated={() => onPage('inspections')} /> : null}
    {page === 'users' && admin ? <UsersPage currentUser={user} onCurrentUserUpdate={onUserChange} /> : null}
    {page === 'employees' && admin ? <EmployeesPage /> : null}
    {page === 'checklist' && admin ? <ChecklistAdminPage /> : null}
    {page === 'assessments' && admin ? <AssessmentsPage /> : null}
    {page === 'assessment-reports' && admin ? <AssessmentReportsPage /> : null}
    {page === 'training-materials' && admin ? <TrainingMaterialsPage /> : null}
    {page === 'hiyari' && admin ? <HiyariPage /> : null}
    {page === 'hiyari-reports' && admin ? <HiyariReportsPage /> : null}
    {page === 'audit-log' && admin ? <AuditLogPage /> : null}
    {page === 'inventory-stock' && isStockStaff(user) ? <InventoryStockPage user={user} /> : null}
    {page === 'inventory-movements' && isStockStaff(user) ? <InventoryMovementsPage user={user} /> : null}
    {page === 'inventory-counts' && isStockStaff(user) ? <InventoryCountsPage user={user} /> : null}
    {page === 'inventory-items' && admin ? <InventoryItemsPage /> : null}
    {page === 'inventory-warehouses' && admin ? <InventoryWarehousesPage /> : null}
    {page === 'requisition-new' ? <RequisitionNewPage user={user} onPage={onPage} /> : null}
    {page === 'requisitions' ? <RequisitionsPage user={user} onPage={onPage} /> : null}
    {page === 'approvals' && user.role !== 'employee' ? <ApprovalsPage user={user} /> : null}
    {page === 'issue-queue' && isStockStaff(user) ? <IssueQueuePage user={user} /> : null}
    {page === 'workflow-admin' && admin ? <WorkflowAdminPage /> : null}
    {page === 'requisitions-admin' && admin ? <RequisitionsAdminPage user={user} /> : null}
  </>
}
