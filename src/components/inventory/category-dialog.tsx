import { useState } from 'react'
import { Plus, Save, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { inventoryApi } from '@/lib/inventory-api'
import type { Category, InventoryType } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm } from '@/components/confirm-provider'

type Props = { open: boolean; categories: Category[]; onOpenChange: (open: boolean) => void; onChanged: () => Promise<void> }

export function CategoryDialog({ open, categories, onOpenChange, onChanged }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<InventoryType>('ppe')

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

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Tags size={19} /></div>
      <DialogTitle>{t('จัดการหมวดสินค้า')}</DialogTitle><DialogDescription>{t('หมวดที่ยังมีสินค้าอยู่ลบไม่ได้ ให้ย้ายหรือลบสินค้าก่อน')}</DialogDescription></DialogHeader>
    {(['ppe', 'medicine'] as const).map((group) => <section key={group} className="space-y-2">
      <h3 className="text-sm font-semibold">{group === 'ppe' ? t('อุปกรณ์ความปลอดภัย (PPE)') : t('ยารักษาโรค')}</h3>
      <ul className="space-y-2">{categories.filter((category) => category.type === group).map((category) => <CategoryRow key={`${category.id}:${category.name}`} category={category} disabled={busy}
        onSave={(next) => run('update', () => inventoryApi.updateCategory(category.id, { name: next }), 'แก้ไขหมวดแล้ว')}
        onDelete={() => run('danger', () => inventoryApi.deleteCategory(category.id), 'ลบหมวดแล้ว')} />)}
        {!categories.some((category) => category.type === group) && <li className="text-sm text-muted-foreground">{t('ยังไม่มีหมวด')}</li>}</ul>
    </section>)}
    <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('ชื่อหมวดใหม่')} aria-label={t('ชื่อหมวดใหม่')} />
      <Select value={type} onValueChange={(value) => setType(value as InventoryType)}><SelectTrigger className="h-10 w-full sm:w-44" aria-label={t('ประเภท')}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ppe">PPE</SelectItem><SelectItem value="medicine">{t('ยารักษาโรค')}</SelectItem></SelectContent></Select>
      <Button iconOnly type="button" disabled={busy || !name.trim()} onClick={() => run('create', async () => { await inventoryApi.createCategory({ name: name.trim(), type }); setName('') }, 'เพิ่มหมวดแล้ว')}><Plus size={16} />{t('เพิ่มหมวด')}</Button>
    </div>
  </DialogContent></Dialog>
}

function CategoryRow({ category, disabled, onSave, onDelete }: { category: Category; disabled: boolean; onSave: (name: string) => void; onDelete: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(category.name)
  return <li className="flex items-center gap-2">
    <Input value={name} onChange={(event) => setName(event.target.value)} aria-label={t('ชื่อหมวด')} />
    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{category.itemCount} {t('รายการ')}</span>
    <Button iconOnly type="button" variant="outline" disabled={disabled || !name.trim() || name.trim() === category.name} onClick={() => onSave(name.trim())}><Save size={15} />{t('บันทึก')}</Button>
    <Button iconOnly type="button" variant="ghost" disabled={disabled} onClick={onDelete} className="text-destructive"><Trash2 size={15} />{t('ลบ')}</Button>
  </li>
}
