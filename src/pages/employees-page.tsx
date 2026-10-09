import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ContactRound, LoaderCircle, Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Employee } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'

type EmployeeInput = Omit<Employee, 'createdAt' | 'updatedAt'>

export function EmployeesPage() {
  const { language, t } = useI18n()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<{ employee: Employee | null; key: string } | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    api.employees().then(({ employees: result }) => setEmployees(result))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายชื่อพนักงานไม่สำเร็จ')))
      .finally(() => setLoading(false))
  }, [t])
  useEffect(refresh, [refresh])

  const filteredEmployees = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return employees
    return employees.filter((employee) => [employee.employeeCode, employee.nameTh, employee.nameEn, employee.positionTh, employee.positionEn, employee.departmentTh, employee.departmentEn]
      .some((value) => value.toLocaleLowerCase().includes(term)))
  }, [employees, query])
  const departments = useMemo(() => new Set(employees.map((employee) => employee.departmentTh || employee.departmentEn).filter(Boolean)).size, [employees])

  function openCreate() { setEditor({ employee: null, key: 'new' }) }
  function openEdit(employee: Employee) { setEditor({ employee, key: employee.employeeCode }) }
  async function remove(employee: Employee) {
    const name = language === 'en' ? employee.nameEn || employee.nameTh : employee.nameTh || employee.nameEn
    if (!window.confirm(`${t('ลบข้อมูลพนักงาน')} ${name} (${employee.employeeCode})?`)) return
    try {
      await api.deleteEmployee(employee.employeeCode)
      toast.success(t('ลบข้อมูลพนักงานแล้ว'))
      refresh()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบข้อมูลพนักงานไม่สำเร็จ')) }
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('การจัดการข้อมูล')}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('รายชื่อพนักงาน')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('จัดการชื่อ รหัสพนักงาน ตำแหน่ง และแผนก สำหรับใช้ค้นหาในรายงาน')}</p></div>
      <Button onClick={openCreate} className="h-11 w-full gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มพนักงาน')}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <EmployeeMetric label={t('พนักงานทั้งหมด')} value={employees.length} icon={UsersRound} />
      <EmployeeMetric label={t('จำนวนแผนก')} value={departments} icon={ContactRound} />
    </div>

    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]">
      <CardHeader className="border-b border-[#edf0f0] px-5 py-4"><CardTitle>{t('ฐานข้อมูลพนักงาน')}</CardTitle><CardDescription>{t('ค้นหาได้จากรหัส ชื่อ ตำแหน่ง หรือแผนก ทั้งภาษาไทยและอังกฤษ')}</CardDescription></CardHeader>
      <CardContent className="border-b border-[#edf0f0] p-4">
        <div className="relative max-w-xl"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-11 pl-10" aria-label={t('ค้นหาชื่อหรือรหัสพนักงาน')} /></div>
        <p className="mt-2 text-sm text-muted-foreground">{t('แสดง')} {filteredEmployees.length} {t('จาก')} {employees.length} {t('คน')}</p>
      </CardContent>
      {filteredEmployees.length ? <>
        <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-[#fafcfc]"><TableHead className="min-w-32 pl-5">{t('รหัสพนักงาน')}</TableHead><TableHead className="min-w-52">{t('ชื่อพนักงาน')}</TableHead><TableHead className="min-w-44">{t('ตำแหน่ง')}</TableHead><TableHead className="min-w-44">{t('แผนก')}</TableHead><TableHead className="min-w-44 pr-5 text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{filteredEmployees.map((employee) => <TableRow key={employee.employeeCode}><TableCell className="pl-5 font-medium"><Badge variant="outline" className="font-mono text-sm">{employee.employeeCode}</Badge></TableCell><TableCell><p className="font-medium">{employee.nameTh || employee.nameEn}</p>{employee.nameTh && employee.nameEn && <p className="mt-0.5 text-sm text-muted-foreground">{employee.nameEn}</p>}</TableCell><TableCell><p>{language === 'en' ? employee.positionEn || employee.positionTh : employee.positionTh || employee.positionEn}</p></TableCell><TableCell><p>{language === 'en' ? employee.departmentEn || employee.departmentTh : employee.departmentTh || employee.departmentEn}</p></TableCell><TableCell className="pr-5"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(employee)} className="h-9 gap-1.5"><Pencil size={14} /> {t('แก้ไข')}</Button><Button variant="outline" size="sm" onClick={() => remove(employee)} className="h-9 gap-1.5 text-destructive hover:text-destructive"><Trash2 size={14} /> {t('ลบ')}</Button></div></TableCell></TableRow>)}</TableBody>
        </Table></div>
        <div className="divide-y md:hidden">{filteredEmployees.map((employee) => <div key={employee.employeeCode} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge variant="outline" className="font-mono">{employee.employeeCode}</Badge><p className="mt-2 font-semibold">{employee.nameTh || employee.nameEn}</p>{employee.nameTh && employee.nameEn && <p className="text-sm text-muted-foreground">{employee.nameEn}</p>}</div><div className="flex shrink-0 gap-1"><Button variant="outline" size="icon" aria-label={t('แก้ไข')} onClick={() => openEdit(employee)}><Pencil size={16} /></Button><Button variant="outline" size="icon" aria-label={t('ลบ')} onClick={() => remove(employee)} className="text-destructive"><Trash2 size={16} /></Button></div></div>
          <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">{t('ตำแหน่ง')}</p><p className="mt-0.5">{language === 'en' ? employee.positionEn || employee.positionTh || '—' : employee.positionTh || employee.positionEn || '—'}</p></div><div><p className="text-muted-foreground">{t('แผนก')}</p><p className="mt-0.5">{language === 'en' ? employee.departmentEn || employee.departmentTh || '—' : employee.departmentTh || employee.departmentEn || '—'}</p></div></div>
        </div>)}</div>
      </> : <CardContent className="grid min-h-48 place-items-center px-5 py-10 text-center"><div><p className="font-medium">{loading ? t('กำลังโหลดรายชื่อพนักงาน…') : t(query ? 'ไม่พบพนักงานที่ตรงกับคำค้น' : 'ยังไม่มีข้อมูลพนักงาน')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่มข้อมูลหรือปรับคำค้นหาแล้วลองอีกครั้ง')}</p></div></CardContent>}
    </Card>
    <EmployeeEditorDialog key={editor?.key || 'closed'} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh() }} />
  </div>
}

function EmployeeMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return <Card className="rounded-xl border-[#e8eeee]"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Icon size={19} /></div></CardContent></Card>
}

function EmployeeEditorDialog({ editor, onClose, onSaved }: { editor: { employee: Employee | null } | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const employee = editor?.employee
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input: EmployeeInput = {
      employeeCode: String(form.get('employeeCode') || '').trim().toUpperCase(),
      nameTh: String(form.get('nameTh') || '').trim(), nameEn: String(form.get('nameEn') || '').trim(),
      positionTh: String(form.get('positionTh') || '').trim(), positionEn: String(form.get('positionEn') || '').trim(),
      departmentTh: String(form.get('departmentTh') || '').trim(), departmentEn: String(form.get('departmentEn') || '').trim(),
    }
    if (!input.employeeCode || (!input.nameTh && !input.nameEn)) return toast.error(t('กรอกรหัสพนักงานและชื่ออย่างน้อยหนึ่งภาษา'))
    setBusy(true)
    try {
      if (employee) { await api.updateEmployee(employee.employeeCode, input); toast.success(t('แก้ไขข้อมูลพนักงานแล้ว')) }
      else { await api.createEmployee(input); toast.success(t('เพิ่มข้อมูลพนักงานแล้ว')) }
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกข้อมูลพนักงานไม่สำเร็จ')) }
    finally { setBusy(false) }
  }
  return <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><ContactRound size={19} /></div><DialogTitle>{t(employee ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงาน')}</DialogTitle><DialogDescription>{t('กรอกข้อมูลพนักงานภาษาไทยและอังกฤษ เพื่อใช้ค้นหาในรายงาน')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><EmployeeField name="employeeCode" label="รหัสพนักงาน" value={employee?.employeeCode || ''} placeholder="เช่น YTR-123" required /><EmployeeField name="nameTh" label="ชื่อพนักงานภาษาไทย" value={employee?.nameTh || ''} placeholder="ชื่อและนามสกุล" /><EmployeeField name="nameEn" label="ชื่อพนักงานภาษาอังกฤษ" value={employee?.nameEn || ''} placeholder="Full name" /><EmployeeField name="positionTh" label="ตำแหน่งภาษาไทย" value={employee?.positionTh || ''} placeholder="ตำแหน่ง" /><EmployeeField name="positionEn" label="ตำแหน่งภาษาอังกฤษ" value={employee?.positionEn || ''} placeholder="Position" /><EmployeeField name="departmentTh" label="แผนกภาษาไทย" value={employee?.departmentTh || ''} placeholder="แผนก" /><EmployeeField name="departmentEn" label="แผนกภาษาอังกฤษ" value={employee?.departmentEn || ''} placeholder="Department" /></div>
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div>
    </form>
  </DialogContent></Dialog>
}

function EmployeeField({ name, label, value, placeholder, required }: { name: string; label: string; value: string; placeholder: string; required?: boolean }) {
  const { t } = useI18n()
  return <div className="grid gap-1.5"><Label htmlFor={`employee-${name}`}>{t(label)}{required && <span className="text-destructive"> *</span>}</Label><Input id={`employee-${name}`} name={name} defaultValue={value} placeholder={placeholder} required={required} /></div>
}
