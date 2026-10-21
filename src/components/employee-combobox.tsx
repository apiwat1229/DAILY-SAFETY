import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { PublicEmployeeSuggestion } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  value: string
  employees: PublicEmployeeSuggestion[]
  mode: 'name' | 'code'
  invalid?: boolean
  onSearch?: (query: string, language: 'th' | 'en') => Promise<PublicEmployeeSuggestion[]>
  onSelect: (employee: PublicEmployeeSuggestion) => void
}

function employeeName(employee: PublicEmployeeSuggestion, language: 'th' | 'en') {
  return language === 'en' ? employee.nameEn || employee.nameTh : employee.nameTh || employee.nameEn
}

export function EmployeeCombobox({ id, value, employees, mode, invalid = false, onSearch, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [remoteEmployees, setRemoteEmployees] = useState<PublicEmployeeSuggestion[]>([])
  const [controlWidth, setControlWidth] = useState<number>()
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { language, t } = useI18n()
  const selected = employees.find((employee) => employee.employeeCode.toLocaleUpperCase() === value.toLocaleUpperCase())
  const normalizedQuery = query.trim().toLocaleLowerCase()
  useEffect(() => {
    if (!onSearch || !open) return
    const term = query.trim()
    if (term.length < 2) { setRemoteEmployees([]); return }
    let cancelled = false
    const timeout = window.setTimeout(() => {
      onSearch(term, language).then((rows) => { if (!cancelled) setRemoteEmployees(rows) }).catch(() => { if (!cancelled) setRemoteEmployees([]) })
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [language, onSearch, open, query])
  const matches = useMemo(() => (onSearch ? remoteEmployees : employees).filter((employee) => {
    const values = [employee.employeeCode, employee.nameTh, employee.nameEn, employee.departmentTh, employee.departmentEn]
    return !normalizedQuery || values.some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
  }).slice(0, 100), [employees, normalizedQuery, onSearch, remoteEmployees])

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const observer = new ResizeObserver(([entry]) => setControlWidth(entry.contentRect.width))
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [])

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setQuery('')
  }

  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverAnchor asChild>
      <div ref={anchorRef}>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-required="true"
          aria-invalid={invalid}
          aria-label={mode === 'name' ? t('ผู้ตรวจ') : t('รหัสพนักงาน')}
          onClick={() => changeOpen(!open)}
          className={cn('h-10 w-full justify-between gap-2 bg-white px-3 text-left text-sm font-normal', invalid && 'border-destructive ring-2 ring-destructive/20')}
        >
          <span className={cn('truncate', !selected && 'invisible')}>
            {selected ? mode === 'code' ? selected.employeeCode : employeeName(selected, language) : '\u00a0'}
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </div>
    </PopoverAnchor>
    <PopoverContent
      align="start"
      sideOffset={4}
      onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus() }}
      style={controlWidth ? { width: controlWidth } : undefined}
      className="p-1.5"
    >
      <Input
        ref={searchRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t('ค้นหาพนักงาน')}
        className="mb-1.5 h-9"
      />
      <div className="max-h-56 overflow-y-auto" role="listbox" aria-label={t('รายชื่อพนักงาน')}>
        {matches.length > 0 ? matches.map((employee) => {
          const name = employeeName(employee, language)
          const department = language === 'en' ? employee.departmentEn || employee.departmentTh : employee.departmentTh || employee.departmentEn
          const isSelected = employee.employeeCode.toLocaleUpperCase() === value.toLocaleUpperCase()
          return <Button
            key={employee.employeeCode}
            type="button"
            variant="ghost"
            role="option"
            aria-selected={isSelected}
            onClick={() => { onSelect(employee); changeOpen(false) }}
            className="h-auto min-h-10 w-full justify-start gap-2 px-2 py-1.5 text-left text-xs font-normal"
          >
            <Check aria-hidden="true" className={cn('size-3.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{mode === 'code' ? employee.employeeCode : name}</span>
                <span className="shrink-0 text-muted-foreground">{mode === 'code' ? name : employee.employeeCode}</span>
              </span>
              {department && <span className="block truncate text-muted-foreground">{department}</span>}
            </span>
          </Button>
        }) : <p className="px-2 py-3 text-center text-xs text-muted-foreground">{onSearch && normalizedQuery.length < 2 ? t('พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา') : t('ไม่พบพนักงาน')}</p>}
      </div>
    </PopoverContent>
  </Popover>
}
