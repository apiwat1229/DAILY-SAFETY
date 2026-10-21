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
| Corner radius scale | 4, 6, 8, 10, 12, 16, 20px, and pill |

Use the `.app-content-frame` and `.app-main-frame` classes to align signed-in page content. Use `.content-narrow` for inspection forms and similarly dense forms. Use `.page-stack` for the vertical rhythm between top-level sections.

## Type and language

- Use Geist Variable with Noto Sans Thai and system UI fallbacks.
- Use `page-heading`, `section-heading`, and `subsection-heading` for repeated heading sizes rather than styling every heading element globally.
- Keep regular body copy at 16px. Compact text utilities resolve to at least 13px on desktop and 14px on mobile, with 15px for `text-sm`.
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

## Responsive behavior

Use Tailwind's standard `sm`, `md`, and `lg` breakpoints. Keep form actions reachable on narrow screens, allow data tables to scroll horizontally when columns cannot be collapsed, and provide a card layout when the same content is more usable as a list on mobile.
