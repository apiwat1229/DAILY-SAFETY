import { useState } from 'react'
import { Activity, KeyRound, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import type { User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ChangePasswordDialog } from '@/components/change-password-dialog'
import { useI18n } from '@/lib/i18n'
import { navFor } from '@/lib/nav-model'
import { signOut } from '@/lib/sign-out'
import { iconFor } from '@/components/nav-icons'
import { renderPage, type NavigateFn } from '@/components/app-pages'
import type { PageKey } from '@/lib/pages'
import { LanguageSwitch } from '@/components/language-switch'
import { useBadges } from '@/lib/use-badges'

export type ShellProps = { user: User; page: PageKey; onPage: NavigateFn; onUserChange: (user: User | null) => void }

export function DesktopShell({ user, page, onPage, onUserChange }: ShellProps) {
  const [mobileMenu, setMobileMenu] = useState(false)
  const { t } = useI18n()
  const badges = useBadges(true)
  const navItems = navFor(user.role).all.map((entry) => ({ key: entry.key, label: t(entry.label), icon: iconFor(entry.icon), badge: entry.badge ? badges[entry.badge] : 0 }))
  const primaryKeys: PageKey[] = user.role === 'storekeeper' ? ['inventory-stock', 'inventory-counts', 'new'] : ['dashboard', 'inspections', 'new']
  const primaryItems = navItems.filter((item) => primaryKeys.includes(item.key))
  const handleLogout = () => signOut(onUserChange, t('ออกจากระบบแล้ว'))

  return (
    <div className="app-shell min-h-screen md:flex">
      <aside className="sidebar sticky top-0 z-30 hidden h-screen w-[var(--app-sidebar-width)] shrink-0 flex-col px-4 py-5 md:flex">
        <div className="flex items-center justify-between gap-1"><Brand /><LanguageSwitch compact className="shrink-0 text-sidebar-muted hover:bg-white/10 hover:text-white" /></div>
        <div className="mt-9 px-3 text-xs font-semibold uppercase tracking-[.14em] text-sidebar-muted">{t('เมนูหลัก')}</div>
        <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 hide-scrollbar">{navItems.map((item) => <NavLink key={item.key} label={item.label} icon={item.icon} badge={item.badge} active={page === item.key} onClick={() => onPage(item.key)} />)}</nav>
        <ProfileBlock user={user} onLogout={handleLogout} />
      </aside>

      <div className="page-scroll min-w-0 flex-1">
        <div className="app-content-frame flex h-10 items-center md:hidden">
          <Button variant="ghost" size="icon" aria-label={t('เปิดเมนู')} onClick={() => setMobileMenu(true)}><Menu size={18} /></Button>
        </div>
        <main className="app-content-frame app-main-frame max-md:pb-28">
          {renderPage({ user, page, onPage, onUserChange })}
        </main>
      </div>

      <nav aria-label={t('เมนูหลัก')} className="bottom-nav fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-card/95 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${primaryItems.length + 1}, minmax(0, 1fr))` }}>
        {primaryItems.map((item) => <button key={item.key} type="button" data-active={page === item.key} onClick={() => onPage(item.key)} className="bottom-nav-item"><item.icon size={21} strokeWidth={1.9} /><span>{item.label}</span></button>)}
        <button type="button" onClick={() => setMobileMenu(true)} className="bottom-nav-item"><Menu size={21} strokeWidth={1.9} /><span>{t('เมนู')}</span></button>
      </nav>

      {mobileMenu && <div className="fixed inset-0 z-50 bg-black/30 md:hidden" onClick={() => setMobileMenu(false)}>
        <aside className="sidebar flex h-full w-[var(--app-sidebar-width)] flex-col px-4 py-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-1"><Brand /><Button variant="ghost" size="icon" className="text-sidebar-muted hover:bg-white/10 hover:text-white" onClick={() => setMobileMenu(false)} aria-label={t('ปิดเมนู')}><X size={18} /></Button></div>
          <div className="mt-2 flex justify-end"><LanguageSwitch compact className="text-sidebar-muted hover:bg-white/10 hover:text-white" /></div>
          <div className="mt-8 px-3 text-xs font-semibold uppercase tracking-[.14em] text-sidebar-muted">{t('เมนูหลัก')}</div>
          <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 hide-scrollbar">{navItems.map((item) => <NavLink key={item.key} label={item.label} icon={item.icon} badge={item.badge} active={page === item.key} onClick={() => { onPage(item.key); setMobileMenu(false) }} />)}</nav>
          <ProfileBlock user={user} onLogout={handleLogout} />
        </aside>
      </div>}
    </div>
  )
}

function Brand() {
  const { t } = useI18n()
  return <div className="flex min-w-0 items-center gap-2.5">
    <div className="grid size-10 place-items-center rounded-lg bg-secondary text-primary"><ShieldCheck size={21} /></div>
    <p className="min-w-0 whitespace-nowrap text-xs text-sidebar-muted">{t('ระบบความปลอดภัยประจำวัน')}</p>
  </div>
}

function ProfileBlock({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useI18n()
  const [passwordOpen, setPasswordOpen] = useState(false)
  return <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.05] p-3.5">
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-soft text-xs font-semibold text-sidebar-foreground">{user.name.slice(0, 1)}</div>
      <div className="min-w-0"><p className="truncate text-xs font-medium text-sidebar-foreground">{user.name}</p><p className="mt-0.5 text-xs text-sidebar-muted">{user.role === 'admin' ? t('ผู้ดูแลระบบ') : `${t(user.role === 'leader' ? 'หัวหน้างาน' : user.role === 'storekeeper' ? 'เจ้าหน้าที่คลัง' : 'พนักงาน')} · ${user.employeeCode}`}</p></div>
      <Button variant="ghost" size="icon" aria-label={t('เปลี่ยนรหัสผ่าน')} title={t('เปลี่ยนรหัสผ่าน')} onClick={() => setPasswordOpen(true)} className="ml-auto text-sidebar-muted hover:bg-white/10 hover:text-white"><KeyRound size={15} /></Button>
      <Button variant="ghost" size="icon" aria-label={t('ออกจากระบบ')} onClick={onLogout} className="text-sidebar-muted hover:bg-white/10 hover:text-white"><LogOut size={15} /></Button>
    </div>
    <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
  </div>
}

type NavLinkProps = { label: string; icon: typeof Activity; active: boolean; badge?: number; onClick: () => void }
function NavLink({ label, icon: Icon, active, badge = 0, onClick }: NavLinkProps) {
  return <Button type="button" variant="ghost" data-active={active} onClick={onClick} className="side-link flex h-auto w-full items-center justify-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium">
    <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{badge > 0 ? <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">{badge}</span> : active && <span className="ml-auto size-1.5 rounded-full bg-sidebar-active" />}
  </Button>
}
