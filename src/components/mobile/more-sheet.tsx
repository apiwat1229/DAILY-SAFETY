import { useState } from 'react'
import { KeyRound, LogOut, Monitor } from 'lucide-react'
import type { User } from '@/lib/types'
import type { PageKey } from '@/lib/pages'
import type { NavGroup } from '@/lib/nav-model'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LanguageSwitch } from '@/components/language-switch'
import { ThemeButton } from '@/components/theme-dialog'
import { ChangePasswordDialog } from '@/components/change-password-dialog'
import { AvatarPickerDialog } from '@/components/avatar-picker-dialog'
import { UserAvatar } from '@/components/user-avatar'
import { iconFor } from '@/components/nav-icons'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
  page: PageKey
  groups: NavGroup[]
  onNavigate: (page: PageKey) => void
  onDesktopView: () => void
  onLogout: () => void
  onUserChange: (user: User | null) => void
}

const roleLabel: Record<User['role'], string> = { admin: 'ผู้ดูแลระบบ', leader: 'หัวหน้างาน', employee: 'พนักงาน', storekeeper: 'เจ้าหน้าที่คลัง' }

/** Everything that does not fit on the tab bar: grouped pages, account actions and the desktop-view switch. */
export function MoreSheet({ open, onOpenChange, user, page, groups, onNavigate, onDesktopView, onLogout, onUserChange }: Props) {
  const { t } = useI18n()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  return <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="mobile-more max-h-[88dvh] gap-0 overflow-y-auto rounded-t-2xl p-0">
        <SheetHeader className="flex-row items-center gap-3 border-b border-border-subtle p-4 text-left">
          <button type="button" onClick={() => setAvatarOpen(true)} aria-label={t('เปลี่ยนรูปโปรไฟล์')} className="shrink-0 rounded-full"><UserAvatar user={user} className="size-12" /></button>
          <div className="min-w-0 flex-1"><SheetTitle className="truncate text-base">{user.name}</SheetTitle><SheetDescription className="truncate">{t(roleLabel[user.role])} · {user.employeeCode}</SheetDescription></div>
          <div className="flex shrink-0 items-center gap-1"><ThemeButton className="text-muted-foreground" /><LanguageSwitch className="text-muted-foreground" /></div>
        </SheetHeader>
        <div className="space-y-4 p-4">
          {groups.map((group) => <section key={group.title}>
            <h2 className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{t(group.title)}</h2>
            <div className="grid grid-cols-3 gap-2">{group.items.map((entry) => {
              const Icon = iconFor(entry.icon)
              return <button key={entry.key} type="button" data-active={entry.key === page} onClick={() => onNavigate(entry.key)} className="mobile-more-item">
                <Icon size={24} strokeWidth={1.8} /><span>{t(entry.short ?? entry.label)}</span></button>
            })}</div>
          </section>)}
          <section className="space-y-2">
            <Button type="button" variant="outline" className="h-12 w-full justify-start gap-3" onClick={() => setPasswordOpen(true)}><KeyRound size={18} />{t('เปลี่ยนรหัสผ่าน')}</Button>
            <Button type="button" variant="outline" className="h-12 w-full justify-start gap-3" onClick={onDesktopView}><Monitor size={18} />{t('ใช้มุมมองเดสก์ท็อป')}</Button>
            <Button type="button" variant="outline" className="h-12 w-full justify-start gap-3 text-destructive" onClick={onLogout}><LogOut size={18} />{t('ออกจากระบบ')}</Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
    <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    <AvatarPickerDialog open={avatarOpen} onOpenChange={setAvatarOpen} user={user} onUserChange={onUserChange} />
  </>
}
