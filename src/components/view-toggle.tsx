import type { LucideIcon } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export type ViewOption<T extends string> = { value: T; label: string; icon: LucideIcon }

/** Small segmented control for switching how a collection is shown (tiles, cards, list, table…). */
export function ViewToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: ViewOption<T>[] }) {
  const { t } = useI18n()
  return <div role="group" aria-label={t('มุมมองการแสดงผล')} className="inline-flex shrink-0 rounded-lg border border-border bg-surface-subtle p-0.5">
    {options.map(({ value: key, label, icon: Icon }) => <button key={key} type="button" aria-pressed={value === key} title={t(label)} aria-label={t(label)} onClick={() => onChange(key)}
      className={`grid size-8 place-items-center rounded-md transition-colors ${value === key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><Icon size={16} /></button>)}
  </div>
}
