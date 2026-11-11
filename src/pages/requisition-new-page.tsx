import { useCallback, useEffect, useMemo, useState } from 'react'
import { LayoutGrid, List, PackageSearch, Rows3, Search, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { requisitionApi } from '@/lib/requisition-api'
import { refreshBadges } from '@/lib/use-badges'
import { usePersistentState } from '@/lib/persistent-state'
import type { Cart, CatalogItem, RequisitionType } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ItemThumb } from '@/components/item-thumb'
import { ViewToggle, type ViewOption } from '@/components/view-toggle'
import { useConfirm } from '@/components/confirm-provider'
import type { NavigateFn } from '@/components/app-pages'
import { CartSheet } from '@/components/requisitions/cart-sheet'
import { CheckoutDialog } from '@/components/requisitions/checkout-dialog'
import { QtyStepper } from '@/components/requisitions/qty-stepper'

type CatalogView = 'tiles' | 'cards' | 'list'
const VIEWS: ViewOption<CatalogView>[] = [{ value: 'tiles', label: 'แบบรูปใหญ่', icon: LayoutGrid }, { value: 'cards', label: 'แบบการ์ด', icon: Rows3 }, { value: 'list', label: 'แบบรายการ', icon: List }]
const GRID: Record<CatalogView, string> = {
  tiles: 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4',
  cards: 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3',
  list: 'flex flex-col gap-2',
}

const other = (type: RequisitionType): RequisitionType => (type === 'ppe' ? 'medicine' : 'ppe')

