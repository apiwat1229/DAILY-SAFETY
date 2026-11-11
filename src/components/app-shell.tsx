import { DesktopShell, type ShellProps } from '@/components/desktop-shell'
import { MobileShell } from '@/components/mobile/mobile-shell'
import { useViewMode } from '@/lib/use-view-mode'

export type { PageKey } from '@/lib/pages'

/** Picks the shell for the current view mode; both render the same pages. */
export function AppShell(props: ShellProps) {
  const { mode } = useViewMode()
  return mode === 'mobile' ? <MobileShell {...props} /> : <DesktopShell {...props} />
}
