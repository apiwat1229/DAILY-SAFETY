import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { inventoryApi } from '@/lib/inventory-api'
import type { Category, InventoryType, Item } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { usePersistentState } from '@/lib/persistent-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { useConfirm } from '@/components/confirm-provider'
import { ItemDialog } from '@/components/inventory/item-dialog'
import { CategoryDialog } from '@/components/inventory/category-dialog'

type Editor = { item: Item | null; key: string } | null

export function InventoryItemsPage() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = usePersistentState<InventoryType>('inventory.items.type', 'ppe')
  const [query, setQuery] = usePersistentState('inventory.items.query', '')
  const [editor, setEditor] = useState<Editor>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [itemResult, categoryResult] = await Promise.all([inventoryApi.items(), inventoryApi.categories()])
      setItems(itemResult.items)
      setCategories(categoryResult.categories)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'โหลดข้อมูลสินค้าไม่สำเร็จ')) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void reload() }, [reload])

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return items.filter((item) => item.type === type && (!term || [item.sku, item.name, item.categoryName].some((value) => value.toLocaleLowerCase().includes(term))))
  }, [items, type, query])
  const pagination = useDataPagination(filtered)
  const editing = editor?.item ? items.find((item) => item.id === editor.item?.id) ?? editor.item : null

  async function remove(item: Item) {
    if (!(await confirm({ kind: 'danger', title: t('ลบสินค้า'), description: `${item.name} (${item.sku})`, confirmLabel: t('ลบ') }))) return
    try { await inventoryApi.deleteItem(item.id); toast.success(t('ลบสินค้าแล้ว')); await reload() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบสินค้าไม่สำเร็จ')) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('คลังสินค้า')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('สินค้าและหมวด')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('จัดการรายการอุปกรณ์ PPE และยา พร้อมไซซ์และจุดสั่งซื้อซ้ำ')}</p></div>
      <div className="flex gap-2"><Button iconOnly variant="outline" onClick={() => setCategoriesOpen(true)}><Tags size={16} />{t('จัดการหมวด')}</Button><Button iconOnly onClick={() => setEditor({ item: null, key: `new-${Date.now()}` })}><Plus size={16} />{t('เพิ่มสินค้า')}</Button></div>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      <CardContent className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={type} onValueChange={(value) => setType(value as InventoryType)}><TabsList><TabsTrigger value="ppe">PPE ({items.filter((item) => item.type === 'ppe').length})</TabsTrigger><TabsTrigger value="medicine">{t('ยารักษาโรค')} ({items.filter((item) => item.type === 'medicine').length})</TabsTrigger></TabsList></Tabs>
        <div className="relative sm:w-72"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหารหัส ชื่อ หรือหมวด')} aria-label={t('ค้นหา')} className="pl-9" /></div>
      </CardContent>
      {filtered.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t('รหัสสินค้า')}</TableHead><TableHead>{t('ชื่อสินค้า')}</TableHead><TableHead>{t('หมวด')}</TableHead><TableHead>{t('ตัวเลือก')}</TableHead><TableHead>{t('จุดสั่งซื้อซ้ำ')}</TableHead><TableHead>{t('การติดตาม')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((item) => <TableRow key={item.id} data-inactive={!item.isActive || undefined}>
            <TableCell><Badge variant="outline" className="font-mono">{item.sku}</Badge></TableCell>
            <TableCell className="font-medium">{item.name}<span className="ml-1 text-xs font-normal text-muted-foreground">({item.unit})</span></TableCell>
            <TableCell>{item.categoryName || '—'}</TableCell>
            <TableCell className="whitespace-normal"><div className="flex flex-wrap gap-1">{item.variants.filter((variant) => variant.label).map((variant) => <Badge key={variant.id} variant="outline" className={variant.isActive ? '' : 'opacity-50'}>{variant.label}</Badge>)}{item.variants.every((variant) => !variant.label) && '—'}</div></TableCell>
            <TableCell className="tabular-nums">{item.minStock}</TableCell>
            <TableCell>{[item.trackLot && t('ล็อต'), item.trackExpiry && t('วันหมดอายุ')].filter(Boolean).join(' + ') || '—'}</TableCell>
            <TableCell><Badge variant="outline" className={item.isActive ? 'border-success/25 bg-success/10 text-success' : 'text-muted-foreground'}>{item.isActive ? t('ใช้งาน') : t('ปิดใช้งาน')}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1"><Button iconOnly variant="ghost" size="sm" onClick={() => setEditor({ item, key: item.id })}><Pencil size={15} />{t('แก้ไข')}</Button><Button iconOnly variant="ghost" size="sm" className="text-destructive" onClick={() => remove(item)}><Trash2 size={15} />{t('ลบ')}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={filtered.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground"><div><Package className="mx-auto mb-2" size={22} />{loading ? t('กำลังโหลด…') : query ? t('ไม่พบสินค้าที่ตรงกับคำค้น') : t('ยังไม่มีสินค้า กด "เพิ่มสินค้า" เพื่อเริ่มต้น')}</div></div>}
    </Card>
    {editor && <ItemDialog key={editor.key} open item={editing} categories={categories} defaultType={type} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void reload() }} onVariantsChanged={reload} />}
    <CategoryDialog open={categoriesOpen} categories={categories} onOpenChange={setCategoriesOpen} onChanged={reload} />
  </div>
}
