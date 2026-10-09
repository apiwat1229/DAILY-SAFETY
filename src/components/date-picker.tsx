import { useState } from 'react'
import { CalendarDays, ChevronDown, X } from 'lucide-react'
import type { Matcher } from '@daypicker/react'
import { formatDate } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/lib/i18n'
import { th } from '@daypicker/react/locale/th'
import { enUS } from '@daypicker/react/locale/en-US'

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  minDate?: string
  maxDate?: string
  placeholder?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
  clearable?: boolean
}

function parseLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function formatLocalDate(value?: Date) {
  if (!value) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DatePicker({ id, value, onChange, minDate, maxDate, placeholder = 'เลือกวันที่', ariaLabel, className, disabled, clearable = false }: Props) {
  const [open, setOpen] = useState(false)
  const { language, t } = useI18n()
  const selected = parseLocalDate(value)
  const bounds: Matcher[] = [
    ...(minDate && parseLocalDate(minDate) ? [{ before: parseLocalDate(minDate)! }] : []),
    ...(maxDate && parseLocalDate(maxDate) ? [{ after: parseLocalDate(maxDate)! }] : []),
  ]

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        aria-haspopup="dialog"
        className={cn('h-10 w-full justify-start gap-2 font-normal', !selected && 'text-muted-foreground', className)}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left">{selected ? formatDate(value, language) : t(placeholder)}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0">
      <Calendar
        locale={language === 'th' ? th : enUS}
        mode="single"
        selected={selected}
        onSelect={(day) => {
          onChange(formatLocalDate(day))
          if (day) setOpen(false)
        }}
        disabled={bounds}
        defaultMonth={selected || parseLocalDate(maxDate || '') || new Date()}
      />
      {clearable && value && <div className="flex justify-end border-t border-border p-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { onChange(''); setOpen(false) }}>
          <X className="size-3.5" /> {t('ล้างวันที่')}
        </Button>
      </div>}
    </PopoverContent>
  </Popover>
}
