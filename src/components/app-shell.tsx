import { Smartphone } from 'lucide-react'
import { DesktopShell, type ShellProps } from '@/components/desktop-shell'
import { MobileShell } from '@/components/mobile/mobile-shell'
import { useI18n } from '@/lib/i18n'
import { useViewMode } from '@/lib/use-view-mode'

export type { PageKey } from '@/lib/pages'

/** Picks the shell for the current view mode; both render the same pages. */
export function AppShell(props: ShellProps) {
  const { t } = useI18n()
  const { mode, preference, narrow, setPreference } = useViewMode()
  if (mode === 'mobile') return <MobileShell {...props} />
  return <>
    <DesktopShell {...props} />
    {/* On a phone that was switched to the desktop view, a chip brings the mobile layout back. */}
    {preference === 'desktop' && narrow && <button type="button" onClick={() => setPreference('auto')} className="fixed bottom-20 right-3 z-50 flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium shadow-lg">
      <Smartphone size={16} />{t('มุมมองมือถือ')}</button>}
  </>
}
