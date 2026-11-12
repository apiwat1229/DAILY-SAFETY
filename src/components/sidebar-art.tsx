import { useTheme } from '@/lib/use-theme'
import { SafetyMascots } from '@/components/safety-mascots'

const SKYLINE = 'M0 120V78H34V52L62 70V50L90 68V84H134V40H150V84H196V60H240V90H300V46H322V90H380V66H420V120Z'

/** Decoration under the sidebar menu, chosen in the theme settings: a factory skyline, or the cartoon safety team in front of it. */
export function SidebarArt() {
  const [{ decor }] = useTheme()
  if (decor !== 'skyline' && decor !== 'mascots') return null
  return <div aria-hidden="true" className="relative mt-2 shrink-0 overflow-hidden rounded-xl">
    <svg viewBox="0 0 420 120" preserveAspectRatio="none" className={`block w-full text-sidebar-muted ${decor === 'mascots' ? 'h-24 opacity-25' : 'h-16 opacity-40'}`} fill="currentColor"><path d={SKYLINE} /></svg>
    {decor === 'mascots' && <div className="absolute inset-x-1 bottom-2"><SafetyMascots /></div>}
    <div className="absolute inset-x-0 bottom-0 h-2" style={{ background: 'repeating-linear-gradient(135deg, #facc15 0 12px, #111827 12px 24px)' }} />
  </div>
}
