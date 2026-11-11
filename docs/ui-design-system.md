# UI design system

This document defines the shared layout and visual tokens for Daily Safety. Reuse these values when adding or updating screens so the signed-in app and public forms remain consistent.

## Source structure

| Path | Responsibility |
| --- | --- |
| `src/pages/` | Signed-in and public screens with their page-specific interactions |
| `src/components/` | Shared application components such as the shell, login, date pickers, and dialogs |
| `src/components/ui/` | Reusable interface primitives built on Tailwind CSS and Radix UI |
| `src/lib/` | API access, shared types, localization, and small utilities |
| `server/` | Express API, domain handlers, and export logic |
| `server/seed/` and `server/templates/` | Seed training materials and import/export templates |
| `public/` | Static files served directly by Vite or Express |
| `docs/` | Product and implementation documentation |

Add new signed-in screens under `src/pages/`, register their page metadata and navigation in `src/components/app-shell.tsx`, and build them from shared primitives. Keep global colors, typography, control sizes, and layout widths in `src/index.css` rather than introducing page-level alternatives. The app shell owns the single page-level `h1`; use `page-heading` for the visible title in page content, and let `CardTitle` use its default `h3` unless a public form needs `as="h1"`.

## Layout and sizing

| Element | Standard |
| --- | --- |
| App content width | 90rem maximum |
| Form content width | 68.75rem maximum |
| Sidebar width | 17.5rem |
| App header height | 4.5rem |
| Horizontal gutter | 1rem to 2.5rem, responsive |
| Space between top-level page sections | 1.25rem desktop, 1rem mobile |
| Standard button and input height | 2.5rem desktop, at least 2.75rem on mobile |
| Corner radius scale | 6px for medium and large surfaces (cards, dialogs, inputs, buttons, menus); 4px for small elements (badges, checkboxes, tooltips, menu items, tabs); full circles only for avatars, switches, progress and dots |

Use the `.app-content-frame` and `.app-main-frame` classes to align signed-in page content. Use `.content-narrow` for inspection forms and similarly dense forms. Use `.page-stack` for the vertical rhythm between top-level sections.

## Type and language

- Use Bai Jamjuree across the app, with Myanmar Text and system UI fallbacks for scripts it does not cover.
- Set font sizes in the `--type-size-*` and `--type-line-*` tokens in `src/index.css`; Tailwind `text-*` utilities map to this shared scale.
- Use `page-heading`, `section-heading`, and `subsection-heading` for repeated heading roles. Card, dialog, application-bar, and toast headings also use named shared tokens.
- Shared UI type scale:

  | Token / utility | Desktop | Mobile | Use |
  | --- | ---: | ---: | --- |
  | `text-xs` | 13px | 14px | Captions and hints |
  | `text-sm` | 15px | 15px | Secondary copy and labels |
  | `text-base` | 16px | 16px | Body copy and controls |
  | `text-lg` / `text-xl` | 18px / 20px | 18px / 20px | Small headings |
  | `text-2xl` / `text-3xl` | 24px / 30px | 24px / 30px | Section and display text |
  | `text-4xl` / `text-5xl` | 36px / 48px | 36px / 48px | Large display text |

- Page, card, dialog, app-bar, and toast title sizes use named role tokens with mobile adjustments.
- Keep A4 report typography in the `--paper-text-*` tokens within `hiyari-reports-page.tsx`; use the shared `server/export-typography.js` point-size roles for Excel exports.
- Set the correct `lang` attribute on public screens when the page language is known.

## Color roles

Use semantic utility classes backed by variables in `src/index.css`:

| Role | Utilities |
| --- | --- |
| Primary brand | `text-primary`, `bg-primary`, `border-primary` |
| Main and muted surfaces | `bg-background`, `bg-card`, `bg-muted`, `bg-surface-subtle` |
| Success | `text-success`, `bg-success/10`, `border-success/25` |
| Warning or pending | `text-warning`, `bg-warning/10`, `border-warning/25` |
| Error or rejected | `text-destructive`, `bg-destructive/10`, `border-destructive/25` |
| Neutral or informational | `text-info`, `bg-info/10`, `border-info/20` |
| Sidebar | `bg-sidebar`, `bg-sidebar-soft`, `text-sidebar-muted`, `text-sidebar-foreground` |

Use status colors consistently: green for completed or accepted work, amber for pending attention, red for rejected or failed work, and slate for neutral or unavailable information. Do not use color alone to communicate status; keep a label or icon alongside it.

## Theme settings for component size and text

All interactive components read their size and text from tokens in `:root` of `src/index.css`. Change a token once and every screen follows; do not size controls with page-level `h-*` or `text-*` classes (they are neutralised by the `[data-slot=...]` rules; add `.control-free` only for a deliberate exception).

| Token | Desktop | Mobile | Applies to |
| --- | ---: | ---: | --- |
| `--control-height` | 2.5rem | 2.75rem | Buttons, inputs, selects, date/time pickers, result choices, icon buttons (square) |
| `--control-radius` | 10px | 10px | Buttons, inputs, selects, textareas |
| `--type-size-control` | 15px | 16px | Text in buttons, inputs, selects, tabs, sidebar links |
| `--type-size-label` | 15px | 16px | Form labels |
| `--type-size-table` | 15px | 16px | Table headers and cells |
| `--type-size-badge` / `--badge-height` | 13px / 1.5rem | same | Badges |

## Responsive behavior

Use Tailwind's standard `sm`, `md`, and `lg` breakpoints. Keep form actions reachable on narrow screens, allow data tables to scroll horizontally when columns cannot be collapsed, and provide a card layout when the same content is more usable as a list on mobile.
