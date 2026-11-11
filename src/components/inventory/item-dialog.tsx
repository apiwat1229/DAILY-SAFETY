import { useState, type FormEvent } from 'react'
import { LoaderCircle, Package, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { inventoryApi } from '@/lib/inventory-api'
import type { Category, InventoryType, Item, Variant } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/confirm-provider'
import { ItemImageField } from '@/components/inventory/item-image-field'

const NONE = '__none__'
const typeLabel: Record<InventoryType, string> = { ppe: 'อุปกรณ์ความปลอดภัย (PPE)', medicine: 'ยารักษาโรค' }

type Props = {
  open: boolean
  /** null = create. The live item from the list, so variant changes show up without closing. */
  item: Item | null
  categories: Category[]
  defaultType: InventoryType
  onClose: () => void
  /** Called after a successful save of the item fields. */
  onSaved: () => void
  /** Reloads the item list (variant edits). */
  onVariantsChanged: () => Promise<void>
}

export function ItemDialog({ open, item, categories, defaultType, onClose, onSaved, onVariantsChanged }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [type, setType] = useState<InventoryType>(item?.type ?? defaultType)
  const [sku, setSku] = useState(item?.sku ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId || NONE)
  const [unit, setUnit] = useState(item?.unit ?? '')
  const [minStock, setMinStock] = useState(String(item?.minStock ?? 0))
  const [trackLot, setTrackLot] = useState(item?.trackLot ?? false)
  const [trackExpiry, setTrackExpiry] = useState(item?.trackExpiry ?? false)
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [variantText, setVariantText] = useState('')
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const isMedicine = type === 'medicine'
  const typeCategories = categories.filter((category) => category.type === type)

  async function save(event: FormEvent) {
    event.preventDefault()
    const min = Number(minStock)
    if (!sku.trim() || !name.trim() || !unit.trim()) return toast.error(t('กรุณาระบุรหัสสินค้า ชื่อ และหน่วยนับ'))
    if (!Number.isInteger(min) || min < 0) return toast.error(t('จุดสั่งซื้อซ้ำต้องเป็นจำนวนเต็มตั้งแต่ 0'))
    setBusy(true)
    try {
      if (!(await confirm(item ? 'update' : 'create'))) return
      const common = { name: name.trim(), unit: unit.trim(), minStock: min, categoryId: categoryId === NONE ? '' : categoryId, trackLot: isMedicine || trackLot, trackExpiry: isMedicine || trackExpiry }
      if (item) { await inventoryApi.updateItem(item.id, { ...common, isActive }); toast.success(t('แก้ไขสินค้าแล้ว')) }
      else {
        const variants = variantText.split(',').map((label) => label.trim()).filter(Boolean)
        const created = await inventoryApi.createItem({ ...common, sku: sku.trim(), type, variants })
        if (pendingImage) {
          try { await inventoryApi.uploadItemImage(created.item.id, pendingImage) } catch (error) { toast.warning(t(error instanceof Error ? error.message : 'เพิ่มสินค้าแล้ว แต่อัปโหลดรูปไม่สำเร็จ')) }
        }
        toast.success(t('เพิ่มสินค้าแล้ว'))
      }
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกสินค้าไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  async function changeImage(file: File) {
    if (!item) { setPendingImage(file); return }
    if (imageBusy) return
    setImageBusy(true)
    try {
      if (!(await confirm('update'))) return
      await inventoryApi.uploadItemImage(item.id, file)
      toast.success(t('อัปโหลดรูปแล้ว'))
      await onVariantsChanged()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'อัปโหลดรูปไม่สำเร็จ')) }
    finally { setImageBusy(false) }
  }

  async function removeImage() {
    if (!item) { setPendingImage(null); return }
    if (imageBusy) return
    setImageBusy(true)
    try {
      if (!(await confirm({ kind: 'danger', title: t('ลบรูปสินค้า'), description: item.name, confirmLabel: t('ลบรูป') }))) return
      await inventoryApi.deleteItemImage(item.id)
      toast.success(t('ลบรูปแล้ว'))
      await onVariantsChanged()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบรูปไม่สำเร็จ')) }
    finally { setImageBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Package size={19} /></div>
      <DialogTitle>{t(item ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า')}</DialogTitle>
      <DialogDescription>{t('ยาต้องติดตามเลขล็อตและวันหมดอายุเสมอ ส่วนอุปกรณ์ PPE เลือกเปิดได้')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <ItemImageField url={item?.imageUrl ?? null} name={name} pending={pendingImage} busy={imageBusy || busy} onPick={(file) => void changeImage(file)} onRemove={() => void removeImage()} />
      <div className="grid gap-1.5"><Label>{t('ประเภท')}</Label>
        <Select value={type} onValueChange={(value) => { setType(value as InventoryType); setCategoryId(NONE) }} disabled={Boolean(item)}>
          <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{(['ppe', 'medicine'] as const).map((value) => <SelectItem key={value} value={value}>{t(typeLabel[value])}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1.5"><Label htmlFor="item-category">{t('หมวด')}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="item-category" className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>{t('ไม่ระบุหมวด')}</SelectItem>{typeCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1.5"><Label htmlFor="item-sku">{t('รหัสสินค้า')} <span className="text-destructive">*</span></Label><Input id="item-sku" value={sku} onChange={(event) => setSku(event.target.value)} readOnly={Boolean(item)} placeholder="PPE-001" /></div>
      <div className="grid gap-1.5"><Label htmlFor="item-name">{t('ชื่อสินค้า')} <span className="text-destructive">*</span></Label><Input id="item-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor="item-unit">{t('หน่วยนับ')} <span className="text-destructive">*</span></Label><Input id="item-unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={t('เช่น ชิ้น คู่ แผง')} /></div>
      <div className="grid gap-1.5"><Label htmlFor="item-min">{t('จุดสั่งซื้อซ้ำ (ต่ำสุดที่ควรมี)')}</Label><Input id="item-min" type="number" min={0} step={1} inputMode="numeric" value={minStock} onChange={(event) => setMinStock(event.target.value)} /></div>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"><span>{t('ติดตามเลขล็อต')}</span><Switch checked={isMedicine || trackLot} disabled={isMedicine} onCheckedChange={setTrackLot} /></label>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"><span>{t('ติดตามวันหมดอายุ')}</span><Switch checked={isMedicine || trackExpiry} disabled={isMedicine} onCheckedChange={setTrackExpiry} /></label>
      {item
        ? <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm sm:col-span-2"><span>{t('เปิดใช้งาน')}</span><Switch checked={isActive} onCheckedChange={setIsActive} /></label>
        : <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="item-variants">{t('ตัวเลือก (ไซซ์/สี) คั่นด้วยจุลภาค')}</Label><Input id="item-variants" value={variantText} onChange={(event) => setVariantText(event.target.value)} placeholder="S, M, L, XL" /><p className="text-xs text-muted-foreground">{t('เว้นว่างไว้ถ้าสินค้านี้ไม่มีตัวเลือก')}</p></div>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{t('บันทึก')}</Button></div>
    </form>
    {item && <VariantsEditor item={item} onChanged={onVariantsChanged} />}
  </DialogContent></Dialog>
}

function VariantsEditor({ item, onChanged }: { item: Item; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(kind: 'create' | 'update' | 'danger', action: () => Promise<unknown>, success: string) {
    if (busy) return
    setBusy(true)
    try {
      if (!(await confirm(kind))) return
      await action()
      toast.success(t(success))
      await onChanged()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <section className="space-y-2 border-t pt-4">
    <h3 className="text-sm font-semibold">{t('ตัวเลือกสินค้า')}</h3>
    <ul className="space-y-2">
      {item.variants.map((variant) => <VariantRow key={`${variant.id}:${variant.label}:${variant.isActive}`} variant={variant} disabled={busy}
        onSave={(label, isActive) => run('update', () => inventoryApi.updateVariant(variant.id, { label, isActive }), 'แก้ไขตัวเลือกแล้ว')}
        onDelete={() => run('danger', () => inventoryApi.deleteVariant(variant.id), 'ลบตัวเลือกแล้ว')} />)}
    </ul>
    <div className="flex gap-2"><Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={t('ชื่อตัวเลือกใหม่ เช่น XL')} aria-label={t('ชื่อตัวเลือกใหม่ เช่น XL')} />
      <Button iconOnly type="button" variant="outline" disabled={busy || !newLabel.trim()} onClick={() => run('create', async () => { await inventoryApi.addVariant(item.id, newLabel.trim()); setNewLabel('') }, 'เพิ่มตัวเลือกแล้ว')}><Plus size={16} />{t('เพิ่มตัวเลือก')}</Button></div>
  </section>
}

function VariantRow({ variant, disabled, onSave, onDelete }: { variant: Variant; disabled: boolean; onSave: (label: string, isActive: boolean) => void; onDelete: () => void }) {
  const { t } = useI18n()
  const [label, setLabel] = useState(variant.label)
  const [isActive, setIsActive] = useState(variant.isActive)
  const changed = label !== variant.label || isActive !== variant.isActive
  return <li className="flex items-center gap-2">
    <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t('(ไม่มีตัวเลือก)')} aria-label={t('ชื่อตัวเลือก')} />
    <Switch checked={isActive} onCheckedChange={setIsActive} aria-label={t('เปิดใช้งาน')} />
    <Button iconOnly type="button" variant="outline" disabled={disabled || !changed} onClick={() => onSave(label, isActive)}><Save size={15} />{t('บันทึก')}</Button>
    <Button iconOnly type="button" variant="ghost" disabled={disabled} onClick={onDelete} className="text-destructive"><Trash2 size={15} />{t('ลบ')}</Button>
  </li>
}
