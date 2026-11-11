import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Eye, LoaderCircle, Plus, Save, Trash2, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { inventoryApi } from '@/lib/inventory-api'
import type { Category, Warehouse } from '@/lib/inventory-types'
import { workflowApi } from '@/lib/requisition-api'
import type { ApproverType, ApproverUser, PreviewStep, WorkflowStep, WorkflowTemplate } from '@/lib/requisition-types'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/confirm-provider'

const ALL = '__all__'
const typeLabel: Record<ApproverType, string> = { dept_supervisor: 'หัวหน้างานของแผนกผู้เบิก', role: 'ตามบทบาท', user: 'ระบุคน', warehouse_staff: 'เจ้าหน้าที่คลังของคลังที่เบิก' }
const roleLabel: Record<string, string> = { admin: 'ผู้ดูแลระบบ', leader: 'หัวหน้างาน', storekeeper: 'เจ้าหน้าที่คลัง' }
const noteLabel: Record<string, string> = { fallback_admin: 'ไม่พบผู้อนุมัติ ส่งให้ผู้ดูแลระบบ', skipped_self: 'ข้ามเพราะผู้เบิกเป็นผู้อนุมัติเอง', skipped_no_approver: 'ไม่มีผู้อนุมัติ ข้ามขั้นนี้' }

type Draft = WorkflowStep & { key: number }
let stepKey = 0
const blankStep = (): Draft => ({ key: ++stepKey, name: '', approverType: 'dept_supervisor', approverRef: '', condition: {}, mode: 'any', slaHours: 0, escalateType: 'none', escalateRef: '', allowEditQty: false })

type Props = { template: WorkflowTemplate | null; onClose: () => void; onSaved: () => void }

