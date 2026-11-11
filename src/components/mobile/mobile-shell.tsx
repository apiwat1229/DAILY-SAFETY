import { useMemo, useState } from 'react'
import type { ShellProps } from '@/components/desktop-shell'
import { renderPage } from '@/components/app-pages'
import { activeSlotIndex, navFor, type TabSlot } from '@/lib/nav-model'
import { signOut } from '@/lib/sign-out'
import { useI18n } from '@/lib/i18n'
import { useViewMode } from '@/lib/use-view-mode'
import { useBadges } from '@/lib/use-badges'
import { BottomTabBar } from '@/components/mobile/bottom-tab-bar'
import { MobileTopBar } from '@/components/mobile/mobile-top-bar'
import { MoreSheet } from '@/components/mobile/more-sheet'

/** Phone layout: title bar, page, bottom tab bar and the More sheet. Pages are the same ones the desktop shell shows. */
export function MobileShell({ user, page, onPage, onUserChange }: ShellProps) {
  const { t } = useI18n()
  const { setPreference } = useViewMode()
  const badges = useBadges(true)
  const model = useMemo(() => navFor(user.role), [user.role])
  const [moreOpen, setMoreOpen] = useState(false)
  const activeIndex = activeSlotIndex(model.tabs, page)
  const title = model.all.find((entry) => entry.key === page)?.label ?? 'ภาพรวม'

  function select(slot: TabSlot, index: number) {
    if (slot.kind === 'more') { setMoreOpen(true); return }
    const target = slot.kind === 'center' ? slot.page : slot.item.key
    const query = slot.kind === 'center' ? slot.query : undefined
    // Tapping the tab you are already on scrolls back to the top, like native tab bars.
    if (index === activeIndex && target === page && !query) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    onPage(target, query)
    window.scrollTo({ top: 0 })
  }

  return <div className="mobile-shell">
    <MobileTopBar title={t(title)} />
    <main className="app-content-frame app-main-frame mobile-content">{renderPage({ user, page, onPage, onUserChange })}</main>
    <BottomTabBar tabs={model.tabs} activeIndex={activeIndex} badges={badges} onSelect={select} />
    <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} user={user} page={page} groups={model.groups}
      onNavigate={(next) => { setMoreOpen(false); onPage(next); window.scrollTo({ top: 0 }) }}
      onDesktopView={() => { setMoreOpen(false); setPreference('desktop') }}
      onLogout={() => { setMoreOpen(false); void signOut(onUserChange, t('ออกจากระบบแล้ว')) }} />
  </div>
}
