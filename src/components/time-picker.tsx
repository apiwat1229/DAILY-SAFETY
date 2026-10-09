import { useState } from 'react'
import { Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/lib/i18n'

type Props = { id?: string; value: string; onChange: (value: string) => void; className?: string; disabled?: boolean }
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'))

export function TimePicker({ id, value, onChange, className, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()
  const [hour = '', minute = ''] = value.split(':')

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" disabled={disabled} aria-label={t('เลือกเวลา')} className={cn('h-10 w-full justify-start gap-2 font-normal', !value && 'text-muted-foreground', className)}>
        <Clock3 className="size-4 shrink-0 text-muted-foreground" />
        <span>{value || t('เลือกเวลา')}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[280px] space-y-3 p-3">
      <div>
        <p className="text-sm font-medium">{t('เลือกเวลาตรวจ')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('ใช้เวลา 24 ชั่วโมง')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">{t('ชั่วโมง')}</span>
          <Select value={hour} onValueChange={(nextHour) => onChange(`${nextHour}:${minute || '00'}`)}>
            <SelectTrigger aria-label={t('ชั่วโมง')} className="w-full"><SelectValue placeholder={t('ชม.')} /></SelectTrigger>
            <SelectContent className="max-h-56">{hours.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">{t('นาที')}</span>
          <Select value={minute} onValueChange={(nextMinute) => onChange(`${hour || '00'}:${nextMinute}`)}>
            <SelectTrigger aria-label={t('นาที')} className="w-full"><SelectValue placeholder={t('นาที')} /></SelectTrigger>
            <SelectContent className="max-h-56">{minutes.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end border-t border-border pt-2">
        <Button type="button" size="sm" onClick={() => setOpen(false)}>{t('เสร็จ')}</Button>
      </div>
    </PopoverContent>
  </Popover>
}
