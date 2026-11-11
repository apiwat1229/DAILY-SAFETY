import { Globe } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

/** Shows the current language (TH / EN) next to a globe so it is obvious what the button does; one tap switches. */
export function LanguageSwitch({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { language, setLanguage } = useI18n()
  const next = language === 'th' ? 'en' : 'th'
  return <button type="button" onClick={() => setLanguage(next)} aria-label={language === 'th' ? 'เปลี่ยนภาษาเป็นอังกฤษ' : 'Switch language to Thai'} title={language === 'th' ? 'ภาษาไทย · เปลี่ยนเป็น English' : 'English · switch to ไทย'}
    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-current/25 px-2.5 text-sm font-semibold transition-colors hover:bg-current/10 ${className}`}>
    <Globe size={compact ? 17 : 16} strokeWidth={1.9} />
    <span className="tabular-nums">{language === 'th' ? 'TH' : 'EN'}</span>
    {!compact && <span className="text-xs font-normal opacity-70">→ {next === 'th' ? 'ไทย' : 'English'}</span>}
  </button>
}
