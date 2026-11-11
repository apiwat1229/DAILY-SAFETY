# Requisitions and Approval Workflow Implementation Plan (sub-project 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Employees put PPE or medicine in a cart and submit a requisition; it moves through an admin-configurable approval workflow (department supervisor by default), stock is reserved on final approval, the storekeeper issues FEFO stock, and the requester confirms receipt. Admins configure workflows, department supervisors, delegations and can override.

**Architecture:** New server modules in `server/requisitions/` — `schema.js` (tables), `workflow.js` (templates, approver resolution, delegation), `service.js` (cart, requisition lifecycle), `routes.js` (`/api/requisitions/*` and `/api/workflow/*`). Stock reservations are added to the existing stock service. Template steps are **snapshotted** into each requisition, so editing a template never changes requisitions in flight. Client adds six pages and a badge hook on top of the existing shell and nav model.

**Tech Stack:** Node 24 `node:sqlite`, Express 5, React 19, shadcn/ui, `node --test` (in-memory SQLite for services, spawned server for API).

**Spec:** `docs/superpowers/specs/2026-11-11-ppe-medicine-requisition-design.md` (section 5); builds on `docs/superpowers/plans/2026-11-11-inventory-catalog.md` and the mobile nav model.

## Global Constraints

- Quantities are whole numbers 1..1,000,000,000 (same limit as stock).
- Requisition number `REQ-<Buddhist year>-<5-digit sequence>`, e.g. `REQ-2569-00001`.
- Statuses: `in_approval`, `returned_for_edit`, `rejected`, `cancelled`, `ready_to_issue`, `partially_issued`, `issued`, `closed`, `received`, `expired`. Final approval reserves stock (all-or-nothing) and sets `ready_to_issue`.
- Nobody approves their own requisition. If the requester is the only eligible approver the step is skipped; if a step has no approver at all (e.g. no supervisor mapped to the department) it falls back to all active admins, and is skipped only if the requester is the sole admin. Every skip/fallback is written as an event.
- Approver types: `dept_supervisor`, `role` (`admin|leader|storekeeper`), `user` (admin/leader/storekeeper accounts), `warehouse_staff`. Step `mode` `any|all`. Conditions (all must hold): `minTotalQty`, `categoryIds`.
- Delegation: for dates `from..to` inclusive (Asia/Bangkok) the delegate may act wherever the delegator is an approver.
- Reject and return-for-edit need a reason; lowering a quantity needs a comment and `allow_edit_qty` on the step (admins may always lower).
- Setting `requisition.expire_days` (default 14): a requisition `ready_to_issue`/`partially_issued` older than that since approval expires and releases reservations.
- Every create/update/delete/submit in the UI goes through `useConfirm`; Thai text via `t()` with English in `src/lib/i18n.tsx`; tables use `useDataPagination`; mobile bar per nav model.
- Every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A requester who is the only approver, or a department with no mapped supervisor, must never stall or self-approve (skip or fall back to admins, with an event).
- Final approval with short stock is refused naming the short items and reserves nothing; reject, cancel, expire and force-cancel release every reservation.
- Two approvers (or one double click) approving the same step: exactly one transition, the other gets 409, no double reservation.
- Editing or deactivating a template while requisitions are in flight leaves their steps unchanged; deleting a template that in-flight requisitions use is refused.
- Issuing more than approved/reserved, issuing from a lot that expired after reservation, returns beyond issued, and receipt confirmation by someone else are all refused without partial writes.

## File Structure

| File | Responsibility |
|---|---|
| `server/inventory/schema.js`, `stock.js` | add `stock_reservations`; `reserve`, `release`, `issueReserved`, `reservedFor` |
| `server/requisitions/schema.js` | `migrateRequisitions(db)` + default templates |
| `server/requisitions/workflow.js` | `createWorkflowService(db, opts)` |
| `server/requisitions/service.js` | `createRequisitionService(db, deps)`, `RequisitionError` |
| `server/requisitions/routes.js` | `registerRequisitionRoutes(app, deps)` |
| `src/lib/requisition-types.ts`, `requisition-api.ts` | client types and API |
| `src/lib/nav-model.ts`, `pages.ts` | new pages, tab layouts, badges |
| `src/lib/use-badges.ts` | polls `/api/requisitions/badges` |
| `src/pages/requisition-*.tsx`, `approvals-page.tsx`, `issue-queue-page.tsx`, `workflow-admin-page.tsx`, `src/components/requisitions/*` | screens |
| `tests/requisition-*.test.js`, `tests/workflow.test.js` | tests |

