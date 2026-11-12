import { useState, type ReactNode } from 'react'
import { Check, Palette, RotateCcw } from 'lucide-react'
import { ACCENTS, DECORS, DEFAULT_THEME, RADII, THEME_PRESETS, themeVariables, type DecorId, type PageBackground, type RadiusId, type SidebarStyle, type ThemeSettings } from '@/lib/theme'
import { useTheme } from '@/lib/use-theme'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SIDEBARS: { id: SidebarStyle; label: string }[] = [{ id: 'dark', label: 'เข้ม' }, { id: 'gradient', label: 'ไล่สี' }, { id: 'accent', label: 'สีหลัก' }, { id: 'light', label: 'สว่าง' }]
const BACKGROUNDS: { id: PageBackground; label: string }[] = [{ id: 'plain', label: 'ขาวเรียบ' }, { id: 'soft', label: 'อมสี' }]

/** Icon button that opens the appearance settings; changes apply immediately and are remembered on this device. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return <>
    <Button type="button" variant="ghost" size="icon" className={className} onClick={() => setOpen(true)} aria-label={t('ตั้งค่าธีม')} title={t('ตั้งค่าธีม')}><Palette size={18} strokeWidth={1.8} /></Button>
    <ThemeDialog open={open} onOpenChange={setOpen} />
  </>
}

function Choice({ active, onClick, children, label }: { active: boolean; onClick: () => void; children?: ReactNode; label: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition-colors ${active ? 'border-primary bg-secondary text-primary' : 'border-border hover:bg-surface-subtle'}`}>{children}<span>{label}</span></button>
}

/** Tiny mock-up of the sidebar in a given style, drawn from the real theme variables so it matches what you get. */
function SidebarSwatch({ settings }: { settings: ThemeSettings }) {
  const vars = themeVariables(settings)
  const fill = vars['--sidebar-fill'] !== 'none' ? vars['--sidebar-fill'] : vars['--sidebar']
  return <span className="flex h-11 w-full overflow-hidden rounded-md border border-border bg-muted">
    <span className="relative w-2/5 overflow-hidden" style={{ background: fill }}>
      {settings.decor === 'pattern' && <span className="absolute inset-0 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(60deg, rgba(255,255,255,.18) 0 1px, transparent 1px 7px)' }} />}
      {(settings.decor === 'skyline' || settings.decor === 'mascots') && <span className="absolute inset-x-0 bottom-0 h-3" style={{ background: 'repeating-linear-gradient(135deg, #facc15 0 4px, #111827 4px 8px)' }} />}
      {settings.decor === 'mascots' && <span className="absolute bottom-1.5 left-1 flex gap-0.5"><i className="size-2 rounded-full bg-yellow-300" /><i className="size-2 rounded-full bg-white" /><i className="size-2 rounded-full bg-red-400" /></span>}
    </span>
  </span>
}

export function ThemeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [theme, setTheme] = useTheme()
  const same = (a: ThemeSettings, b: ThemeSettings) => a.accent === b.accent && a.sidebar === b.sidebar && a.decor === b.decor && a.background === b.background && a.radius === b.radius
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
    <DialogHeader>
      <div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Palette size={19} /></div>
      <DialogTitle>{t('ตั้งค่าธีม')}</DialogTitle>
      <DialogDescription>{t('เปลี่ยนสีของระบบและแถบเมนู การตั้งค่าจะจำไว้ในเครื่องนี้')}</DialogDescription>
    </DialogHeader>

    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('ชุดธีมสำเร็จรูป')}</h3>
      <div className="grid grid-cols-3 gap-2">{THEME_PRESETS.map((preset) => <Choice key={preset.id} active={same(theme, preset.settings)} onClick={() => setTheme({ ...preset.settings })} label={t(preset.label)}><SidebarSwatch settings={preset.settings} /></Choice>)}</div>
    </section>

    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('สีหลัก')}</h3>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">{ACCENTS.map((accent) => <button key={accent.id} type="button" aria-pressed={theme.accent === accent.id} aria-label={t(accent.label)} title={t(accent.label)} onClick={() => setTheme({ ...theme, accent: accent.id })}
        className={`grid aspect-square place-items-center rounded-full border-2 text-white transition-transform hover:scale-105 ${theme.accent === accent.id ? 'border-foreground' : 'border-transparent'}`} style={{ background: accent.hex }}>{theme.accent === accent.id && <Check size={16} strokeWidth={3} />}</button>)}</div>
    </section>

    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('แถบเมนูด้านข้าง')}</h3>
      <div className="grid grid-cols-4 gap-2">{SIDEBARS.map((option) => <Choice key={option.id} active={theme.sidebar === option.id} onClick={() => setTheme({ ...theme, sidebar: option.id })} label={t(option.label)}><SidebarSwatch settings={{ ...theme, sidebar: option.id, decor: 'none' }} /></Choice>)}</div>
    </section>

    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('ลวดลายและตัวการ์ตูนในเมนู')}</h3>
      <div className="grid grid-cols-4 gap-2">{DECORS.map((option) => <Choice key={option.id} active={theme.decor === option.id} onClick={() => setTheme({ ...theme, decor: option.id as DecorId })} label={t(option.label)}><SidebarSwatch settings={{ ...theme, decor: option.id }} /></Choice>)}</div>
    </section>

    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('สีพื้นหลังหน้า')}</h3>
      <div className="grid grid-cols-2 gap-2">{BACKGROUNDS.map((option) => <Choice key={option.id} active={theme.background === option.id} onClick={() => setTheme({ ...theme, background: option.id })} label={t(option.label)}>
        <span className="h-9 w-full rounded-md border border-border" style={{ background: themeVariables({ ...theme, background: option.id })['--background'] }} /></Choice>)}</div>
    </section>

    <section className="space-y-2"><h3 className="text-sm font-semibold">{t('มุมของปุ่มและการ์ด')}</h3>
      <div className="grid grid-cols-3 gap-2">{(Object.keys(RADII) as RadiusId[]).map((id) => <Choice key={id} active={theme.radius === id} onClick={() => setTheme({ ...theme, radius: id })} label={t(RADII[id].label)}>
        <span className="h-9 w-full border-2 border-primary/60 bg-secondary" style={{ borderRadius: RADII[id].value }} /></Choice>)}</div>
    </section>

    <div className="flex justify-between gap-2 border-t pt-4">
      <Button type="button" variant="outline" className="gap-2" disabled={same(theme, DEFAULT_THEME)} onClick={() => setTheme({ ...DEFAULT_THEME })}><RotateCcw size={15} />{t('คืนค่าเริ่มต้น')}</Button>
      <Button type="button" onClick={() => onOpenChange(false)}>{t('เสร็จสิ้น')}</Button>
    </div>
  </DialogContent></Dialog>
}
