import { LanguageSwitch } from '@/components/language-switch'
import { ThemeButton } from '@/components/theme-dialog'

/** Sticky title bar (respects the iPhone notch via safe-area-inset-top). */
export function MobileTopBar({ title }: { title: string }) {
  return <header className="mobile-topbar">
    <h1 className="min-w-0 truncate">{title}</h1>
    <div className="flex shrink-0 items-center gap-1"><ThemeButton className="text-muted-foreground" /><LanguageSwitch compact className="text-muted-foreground" /></div>
  </header>
}
