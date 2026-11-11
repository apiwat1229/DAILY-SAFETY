import { useEffect, useState, type FormEvent } from 'react'
import { LoaderCircle, Save, UsersRound, Warehouse as WarehouseIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { Warehouse, WarehouseType } from '@/lib/inventory-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/confirm-provider'

export const warehouseTypeLabel: Record<WarehouseType, string> = { any: 'ทุกประเภท', ppe: 'เฉพาะ PPE', medicine: 'เฉพาะยา' }

type EditorProps = { open: boolean; warehouse: Warehouse | null; onClose: () => void; onSaved: () => void }

export function WarehouseDialog({ open, warehouse, onClose, onSaved }: EditorProps) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(warehouse?.code ?? '')
  const [name, setName] = useState(warehouse?.name ?? '')
  const [isActive, setIsActive] = useState(warehouse?.isActive ?? true)
  const [type, setType] = useState<WarehouseType>(warehouse?.type ?? 'ppe')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!code.trim() || !name.trim()) return toast.error(t('กรุณาระบุรหัสและชื่อคลัง'))
    setBusy(true)
    try {
      if (!(await confirm(warehouse ? 'update' : 'create'))) return
      if (warehouse) { await inventoryApi.updateWarehouse(warehouse.id, { code: code.trim(), name: name.trim(), type, isActive }); toast.success(t('แก้ไขคลังแล้ว')) }
      else { await inventoryApi.createWarehouse({ code: code.trim(), name: name.trim(), type }); toast.success(t('เพิ่มคลังแล้ว')) }
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกคลังไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="sm:max-w-lg">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><WarehouseIcon size={19} /></div>
      <DialogTitle>{t(warehouse ? 'แก้ไขคลัง' : 'เพิ่มคลัง')}</DialogTitle><DialogDescription>{t('รหัสคลังใช้อ้างอิงในเอกสารและรายงาน')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor="wh-code">{t('รหัสคลัง')} <span className="text-destructive">*</span></Label><Input id="wh-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="WH-01" /></div>
      <div className="grid gap-1.5"><Label htmlFor="wh-name">{t('ชื่อคลัง')} <span className="text-destructive">*</span></Label><Input id="wh-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('เช่น คลัง PPE')} /></div>
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="wh-type">{t('ประเภทของที่เก็บ')}</Label>
        <Select value={type} onValueChange={(value) => value && setType(value as WarehouseType)}><SelectTrigger id="wh-type" className="h-10 w-full"><SelectValue>{t(warehouseTypeLabel[type])}</SelectValue></SelectTrigger>
          <SelectContent>{(Object.keys(warehouseTypeLabel) as WarehouseType[]).map((key) => <SelectItem key={key} value={key}>{t(warehouseTypeLabel[key])}</SelectItem>)}</SelectContent></Select>
        <p className="text-xs text-muted-foreground">{t('แยกคลัง PPE กับคลังยาออกจากกัน คลังเฉพาะประเภทจะรับเข้าได้เฉพาะสินค้าประเภทนั้น')}</p></div>
      {warehouse && <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm sm:col-span-2"><span>{t('เปิดใช้งาน')}</span><Switch checked={isActive} onCheckedChange={setIsActive} /></label>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{t('บันทึก')}</Button></div>
    </form>
  </DialogContent></Dialog>
}

type StaffProps = { warehouse: Warehouse | null; onClose: () => void; onSaved: () => void }

/** Pick which storekeepers (and admins) work in a warehouse. */
export function WarehouseStaffDialog({ warehouse, onClose, onSaved }: StaffProps) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(warehouse?.staff.map((member) => member.userId)))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.users().then(({ users: rows }) => setUsers(rows.filter((user) => user.isActive && (user.role === 'storekeeper' || user.role === 'admin'))))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ')))
  }, [t])

  async function save() {
    if (!warehouse || busy) return
    setBusy(true)
    try {
      if (!(await confirm('update'))) return
      await inventoryApi.setWarehouseStaff(warehouse.id, [...selected])
      toast.success(t('บันทึกเจ้าหน้าที่คลังแล้ว'))
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={Boolean(warehouse)} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><UsersRound size={19} /></div>
      <DialogTitle>{t('เจ้าหน้าที่คลัง')}</DialogTitle><DialogDescription>{warehouse?.code} · {warehouse?.name}</DialogDescription></DialogHeader>
    {users.length === 0
      ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('ยังไม่มีผู้ใช้ที่เป็นเจ้าหน้าที่คลัง สร้างบัญชีสิทธิ์ "เจ้าหน้าที่คลัง" ที่หน้าผู้ใช้งานก่อน')}</p>
      : <ul className="space-y-1">{users.map((user) => <li key={user.id}><label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
        <Checkbox checked={selected.has(user.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked === true) next.add(user.id); else next.delete(user.id); return next })} />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{user.name}</span><span className="text-xs text-muted-foreground">{user.employeeCode} · {user.role === 'admin' ? 'Admin' : t('เจ้าหน้าที่คลัง')}</span></span></label></li>)}</ul>}
    <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</Button><Button type="button" onClick={save} disabled={busy} className="gap-2">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{t('บันทึก')}</Button></div>
  </DialogContent></Dialog>
}
