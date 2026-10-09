import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ContactRound, FileBarChart2, LoaderCircle, Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Employee, EmployeeActivityReport } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'
import { formatDate, formatDateTime } from '@/lib/api'

type EmployeeInput = Omit<Employee, 'createdAt' | 'updatedAt'>

export function EmployeesPage() {
  const { language, t } = useI18n()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<{ employee: Employee | null; key: string } | null>(null)
  const [reportEmployee, setReportEmployee] = useState<Employee | null>(null)

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
      <CardHeader className="flex flex-col gap-3 border-b border-[#edf0f0] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{t('ฐานข้อมูลพนักงาน')}</CardTitle><CardDescription>{t('ค้นหาได้จากรหัส ชื่อ ตำแหน่ง หรือแผนก ทั้งภาษาไทยและอังกฤษ')}</CardDescription></div><div className="w-full sm:max-w-sm"><div className="relative"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาชื่อหรือรหัสพนักงาน')} className="h-10 pl-10" aria-label={t('ค้นหาชื่อหรือรหัสพนักงาน')} /></div><p className="mt-1 text-xs text-muted-foreground">{t('แสดง')} {filteredEmployees.length} {t('จาก')} {employees.length} {t('คน')}</p></div></CardHeader>
      {filteredEmployees.length ? <>
        <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow className="bg-[#fafcfc]"><TableHead className="min-w-32 pl-5">{t('รหัสพนักงาน')}</TableHead><TableHead className="min-w-52">{t('ชื่อพนักงาน')}</TableHead><TableHead className="min-w-44">{t('ตำแหน่ง')}</TableHead><TableHead className="min-w-44">{t('แผนก')}</TableHead><TableHead className="min-w-44 pr-5 text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{filteredEmployees.map((employee) => <TableRow key={employee.employeeCode}><TableCell className="pl-5 font-medium"><Badge variant="outline" className="font-mono text-sm">{employee.employeeCode}</Badge></TableCell><TableCell><p className="font-medium">{employee.nameTh || employee.nameEn}</p>{employee.nameTh && employee.nameEn && <p className="mt-0.5 text-sm text-muted-foreground">{employee.nameEn}</p>}</TableCell><TableCell><p>{language === 'en' ? employee.positionEn || employee.positionTh : employee.positionTh || employee.positionEn}</p></TableCell><TableCell><p>{language === 'en' ? employee.departmentEn || employee.departmentTh : employee.departmentTh || employee.departmentEn}</p></TableCell><TableCell className="pr-5"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setReportEmployee(employee)} className="gap-1.5"><FileBarChart2 size={14} /> {t('รายงาน')}</Button><Button variant="outline" size="sm" onClick={() => openEdit(employee)} className="gap-1.5"><Pencil size={14} /> {t('แก้ไข')}</Button><Button variant="outline" size="sm" onClick={() => remove(employee)} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 size={14} /> {t('ลบ')}</Button></div></TableCell></TableRow>)}</TableBody>
        </Table></div>
        <div className="divide-y md:hidden">{filteredEmployees.map((employee) => <div key={employee.employeeCode} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge variant="outline" className="font-mono">{employee.employeeCode}</Badge><p className="mt-2 font-semibold">{employee.nameTh || employee.nameEn}</p>{employee.nameTh && employee.nameEn && <p className="text-sm text-muted-foreground">{employee.nameEn}</p>}</div><div className="flex shrink-0 gap-1"><Button variant="outline" size="icon" aria-label={t('รายงาน')} onClick={() => setReportEmployee(employee)}><FileBarChart2 size={16} /></Button><Button variant="outline" size="icon" aria-label={t('แก้ไข')} onClick={() => openEdit(employee)}><Pencil size={16} /></Button><Button variant="outline" size="icon" aria-label={t('ลบ')} onClick={() => remove(employee)} className="text-destructive"><Trash2 size={16} /></Button></div></div>
          <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">{t('ตำแหน่ง')}</p><p className="mt-0.5">{language === 'en' ? employee.positionEn || employee.positionTh || '—' : employee.positionTh || employee.positionEn || '—'}</p></div><div><p className="text-muted-foreground">{t('แผนก')}</p><p className="mt-0.5">{language === 'en' ? employee.departmentEn || employee.departmentTh || '—' : employee.departmentTh || employee.departmentEn || '—'}</p></div></div>
        </div>)}</div>
      </> : <CardContent className="grid min-h-48 place-items-center px-5 py-10 text-center"><div><p className="font-medium">{loading ? t('กำลังโหลดรายชื่อพนักงาน…') : t(query ? 'ไม่พบพนักงานที่ตรงกับคำค้น' : 'ยังไม่มีข้อมูลพนักงาน')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่มข้อมูลหรือปรับคำค้นหาแล้วลองอีกครั้ง')}</p></div></CardContent>}
    </Card>
    <EmployeeEditorDialog key={editor?.key || 'closed'} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh() }} />
    {reportEmployee && <EmployeeReportDialog key={reportEmployee.employeeCode} employee={reportEmployee} onClose={() => setReportEmployee(null)} />}
  </div>
}

function EmployeeMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return <Card className="rounded-xl border-[#e8eeee]"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Icon size={19} /></div></CardContent></Card>
}

function EmployeeReportDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { language, t } = useI18n()
  const [report, setReport] = useState<EmployeeActivityReport | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let current = true
    api.employeeReport(employee.employeeCode).then((value) => { if (current) setReport(value) })
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ')))
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [employee.employeeCode, t])
  const displayName = language === 'en' ? employee.nameEn || employee.nameTh : employee.nameTh || employee.nameEn
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><FileBarChart2 size={19} /></div><DialogTitle>{t('รายงานพนักงาน')}</DialogTitle><DialogDescription>{displayName} · {employee.employeeCode} · {language === 'en' ? employee.departmentEn || employee.departmentTh : employee.departmentTh || employee.departmentEn}</DialogDescription></DialogHeader>
    {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground"><LoaderCircle size={18} className="animate-spin" />{t('กำลังโหลดข้อมูล…')}</div> : report && <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><ReportMetric label={t('รายการตรวจ')} value={report.summary.inspections} /><ReportMetric label={t('งานแก้ไขที่มอบหมาย')} value={report.summary.correctiveTasks} /><ReportMetric label={t('งานแก้ไขที่ยังเปิด')} value={report.summary.openTasks} /><ReportMetric label={t('ผลแบบประเมิน')} value={report.summary.assessments} /><ReportMetric label={t('สื่ออบรมที่อ่าน')} value={report.summary.trainingViews} /></div>
      <section className="space-y-2"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{t('ประวัติรายการตรวจ')}</h3><span className="text-sm text-muted-foreground">{t('แสดงล่าสุด')} {report.inspections.length} {t('รายการ')}</span></div>{report.inspections.length ? <div className="divide-y rounded-xl border">{report.inspections.map((item) => <article key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{item.area} · {item.shift}</p><p className="text-sm text-muted-foreground">{formatDate(item.date, language)} {item.time}</p></div><div className="flex flex-wrap gap-2 text-sm"><Badge variant="outline" className="border-emerald-200 text-emerald-700">OK {item.counts.ok}</Badge><Badge variant="outline" className="border-red-200 text-red-700">NG {item.counts.ng}</Badge><Badge variant="outline">N/A {item.counts.na}</Badge></div></article>)}</div> : <EmptyReport text={t('ยังไม่มีประวัติรายการตรวจ')} />}</section>
      <section className="space-y-2"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{t('งานแก้ไขที่รับผิดชอบ')}</h3><span className="text-sm text-muted-foreground">{report.correctiveTasks.length} {t('รายการ')}</span></div>{report.correctiveTasks.length ? <div className="divide-y rounded-xl border">{report.correctiveTasks.map((item) => <article key={item.id} className="space-y-1 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{item.title} · {item.area}</p><Badge variant="outline" className={item.followUpStatus === 'แก้ไขแล้ว' ? 'border-emerald-200 text-emerald-700' : 'border-amber-200 text-amber-800'}>{t(item.followUpStatus)}</Badge></div><p className="text-sm text-muted-foreground">{item.issueDetails}</p><p className="text-xs text-muted-foreground">{formatDate(item.date, language)} {item.time} · {t('กำหนดเสร็จ')} {item.dueDate ? formatDate(item.dueDate, language) : '—'} · {t('รูปก่อนแก้ไข')} {item.beforePhotos} · {t('รูปหลังแก้ไข')} {item.afterPhotos}</p>{item.resolutionNote && <p className="text-sm">{item.resolutionNote}</p>}</article>)}</div> : <EmptyReport text={t('ยังไม่มีงานแก้ไขที่มอบหมาย')} />}</section>
      <section className="space-y-2"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{t('ผลการทำแบบประเมิน')}</h3><span className="text-sm text-muted-foreground">{report.assessments.length} {t('รายการ')}</span></div>{report.assessments.length ? <div className="divide-y rounded-xl border">{report.assessments.map((item) => <article key={item.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{formatDateTime(item.submittedAt, language)} · {t('คะแนน')} {item.score} / {item.maxScore}</p></article>)}</div> : <EmptyReport text={t('ยังไม่มีผลการทำแบบประเมิน')} />}</section>
      <section className="space-y-2"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{t('สื่ออบรมที่ยืนยันว่าอ่านแล้ว')}</h3><span className="text-sm text-muted-foreground">{report.trainingViews.length} {t('รายการ')}</span></div>{report.trainingViews.length ? <div className="divide-y rounded-xl border">{report.trainingViews.map((item) => <article key={item.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{formatDateTime(item.viewedAt, language)}</p></article>)}</div> : <EmptyReport text={t('ยังไม่มีประวัติการอ่านสื่ออบรม')} />}</section>
    </div>}
    <div className="flex justify-end border-t pt-3"><Button variant="outline" onClick={onClose}>{t('ปิด')}</Button></div>
  </DialogContent></Dialog>
}

function ReportMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border bg-[#fbfcfc] p-3"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div> }
function EmptyReport({ text }: { text: string }) { return <div className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{text}</div> }

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
