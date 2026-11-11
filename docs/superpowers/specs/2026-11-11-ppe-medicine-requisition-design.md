# PPE and medicine requisition, inventory and approval workflow — design

Date: 2026-11-11 · Status: draft for review · App: Daily Safety (Y.T. Rubber)

## 1. Goal

Employees request safety equipment (PPE) and over-the-counter / first-aid medicine through a shopping-cart flow.
Each request is a requisition that moves through an approval workflow (department supervisor, then the warehouse),
stock is controlled in a proper inventory ledger, and admins can configure the workflow and everything around it.

### Decisions already made with the owner

| Topic | Decision |
|---|---|
| Medicine scope | Over-the-counter / first-aid only. Lot and expiry tracked, FEFO picking, no prescription step. |
| Who issues stock | New role `storekeeper`. Admin configures everything. Several warehouses supported; each has assigned staff. |
| Who approves | The requester's department supervisor. Admin maps department to supervisor (primary and backup). |
| Entitlement limits | None. The supervisor decides. (No quota engine.) |
| Workflow style | Admin-configurable ordered steps (approach "A"). No BPMN engine, no fixed two-step. |
| Notifications | In-app only (inbox badge). Email/LINE stay deferred. |

### Non-goals (YAGNI, can be added later)

Purchase orders and suppliers, unit cost and valuation, controlled/prescription drugs, barcode scanning,
email/LINE notifications, parallel or branching workflow graphs, multi-company.

## 2. Delivery in three sub-projects

Each gets its own implementation plan and can ship on its own.

1. **Inventory and catalog** (foundation).
2. **Cart requisition and approval workflow** (depends on 1).
3. **Reports and controls** (depends on 1 and 2).

## 3. Architecture

- Same stack: Express 5, `node:sqlite`, React 19, shadcn/ui, existing theme, confirm dialogs, pagination, audit log, i18n (Thai/English).
- New server code lives in separate modules (`server/inventory/*`, `server/requisitions/*`, `server/workflow/*`) mounted from `server/index.js`,
  so `index.js` does not keep growing. Tables follow the existing `CREATE TABLE IF NOT EXISTS` migration pattern.
- Roles: add `storekeeper`. `admin` can do everything. `leader` (supervisor) approves. `employee` requests.
  Helpers in `server/` and `src/lib/roles.ts` get `isStorekeeper` and permission checks per warehouse.
- All stock-changing operations run inside one SQLite transaction (`BEGIN IMMEDIATE`) so concurrent issues cannot oversell.

## 4. Sub-project 1: inventory and catalog

### Data model

- `item_categories(id, name, type 'ppe'|'medicine', sort)`
- `items(id, sku unique, name, type, category_id, unit, image, min_stock, track_lot, track_expiry, is_active)`
  Medicine items force `track_lot = track_expiry = 1`.
- `item_variants(id, item_id, label e.g. size/colour, sku_suffix, is_active)` — stock is counted per variant (every item has at least one default variant).
- `warehouses(id, name, code, is_active)` and `warehouse_staff(warehouse_id, user_id)`.
- `stock_lots(id, variant_id, warehouse_id, lot_no, expiry_date nullable, received_at)`.
- `stock_movements` — **append-only ledger**:
  `id, type, variant_id, warehouse_id, lot_id nullable, qty (signed), ref_type, ref_id, reason, user_id, created_at`.
  Types: `receive`, `issue`, `return`, `transfer_out`, `transfer_in`, `adjust`, `count_adjust`, `write_off`.
  Rows are never updated or deleted; corrections are new rows.
- `stock_balances(variant_id, warehouse_id, lot_id, on_hand, reserved)` — maintained in the same transaction as each movement,
  with an integrity check that recomputes balances from the ledger.
- `stock_counts(id, warehouse_id, status 'draft'|'counting'|'posted', created_by, posted_at)` and `stock_count_lines(count_id, variant_id, lot_id, system_qty, counted_qty)`.
  Posting writes the differences as `count_adjust` movements.

### Rules

- Available = on_hand − reserved. On hand can never go negative.
- Issue picks lots **first-expiry-first-out**; expired lots are never issued. Items without expiry pick oldest received first.
- Adjust, write-off and count posting require a reason and are written to the audit log. Write-off reasons: expired, damaged, lost, other.
- Alerts on the dashboard: below `min_stock`; medicine expiring within 30/60/90 days (thresholds stored in `app_settings`).

### Screens (storekeeper/admin)

