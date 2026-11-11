# Inventory and Catalog Implementation Plan (sub-project 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warehouse stock control for PPE and over-the-counter medicine: catalog, multiple warehouses, append-only stock ledger with lots/expiry (FEFO), stock counts, alerts, and a new `storekeeper` role.

**Architecture:** New server modules under `server/inventory/` (`schema.js`, `stock.js` service, `routes.js`) mounted from `server/index.js`. The stock service owns every stock change inside one `BEGIN IMMEDIATE` transaction and is unit-tested against an in-memory SQLite. React pages are added under the existing `/app/<page>` routing and shell.

**Tech Stack:** Node 24 `node:sqlite`, Express 5, exceljs (already installed), React 19, shadcn/ui, existing theme, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-ppe-medicine-requisition-design.md` (sections 3, 4, 6 permissions). Requisitions, workflow and reports are sub-projects 2 and 3 and are NOT built here, but `stock_balances.reserved` and `issueFefo` exist now because the spec's available-stock rule needs them.

## Global Constraints

- Quantities are whole numbers (`Number.isInteger(qty) && qty > 0` for movements); on hand never below 0.
- `stock_movements` is append-only: no UPDATE or DELETE, enforced by SQLite triggers; corrections are new rows.
- Medicine items always have `track_lot = track_expiry = 1`; expired lots (expiry before today, Asia/Bangkok) are never issued.
- FEFO order: lots with expiry by earliest expiry first, then lots without expiry by `received_at`.
- Adjust, write-off, count posting require a non-empty reason and write `addAudit(...)`; write-off reasons: `expired | damaged | lost | other`.
- Permissions: admin everything; `storekeeper` only warehouses listed in `warehouse_staff`; `leader` and `employee` no inventory access in this sub-project.
- UI rules already in the app: Thai text through `t()` with English added in `src/lib/i18n.tsx`; `useConfirm('create'|'update'|'danger')` before every create/update/delete; `useDataPagination` + `DataTablePagination` on every table; icon-only buttons use `Button iconOnly` with tooltip; dates via `formatDateTime`/`formatDate`; ids are `randomUUID()` strings; server messages are Thai.
- Every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Receiving `qty` of 0, negative, fractional or text is refused (`INVALID_QTY`) and writes nothing.
- Receiving a medicine without lot number or expiry date is refused; receiving the same lot number again for the same variant+warehouse adds to the existing lot, and a different expiry on that lot number is refused.
- An issue larger than non-expired stock fails as a whole: no movement rows, balances unchanged (all-or-nothing across several lots).
- Transfer to the same warehouse is refused; a storekeeper assigned only to the source warehouse cannot transfer into one they are not assigned to.
- Posting a stock count twice is refused; the adjustment is `counted − current on_hand at post time` so stock moved after the sheet was created is not double counted.

## File Structure

| File | Responsibility |
|---|---|
| `server/inventory/schema.js` | `migrateInventory(db)` tables, indexes, append-only triggers |
| `server/inventory/stock.js` | `StockError`, `createStockService(db, opts)` — all stock changes and queries |
| `server/inventory/counts.js` | stock count sheets on top of the service |
| `server/inventory/routes.js` | `registerInventoryRoutes(app, deps)` — all `/api/inventory/*` endpoints |
| `server/index.js` | storekeeper role migration/validation, call `migrateInventory`, `registerInventoryRoutes` |
| `src/lib/inventory-types.ts`, `src/lib/api.ts` | client types and API methods |
| `src/lib/pages.ts`, `src/lib/roles.ts`, `src/components/app-shell.tsx` | storekeeper role, 5 new pages, nav |
| `src/pages/inventory-*.tsx`, `src/components/inventory/*.tsx` | screens and dialogs |
| `tests/inventory-stock.test.js`, `tests/inventory-api.test.js` | unit (in-memory) and API tests |

---

### Task 1: Schema and `storekeeper` role

**Files:** Create `server/inventory/schema.js`; Modify `server/index.js` (users CHECK at line 55 and rebuild guard near line 331, role lists at lines 3127 and 3170, call `migrateInventory(db)` after the other migrations); Test `tests/inventory-api.test.js`.

**Interfaces:**
- Produces: `migrateInventory(db: DatabaseSync): void`; users accept role `'storekeeper'`.

Tables (all ids TEXT; timestamps ISO TEXT):
- `item_categories(id, name, type CHECK in ppe|medicine, sort_order)`
- `items(id, sku UNIQUE, name, type, category_id, unit, image, min_stock INT, track_lot, track_expiry, is_active)`
- `item_variants(id, item_id, label, is_active)` — every item gets a default variant labelled `''` on creation
- `warehouses(id, code UNIQUE, name, is_active)`, `warehouse_staff(warehouse_id, user_id, PRIMARY KEY both)`
- `stock_lots(id, variant_id, warehouse_id, lot_no, expiry_date, received_at, UNIQUE(variant_id, warehouse_id, lot_no))` — items without lot tracking use `lot_no = ''`
- `stock_movements(id, type, variant_id, warehouse_id, lot_id, qty INT signed, ref_type, ref_id, reason, user_id, created_at)` with `BEFORE UPDATE` and `BEFORE DELETE` triggers raising `ABORT`
- `stock_balances(variant_id, warehouse_id, lot_id, on_hand, reserved DEFAULT 0, PRIMARY KEY(variant_id, warehouse_id, lot_id))`
- `stock_counts(id, warehouse_id, status, created_by, created_at, posted_at)`, `stock_count_lines(count_id, variant_id, lot_id, system_qty, counted_qty NULL)`

- [ ] **Step 1: Write failing API test** `storekeeper role can be created and logs in`: as admin create an employee (`employeeBody`) then `POST /api/admin/users` with `role: 'storekeeper'` → 201; log in as that user → 200 and `/api/auth/me` role is `storekeeper`. Add `inventory tables exist` asserting `stock_movements` rejects UPDATE (run via a second `DatabaseSync` on `dataDir`).
- [ ] **Step 2: Run** `node --test tests/inventory-api.test.js` → FAIL (role invalid).
- [ ] **Step 3: Implement** the schema module; extend users CHECK in the CREATE and add a second rebuild guard `!usersSchema.includes("'storekeeper'")` reusing the existing `users_rebuild` pattern; add `'storekeeper'` to both role validation arrays.
- [ ] **Step 4: Run** the test and `node --test tests/` → all PASS.
- [ ] **Step 5: Commit** `feat(inventory): schema and storekeeper role`.

### Task 2: Stock service — receive, balances, integrity

**Files:** Create `server/inventory/stock.js`; Test `tests/inventory-stock.test.js` (uses `new DatabaseSync(':memory:')` + `migrateInventory`).

**Interfaces:**
- Produces: `class StockError extends Error { code }` with codes `INVALID_QTY, INSUFFICIENT_STOCK, LOT_REQUIRED, EXPIRY_REQUIRED, EXPIRY_MISMATCH, LOT_EXPIRED, REASON_REQUIRED, INACTIVE, SAME_WAREHOUSE, NOT_FOUND, ALREADY_POSTED`;
  `createStockService(db, opts?: { now?: () => string; today?: () => string }): StockService` where `today()` defaults to the Asia/Bangkok date `YYYY-MM-DD`;
  `receive({ variantId, warehouseId, qty, lotNo?, expiryDate?, reason?, userId, refType?, refId? }): { movementId, lotId }`;
  `balance({ variantId, warehouseId, lotId? }): { onHand, reserved, available }`;
  `verifyIntegrity(): { ok: boolean, mismatches: { variantId, warehouseId, lotId, ledger, balance }[] }`.
  Every later mutating method wraps its work in `BEGIN IMMEDIATE … COMMIT` and rolls back on `StockError`.

- [ ] **Step 1: Failing tests** (helper `seed()` inserts a PPE item+variant, a medicine item+variant, a warehouse): `receive adds on_hand and one ledger row`; `receive rejects qty 0, -1, 1.5, "3"`; `medicine receive requires lotNo and expiryDate`; `same lot number merges into one lot`; `same lot number with different expiry is refused`; `inactive variant cannot receive`; `ledger rows cannot be updated or deleted`; `verifyIntegrity is ok after receipts and detects a tampered balance`.
- [ ] **Step 2: Run** `node --test tests/inventory-stock.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** `receive` (find-or-create lot by `(variant, warehouse, lotNo)`, insert movement `type 'receive'`, upsert balance) and `balance`, `verifyIntegrity` (sum ledger per key vs `stock_balances.on_hand`).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(inventory): stock service receive and integrity`.

### Task 3: Stock service — FEFO issue and returns

**Files:** Modify `server/inventory/stock.js`; Test `tests/inventory-stock.test.js`.

**Interfaces:**
- Produces: `issueFefo({ variantId, warehouseId, qty, userId, refType?, refId? }): { picks: { lotId, qty, movementId }[] }`; `returnStock({ variantId, warehouseId, lotId, qty, userId, refType?, refId?, reason? }): { movementId }`.

- [ ] **Step 1: Failing tests** with injected `today: () => '2026-11-11'`: `issue takes earliest expiry first across lots` (lots 5@2026-12-01, 5@2027-01-01, issue 7 → picks 5 then 2); `lots without expiry come after expiring lots, oldest received first`; `expired lot is skipped`; `issue beyond non-expired stock throws INSUFFICIENT_STOCK and changes nothing` (ledger count and balances identical before/after); `issue respects reserved` (set `reserved` directly: available = on_hand − reserved); `returnStock adds back to the same lot`; `returnStock to an unknown lot throws NOT_FOUND`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** both methods (issue writes negative `issue` movements per pick; return writes positive `return`).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(inventory): FEFO issue and returns`.

### Task 4: Stock service — adjust, write-off, transfer

**Files:** Modify `server/inventory/stock.js`; Test `tests/inventory-stock.test.js`.

**Interfaces:**
- Produces: `adjust({ variantId, warehouseId, lotId, delta, reason, userId }): { movementId }`;
  `writeOff({ variantId, warehouseId, lotId, qty, reason: 'expired'|'damaged'|'lost'|'other', note?, userId }): { movementId }`;
  `transfer({ variantId, fromWarehouseId, toWarehouseId, lotId, qty, userId }): { outId, inId, toLotId }` — destination lot reuses the source lot number and expiry.

- [ ] **Step 1: Failing tests:** `adjust requires a reason`; `adjust cannot take on_hand below 0`; `adjust works on inactive variants`; `writeOff reason must be one of the four`; `writeOff reduces stock with type write_off`; `transfer moves stock and keeps lot number and expiry`; `transfer to the same warehouse throws SAME_WAREHOUSE`; `transfer more than on hand throws and changes nothing`.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat(inventory): adjust, write-off and transfer`.

### Task 5: Stock counts

**Files:** Create `server/inventory/counts.js`; Test `tests/inventory-stock.test.js`.

**Interfaces:**
- Consumes: `StockService` from Task 2–4.
- Produces: `createCountService(db, stock: StockService)` with
  `create({ warehouseId, userId }): { id }` (snapshots every balance row of the warehouse into `stock_count_lines.system_qty`);
  `setLines(id, lines: { variantId, lotId, countedQty }[]): void` (moves status `draft → counting`; refused once posted);
  `post(id, userId): { adjustments: number }` — for each counted line writes `count_adjust` movement of `countedQty − current on_hand` when non-zero, sets `posted`, throws `ALREADY_POSTED` the second time.

- [ ] **Step 1: Failing tests:** `count sheet snapshots balances`; `posting writes only non-zero differences`; `difference uses on_hand at post time` (receive 3 after creating the sheet, count equals the new total → 0 adjustments); `posting twice throws ALREADY_POSTED`; `lines cannot be edited after posting`; `uncounted lines are left alone`.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(inventory): stock counts`.

### Task 6: Catalog and warehouse API

**Files:** Create `server/inventory/routes.js` (catalog and warehouse part, exports `registerInventoryRoutes(app, { db, requireAuth, requireAdmin, addAudit, randomUUID, nowIso })`); Modify `server/index.js` (call it); Test `tests/inventory-api.test.js`.

**Interfaces:**
- Produces middleware inside routes.js: `requireStockStaff(req, res, next)` (admin or storekeeper, else 403) and `canUseWarehouse(user, warehouseId): boolean` (admin, or row in `warehouse_staff`).
- Endpoints (admin writes, staff reads): `GET/POST /api/inventory/categories`, `PATCH/DELETE /categories/:id`; `GET /items?type&q&active`, `POST /items` (creates default variant), `PATCH /items/:id`, `DELETE /items/:id`; `POST /items/:id/variants`, `PATCH /variants/:id`, `DELETE /variants/:id`; `GET/POST /warehouses`, `PATCH/DELETE /warehouses/:id`, `PUT /warehouses/:id/staff` body `{ userIds: string[] }` (only active storekeepers/admins).
  `GET /warehouses` returns all for admin, only assigned for storekeeper. Deletes return 409 with a Thai message when stock movements exist (category/item/variant/warehouse in use) — deactivate instead.

- [ ] **Step 1: Failing API tests:** `admin creates PPE item with variants`; `medicine items force lot and expiry tracking`; `duplicate sku is 409`; `storekeeper cannot create items (403) but can list them`; `employee gets 403 on every inventory endpoint`; `storekeeper sees only assigned warehouses`; `PUT staff rejects employee users`; `delete item with movements is 409, without is 200`; `create/update/delete write audit entries`.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(inventory): catalog and warehouse API`.

### Task 7: Stock operation API, alerts and export

**Files:** Modify `server/inventory/routes.js`; Test `tests/inventory-api.test.js`.

**Interfaces:**
- Consumes: `createStockService` (created once in `registerInventoryRoutes`), `requireStockStaff`, `canUseWarehouse`.
- Endpoints (all check `canUseWarehouse`; `StockError` → 400, `INSUFFICIENT_STOCK`/`ALREADY_POSTED` → 409):
  `GET /stock?warehouseId&type&categoryId&q&filter=low|expiring` → rows `{ variantId, itemId, sku, name, variantLabel, unit, warehouseId, onHand, reserved, available, minStock, nearestExpiry }`;
  `GET /stock/lots?warehouseId&variantId` → `{ lotId, lotNo, expiryDate, onHand }[]`;
  `POST /receipts` `{ warehouseId, lines: { variantId, qty, lotNo?, expiryDate? }[], note? }` (all lines or none);
  `POST /adjustments`, `POST /write-offs`, `POST /transfers` (`lines`, needs access to both warehouses);
  `GET /movements?warehouseId&variantId&type&from&to&page&pageSize` → `{ rows, total }` and `GET /movements/export` (xlsx);
  `GET /alerts` → `{ lowStock: StockRow[], expiring: { variantId, name, lotNo, expiryDate, daysLeft, onHand }[] }`;
  `GET/PUT /settings` (admin write) key `inventory.expiry_warn_days` default `"30,60,90"`.

- [ ] **Step 1: Failing API tests:** `receipt with a bad line writes nothing`; `receipt, stock list and movements agree`; `storekeeper cannot receive into an unassigned warehouse (403)`; `transfer needs both warehouses (403 otherwise)`; `adjustment without reason is 400`; `alerts list low stock and lots expiring within the largest threshold with daysLeft`; `expired lots are listed with negative daysLeft`; `movements export returns an xlsx with a header row`; `settings PUT is admin only and validates numbers`.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(inventory): stock operations API, alerts, export`.

### Task 8: Stock count API

**Files:** Modify `server/inventory/routes.js`; Test `tests/inventory-api.test.js`.

**Interfaces:**
- Consumes: `createCountService`. Endpoints: `GET /counts?warehouseId`, `POST /counts` `{ warehouseId }`, `GET /counts/:id` (sheet with lines + item names), `PUT /counts/:id/lines` `{ lines }`, `POST /counts/:id/post` (writes `addAudit` with number of adjustments).

- [ ] **Step 1: Failing API tests:** `count create → set lines → post adjusts stock`; `posting twice is 409`; `storekeeper cannot open a count for an unassigned warehouse`; `count lines for another warehouse's lot are rejected`.
- [ ] **Step 2–4:** run, implement, run. **Step 5: Commit** `feat(inventory): stock count API`.

### Task 9: Client foundation (types, API, roles, nav)

**Files:** Create `src/lib/inventory-types.ts`; Modify `src/lib/api.ts`, `src/lib/types.ts` (`User['role']` adds `'storekeeper'`), `src/lib/pages.ts`, `src/lib/roles.ts`, `src/components/app-shell.tsx`, `src/lib/i18n.tsx`, `src/pages/users-page.tsx` (role option "เจ้าหน้าที่คลัง").

**Interfaces:**
- Produces: `PAGE_KEYS` gains `'inventory-stock' | 'inventory-items' | 'inventory-warehouses' | 'inventory-counts' | 'inventory-movements'`; `pagesFor('admin')` all; `pagesFor('storekeeper')` = `new, inspections, inventory-stock, inventory-movements, inventory-counts`; `defaultPage('storekeeper') = 'inventory-stock'`; `isStockStaff(user)` in `roles.ts` (admin or storekeeper); `api.inventory.*` methods mirroring the Task 6–8 endpoints; types `Item`, `Variant`, `Warehouse`, `StockRow`, `Lot`, `Movement`, `StockAlerts`, `CountSheet`.
- Page components are stubs returning a heading until Tasks 10–12; `app-shell.tsx` renders them by key.

- [ ] **Step 1:** Extend `pages.ts`/`roles.ts` and add a small `tests/pages.test.js`-style check is not available (no client test runner), so verify with `npx tsc -b` (must pass) and `grep` that every `PAGE_KEYS` entry is rendered in `app-shell.tsx`.
- [ ] **Step 2:** Add the nav entries (admin: 5 items; storekeeper: stock, movements, counts, plus inspection items) and Thai/English labels.
- [ ] **Step 3: Run** `npx tsc -b` and `npx vite build` → PASS; log in as a storekeeper in the browser and confirm `/app/inventory-stock` loads and `/app/users` falls back to it.
- [ ] **Step 4: Commit** `feat(inventory): client foundation and storekeeper navigation`.

### Task 10: Items, categories and warehouses pages (admin)

**Files:** Create `src/pages/inventory-items-page.tsx`, `src/pages/inventory-warehouses-page.tsx`, `src/components/inventory/item-dialog.tsx`, `warehouse-dialog.tsx`.

**Interfaces:** Consumes `api.inventory` catalog/warehouse methods. Items page: type tabs (PPE/ยา), search, table with pagination, create/edit dialog (two-column; variants editor; medicine hides lot/expiry switches as forced on), activate/deactivate and guarded delete (show the server's 409 message). Categories managed in a dialog on the same page. Warehouses page: list, create/edit, staff multi-select (storekeepers/admins), expiry-warning days setting dialog.

- [ ] **Step 1:** Build both pages following `employees-page.tsx` patterns (confirm provider, icon-only tooltip buttons, stacked cards on phones).
- [ ] **Step 2: Run** `npx tsc -b` and `npx vite build` → PASS.
- [ ] **Step 3: Verify in the browser** (temp server with `DATA_DIR`): create a category, a PPE item with two sizes, a medicine item (lot/expiry forced), a warehouse with staff; screenshots at desktop and 375px width.
- [ ] **Step 4: Commit** `feat(inventory): items, categories and warehouses pages`.

### Task 11: Stock page, operations dialogs and alerts

**Files:** Create `src/pages/inventory-stock-page.tsx`, `src/components/inventory/receive-dialog.tsx`, `adjust-dialog.tsx`, `writeoff-dialog.tsx`, `transfer-dialog.tsx`, `stock-alerts-card.tsx`; Modify `src/pages/dashboard-page.tsx` (admin only: compact alerts card).

**Interfaces:** Consumes `api.inventory.stock/lots/receipts/adjustments/writeOffs/transfers/alerts`. Stock page: warehouse selector (only permitted ones), type/category/search filters, filter chips "ใกล้หมด" and "ใกล้หมดอายุ", paginated table (on hand, reserved, available, nearest expiry colour-coded by the alert thresholds), row actions by icon. Receive dialog supports several lines; lot/expiry fields appear for tracked items. Every submit goes through `useConfirm`.

- [ ] **Step 1:** Implement page and dialogs; `StockAlertsCard` shows low-stock count and expiring buckets 30/60/90 and links into the filtered stock page.
- [ ] **Step 2: Run** `npx tsc -b`, `npx vite build` → PASS.
- [ ] **Step 3: Verify in the browser:** receive medicine with lot+expiry, see it in the 30-day bucket, adjust, write off, transfer between two warehouses; confirm a storekeeper cannot see an unassigned warehouse; phone width check.
- [ ] **Step 4: Commit** `feat(inventory): stock page, operations and alerts`.

### Task 12: Movements and counts pages, final verification

**Files:** Create `src/pages/inventory-movements-page.tsx`, `src/pages/inventory-counts-page.tsx`, `src/components/inventory/count-sheet-dialog.tsx`.

**Interfaces:** Movements page: server-paginated ledger (filters warehouse/item/type/date range with `DatePicker`, readable type badges, signed quantities, reference column) and an Excel export button. Counts page: list of sheets with status badges, "start count" (warehouse), sheet dialog with counted-quantity inputs (shows system quantity and live difference), save, and post with a danger-style confirm.

- [ ] **Step 1:** Implement both pages; reuse the persistent filter state hook (`usePersistentState`) for filters.
- [ ] **Step 2: Run** `npx tsc -b`, `npx oxlint`, `npx vite build`, `node --test tests/` → all PASS.
- [ ] **Step 3: Verify in the browser:** ledger shows every movement made in Task 11, export downloads, a full count (create → enter counts → post) produces `count_adjust` rows and updates stock; phone width.
- [ ] **Step 4: Commit** `feat(inventory): movements and stock count pages`.
