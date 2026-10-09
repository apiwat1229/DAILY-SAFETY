import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

type Props = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  suggestions: string[]
}

export function AutocompleteInput({ value, onValueChange, suggestions, className, ...inputProps }: Props) {
  const [open, setOpen] = useState(false)
  const [inputWidth, setInputWidth] = useState<number>()
  const anchorRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  const matches = useMemo(() => {
    const query = value.trim().toLocaleLowerCase()
    return [...new Set(suggestions)]
      .filter((suggestion) => !query || suggestion.toLocaleLowerCase().includes(query))
      .slice(0, 8)
  }, [suggestions, value])

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const observer = new ResizeObserver(([entry]) => setInputWidth(entry.contentRect.width))
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [])

  return <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
    <PopoverAnchor asChild>
      <div ref={anchorRef} className="relative">
        <Input
          {...inputProps}
          value={value}
          onChange={(event) => { onValueChange(event.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
          className={cn('pr-8', className)}
        />
        {suggestions.length > 0 && <ChevronsUpDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />}
      </div>
    </PopoverAnchor>
    <PopoverContent align="start" sideOffset={4} onOpenAutoFocus={(event) => event.preventDefault()} style={inputWidth ? { width: inputWidth } : undefined} className="p-1">
      <div className="max-h-56 overflow-y-auto" role="listbox" aria-label={t('คำแนะนำ')}>
        {matches.map((suggestion) => <Button
          key={suggestion}
          type="button"
          variant="ghost"
          role="option"
          aria-selected={suggestion === value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { onValueChange(suggestion); setOpen(false) }}
          className="h-8 w-full justify-start gap-2 truncate px-2 text-left text-xs font-normal"
        >
          <Check className={cn('size-3.5 shrink-0', suggestion === value ? 'opacity-100' : 'opacity-0')} />
          <span className="truncate">{suggestion}</span>
        </Button>)}
      </div>
    </PopoverContent>
  </Popover>
}
