import type { TabSlot } from '@/lib/nav-model'
import { useI18n } from '@/lib/i18n'
import { iconFor } from '@/components/nav-icons'

type Props = { tabs: TabSlot[]; activeIndex: number; onSelect: (slot: TabSlot, index: number) => void }

/** Bottom tab bar: 3–5 equal slots, the centre action raised, More last. */
export function BottomTabBar({ tabs, activeIndex, onSelect }: Props) {
  const { t } = useI18n()
  return <nav aria-label={t('เมนูหลัก')} className="mobile-tabbar" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
    {tabs.map((slot, index) => {
      const active = index === activeIndex
      if (slot.kind === 'center') {
        const Icon = iconFor(slot.icon)
        return <button key="center" type="button" className="mobile-tab mobile-tab-center" data-active={active} aria-current={active ? 'page' : undefined} onClick={() => onSelect(slot, index)}>
          <span className="mobile-tab-fab"><Icon size={26} strokeWidth={2.2} /></span><span className="mobile-tab-label">{t(slot.label)}</span></button>
      }
      const Icon = iconFor(slot.kind === 'more' ? 'Menu' : slot.item.icon)
      const label = slot.kind === 'more' ? 'เพิ่มเติม' : slot.item.short ?? slot.item.label
      return <button key={slot.kind === 'more' ? 'more' : slot.item.key} type="button" className="mobile-tab" data-active={active} aria-current={active ? 'page' : undefined} onClick={() => onSelect(slot, index)}>
        <Icon size={22} strokeWidth={active ? 2.2 : 1.8} /><span className="mobile-tab-label">{t(label)}</span></button>
    })}
  </nav>
}
