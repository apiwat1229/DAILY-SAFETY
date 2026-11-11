import { ShoppingCart, Trash2 } from 'lucide-react'
import type { Cart, RequisitionType } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { useViewMode } from '@/lib/use-view-mode'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ItemThumb } from '@/components/item-thumb'
import { QtyStepper } from '@/components/requisitions/qty-stepper'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: RequisitionType
  cart: Cart | null
  otherCount: number
  busy: boolean
  onQty: (variantId: string, qty: number) => void
  onRemove: (variantId: string) => void
  onClear: () => void
  onCheckout: () => void
  onSwitchType: () => void
}

const typeName: Record<RequisitionType, string> = { ppe: 'PPE', medicine: 'ยารักษาโรค' }

/** The cart: a bottom sheet on phones, a side sheet on desktop. */
export function CartSheet({ open, onOpenChange, type, cart, otherCount, busy, onQty, onRemove, onClear, onCheckout, onSwitchType }: Props) {
  const { t } = useI18n()
  const { mode } = useViewMode()
  const lines = cart?.lines ?? []
  const total = lines.reduce((sum, line) => sum + line.qty, 0)
  const over = lines.filter((line) => line.qty > line.available)
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={mode === 'mobile' ? 'bottom' : 'right'} className={mode === 'mobile' ? 'max-h-[88dvh] gap-0 rounded-t-2xl p-0' : 'w-full gap-0 p-0 sm:max-w-md'}>
      <SheetHeader className="border-b border-border-subtle p-4 text-left">
        <SheetTitle className="flex items-center gap-2"><ShoppingCart size={18} className="text-primary" />{t('ตะกร้าเบิกของ')} · {t(typeName[type])}</SheetTitle>
        <SheetDescription>{lines.length ? `${lines.length} ${t('รายการ')} · ${total} ${t('ชิ้นรวม')}` : t('ยังไม่มีสินค้าในตะกร้า')}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {lines.length === 0 ? <div className="grid min-h-40 place-items-center text-center text-sm text-muted-foreground"><div><ShoppingCart className="mx-auto mb-2" size={24} />{t('เลือกสินค้าแล้วกด "ใส่ตะกร้า"')}</div></div>
          : <ul className="space-y-3">{lines.map((line) => <li key={line.variantId} className="flex gap-3 rounded-xl border border-border p-3">
            <ItemThumb url={line.imageUrl} name={line.name} size={56} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{line.name}{line.variantLabel && <span className="font-normal text-muted-foreground"> · {line.variantLabel}</span>}</p>
                  <p className="text-xs text-muted-foreground">{line.sku} · {line.unit}</p></div>
                <Button iconOnly type="button" variant="ghost" size="icon" disabled={busy} className="-mr-1 -mt-1 shrink-0 text-destructive" onClick={() => onRemove(line.variantId)}><Trash2 size={15} />{t('นำออกจากตะกร้า')}</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <QtyStepper value={line.qty} max={999_999} disabled={busy} onChange={(qty) => onQty(line.variantId, qty)} label={`${t('จำนวน')} ${line.name}`} />
                {!line.active ? <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-destructive">{t('ปิดใช้งานแล้ว')}</Badge>
                  : line.qty > line.available ? <Badge variant="outline" className="border-warning/25 bg-warning/10 text-warning">{t('มีในคลัง')} {line.available}</Badge> : null}
              </div>
            </div>
          </li>)}</ul>}
        {otherCount > 0 && <button type="button" onClick={onSwitchType} className="mt-4 w-full rounded-lg border border-dashed border-border p-3 text-center text-sm text-primary hover:bg-secondary/40">
          {t('ตะกร้า')} {t(typeName[type === 'ppe' ? 'medicine' : 'ppe'])} {t('มีอีก')} {otherCount} {t('รายการ')} · {t('ดูตะกร้านั้น')}</button>}
      </div>
      <div className="space-y-2 border-t border-border-subtle p-4">
        {over.length > 0 && <p className="text-xs text-warning">{t('มีสินค้าที่ขอมากกว่าสต็อกที่มีอยู่ตอนนี้ หัวหน้างานอาจลดจำนวนหรือรอสต็อกเพิ่ม')}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={busy || lines.length === 0} onClick={onClear} className="shrink-0">{t('ล้างตะกร้า')}</Button>
          <Button type="button" disabled={busy || lines.length === 0 || lines.some((line) => !line.active)} onClick={onCheckout} className="flex-1">{t('เบิกของ')}</Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
}
