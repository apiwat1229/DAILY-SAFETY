import { LanguageSwitch } from '@/components/language-switch'

/** Sticky title bar (respects the iPhone notch via safe-area-inset-top). */
export function MobileTopBar({ title }: { title: string }) {
  return <header className="mobile-topbar">
    <h1 className="min-w-0 truncate">{title}</h1>
    <LanguageSwitch compact />
  </header>
}
