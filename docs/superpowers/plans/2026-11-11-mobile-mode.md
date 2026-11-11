# Mobile Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real mobile mode with its own shell (top bar, five-slot bottom tab bar with a raised centre action, "More" sheet) switched automatically by screen width with a manual override; desktop stays unchanged.

**Architecture:** One pure navigation model (`nav-model.ts`) feeds both shells. `AppShell` becomes a switch between `DesktopShell` (today's markup moved as is) and `MobileShell`. Mode comes from a small external store (`view-mode`) that listens to `matchMedia` and a device-level preference. Mobile-only CSS hangs off `[data-view="mobile"]` on `<html>`.

**Tech Stack:** React 19, TypeScript, Tailwind v4 + `src/index.css`, lucide-react, shadcn Sheet/Dialog, `node --test` (Node strips types, so pure `.ts` modules are imported directly by tests).

**Spec:** `docs/superpowers/specs/2026-11-11-mobile-mode-design.md`

## Global Constraints

- Mobile mode when viewport width < 768px (`matchMedia('(max-width: 767px)')`) and preference is `auto`; preference values `auto | mobile | desktop`.
- Preference is stored in localStorage under key `ds-device:view.mode` (NOT the `ds:` prefix) so `clearPersistentState()` on logout does not remove it.
- Bottom bar: 3–5 slots, centre action raised and always at index `Math.floor(slots / 2)`; "More" is always the last slot.
- Touch targets in mobile mode at least 44px; bottom bar and content respect `env(safe-area-inset-bottom)`.
- Every new CSS rule for mobile is scoped under `[data-view="mobile"]`; desktop rendering must not change.
- Pure modules (`nav-model.ts`, `view-mode-core.ts`) have only `import type` imports so Node can load them in tests; icons are referenced by string name there.
- Thai UI text through `t()`, English added in `src/lib/i18n.tsx`; icon-only buttons use `Button iconOnly` (tooltip) or `aria-label`.
- Every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Resizing across 768px while signed in must keep the current page (no blank screen, no fallback to the home page) — the inspection draft autosave covers typed form data.
- The "desktop view" preference on a phone survives reload, sign-out and sign-in; switching back to auto restores width-based behaviour.
- When the current page is not a tab (it lives in More), the More slot shows as active; tapping the active tab scrolls the page to top.
- Every tab key and every More-sheet item is allowed for the role (`pagesFor(role)`), so no tab leads to a page the role cannot open.
- With the on-screen keyboard open, the bottom bar must not cover the focused field (bar hides while a text field has focus); five Thai labels fit at 360px without wrapping or horizontal scroll.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/nav-model.ts` | pure: `navFor(role)`, `activeSlotIndex(tabs, page)` |
| `src/lib/view-mode-core.ts` | pure: `resolveViewMode(preference, isNarrow)`, preference parsing |
| `src/lib/use-view-mode.ts` | React hook over an external store (matchMedia + localStorage) |
| `src/components/nav-icons.ts` | `IconName` → lucide component map |
| `src/components/app-pages.tsx` | `renderPage(...)` shared by both shells |
| `src/components/desktop-shell.tsx` | today's sidebar shell, moved |
| `src/components/mobile/mobile-shell.tsx`, `bottom-tab-bar.tsx`, `more-sheet.tsx`, `mobile-top-bar.tsx` | mobile shell |
| `src/components/app-shell.tsx` | thin switch |
| `src/index.css` | `[data-view="mobile"]` rules |
| `tests/mobile-nav.test.js` | tests for the pure modules |

---

### Task 1: Navigation model and view-mode core (pure)

**Files:** Create `src/lib/nav-model.ts`, `src/lib/view-mode-core.ts`; Test `tests/mobile-nav.test.js` (imports `../src/lib/nav-model.ts`, `../src/lib/pages.ts`, `../src/lib/view-mode-core.ts`).

**Interfaces:**
- Produces:
  `type Role = 'admin' | 'leader' | 'employee' | 'storekeeper'`; `type IconName` (string union of the lucide names used);
  `type NavItem = { key: PageKey; label: string; icon: IconName }` (label is the Thai text);
  `type TabSlot = { kind: 'tab'; item: NavItem } | { kind: 'center'; label: string; icon: IconName; page: PageKey; query?: string } | { kind: 'more' }`;
  `type NavGroup = { title: string; items: NavItem[] }`;
  `navFor(role: Role): { all: NavItem[]; tabs: TabSlot[]; groups: NavGroup[] }` — `all` keeps today's sidebar order and Thai labels (admin "ภาพรวม", leader "ภาพรวมทีม"/"ติดตามงานทีม", employee "ประวัติของฉัน", storekeeper stock pages first); `groups` hold the items that are not tabs, titled "คลังสินค้า", "ข้อมูลระบบ", "การตรวจ";
  `activeSlotIndex(tabs: TabSlot[], page: PageKey): number` — index of the tab whose key is `page`, the centre slot when `page` equals its `page`, otherwise the index of the `more` slot;
  `type ViewPreference = 'auto' | 'mobile' | 'desktop'`; `parsePreference(raw: string | null): ViewPreference` (anything else → `'auto'`); `resolveViewMode(preference: ViewPreference, isNarrow: boolean): 'mobile' | 'desktop'`.
  Tab layouts (centre is the third item below where bolded): admin Overview · Inspections · **Record(`new`)** · Stock · More; leader Overview · Follow-ups · **Record** · More; employee History · **Record** · More; storekeeper Stock · Movements · **Receive**(`inventory-stock`, query `?action=receive`) · Counts · More.

- [ ] **Step 1: Write failing tests** in `tests/mobile-nav.test.js`: `every tab key and group item is allowed for its role` (loop roles, compare with `pagesFor(role)`); `centre slot sits at floor(n/2) and more is last`; `slot counts are admin 5, leader 4, employee 3, storekeeper 5`; `groups never repeat a tab item and cover the rest of all`; `activeSlotIndex returns the more slot for a page that is only in the sheet` (admin on `users` → last index) and the tab index for `inspections`; `resolveViewMode: auto follows width, mobile and desktop override it`; `parsePreference falls back to auto for junk`.
- [ ] **Step 2: Run** `node --test tests/mobile-nav.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** both modules exactly to the signatures above (plain data tables, no React).
- [ ] **Step 4: Run** `node --test tests/` → all pass. **Step 5: Commit** `feat(mobile): navigation model and view-mode core`.

### Task 2: View-mode hook and root attribute

**Files:** Create `src/lib/use-view-mode.ts`; Modify `src/App.tsx`.

**Interfaces:**
- Consumes: `resolveViewMode`, `parsePreference` (Task 1).
- Produces: `useViewMode(): { mode: 'mobile' | 'desktop'; preference: ViewPreference; setPreference: (value: ViewPreference) => void }` implemented with `useSyncExternalStore` over a module-level store that subscribes to `matchMedia('(max-width: 767px)')` and to a listener set notified by `setPreference`; reads/writes `localStorage['ds-device:view.mode']` inside try/catch (storage may be unavailable → in-memory fallback).
- `App.tsx` sets `document.documentElement.dataset.view = mode` in an effect, for every screen including login.

- [ ] **Step 1:** Implement the store and hook; wire the effect in `App.tsx`.
- [ ] **Step 2: Run** `npx tsc -b` → no errors.
- [ ] **Step 3: Verify in the browser:** at 375px `document.documentElement.dataset.view === 'mobile'`; at desktop width `'desktop'`; after `localStorage['ds-device:view.mode']='desktop'` and reload at 375px it is `'desktop'`; after sign-out and sign-in the key is still present.
- [ ] **Step 4: Commit** `feat(mobile): view-mode hook and data-view attribute`.

### Task 3: Shell switch and desktop refactor (no visual change)

**Files:** Create `src/components/nav-icons.ts`, `src/components/app-pages.tsx`, `src/components/desktop-shell.tsx`; Modify `src/components/app-shell.tsx`.

**Interfaces:**
- Consumes: `navFor`, `useViewMode`.
- Produces: `iconFor(name: IconName): LucideIcon`; `renderPage(args: { user: User; page: PageKey; onPage: (page: PageKey, query?: string) => void; onUserChange: (user: User | null) => void }): ReactNode` (the current `{page === ...}` block, unchanged conditions); `DesktopShell` takes the same props as today's `AppShell`; `AppShell` renders `DesktopShell` when `mode === 'desktop'` and `MobileShell` (placeholder returning `renderPage` output until Task 4) otherwise.
- `onPage` in `App.tsx` `navigate` gains an optional `query` appended after `pagePath(next)`.

- [ ] **Step 1:** Move the markup, replace the inline nav arrays with `navFor(user.role).all` (labels through `t`, icons through `iconFor`).
- [ ] **Step 2: Run** `npx tsc -b`, `npx vite build`, `node --test tests/` → pass.
- [ ] **Step 3: Verify parity in the browser:** admin, leader, employee sidebars at desktop width show the same items, order and labels as before this task (compare against `git show HEAD:src/components/app-shell.tsx`).
- [ ] **Step 4: Commit** `refactor(shell): split desktop shell and share nav model`.

### Task 4: Mobile shell (top bar, tab bar, More sheet)

**Files:** Create `src/components/mobile/mobile-shell.tsx`, `mobile-top-bar.tsx`, `bottom-tab-bar.tsx`, `more-sheet.tsx`; Modify `src/index.css`, `src/lib/i18n.tsx`.

**Interfaces:**
- Consumes: `navFor`, `activeSlotIndex`, `useViewMode`, `renderPage`, `iconFor`, `LanguageSwitch`, `ChangePasswordDialog`.
- Produces: `MobileShell(props same as DesktopShell)`; `BottomTabBar({ tabs: TabSlot[]; activeIndex: number; onSelect: (slot: TabSlot) => void })` (grid with `repeat(n, 1fr)`; centre = 52px raised round button with 3px ring in the surface colour; labels 11px with ellipsis); `MoreSheet({ open; onOpenChange; user; groups: NavGroup[]; onNavigate(page) ; onLogout })` — profile row, language, "ใช้มุมมองเดสก์ท็อป" (sets preference `desktop`), grouped 3-column icon grid, change password, sign out; `MobileTopBar({ title: string; onBack?: () => void })`.
- Behaviour: tapping the active tab calls `window.scrollTo({ top: 0, behavior: 'smooth' })`; a centre slot with `query` navigates with it; selecting a More item closes the sheet; in desktop-preference mode a floating "มุมมองมือถือ" chip appears only when the viewport is narrow, to get back.
- CSS: `[data-view="mobile"]` rules for the tab bar (safe-area padding, `box-shadow`, 44px minimum), `.mobile-content { padding-bottom: calc(76px + env(safe-area-inset-bottom)) }`, hide the bar while a text field is focused (`body:has(input:focus, textarea:focus, [contenteditable]:focus) .mobile-tabbar { display: none }`), `overscroll-behavior-y: contain` on the content scroller, hide page sub-labels (`.page-eyebrow`) — add that class to the small coloured line above each page `<h2>` only where it is cheap, otherwise skip.

- [ ] **Step 1:** Build the four components and the CSS.
- [ ] **Step 2: Run** `npx tsc -b`, `npx vite build`, `node --test tests/` → pass.
- [ ] **Step 3: Verify in the browser at 375px for each role** (admin, leader, employee, storekeeper; create users through the API with a temp `DATA_DIR`): correct slots and labels, active highlight (including More when on a sheet-only page), centre action opens the right page, `/app/inventory-stock?action=receive` flow for the storekeeper is handled in Task 5, More sheet opens/closes, desktop-view toggle switches to the sidebar and the chip returns to mobile.
- [ ] **Step 4: Commit** `feat(mobile): mobile shell with bottom tab bar and More sheet`.

### Task 5: Touch polish and receive shortcut

**Files:** Modify `src/pages/inventory-stock-page.tsx` (read `?action=receive`), `src/index.css`, `src/pages/inspection-form-page.tsx` and dialog footers only where the checks below fail.

**Interfaces:** Consumes the `query` support from Task 3. The stock page opens `ReceiveDialog` when `location.search` contains `action=receive`, then `history.replaceState` removes the query.

- [ ] **Step 1:** Implement the receive shortcut; add mobile CSS: `[data-view="mobile"] button, [data-slot="select-trigger"], input, [role="tab"] { min-height: 44px }` (excluding inline icon buttons inside tables that already stack), `scroll-margin-bottom: 120px` on form fields, sticky form action bars sit above the tab bar (`bottom: calc(64px + env(safe-area-inset-bottom))`).
- [ ] **Step 2: Run** `npx tsc -b`, `npx vite build`, `node --test tests/` → pass.
- [ ] **Step 3: Verify in the browser:** storekeeper centre button lands on Stock with the receive dialog open and the URL cleaned; at 360px no page has horizontal scroll (check `document.documentElement.scrollWidth <= innerWidth` on every page key of each role); focusing a text field hides the tab bar; five Thai labels do not wrap at 360px.
- [ ] **Step 4: Commit** `feat(mobile): touch targets, safe areas and receive shortcut`.

### Task 6: Cross-role verification and resize behaviour

**Files:** Modify only what the checks expose.

- [ ] **Step 1: Run** the full suite: `npx tsc -b`, `npx oxlint` (no new errors), `npx vite build`, `node --test tests/`.
- [ ] **Step 2: Verify in the browser:** resize 1000px → 375px → 1000px while on `/app/inventory-stock` and on the inspection form with typed text: the page stays, the shell swaps, the inspection draft is restored; widths 360, 375 and 414 for all four roles; desktop width screenshots of the admin sidebar identical in structure to before the work.
- [ ] **Step 3:** Fix any failure found, re-run Step 1.
- [ ] **Step 4: Commit** `fix(mobile): cross-role verification fixes` (skip if nothing changed).
