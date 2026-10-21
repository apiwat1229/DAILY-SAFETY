import { Languages } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

export function LanguageSwitch({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { language, setLanguage } = useI18n()
  const next = language === 'th' ? 'en' : 'th'
  return <Button type="button" variant={compact ? 'ghost' : 'outline'} size={compact ? 'icon' : 'sm'} className={`${compact ? '' : 'gap-1.5'} ${className}`} onClick={() => setLanguage(next)} aria-label={language === 'th' ? 'เปลี่ยนภาษาเป็นอังกฤษ' : 'Switch language to Thai'} title={language === 'th' ? 'ภาษาไทย · English' : 'English · ภาษาไทย'}>
    <Languages size={compact ? 18 : 15} strokeWidth={1.8} />{!compact && <>{language === 'th' ? 'ไทย' : 'English'} <span className="text-muted-foreground">·</span> {language === 'th' ? 'EN' : 'TH'}</>}
  </Button>
}
