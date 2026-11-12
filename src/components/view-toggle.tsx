import type { LucideIcon } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export type ViewOption<T extends string> = { value: T; label: string; icon: LucideIcon }

/** Small segmented control for switching how a collection is shown (tiles, cards, list, table…). */
export function ViewToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: ViewOption<T>[] }) {
  const { t } = useI18n()
  return <div role="group" aria-label={t('มุมมองการแสดงผล')} className="inline-flex shrink-0 rounded-xl border border-border bg-surface-subtle p-1 shadow-sm">
    {options.map(({ value: key, label, icon: Icon }) => <button key={key} type="button" aria-pressed={value === key} title={t(label)} aria-label={t(label)} onClick={() => onChange(key)}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all ${value === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}><Icon size={15} /><span className="hidden sm:inline">{t(label)}</span></button>)}
  </div>
}