Item list and form (with variants), stock on hand (by warehouse, filter by category/low/expiring), receive stock, adjust / write-off,
transfer between warehouses, stock count sheets, movement history (the ledger) with Excel export.

## 5. Sub-project 2: cart requisition and workflow

### Cart and requisition

- A cart is a server-side draft per user and per type (PPE, medicine) because the two use different warehouses and workflows.
  Checking out turns a cart into one requisition.
- `requisitions(id, number REQ-<BE year>-<seq>, type, requester_id, department, warehouse_id, template_id, template_version, status,
  reason, needed_by, current_step, created_at, submitted_at)`; `requisition_lines(requisition_id, variant_id, qty_requested, qty_approved, qty_issued, note)`.
- Status path: `draft → submitted → in_approval(step n) → approved → ready_to_issue → partially_issued | issued → received`.
  Branches: `rejected` (reason required), `returned_for_edit` (requester edits and resubmits), `cancelled` (before issue), `expired` (approved but not collected in time).
- Approvers may lower line quantities (partial approval) with a reason when the step allows it.
- Final approval **reserves** stock; reject, cancel and expiry release it; issue consumes it and writes `issue` movements. Unissued remainder can be closed or kept as back-order by the storekeeper.
- Returns after issue create `return` movements and a linked return record.
- Every create, update, submit and delete uses the existing confirm dialog.

### Workflow engine (ordered steps, admin-configurable)

- `workflow_templates(id, name, applies_type 'ppe'|'medicine'|'any', warehouse_id nullable, version, is_active)`.
  Editing a template creates a new version; running requisitions keep the version they started with.
- `workflow_steps(template_id, version, position, name, approver_type, approver_ref, condition_json, mode 'any'|'all', sla_hours, escalate_to, allow_edit_qty)`.
  `approver_type`: `dept_supervisor`, `role`, `user`, `warehouse_staff`.
  `condition_json` examples: total qty greater than N, contains category X. A step whose condition is false is skipped.
- `department_supervisors(department, user_id, is_backup)`.
- `delegations(from_user, to_user, from_date, to_date)` — approvals route to the delegate during the range.
- **Segregation of duties:** nobody approves their own requisition. If the requester is the step's approver, the step is skipped (or goes to the backup/admin if none remain).
- `requisition_events(id, requisition_id, step, actor_id, action, comment, at)` — append-only history shown as a timeline.
- SLA: overdue approvals are flagged in the inbox and can be escalated to `escalate_to`.
- Default templates created on first run: PPE and medicine, each = department supervisor → warehouse issue → requester confirms receipt.

### Screens

- **Employee:** browse catalog, cart (bottom sheet on phones), my requisitions with timeline, confirm receipt, cancel.
- **Supervisor:** approval inbox with badge, approve / reject / edit quantities, bulk approve.
- **Storekeeper:** issue queue, pick list showing FEFO lots, confirm issue, record returns.
- **Admin:** workflow designer (step list editor with condition builder and route preview), department-to-supervisor mapping, delegation overview,
  all requisitions with override actions (reassign, force-cancel; reason required and audited).

## 6. Sub-project 3: reports and controls

- Reports (filter by date, department, person, item, warehouse; Excel export and print view): stock on hand, movement ledger, usage by department / person / item,
  requisition cycle time and approval SLA, expiring and low-stock lists, requests by status.
- Printable issue slip for each issued requisition.
- Controls: permissions matrix below, audit-log entries for all master-data and stock changes, nightly ledger-vs-balance integrity check (result shown to admin),
  rate limiting and CSRF as already in the app.

### Permissions

| Action | employee | leader | storekeeper | admin |
|---|---|---|---|---|
| Browse catalog, cart, own requisitions | yes | yes | yes | yes |
| Approve requisitions as assigned | – | yes | if assigned | yes |
| Receive, issue, adjust, count, transfer | – | – | own warehouses | all |
| Items, warehouses, workflow, department mapping | – | – | – | yes |
| Reports | own | department | own warehouses | all |

## 7. Testing

- API tests with `node --test` (existing harness): ledger and balance consistency, FEFO selection, expired-lot refusal, no negative stock, reservation lifecycle,
  concurrent issue attempts, every status transition and illegal transition, template versioning, conditions and skipped steps, delegation, segregation of duties,
  permission checks per role and warehouse.
- UI checked in the browser on desktop and phone width: cart, approval inbox, issue queue, workflow designer.

## 8. Open questions

None blocking. Optional later: unit cost and valuation, purchase orders, email/LINE alerts, barcode scanning.