---

### Task 1: Stock reservations

**Files:** Modify `server/inventory/schema.js` (table), `server/inventory/stock.js`; Test `tests/inventory-stock.test.js`.

**Interfaces:** Table `stock_reservations(id, ref_type, ref_id, variant_id, warehouse_id, lot_id, qty INTEGER CHECK(qty > 0), created_at)`. Produces on the stock service:
`reserve({ variantId, warehouseId, qty, refType, refId }): { reserved: { lotId, qty }[] }` — FEFO over non-expired lots by `on_hand − reserved`, all-or-nothing, raises `reserved` on balances, `INSUFFICIENT_STOCK` otherwise;
`release({ refType, refId, variantId? }): number` (qty released);
`reservedFor({ refType, refId, variantId }): number`;
`issueReserved({ refType, refId, variantId, warehouseId, qty, userId }): { picks: { lotId, qty, movementId }[] }` — first re-reserves reservations sitting on lots that have since expired (release then reserve the same qty FEFO, shrinking if short), then consumes reservation rows in FEFO order writing `issue` movements with `ref_type/ref_id`, lowering `reserved`; `INSUFFICIENT_STOCK` if non-expired reserved qty < `qty`.

- [ ] **Step 1: Failing tests** (in-memory): `reserve picks FEFO lots and raises reserved`; `reserve is all-or-nothing when short (no rows, reserved unchanged)`; `reserve ignores already reserved quantity and expired lots`; `release frees everything for a ref, or only one variant`; `issueReserved consumes reservations and writes issue rows with the ref`; `issueReserved cannot exceed the reserved qty`; `issueReserved moves a reservation off a lot that expired after reserving` (set `today` forward); `verifyIntegrity stays ok after reserve and issueReserved`.
- [ ] **Step 2: Run** `node --test tests/inventory-stock.test.js` → FAIL. **Step 3: Implement.** **Step 4: Run** `node --test tests/` → pass. **Step 5: Commit** `feat(requisitions): stock reservations`.

### Task 2: Schema and workflow service

**Files:** Create `server/requisitions/schema.js`, `server/requisitions/workflow.js`; Modify `server/index.js` (call `migrateRequisitions(db)`); Test `tests/workflow.test.js`.

**Interfaces:** Tables `workflow_templates(id, name, applies_type 'ppe'|'medicine'|'any', warehouse_id, version, is_active, created_at)`, `workflow_steps(template_id, position, name, approver_type, approver_ref, condition_json, mode, sla_hours, escalate_type, escalate_ref, allow_edit_qty)`, `department_supervisors(department, user_id, is_backup)`, `delegations(id, from_user, to_user, from_date, to_date)`, `carts(id, user_id, type, updated_at, UNIQUE(user_id,type))`, `cart_lines(cart_id, variant_id, qty)`, `requisitions(id, number, type, requester_id, department, warehouse_id, template_id, template_version, status, reason, needed_by, current_step, approved_at, created_at, submitted_at)`, `requisition_lines(id, requisition_id, variant_id, qty_requested, qty_approved, qty_issued, qty_returned, note)`, `requisition_steps(requisition_id, position, name, approver_type, approver_ref, condition_json, mode, sla_hours, escalate_type, escalate_ref, allow_edit_qty, status 'waiting'|'active'|'approved'|'skipped', approvers_json, approvals_json, due_at, escalated, resolved_at)`, `requisition_events(id, requisition_id, step, actor_id, action, comment, at)` with append-only triggers, `requisition_counters(year, last)`. `migrateRequisitions` also seeds two default templates ("เบิก PPE", "เบิกยา") with one step `dept_supervisor` mode `any` when no template exists.
`createWorkflowService(db, { now?, today? })` produces: `saveTemplate(input): template` (create or update; update bumps `version` and replaces steps; validates types, `any|all`, role names, condition shape, ≥1 step), `getTemplate(id)`, `listTemplates()`, `deleteTemplate(id)` (`IN_USE` if a non-final requisition references it), `pickTemplate({ type, warehouseId })` (warehouse-specific active, else type-specific, else `any`, else null), `stepApplies(step, { totalQty, categoryIds }): boolean`, `resolveApprovers(step, { requesterId, department, warehouseId }): { approvers: string[]; note: '' | 'skipped_self' | 'fallback_admin' | 'skipped_no_approver' }` (applies delegation and removes the requester), `setDepartmentSupervisors(department, entries)`, `listDepartmentSupervisors()`, `addDelegation / listDelegations / removeDelegation`, `effectiveActors(approverIds): string[]` (approvers plus active delegates). Errors: `WorkflowError(code, message)` codes `INVALID`, `NOT_FOUND`, `IN_USE`.