/** Designer for one workflow template: ordered steps with approvers, conditions, SLA and escalation, plus a route preview. */
export function TemplateDialog({ template, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [name, setName] = useState(template?.name ?? '')
  const [appliesType, setAppliesType] = useState<WorkflowTemplate['appliesType']>(template?.appliesType ?? 'any')
  const [warehouseId, setWarehouseId] = useState(template?.warehouseId || ALL)
  const [isActive, setIsActive] = useState(template?.isActive ?? true)
  const [steps, setSteps] = useState<Draft[]>(() => (template?.steps.length ? template.steps.map((step) => ({ ...step, key: ++stepKey })) : [{ ...blankStep(), name: 'หัวหน้างานอนุมัติ' }]))
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [approvers, setApprovers] = useState<ApproverUser[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [busy, setBusy] = useState(false)
  const [previewUser, setPreviewUser] = useState('')
  const [previewQty, setPreviewQty] = useState('1')
  const [preview, setPreview] = useState<PreviewStep[] | null>(null)

  useEffect(() => {
    inventoryApi.warehouses().then(({ warehouses: rows }) => setWarehouses(rows)).catch(() => undefined)
    inventoryApi.categories().then(({ categories: rows }) => setCategories(rows)).catch(() => undefined)
    workflowApi.approvers().then(({ users: rows }) => setApprovers(rows)).catch(() => undefined)
    api.users().then(({ users: rows }) => setUsers(rows.filter((row) => row.isActive))).catch(() => undefined)
  }, [])

  const update = (key: number, patch: Partial<WorkflowStep>) => setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)))
  const move = (index: number, delta: number) => setSteps((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next })

  async function save() {
    if (!name.trim()) return toast.error(t('กรุณาระบุชื่อแม่แบบ'))
    for (const [index, step] of steps.entries()) {
      if (!step.name.trim()) return toast.error(`${t('ขั้นที่')} ${index + 1}: ${t('กรุณาระบุชื่อขั้นตอน')}`)
      if ((step.approverType === 'role' || step.approverType === 'user') && !step.approverRef) return toast.error(`${t('ขั้นที่')} ${index + 1}: ${t('กรุณาเลือกผู้อนุมัติ')}`)
      if ((step.escalateType === 'role' || step.escalateType === 'user') && !step.escalateRef) return toast.error(`${t('ขั้นที่')} ${index + 1}: ${t('กรุณาเลือกผู้รับเรื่องที่ส่งต่อ')}`)
    }
    const body = {
      name: name.trim(), appliesType, warehouseId: warehouseId === ALL ? '' : warehouseId, isActive,
      steps: steps.map(({ key: _key, position: _position, ...step }) => ({ ...step, name: step.name.trim(), condition: step.condition })),
    }
    setBusy(true)
    try {
      if (!(await confirm(template ? { kind: 'update', description: template.inFlight ? t('ใบเบิกที่กำลังดำเนินการอยู่จะใช้ขั้นตอนเดิมต่อไป การแก้ไขนี้มีผลกับใบเบิกใหม่เท่านั้น') : undefined } : 'create'))) return
      if (template) await workflowApi.updateTemplate(template.id, body)
      else await workflowApi.createTemplate(body)
      toast.success(t('บันทึกแม่แบบแล้ว'))
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  async function runPreview() {
    if (!template) return
    const qty = Number(previewQty)
    if (!previewUser) return toast.error(t('กรุณาเลือกผู้เบิกตัวอย่าง'))
    if (!Number.isInteger(qty) || qty < 0) return toast.error(t('จำนวนรวมต้องเป็นจำนวนเต็มตั้งแต่ 0'))
    try {
      const result = await workflowApi.preview({ templateId: template.id, requesterId: previewUser, totalQty: qty, categoryIds: [], warehouseId: template.warehouseId || undefined })
      setPreview(result.steps)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'ดูตัวอย่างไม่สำเร็จ')) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Workflow size={19} /></div>
      <DialogTitle>{template ? t('แก้ไขแม่แบบขั้นตอนอนุมัติ') : t('สร้างแม่แบบขั้นตอนอนุมัติ')}</DialogTitle>
      <DialogDescription>{t('ใบเบิกใหม่จะใช้แม่แบบที่ตรงกับประเภทสินค้าและคลัง (เจาะจงคลังก่อน แล้วจึงตามประเภท)')}</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="tpl-name">{t('ชื่อแม่แบบ')} <span className="text-destructive">*</span></Label><Input id="tpl-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></div>
      <div className="grid gap-1.5"><Label>{t('ใช้กับสินค้า')}</Label>
        <Select value={appliesType} onValueChange={(value) => setAppliesType(value as WorkflowTemplate['appliesType'])}><SelectTrigger className="h-10 w-full"><SelectValue>{appliesType === 'any' ? t('ทุกประเภท') : appliesType === 'ppe' ? 'PPE' : t('ยารักษาโรค')}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="any">{t('ทุกประเภท')}</SelectItem><SelectItem value="ppe">PPE</SelectItem><SelectItem value="medicine">{t('ยารักษาโรค')}</SelectItem></SelectContent></Select></div>
      <div className="grid gap-1.5"><Label>{t('ใช้กับคลัง')}</Label>
        <Select value={warehouseId} onValueChange={(value) => value && setWarehouseId(value)}><SelectTrigger className="h-10 w-full"><SelectValue>{warehouseId === ALL ? t('ทุกคลัง') : warehouses.find((row) => row.id === warehouseId)?.name ?? t('ทุกคลัง')}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>{t('ทุกคลัง')}</SelectItem>{warehouses.map((row) => <SelectItem key={row.id} value={row.id}>{row.code} · {row.name}</SelectItem>)}</SelectContent></Select></div>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm sm:col-span-2"><span>{t('เปิดใช้งานแม่แบบนี้')}</span><Switch checked={isActive} onCheckedChange={setIsActive} /></label>
    </div>

    <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t('ขั้นตอนการอนุมัติ (เรียงตามลำดับ)')}</h3>
      <Button type="button" variant="outline" size="sm" className="gap-2" disabled={steps.length >= 10} onClick={() => setSteps((current) => [...current, blankStep()])}><Plus size={15} />{t('เพิ่มขั้นตอน')}</Button></div>
      <ol className="space-y-3">{steps.map((step, index) => <li key={step.key} className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-center gap-2"><Badge variant="outline" className="shrink-0">{index + 1}</Badge>
          <Input value={step.name} onChange={(event) => update(step.key, { name: event.target.value })} maxLength={80} placeholder={t('ชื่อขั้นตอน เช่น หัวหน้างานอนุมัติ')} aria-label={t('ชื่อขั้นตอน')} />
          <Button iconOnly type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} />{t('เลื่อนขึ้น')}</Button>
          <Button iconOnly type="button" variant="ghost" size="icon" disabled={index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} />{t('เลื่อนลง')}</Button>
          <Button iconOnly type="button" variant="ghost" size="icon" disabled={steps.length === 1} className="text-destructive" onClick={() => setSteps((current) => current.filter((entry) => entry.key !== step.key))}><Trash2 size={15} />{t('ลบขั้นตอน')}</Button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label>{t('ผู้อนุมัติ')}</Label>
            <Select value={step.approverType} onValueChange={(value) => update(step.key, { approverType: value as ApproverType, approverRef: '' })}><SelectTrigger className="h-10 w-full"><SelectValue>{t(typeLabel[step.approverType])}</SelectValue></SelectTrigger>
              <SelectContent>{(Object.keys(typeLabel) as ApproverType[]).map((key) => <SelectItem key={key} value={key}>{t(typeLabel[key])}</SelectItem>)}</SelectContent></Select></div>
          {step.approverType === 'role' && <div className="grid gap-1.5"><Label>{t('บทบาท')}</Label>
            <Select value={step.approverRef} onValueChange={(value) => value && update(step.key, { approverRef: value })}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t('เลือกบทบาท')}>{step.approverRef ? t(roleLabel[step.approverRef]) : undefined}</SelectValue></SelectTrigger>
              <SelectContent>{Object.keys(roleLabel).map((key) => <SelectItem key={key} value={key}>{t(roleLabel[key])}</SelectItem>)}</SelectContent></Select></div>}
          {step.approverType === 'user' && <div className="grid gap-1.5"><Label>{t('ผู้ใช้')}</Label>
            <Select value={step.approverRef} onValueChange={(value) => value && update(step.key, { approverRef: value })}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t('เลือกผู้ใช้')}>{approvers.find((row) => row.id === step.approverRef)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{approvers.map((row) => <SelectItem key={row.id} value={row.id}>{row.name} · {t(roleLabel[row.role])}</SelectItem>)}</SelectContent></Select></div>}
          <div className="grid gap-1.5"><Label>{t('รูปแบบการอนุมัติ')}</Label>
            <Select value={step.mode} onValueChange={(value) => update(step.key, { mode: value as 'any' | 'all' })}><SelectTrigger className="h-10 w-full"><SelectValue>{step.mode === 'any' ? t('คนใดคนหนึ่งอนุมัติก็พอ') : t('ต้องอนุมัติทุกคน')}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="any">{t('คนใดคนหนึ่งอนุมัติก็พอ')}</SelectItem><SelectItem value="all">{t('ต้องอนุมัติทุกคน')}</SelectItem></SelectContent></Select></div>
          <div className="grid gap-1.5"><Label>{t('เวลาตอบสนองสูงสุด (ชั่วโมง, 0 = ไม่กำหนด)')}</Label>
            <Input type="number" min={0} max={720} step={1} inputMode="numeric" value={step.slaHours} onChange={(event) => update(step.key, { slaHours: Math.max(0, Math.trunc(Number(event.target.value)) || 0) })} /></div>
          <div className="grid gap-1.5"><Label>{t('เมื่อเกินเวลา ส่งต่อให้')}</Label>
            <Select value={step.escalateType} onValueChange={(value) => update(step.key, { escalateType: value as 'none' | 'role' | 'user', escalateRef: '' })}><SelectTrigger className="h-10 w-full"><SelectValue>{step.escalateType === 'none' ? t('ไม่ส่งต่อ') : step.escalateType === 'role' ? t('ตามบทบาท') : t('ระบุคน')}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="none">{t('ไม่ส่งต่อ')}</SelectItem><SelectItem value="role">{t('ตามบทบาท')}</SelectItem><SelectItem value="user">{t('ระบุคน')}</SelectItem></SelectContent></Select></div>
          {step.escalateType !== 'none' && <div className="grid gap-1.5"><Label>{step.escalateType === 'role' ? t('บทบาทที่รับเรื่อง') : t('ผู้รับเรื่อง')}</Label>
            <Select value={step.escalateRef} onValueChange={(value) => value && update(step.key, { escalateRef: value })}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t('เลือก')}>{step.escalateType === 'role' ? (step.escalateRef ? t(roleLabel[step.escalateRef]) : undefined) : approvers.find((row) => row.id === step.escalateRef)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{step.escalateType === 'role' ? Object.keys(roleLabel).map((key) => <SelectItem key={key} value={key}>{t(roleLabel[key])}</SelectItem>) : approvers.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="grid gap-1.5"><Label>{t('ทำขั้นนี้เมื่อจำนวนรวมตั้งแต่ (ว่าง = เสมอ)')}</Label>
            <Input type="number" min={1} step={1} inputMode="numeric" value={step.condition.minTotalQty ?? ''} onChange={(event) => { const value = Math.trunc(Number(event.target.value)); update(step.key, { condition: { ...step.condition, minTotalQty: event.target.value === '' || value < 1 ? undefined : value } }) }} /></div>
          <label className="flex items-center justify-between gap-3 self-end rounded-lg border border-border px-3 py-2.5 text-sm"><span>{t('ผู้อนุมัติลดจำนวนได้')}</span><Switch checked={step.allowEditQty} onCheckedChange={(value) => update(step.key, { allowEditQty: value })} /></label>
        </div>
        {categories.length > 0 && <div className="space-y-1.5"><p className="text-sm font-medium">{t('ทำขั้นนี้เมื่อมีสินค้าในหมวด (ไม่เลือก = ทุกหมวด)')}</p>
          <div className="flex flex-wrap gap-2">{categories.map((category) => { const selected = step.condition.categoryIds?.includes(category.id) ?? false
            return <button key={category.id} type="button" aria-pressed={selected} onClick={() => { const current = step.condition.categoryIds ?? []; const next = selected ? current.filter((id) => id !== category.id) : [...current, category.id]; update(step.key, { condition: { ...step.condition, categoryIds: next.length ? next : undefined } }) }}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${selected ? 'border-primary bg-secondary text-primary' : 'border-border text-muted-foreground hover:bg-surface-subtle'}`}>{category.name}</button> })}</div></div>}
      </li>)}</ol>
    </section>

    {template && <section className="space-y-3 rounded-xl border border-dashed border-border p-3"><h3 className="text-sm font-semibold">{t('ดูตัวอย่างเส้นทางอนุมัติ (ตามที่บันทึกไว้)')}</h3>
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <Select value={previewUser} onValueChange={(value) => value && setPreviewUser(value)}><SelectTrigger className="h-10 w-full" aria-label={t('ผู้เบิกตัวอย่าง')}><SelectValue placeholder={t('เลือกผู้เบิกตัวอย่าง')}>{users.find((row) => row.id === previewUser)?.name}</SelectValue></SelectTrigger>
          <SelectContent>{users.map((row) => <SelectItem key={row.id} value={row.id}>{row.name} · {row.employeeCode}</SelectItem>)}</SelectContent></Select>
        <Input type="number" min={0} step={1} inputMode="numeric" value={previewQty} onChange={(event) => setPreviewQty(event.target.value)} aria-label={t('จำนวนรวม')} />
        <Button type="button" variant="outline" className="gap-2" onClick={() => void runPreview()}><Eye size={15} />{t('ดูตัวอย่าง')}</Button></div>
      {preview && <ol className="space-y-1.5 text-sm">{preview.map((step) => <li key={step.position} className={`flex flex-wrap items-center gap-1.5 ${step.applies ? '' : 'opacity-50'}`}>
        <span className="font-medium">{step.position}. {step.name}</span><ArrowRight size={13} className="text-muted-foreground" />
        <span className="text-muted-foreground">{step.applies ? (step.approvers.map((entry) => entry.name).join(', ') || t('ข้ามขั้นนี้')) : t('ไม่ต้องทำ (เงื่อนไขไม่ตรง)')}</span>
        {step.applies && step.note && <span className="w-full text-xs text-warning">{t(noteLabel[step.note] ?? '')}</span>}</li>)}</ol>}
    </section>}

    <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button>
      <Button type="button" disabled={busy} onClick={() => void save()} className="gap-2">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{t('บันทึก')}</Button></div>
  </DialogContent></Dialog>
}
