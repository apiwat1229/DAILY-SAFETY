import { Minus, Plus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

type Props = { value: number; min?: number; max?: number; onChange: (value: number) => void; disabled?: boolean; label?: string }

/** − qty + control. Typing is allowed too; out-of-range values snap back into [min, max]. */
export function QtyStepper({ value, min = 1, max = 999_999, onChange, disabled, label }: Props) {
  const { t } = useI18n()
  const clamp = (next: number) => Math.min(Math.max(Number.isFinite(next) ? Math.trunc(next) : min, min), max)
  return <div className="inline-flex items-center gap-1" role="group" aria-label={label ?? t('จำนวน')}>
    <Button iconOnly type="button" variant="outline" size="icon" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))}><Minus size={15} />{t('ลดจำนวน')}</Button>
    <input type="number" inputMode="numeric" min={min} max={max} step={1} value={value} disabled={disabled} aria-label={label ?? t('จำนวน')}
      onChange={(event) => onChange(clamp(Number(event.target.value)))}
      className="h-10 w-16 rounded-md border border-input bg-background text-center text-sm tabular-nums [appearance:textfield] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none" />
    <Button iconOnly type="button" variant="outline" size="icon" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))}><Plus size={15} />{t('เพิ่มจำนวน')}</Button>
  </div>
}
