import { useCallback, useEffect, useState } from 'react'
import { BellRing, Pencil, Plus, Save, Trash2, UsersRound, Warehouse as WarehouseIcon } from 'lucide-react'
import { toast } from 'sonner'
import { inventoryApi } from '@/lib/inventory-api'
import type { Warehouse } from '@/lib/inventory-types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { useConfirm } from '@/components/confirm-provider'
import { WarehouseDialog, WarehouseStaffDialog } from '@/components/inventory/warehouse-dialog'

export function InventoryWarehousesPage() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ warehouse: Warehouse | null; key: string } | null>(null)
  const [staffTarget, setStaffTarget] = useState<Warehouse | null>(null)
  const [days, setDays] = useState('')
  const [savedDays, setSavedDays] = useState('')

  const reload = useCallback(async () => {
    try {
      const [{ warehouses: rows }, settings] = await Promise.all([inventoryApi.warehouses(), inventoryApi.settings()])
      setWarehouses(rows)
      const text = settings.expiryWarnDays.join(', ')
      setDays(text); setSavedDays(text)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'โหลดข้อมูลคลังไม่สำเร็จ')) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void reload() }, [reload])
  const pagination = useDataPagination(warehouses)

  async function remove(warehouse: Warehouse) {
    if (!(await confirm({ kind: 'danger', title: t('ลบคลัง'), description: `${warehouse.code} · ${warehouse.name}`, confirmLabel: t('ลบ') }))) return
    try { await inventoryApi.deleteWarehouse(warehouse.id); toast.success(t('ลบคลังแล้ว')); await reload() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบคลังไม่สำเร็จ')) }
  }

  async function saveDays() {
    const values = days.split(/[,\s]+/).filter(Boolean).map(Number)
    if (values.length < 1 || values.length > 5 || values.some((value) => !Number.isInteger(value) || value < 1 || value > 365)) return toast.error(t('จำนวนวันแจ้งเตือนต้องเป็นจำนวนเต็ม 1–365 จำนวน 1–5 ค่า'))
    if (!(await confirm('update'))) return
    try { await inventoryApi.saveSettings(values); toast.success(t('บันทึกการตั้งค่าแล้ว')); await reload() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('คลังสินค้า')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('คลังสินค้า')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('กำหนดคลังและเจ้าหน้าที่ที่ดูแลแต่ละคลัง')}</p></div>
      <Button iconOnly onClick={() => setEditor({ warehouse: null, key: `new-${Date.now()}` })}><Plus size={16} />{t('เพิ่มคลัง')}</Button>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border">
      {warehouses.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t('รหัสคลัง')}</TableHead><TableHead>{t('ชื่อคลัง')}</TableHead><TableHead>{t('เจ้าหน้าที่')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((warehouse) => <TableRow key={warehouse.id} data-inactive={!warehouse.isActive || undefined}>
            <TableCell><Badge variant="outline" className="font-mono">{warehouse.code}</Badge></TableCell>
            <TableCell className="font-medium">{warehouse.name}</TableCell>
            <TableCell className="whitespace-normal"><div className="flex flex-wrap gap-1">{warehouse.staff.length ? warehouse.staff.map((member) => <Badge key={member.userId} variant="outline">{member.name}</Badge>) : <span className="text-muted-foreground">{t('ยังไม่กำหนด')}</span>}</div></TableCell>
            <TableCell><Badge variant="outline" className={warehouse.isActive ? 'border-success/25 bg-success/10 text-success' : 'text-muted-foreground'}>{warehouse.isActive ? t('ใช้งาน') : t('ปิดใช้งาน')}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1">
              <Button iconOnly variant="ghost" size="sm" onClick={() => setStaffTarget(warehouse)}><UsersRound size={15} />{t('กำหนดเจ้าหน้าที่')}</Button>
              <Button iconOnly variant="ghost" size="sm" onClick={() => setEditor({ warehouse, key: warehouse.id })}><Pencil size={15} />{t('แก้ไข')}</Button>
              <Button iconOnly variant="ghost" size="sm" className="text-destructive" onClick={() => remove(warehouse)}><Trash2 size={15} />{t('ลบ')}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={warehouses.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-40 place-items-center p-8 text-center text-sm text-muted-foreground"><div><WarehouseIcon className="mx-auto mb-2" size={22} />{loading ? t('กำลังโหลด…') : t('ยังไม่มีคลัง กด "เพิ่มคลัง" เพื่อเริ่มต้น')}</div></CardContent>}
    </Card>
    <Card className="rounded-2xl border-border">
      <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><BellRing size={17} className="text-primary" />{t('แจ้งเตือนยาใกล้หมดอายุ')}</CardTitle><CardDescription>{t('ระบบแจ้งเตือนล็อตที่จะหมดอายุภายในจำนวนวันเหล่านี้ (ใส่ได้ 1–5 ค่า คั่นด้วยจุลภาค)')}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2 px-5 pb-5 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5 sm:max-w-xs"><Label htmlFor="expiry-days">{t('จำนวนวันก่อนหมดอายุ')}</Label><Input id="expiry-days" value={days} onChange={(event) => setDays(event.target.value)} placeholder="30, 60, 90" /></div>
        <Button iconOnly variant="outline" disabled={days.trim() === savedDays} onClick={saveDays}><Save size={16} />{t('บันทึก')}</Button>
      </CardContent>
    </Card>
    {editor && <WarehouseDialog key={editor.key} open warehouse={editor.warehouse} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void reload() }} />}
    {staffTarget && <WarehouseStaffDialog key={staffTarget.id} warehouse={staffTarget} onClose={() => setStaffTarget(null)} onSaved={() => { setStaffTarget(null); void reload() }} />}
  </div>
}
