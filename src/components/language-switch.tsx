import { Languages } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useI18n()
  const next = language === 'th' ? 'en' : 'th'
  return <Button type="button" variant="outline" size="sm" className={`gap-1.5 ${className}`} onClick={() => setLanguage(next)} aria-label={language === 'th' ? 'Switch language to English' : 'เปลี่ยนภาษาเป็นไทย'}>
    <Languages size={14} /> {language === 'th' ? 'TH' : 'EN'} <span className="text-muted-foreground">·</span> {language === 'th' ? 'EN' : 'TH'}
  </Button>
}