export function RequisitionNewPage({ onPage }: { user: User; onPage: NavigateFn }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [type, setType] = usePersistentState<RequisitionType>('requisition.type', 'ppe')
  const [view, setView] = usePersistentState<CatalogView>('requisition.view', 'tiles', 'local')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<Cart | null>(null)
  const [otherCount, setOtherCount] = useState(0)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    const timer = window.setTimeout(() => {
      requisitionApi.catalog(type, query.trim() || undefined).then(({ items: rows }) => setItems(rows))
        .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายการสินค้าไม่สำเร็จ')))
        .finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [type, query, t])

  const loadCarts = useCallback(() => {
    Promise.all([requisitionApi.cart(type), requisitionApi.cart(other(type))])
      .then(([current, otherCart]) => { setCart(current.cart); setOtherCount(otherCart.cart.lines.length) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดตะกร้าไม่สำเร็จ')))
  }, [type, t])
  useEffect(loadCarts, [loadCarts])
  useEffect(() => setCategory(''), [type])

  const inCart = useMemo(() => new Map((cart?.lines ?? []).map((line) => [line.variantId, line.qty])), [cart])
  const categories = useMemo(() => [...new Set(items.map((item) => item.categoryName).filter(Boolean))], [items])
  const shown = category ? items.filter((item) => item.categoryName === category) : items
  const cartCount = cart?.lines.length ?? 0

  async function setLine(variantId: string, qty: number, message?: string) {
    setBusy(true)
    try {
      const result = await requisitionApi.setCartLine(type, variantId, qty)
      setCart(result.cart)
      refreshBadges()
      if (message) toast.success(message)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'อัปเดตตะกร้าไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  async function clearCart() {
    if (!(await confirm({ kind: 'danger', title: t('ล้างตะกร้า'), description: t('นำสินค้าทั้งหมดออกจากตะกร้านี้'), confirmLabel: t('ล้างตะกร้า') }))) return
    setBusy(true)
    try { await requisitionApi.clearCart(type); setCart({ type, lines: [] }); refreshBadges() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ล้างตะกร้าไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <div className="page-stack">
    <div className="flex items-end justify-between gap-3">
      <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('เบิกของ')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('เลือกอุปกรณ์หรือยา ใส่ตะกร้า แล้วส่งใบเบิกให้หัวหน้างานอนุมัติ')}</p></div>
      <Button type="button" onClick={() => setCartOpen(true)} className="relative shrink-0 gap-2"><ShoppingCart size={17} /><span className="hidden sm:inline">{t('ตะกร้า')}</span>
        {cartCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-[11px] font-semibold text-primary">{cartCount}</span>}</Button>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      <CardContent className="grid gap-3 border-b border-border-subtle p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <Tabs value={type} onValueChange={(value) => setType(value as RequisitionType)}><TabsList><TabsTrigger value="ppe">PPE</TabsTrigger><TabsTrigger value="medicine">{t('ยารักษาโรค')}</TabsTrigger></TabsList></Tabs>
        <div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหารหัสหรือชื่อสินค้า')} aria-label={t('ค้นหา')} className="pl-9" /></div>
          <ViewToggle value={view} onChange={setView} options={VIEWS} /></div>
        {categories.length > 1 && <div className="flex flex-wrap gap-2 sm:col-span-2">
          {['', ...categories].map((name) => <button key={name || 'all'} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${category === name ? 'border-primary bg-secondary text-primary' : 'border-border text-muted-foreground hover:bg-surface-subtle'}`}>{name || t('ทั้งหมด')}</button>)}</div>}
      </CardContent>
      <CardContent className="p-4">
        {shown.length === 0 ? <div className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground"><div><PackageSearch className="mx-auto mb-2" size={24} />{loading ? t('กำลังโหลด…') : query ? t('ไม่พบสินค้าที่ตรงกับคำค้น') : t('ยังไม่มีสินค้าให้เบิก')}</div></div>
          : <div className={GRID[view]}>{shown.map((item) => <ItemCard key={item.itemId} item={item} view={view} inCart={inCart} busy={busy}
            onAdd={(variantId, qty) => setLine(variantId, (inCart.get(variantId) ?? 0) + qty, `${item.name} +${qty}`)} />)}</div>}
      </CardContent>
    </Card>
    {cartCount > 0 && !cartOpen && <Button type="button" onClick={() => setCartOpen(true)} className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 h-12 gap-2 rounded-full px-5 shadow-lg md:hidden"><ShoppingCart size={18} />{cartCount}</Button>}
    <CartSheet open={cartOpen} onOpenChange={setCartOpen} type={type} cart={cart} otherCount={otherCount} busy={busy}
      onQty={(variantId, qty) => void setLine(variantId, qty)} onRemove={(variantId) => void setLine(variantId, 0)} onClear={() => void clearCart()}
      onCheckout={() => { setCartOpen(false); setCheckoutOpen(true) }} onSwitchType={() => setType(other(type))} />
    <CheckoutDialog open={checkoutOpen} type={type} cart={cart} onClose={() => setCheckoutOpen(false)} onDone={() => { setCheckoutOpen(false); loadCarts(); onPage('requisitions') }} />
  </div>
}

function ItemCard({ item, view, inCart, busy, onAdd }: { item: CatalogItem; view: CatalogView; inCart: Map<string, number>; busy: boolean; onAdd: (variantId: string, qty: number) => void }) {
  const { t } = useI18n()
  const [variantId, setVariantId] = useState(() => (item.variants.find((variant) => variant.available > 0) ?? item.variants[0]).variantId)
  const [qty, setQty] = useState(1)
  const variant = item.variants.find((entry) => entry.variantId === variantId) ?? item.variants[0]
  const remaining = Math.max(variant.available - (inCart.get(variant.variantId) ?? 0), 0)
  const inBasket = inCart.get(variant.variantId) ?? 0
  const stockBadge = variant.available > 0
    ? <Badge variant="outline" className="border-success/25 bg-success/10 text-success">{t('มีในคลัง')} {variant.available}</Badge>
    : <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-destructive">{t('สินค้าหมด')}</Badge>
  const basketBadge = inBasket > 0 && <Badge variant="outline" className="border-primary/25 bg-secondary text-primary">{t('ในตะกร้า')} {inBasket}</Badge>
  const picker = item.variants.length > 1 && <Select value={variantId} onValueChange={(value) => { if (value) { setVariantId(value); setQty(1) } }}>
    <SelectTrigger className="h-10 w-full" aria-label={t('ตัวเลือก')}><SelectValue>{variant.label || t('ไม่ระบุ')}</SelectValue></SelectTrigger>
    <SelectContent>{item.variants.map((entry) => <SelectItem key={entry.variantId} value={entry.variantId}>{entry.label || t('ไม่ระบุ')} ({entry.available})</SelectItem>)}</SelectContent></Select>
  const stepper = <QtyStepper value={Math.min(qty, Math.max(remaining, 1))} max={Math.max(remaining, 1)} disabled={remaining === 0 || busy} onChange={setQty} label={`${t('จำนวน')} ${item.name}`} />
  const addButton = (full: boolean) => <Button type="button" disabled={remaining === 0 || busy} onClick={() => { onAdd(variant.variantId, Math.min(qty, remaining)); setQty(1) }} className={`gap-2 ${full ? 'w-full' : ''}`}><ShoppingCart size={15} />{t('ใส่ตะกร้า')}</Button>
  const meta = `${item.sku} · ${item.unit}${item.categoryName ? ` · ${item.categoryName}` : ''}`

  if (view === 'tiles') return <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
    <ItemThumb url={item.imageUrl} name={item.name} fill className="!rounded-none !border-0" />
    <div className="flex flex-1 flex-col gap-2 p-3">
      <div><p className="font-medium leading-tight">{item.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p></div>
      <div className="flex flex-wrap gap-1">{stockBadge}{basketBadge}</div>
      {picker}
      <div className="mt-auto flex flex-col items-center gap-2 pt-1">{stepper}{addButton(true)}</div>
    </div>
  </div>

  if (view === 'list') return <div className="flex flex-col gap-2 rounded-xl border border-border p-2.5 sm:flex-row sm:items-center">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <ItemThumb url={item.imageUrl} name={item.name} size={48} />
      <div className="min-w-0 flex-1"><p className="truncate font-medium leading-tight">{item.name}</p><p className="truncate text-xs text-muted-foreground">{meta}</p>
        <div className="mt-1 flex flex-wrap gap-1">{stockBadge}{basketBadge}</div></div>
    </div>
    <div className="flex items-center gap-2 sm:shrink-0">{picker && <div className="w-28">{picker}</div>}{stepper}{addButton(false)}</div>
  </div>

  return <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
    <div className="flex gap-3">
      <ItemThumb url={item.imageUrl} name={item.name} size={72} />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">{item.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">{stockBadge}{basketBadge}</div>
      </div>
    </div>
    {picker}
    <div className="mt-auto flex items-center justify-between gap-2">{stepper}{addButton(false)}</div>
  </div>
}
