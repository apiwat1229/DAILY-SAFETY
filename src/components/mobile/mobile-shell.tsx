import type { ShellProps } from '@/components/desktop-shell'
import { renderPage } from '@/components/app-pages'

/** Placeholder until the mobile chrome is built: pages only, no navigation. */
export function MobileShell({ user, page, onPage, onUserChange }: ShellProps) {
  return <main className="app-content-frame app-main-frame">{renderPage({ user, page, onPage, onUserChange })}</main>
}
