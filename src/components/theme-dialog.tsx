import { useState } from 'react'
import { Check, Palette, RotateCcw } from 'lucide-react'
import { ACCENTS, DEFAULT_THEME, RADII, type RadiusId, type SidebarStyle } from '@/lib/theme'
import { useTheme } from '@/lib/use-theme'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SIDEBARS: { id: SidebarStyle; label: string }[] = [{ id: 'dark', label: 'เข้ม' }, { id: 'accent', label: 'สีหลัก' }, { id: 'light', label: 'สว่าง' }]

/** Icon button that opens the appearance settings; changes apply immediately and are remembered on this device. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return <>
    <Button type="button" variant="ghost" size="icon" className={className} onClick={() => setOpen(true)} aria-label={t('ตั้งค่าธีม')} title={t('ตั้งค่าธีม')}><Palette size={18} strokeWidth={1.8} /></Button>
    <ThemeDialog open={open} onOpenChange={setOpen} />
  </>
}

function Choice({ active, onClick, children, label }: { active: boolean; onClick: () => void; children?: React.ReactNode; label: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs transition-colors ${active ? 'border-primary bg-secondary text-primary' : 'border-border hover:bg-surface-subtle'}`}>{children}<span>{label}</span></button>
}

export function ThemeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [theme, setTheme] = useTheme()
  const isDefault = theme.accent === DEFAULT_THEME.accent && theme.sidebar === DEFAULT_THEME.sidebar && theme.radius === DEFAULT_THEME.radius
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader>
      <div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Palette size={19} /></div>
      <DialogTitle>{t('ตั้งค่าธีม')}</DialogTitle>
      <DialogDescription>{t('เปลี่ยนสีของระบบและแถบเมนู การตั้งค่าจะจำไว้ในเครื่องนี้')}</DialogDescription>
    </DialogHeader>
    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('สีหลัก')}</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{ACCENTS.map((accent) => <button key={accent.id} type="button" aria-pressed={theme.accent === accent.id} aria-label={t(accent.label)} title={t(accent.label)} onClick={() => setTheme({ ...theme, accent: accent.id })}
        className={`grid aspect-square place-items-center rounded-full border-2 text-white transition-transform hover:scale-105 ${theme.accent === accent.id ? 'border-foreground' : 'border-transparent'}`} style={{ background: accent.hex }}>{theme.accent === accent.id && <Check size={18} strokeWidth={3} />}</button>)}</div>
    </section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('แถบเมนูด้านข้าง')}</h3>
      <div className="grid grid-cols-3 gap-2">{SIDEBARS.map((option) => <Choice key={option.id} active={theme.sidebar === option.id} onClick={() => setTheme({ ...theme, sidebar: option.id })} label={t(option.label)}>
        <span className="flex h-9 w-full overflow-hidden rounded-md border border-border"><span className="w-1/3" style={{ background: option.id === 'light' ? '#fff' : option.id === 'accent' ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 30%, #0b1220)' }} /><span className="flex-1 bg-muted" /></span></Choice>)}</div>
    </section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('มุมของปุ่มและการ์ด')}</h3>
      <div className="grid grid-cols-3 gap-2">{(Object.keys(RADII) as RadiusId[]).map((id) => <Choice key={id} active={theme.radius === id} onClick={() => setTheme({ ...theme, radius: id })} label={t(RADII[id].label)}>
        <span className="h-9 w-full border-2 border-primary/60 bg-secondary" style={{ borderRadius: RADII[id].value }} /></Choice>)}</div>
    </section>
    <div className="flex justify-between gap-2 border-t pt-4">
      <Button type="button" variant="outline" className="gap-2" disabled={isDefault} onClick={() => setTheme({ ...DEFAULT_THEME })}><RotateCcw size={15} />{t('คืนค่าเริ่มต้น')}</Button>
      <Button type="button" onClick={() => onOpenChange(false)}>{t('เสร็จสิ้น')}</Button>
    </div>
  </DialogContent></Dialog>
}
