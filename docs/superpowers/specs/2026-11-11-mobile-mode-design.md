# Mobile mode — design

Date: 2026-11-11 · Status: draft for review · App: Daily Safety

## Goal

Phones are the main device. Give the app a real mobile mode: its own shell (top bar, bottom tab bar, "More" sheet) and touch-friendly screens,
while desktop keeps the sidebar shell unchanged. Pages share one implementation; only the shell and a few layout rules differ.

### Decisions (agreed with the owner)

| Topic | Decision |
|---|---|
| Bottom bar style | Option A: five-slot bottom bar with a raised centre action (mockup shown in chat). |
| Mode switching | Automatic by viewport width (< 768px = mobile) plus a manual override in the More menu, remembered on the device. |
| Scope | All roles: admin, leader (supervisor), employee, storekeeper. |

### Non-goals

Native app wrappers, push notifications, offline support beyond the existing PWA queue, redesigning page content for desktop.

## Architecture

- `src/lib/view-mode.ts`: `useViewMode(): { mode: 'mobile' | 'desktop'; preference: 'auto' | 'mobile' | 'desktop'; setPreference }`.
  Auto = `matchMedia('(max-width: 767px)')`, listened to live. Preference is stored with `usePersistentState('view.mode', 'auto', 'local')`
  and is not cleared on logout (it is a device setting, like language).
- `src/components/app-shell.tsx` becomes a thin switch: it computes the nav model once and renders `DesktopShell` (today's markup, moved as is)
  or `MobileShell`. Pages are rendered by the same `renderPage(page)` function in both.
- `src/lib/nav-model.ts`: single source of truth for navigation, replacing the inline arrays: `navFor(user): { all: NavItem[]; tabs: TabSlot[]; groups: NavGroup[] }`
  where `NavItem = { key: PageKey; label: string; icon: LucideIcon }`, `TabSlot = NavItem | { action: 'center'; ... }`, `NavGroup = { title: string; items: NavItem[] }`.
  Desktop sidebar uses `all`; mobile uses `tabs` and `groups`.
- `src/components/mobile/mobile-shell.tsx`, `bottom-tab-bar.tsx`, `more-sheet.tsx`, `mobile-top-bar.tsx`.

### Bottom tabs per role

| Role | Slots (left to right) | Centre action |
|---|---|---|
| admin | Overview · Inspections · **Record** · Stock · More | Record inspection |
| leader | Team overview · Follow-ups · **Record** · More | Record inspection |
| employee | **Record** · History · More | Record inspection |
| storekeeper | Stock · Movements · **Receive** · Counts · More | Receive stock (opens the receive dialog on the Stock page) |

- Four or five slots; the centre action is a raised round button. "More" is always last and opens the sheet.
- A tab shows a dot or number badge when the page reports one (hook ready for the requisition cart in sub-project 2; not used yet).
- Active tab: filled icon tint plus label colour; tap on the active tab scrolls the page to top.

### Top bar

Sticky, 48px plus safe-area top. Shows the current page title; a back button replaces the title's left space when the page has a parent (e.g. a detail opened from a list);
right side holds the language switch and, later, a notification bell. Page-level `<h2>` headings stay (they are the page body) but the sub-label above them is hidden on mobile to save height.

### More sheet

Bottom sheet (existing sheet/dialog bottom-sheet CSS): profile row (name, role, code), language, "Use desktop view", then grouped icon grid built from `groups`
(Inventory, System data, Account), change password, sign out. Tapping an item navigates and closes the sheet.

### Touch and layout rules (mobile mode only, via `data-view="mobile"` on the app root)

- Minimum 44px touch targets for buttons, tabs, table row actions, select triggers.
- Content gets `padding-bottom: calc(76px + env(safe-area-inset-bottom))` so nothing hides behind the tab bar; the bar uses `padding-bottom: env(safe-area-inset-bottom)`.
- Long forms (inspection form, item/warehouse/receive dialogs) keep a sticky bottom action bar above the tab bar / keyboard; inputs use `scroll-margin` so the focused field is not covered by the keyboard.
- Dialogs are already bottom sheets on phones; confirm dialogs stay centred.
- Number inputs use `inputMode="numeric"`, dates use the existing picker (no native keyboard on date fields).
- `viewport-fit=cover` in `index.html`; `overscroll-behavior-y: contain` on the scroll container so pull-down does not reload the PWA by accident.
- Desktop CSS is untouched: every new rule is scoped under `[data-view="mobile"]`.

## Testing

- Unit-test the pure parts with `node --test`: `navFor(user)` returns the expected tabs/groups per role (including that every tab key is allowed by `pagesFor(role)`)
  and `resolveViewMode(preference, isNarrow)`. These are plain TypeScript modules with no React imports so they can be imported from tests.
- Browser checks at 360, 375 and 414px for all four roles: tab bar visible and not covering content, More sheet opens/closes, centre action works,
  switching to desktop view and back, no horizontal scroll on every page, desktop width unchanged.

## Open questions

None blocking.