- [ ] **Step 1: Failing tests:** default templates exist after migration; `saveTemplate validates` (bad type, empty steps, unknown role, bad condition); `update bumps version`; `pickTemplate prefers warehouse then type then any`; `stepApplies honours minTotalQty and categoryIds`; `dept_supervisor resolves primary then backup only when primary missing`; `requester is removed from approvers`; `requester sole approver → skipped_self`; `unmapped department → fallback_admin`; `requester sole admin and unmapped → skipped_no_approver`; `delegation adds the delegate only inside the date range`; `deleteTemplate refuses when a non-final requisition uses it`.
- [ ] **Step 2–4:** run (FAIL), implement, run. **Step 5: Commit** `feat(requisitions): schema and workflow service`.

### Task 3: Requisition service

**Files:** Create `server/requisitions/service.js`; Test `tests/requisitions.test.js` (in-memory DB, real stock + workflow services).

**Interfaces:** `createRequisitionService(db, { stock, workflow, now?, today? })` and `RequisitionError(code, message, details?)` with codes `NOT_FOUND`, `FORBIDDEN`, `BAD_STATE`, `INVALID`, `SHORTAGE` (`details`: `{ variantId, name, short }[]`).
Cart: `getCart(userId, type)`, `setCartLine(userId, type, variantId, qty)` (0 removes; inactive variants refused), `clearCart(userId, type)`.
`checkout({ userId, type, warehouseId, reason, neededBy }): { id }` (non-empty cart and reason; creates the requisition, takes the department from `employee_directory` via the user's employee code, snapshots the template steps, activates the first applicable step or goes straight to `ready_to_issue` reserving stock when none applies);
`get(id): RequisitionDetail` (lines, steps, events, requester name);
`approve({ id, userId, comment?, lines?: { lineId, qty }[], asAdmin? })` (actor must be an effective approver of the active step or admin; `all` mode waits for every approver; on the last step reserves all lines or throws `SHORTAGE` and changes nothing);
`reject({ id, userId, reason })`, `requestChanges({ id, userId, reason })` (→ `returned_for_edit`), `cancel({ id, userId, reason?, asAdmin? })` (requester or admin; refused once anything is issued; releases reservations), `resubmit({ id, userId, lines?, reason?, neededBy? })` (only `returned_for_edit`, restarts at the first applicable step, clears approvals),
`issue({ id, userId, lines: { lineId, qty }[] })` (storekeeper of the warehouse or admin; `issueReserved` per line; status `partially_issued` or `issued`), `closeRemainder({ id, userId, reason })` (releases the rest → `closed`, or `issued` if nothing was left), `recordReturn({ id, userId, lines: { lineId, lotId, qty }[], reason? })` (≤ issued − returned; `returnStock`), `confirmReceipt({ id, userId })` (requester only; from `issued|partially_issued|closed` with issued > 0 → `received`),
`reassign({ id, userId, toUserId, reason })` (admin; adds an approver to the active step), `listMine(userId, { status? })`, `inbox(userId): InboxItem[]` (`overdue` flag), `issueQueue(userId, role): Detail[]`, `listAll({ status?, q?, page, pageSize })`, `badges(user): { approvals, issue }`, `expireStale(): number`, `escalateOverdue(): number` (adds the escalate approver to active steps whose `due_at` passed, once).
Every transition writes a `requisition_events` row and runs in `stock.transaction` with a status guard so a concurrent second approval gets `BAD_STATE`.

- [ ] **Step 1: Failing tests** (names; assertions use real stock): `checkout creates REQ-<BE year>-00001, snapshots steps and activates the supervisor step`; `empty cart or empty reason is refused`; `supervisor approval reserves stock and moves to ready_to_issue`; `final approval with short stock throws SHORTAGE naming the item and reserves nothing`; `requester who is the only approver is skipped, request goes on`; `unmapped department falls back to admins and records the event`; `approver cannot be the requester and strangers cannot approve`; `mode all needs every approver`; `approver lowers a quantity only when the step allows it and a comment is given`; `second approval of the same step is BAD_STATE and reserves once`; `reject and requestChanges need a reason; resubmit restarts the workflow`; `cancel releases reservations and is refused after an issue`; `issue consumes reservations FEFO, rejects more than approved, status partially_issued then issued`; `issue after the reserved lot expired re-reserves or fails without partial writes`; `closeRemainder releases the rest`; `recordReturn cannot exceed issued`; `confirmReceipt only by the requester`; `editing a template does not change a requisition in flight`; `expireStale releases reservations of old ready_to_issue requisitions`; `escalateOverdue adds the escalate approver once`; `delegate can approve while the delegation is active`; `condition minTotalQty adds an extra step only for big requests`; `events are append-only`.
- [ ] **Step 2–4:** run (FAIL), implement, run. **Step 5: Commit** `feat(requisitions): requisition service`.

### Task 4: Workflow admin API

**Files:** Create `server/requisitions/routes.js` (workflow part, `registerRequisitionRoutes(app, { db, requireAuth, requireAdmin, addAudit, nowIso })` creating the services once); Modify `server/index.js` (register routes, hourly `expireStale` + `escalateOverdue` interval cleared on shutdown); Test `tests/requisitions-api.test.js`.

**Interfaces:** `GET/POST /api/workflow/templates`, `GET/PUT/DELETE /api/workflow/templates/:id` (admin write; any logged-in manager reads), `GET /api/workflow/departments` (distinct departments from the employee directory with their mapped supervisors), `PUT /api/workflow/departments/supervisors` `{ department, entries: { userId, isBackup }[] }`, `GET/POST/DELETE /api/workflow/delegations` (a user manages their own; admin any), `POST /api/workflow/preview` `{ templateId, requesterId, totalQty, categoryIds }` → resolved steps with approver names, `GET/PUT /api/workflow/settings` `{ expireDays }`. Errors map `INVALID`→400, `NOT_FOUND`→404, `IN_USE`→409; all writes audited (`target_type` `workflow_template|workflow_department|workflow_delegation|workflow_settings`).

- [ ] **Step 1: Failing API tests:** `only admin writes templates, managers read`; `template validation errors are 400`; `deleting a template in use is 409`; `department supervisors can be set and read back`; `delegation: user creates own, cannot create for others, admin can; bad date range is 400`; `preview resolves approvers for a requester`; `settings validate expireDays 1..365`; `writes create audit rows`.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(requisitions): workflow admin API`.

### Task 5: Requisition API

**Files:** Modify `server/requisitions/routes.js`; Test `tests/requisitions-api.test.js`.

**Interfaces (all require login):** `GET /api/requisitions/catalog?type&q` → `{ items: { itemId, sku, name, type, unit, categoryName, variants: { variantId, label, available }[] }[] }`; `GET /cart?type`, `PUT /cart/lines` `{ type, variantId, qty }`, `DELETE /cart?type`, `POST /checkout` `{ type, warehouseId, reason, neededBy }` → 201 `{ requisition }`; `GET /mine?status`, `GET /:id` (requester, approvers, storekeepers of the warehouse, admin; else 403), `POST /:id/cancel|resubmit|receive`; approvals `GET /inbox`, `POST /:id/approve|reject|request-changes`, `POST /bulk-approve` `{ ids }` → `{ results: { id, ok, error? }[] }`; storekeeper `GET /issue-queue`, `POST /:id/issue`, `/close`, `/returns`; admin `GET /admin/all`, `POST /:id/admin/reassign`, `/admin/force-cancel`; `GET /badges` → `{ approvals, issue, cart }`. `RequisitionError`→ `NOT_FOUND` 404, `FORBIDDEN` 403, `BAD_STATE` 409, `SHORTAGE` 409 with `details`, `INVALID` 400. Every mutation audited (`target_type` `requisition`).

- [ ] **Step 1: Failing API tests:** an end-to-end happy path (employee cart → checkout → leader approves → storekeeper issues → employee confirms receipt) asserting stock `on_hand`, `reserved` and movements at each step; `shortage at final approval is 409 with details`; `stranger gets 403 on someone else's requisition`; `employee cannot reach inbox actions, issue or admin endpoints`; `storekeeper only sees queues of their warehouses`; `bulk approve reports per-id results`; `badges count pending approvals and issue queue`; `catalog shows availability and hides inactive items`; `anonymous is 401`; `double approve is 409`.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(requisitions): requisition API`.

### Task 6: Client foundation, nav and badges

**Files:** Create `src/lib/requisition-types.ts`, `src/lib/requisition-api.ts`, `src/lib/use-badges.ts`, stub pages; Modify `src/lib/pages.ts`, `src/lib/nav-model.ts`, `src/components/nav-icons.ts`, `src/components/app-pages.tsx`, `src/components/mobile/bottom-tab-bar.tsx`, `desktop-shell.tsx` (badges), `tests/mobile-nav.test.js`.

**Interfaces:** `PAGE_KEYS` gains `requisition-new` (เบิกของ), `requisitions` (ใบเบิกของฉัน), `approvals` (รออนุมัติ), `issue-queue` (จ่ายของ), `workflow-admin` (ตั้งค่าขั้นอนุมัติ), `requisitions-admin` (ใบเบิกทั้งหมด); every role may open `requisition-new` and `requisitions`; `approvals`: admin, leader, storekeeper; `issue-queue`: admin, storekeeper; the two admin pages: admin. `NavItem` gains `badge?: 'cart' | 'approvals' | 'issue'`. Bars: employee `[requisition-new(cart), requisitions]` + centre Record + More (4 slots); leader `[dashboard, inspections, approvals]` + centre + More; admin unchanged plus `approvals` in More; storekeeper `[inventory-stock, issue-queue, inventory-counts]` + centre Receive + More. New group "การเบิกของ". `useBadges(): { approvals, issue, cart }` polls every 60 s and on `ds:navigate`.

- [ ] **Step 1:** update `tests/mobile-nav.test.js` expectations (slot counts admin 5, leader 5, employee 4, storekeeper 5; every key allowed; groups cover the rest) — run → FAIL.
- [ ] **Step 2:** implement the model, pages list, API client, hook, stubs. **Step 3: Run** `node --test tests/`, `npx tsc -b`, `npx vite build` → pass. **Step 4: Commit** `feat(requisitions): client foundation, nav and badges`.

### Task 7: Catalog, cart and checkout (employee)

**Files:** `src/pages/requisition-new-page.tsx`, `src/components/requisitions/cart-sheet.tsx`, `checkout-dialog.tsx`.

**Behaviour:** type tabs (PPE/ยา), search, category chips, item cards with variant picker and a quantity stepper (min 1, shows availability, "หมด" disabled state); floating cart button with count; cart opens as a bottom sheet on phones and a side sheet on desktop with editable quantities, remove, clear (confirm); checkout dialog: warehouse select (active warehouses), reason, needed-by date, shows the approval route preview text ("หัวหน้างานแผนก … อนุมัติ"), confirm via `useConfirm('submit')`; success toast and link to the requisition.

- [ ] **Step 1:** implement. **Step 2: Run** `npx tsc -b`, `npx vite build`. **Step 3: Verify in the browser** (employee at 375px and desktop): add items, change qty, cart persists after reload, checkout creates a requisition. **Step 4: Commit** `feat(requisitions): catalog, cart and checkout`.

### Task 8: My requisitions and detail

**Files:** `src/pages/requisitions-page.tsx`, `src/components/requisitions/requisition-detail-dialog.tsx`, `status-badge.tsx`.

**Behaviour:** status filter tabs, paginated list (cards on phones); detail dialog with lines (requested/approved/issued/returned), approval steps with approvers, timeline of events, and actions by state: cancel (reason), edit-and-resubmit (lines/reason) when returned, confirm receipt; status badge colours per status.

- [ ] **Step 1:** implement. **Step 2: Run** typecheck and build. **Step 3: Verify in the browser:** the happy path from the employee side, cancel, resubmit. **Step 4: Commit** `feat(requisitions): my requisitions and detail`.

### Task 9: Approvals inbox and delegation

**Files:** `src/pages/approvals-page.tsx`, `src/components/requisitions/approve-dialog.tsx`, `delegation-dialog.tsx`.

**Behaviour:** inbox list with overdue badge, select-many bulk approve (confirm), row opens the detail with approve (comment, lower quantities when allowed), reject (reason), request changes (reason); "มอบสิทธิ์แทน" dialog (delegate user, date range, list/remove own delegations).

- [ ] **Step 1:** implement. **Step 2: Run** typecheck and build. **Step 3: Verify in the browser** as leader: approve, reject, request changes, bulk approve, delegation. **Step 4: Commit** `feat(requisitions): approvals inbox and delegation`.

### Task 10: Issue queue (storekeeper)

**Files:** `src/pages/issue-queue-page.tsx`, `src/components/requisitions/issue-dialog.tsx`, `returns-dialog.tsx`.

**Behaviour:** queue of `ready_to_issue/partially_issued` for the user's warehouses with a pick list (lot, expiry, qty per line), issue dialog (qty per line, default remaining), close remainder (reason, danger confirm), record returns (lot, qty, reason).

- [ ] **Step 1:** implement. **Step 2: Run** typecheck and build. **Step 3: Verify in the browser** as storekeeper: issue, partial issue, close, return; stock page numbers agree. **Step 4: Commit** `feat(requisitions): issue queue`.

### Task 11: Workflow designer and all requisitions (admin)

**Files:** `src/pages/workflow-admin-page.tsx`, `requisitions-admin-page.tsx`, `src/components/requisitions/template-dialog.tsx`, `department-supervisors-card.tsx`.

**Behaviour:** templates list (applies to, warehouse, steps count, version, active), template dialog with ordered step editor (name, approver type/ref, mode, SLA hours, escalation, allow edit qty, condition builder for min qty and categories, move up/down, remove), a route preview using `/api/workflow/preview`; department → supervisor mapping (primary and backup) card; delegation overview; expiry-days setting. All-requisitions page: filters, paginated table, row actions reassign and force-cancel (reason, danger confirm).

- [ ] **Step 1:** implement. **Step 2: Run** typecheck and build. **Step 3: Verify in the browser** as admin: create a two-step template with a quantity condition, map a department, see the preview, run a requisition through it, reassign, force-cancel. **Step 4: Commit** `feat(requisitions): workflow designer and admin overview`.

### Task 12: Cross-role verification

- [ ] **Step 1: Run** `npx tsc -b`, `npx oxlint` (no new errors), `npx vite build`, `node --test tests/` → all pass.
- [ ] **Step 2: Verify in the browser:** all four roles at 375px and desktop: bars and badges, no horizontal scroll on the six new pages at 360px, the full happy path end to end, a rejected and a returned path.
- [ ] **Step 3:** Fix anything found; commit `fix(requisitions): verification fixes` if needed.
