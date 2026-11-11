import { useCallback, useEffect, useState } from 'react'
import { BellRing, Pencil, Plus, Save, Trash2, UserRoundCheck, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/api'
import { workflowApi } from '@/lib/requisition-api'
import type { Delegation, WorkflowTemplate } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { useConfirm } from '@/components/confirm-provider'
import { DepartmentSupervisorsCard } from '@/components/requisitions/department-supervisors-card'
import { TemplateDialog } from '@/components/requisitions/template-dialog'

const appliesLabel: Record<WorkflowTemplate['appliesType'], string> = { any: 'ทุกประเภท', ppe: 'PPE', medicine: 'ยารักษาโรค' }

/** Admin: workflow templates, department supervisors, delegations and the "not collected" expiry. */
export function WorkflowAdminPage() {
  const { t, language } = useI18n()
  const confirm = useConfirm()
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [editor, setEditor] = useState<{ template: WorkflowTemplate | null; key: string } | null>(null)
  const [days, setDays] = useState('14')
  const [savedDays, setSavedDays] = useState('14')

  const reload = useCallback(async () => {
    try {
      const [tpl, del, settings] = await Promise.all([workflowApi.templates(), workflowApi.delegations(), workflowApi.settings()])
      setTemplates(tpl.templates); setDelegations(del.delegations)
      setDays(String(settings.expireDays)); setSavedDays(String(settings.expireDays))
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'โหลดการตั้งค่าไม่สำเร็จ')) }
  }, [t])
  useEffect(() => { void reload() }, [reload])
  const pagination = useDataPagination(templates)

  async function remove(template: WorkflowTemplate) {
    if (!(await confirm({ kind: 'danger', title: t('ลบแม่แบบขั้นตอนอนุมัติ'), description: template.name, confirmLabel: t('ลบ') }))) return
    try { await workflowApi.deleteTemplate(template.id); toast.success(t('ลบแม่แบบแล้ว')); await reload() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบไม่สำเร็จ')) }
  }

  async function saveDays() {
    const value = Number(days)
    if (!Number.isInteger(value) || value < 1 || value > 365) return toast.error(t('จำนวนวันต้องเป็นจำนวนเต็ม 1–365'))
    if (!(await confirm('update'))) return
    try { await workflowApi.saveSettings(value); toast.success(t('บันทึกการตั้งค่าแล้ว')); await reload() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
  }

  async function removeDelegation(delegation: Delegation) {
    if (!(await confirm({ kind: 'danger', title: t('ยกเลิกการมอบสิทธิ์'), description: `${delegation.fromName} → ${delegation.toName}`, confirmLabel: t('ยกเลิกการมอบสิทธิ์') }))) return
    try { await workflowApi.removeDelegation(delegation.id); await reload() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ')) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('การเบิกของ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('ตั้งค่าขั้นอนุมัติ')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('กำหนดว่าใบเบิกต้องผ่านใครบ้าง ใช้เงื่อนไขอะไร และเกินเวลาแล้วส่งต่อใคร')}</p></div>
      <Button type="button" className="gap-2" onClick={() => setEditor({ template: null, key: `new-${Date.now()}` })}><Plus size={16} />{t('สร้างแม่แบบ')}</Button>
    </div>

    <Card className="overflow-hidden rounded-2xl border-border">
      <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><Workflow size={17} className="text-primary" />{t('แม่แบบขั้นตอนอนุมัติ')}</CardTitle>
        <CardDescription>{t('แก้ไขแม่แบบมีผลกับใบเบิกใหม่เท่านั้น ใบที่กำลังดำเนินการใช้ขั้นตอนเดิมต่อไป')}</CardDescription></CardHeader>
      {templates.length ? <>
        <Table>
          <TableHeader><TableRow><TableHead>{t('ชื่อ')}</TableHead><TableHead>{t('ใช้กับ')}</TableHead><TableHead>{t('ขั้นตอน')}</TableHead><TableHead>{t('เวอร์ชัน')}</TableHead><TableHead>{t('กำลังดำเนินการ')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((template) => <TableRow key={template.id} data-inactive={!template.isActive || undefined}>
            <TableCell className="font-medium">{template.name}</TableCell>
            <TableCell>{t(appliesLabel[template.appliesType])}{template.warehouseId ? ` · ${t('เฉพาะคลัง')}` : ''}</TableCell>
            <TableCell className="whitespace-normal text-sm text-muted-foreground">{template.steps.map((step) => step.name).join(' → ')}</TableCell>
            <TableCell className="tabular-nums">v{template.version}</TableCell>
            <TableCell className="tabular-nums">{template.inFlight}</TableCell>
            <TableCell><Badge variant="outline" className={template.isActive ? 'border-success/25 bg-success/10 text-success' : 'text-muted-foreground'}>{template.isActive ? t('ใช้งาน') : t('ปิดใช้งาน')}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1"><Button iconOnly variant="ghost" size="sm" onClick={() => setEditor({ template, key: `${template.id}-${template.version}` })}><Pencil size={15} />{t('แก้ไข')}</Button>
              <Button iconOnly variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(template)}><Trash2 size={15} />{t('ลบ')}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <DataTablePagination total={templates.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="p-8 text-center text-sm text-muted-foreground">{t('ยังไม่มีแม่แบบ กด "สร้างแม่แบบ" เพื่อเริ่มต้น')}</CardContent>}
    </Card>

    <DepartmentSupervisorsCard />

    <Card className="rounded-2xl border-border">
      <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><UserRoundCheck size={17} className="text-primary" />{t('การมอบสิทธิ์อนุมัติแทน')}</CardTitle><CardDescription>{t('หัวหน้างานมอบสิทธิ์เองได้ที่หน้า "รออนุมัติ" ที่นี่ผู้ดูแลระบบดูภาพรวมและยกเลิกได้')}</CardDescription></CardHeader>
      <CardContent className="px-5 pb-5">{delegations.length === 0 ? <p className="text-sm text-muted-foreground">{t('ยังไม่มีการมอบสิทธิ์')}</p> : <ul className="divide-y divide-border-subtle rounded-xl border border-border">
        {delegations.map((delegation) => <li key={delegation.id} className="flex items-center gap-2 p-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate font-medium">{delegation.fromName} → {delegation.toName}</p><p className="text-xs text-muted-foreground">{formatDate(delegation.fromDate, language)} – {formatDate(delegation.toDate, language)}</p></div>
          <Button iconOnly type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => void removeDelegation(delegation)}><Trash2 size={15} />{t('ยกเลิกการมอบสิทธิ์')}</Button></li>)}</ul>}</CardContent>
    </Card>

    <Card className="rounded-2xl border-border">
      <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><BellRing size={17} className="text-primary" />{t('ใบเบิกที่ไม่มารับของ')}</CardTitle><CardDescription>{t('อนุมัติแล้วแต่ไม่มารับของภายในจำนวนวันนี้ ระบบจะปล่อยสต็อกที่จองไว้คืน')}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-2 px-5 pb-5 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5 sm:max-w-xs"><Label htmlFor="expire-days">{t('จำนวนวัน')}</Label><Input id="expire-days" type="number" min={1} max={365} step={1} inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} /></div>
        <Button iconOnly variant="outline" disabled={days === savedDays} onClick={() => void saveDays()}><Save size={16} />{t('บันทึก')}</Button>
      </CardContent>
    </Card>

    {editor && <TemplateDialog key={editor.key} template={editor.template} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void reload() }} />}
  </div>
}
