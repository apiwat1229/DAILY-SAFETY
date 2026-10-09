import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, ClipboardCheck, LoaderCircle, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ChecklistItem, InspectionResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'

type ChecklistDraft = { title: string; description: string; choices: InspectionResult[]; order: string }
const resultChoices: InspectionResult[] = ['OK', 'NG', 'N/A']
const emptyDraft: ChecklistDraft = { title: '', description: '', choices: resultChoices, order: '' }

export function ChecklistAdminPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChecklistItem | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const refresh = useCallback(() => {
    setLoading(true)
    api.adminChecklist().then(({ items: result }) => setItems(result)).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดรายการตรวจไม่สำเร็จ'))).finally(() => setLoading(false))
  }, [t])
  useEffect(refresh, [refresh])

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(item: ChecklistItem) {
    setEditing(item)
    setDialogOpen(true)
  }

  async function toggleItem(item: ChecklistItem) {
    setBusyKey(item.key)
    try {
      await api.updateChecklistItem(item.key, { isActive: !item.isActive })
      toast.success(item.isActive ? t('ปิดใช้หัวข้อตรวจแล้ว') : t('เปิดใช้หัวข้อตรวจแล้ว'))
      refresh()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusyKey(null) }
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('การตั้งค่าแบบตรวจ')}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('แบบตรวจความปลอดภัยประจำวัน')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่ม แก้ไข จัดลำดับ และปิดใช้หัวข้อตรวจ')}</p></div>
      <Button onClick={openCreate} className="h-11 w-full gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มหัวข้อตรวจ')}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <ChecklistMetric label={t('หัวข้อที่เปิดใช้')} value={items.filter((item) => item.isActive).length} />
      <ChecklistMetric label={t('หัวข้อทั้งหมด')} value={items.length} />
      <ChecklistMetric label={t('หัวข้อที่ปิดใช้')} value={items.filter((item) => !item.isActive).length} />
    </div>

    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]">
      <CardHeader className="border-b border-[#edf0f0] px-5 py-4"><CardTitle className="text-base">{t('รายการหัวข้อตรวจ')}</CardTitle><CardDescription>{t('หัวข้อที่ปิดใช้จะไม่แสดงในแบบตรวจใหม่ แต่ข้อมูลย้อนหลังยังเก็บชื่อเดิมไว้')}</CardDescription></CardHeader>
      {items.length ? <>
        <div className="hidden overflow-x-auto md:block"><Table>
          <TableHeader><TableRow className="bg-[#fafcfc] hover:bg-[#fafcfc]"><TableHead className="w-20 pl-5">{t('ลำดับ')}</TableHead><TableHead>{t('ชื่อหัวข้อ')}</TableHead><TableHead>{t('รายละเอียด')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="pr-5 text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((item) => <TableRow key={item.key} className={!item.isActive ? 'opacity-60' : ''}>
            <TableCell className="pl-5 font-medium">{item.order}</TableCell><TableCell className="min-w-48 font-semibold">{item.title}</TableCell><TableCell className="min-w-64 whitespace-normal text-muted-foreground">{item.description || '—'}</TableCell>
            <TableCell><StatusBadge isActive={Boolean(item.isActive)} /></TableCell>
            <TableCell className="pr-5"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openEdit(item)}><Pencil size={14} /> {t('แก้ไข')}</Button><Button variant="outline" size="sm" disabled={busyKey === item.key} onClick={() => toggleItem(item)} className="h-9 gap-1.5">{busyKey === item.key ? <LoaderCircle size={14} className="animate-spin" /> : item.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />}{item.isActive ? t('ปิดใช้') : t('เปิดใช้งาน')}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        <div className="space-y-3 p-3 md:hidden">{items.map((item) => <Card key={item.key} className={`rounded-xl border-[#e8eeee] ${!item.isActive ? 'opacity-70' : ''}`}><CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5f3] text-sm font-semibold text-primary">{item.order.toString().padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{item.title}</h2><StatusBadge isActive={Boolean(item.isActive)} /></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description || '—'}</p></div></div>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-11 w-full gap-1.5" onClick={() => openEdit(item)}><Pencil size={15} /> {t('แก้ไข')}</Button><Button variant="outline" className="h-11 w-full gap-1.5" disabled={busyKey === item.key} onClick={() => toggleItem(item)}>{busyKey === item.key ? <LoaderCircle size={15} className="animate-spin" /> : item.isActive ? <Archive size={15} /> : <ArchiveRestore size={15} />}{item.isActive ? t('ปิดใช้') : t('เปิดใช้งาน')}</Button></div>
        </CardContent></Card>)}</div>
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div><ClipboardCheck className="mx-auto mb-3 text-primary" size={26} /><p className="text-base font-medium">{loading ? t('กำลังโหลดรายการตรวจ…') : t('ไม่พบหัวข้อตรวจ')}</p><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่มหัวข้อเพื่อให้แสดงในแบบตรวจใหม่')}</p></div></CardContent>}
    </Card>
    <ChecklistDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} nextOrder={items.reduce((max, current) => Math.max(max, current.order), 0) + 1} onSaved={refresh} />
  </div>
}

function ChecklistMetric({ label, value }: { label: string; value: number }) {
  return <Card className="rounded-xl border-[#e8eeee]"><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useI18n()
  return <Badge variant="outline" className={isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>{isActive ? t('เปิดใช้งาน') : t('ปิดใช้แล้ว')}</Badge>
}

function ChecklistDialog({ open, onOpenChange, item, nextOrder, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; item: ChecklistItem | null; nextOrder: number; onSaved: () => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<ChecklistDraft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setDraft(item ? { title: item.title, description: item.description, choices: item.choices || resultChoices, order: String(item.order) } : { ...emptyDraft, choices: [...resultChoices], order: String(nextOrder) })
  }, [open, item])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.choices.length) return toast.error(t('เลือกคำตอบอย่างน้อย 1 รายการ'))
    setBusy(true)
    try {
      const payload = { title: draft.title.trim(), description: draft.description.trim(), choices: draft.choices, order: Number(draft.order) }
      if (item) await api.updateChecklistItem(item.key, payload)
      else await api.createChecklistItem(payload)
      toast.success(item ? t('บันทึกการแก้ไขหัวข้อแล้ว') : t('เพิ่มหัวข้อตรวจแล้ว'))
      onOpenChange(false)
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
    <DialogHeader><div className="flex items-start gap-3 pr-8"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f3] text-primary"><ClipboardCheck size={18} /></div><div className="min-w-0"><DialogTitle>{item ? t('แก้ไขหัวข้อตรวจ') : t('เพิ่มหัวข้อตรวจ')}</DialogTitle><DialogDescription className="mt-1">{t('ชื่อและรายละเอียดจะแสดงให้หัวหน้างานเห็นตอนบันทึกแบบตรวจ')}</DialogDescription></div></div></DialogHeader>
    <form onSubmit={save} className="space-y-4 pt-1">
      <div className="grid gap-1.5"><Label htmlFor="checklist-title">{t('ชื่อหัวข้อ')}</Label><Input id="checklist-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={160} required placeholder={t('กรอกชื่อหัวข้อ')} /></div>
      <div className="grid gap-1.5"><Label htmlFor="checklist-description">{t('รายละเอียด')}</Label><Textarea id="checklist-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={1000} rows={4} placeholder={t('อธิบายสิ่งที่ต้องตรวจ')} /></div>
      <fieldset className="grid gap-2 rounded-xl border border-[#e5ebea] bg-[#fafcfc] p-3">
        <legend className="px-1 text-sm font-medium">{t('ตัวเลือกคำตอบ')}</legend>
        <p className="text-xs text-muted-foreground">{t('เลือกคำตอบที่ให้แสดงในหัวข้อนี้')}</p>
        <div className="grid grid-cols-3 gap-2">
          {resultChoices.map((choice) => <Label key={choice} htmlFor={`checklist-choice-${choice}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#e5ebea] bg-white px-3 py-2 text-sm font-medium has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-[#edf5f3]">
            <Checkbox id={`checklist-choice-${choice}`} checked={draft.choices.includes(choice)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, choices: checked === true ? resultChoices.filter((value) => current.choices.includes(value) || value === choice) : current.choices.filter((value) => value !== choice) }))} />
            <span>{choice}</span>
          </Label>)}
        </div>
      </fieldset>
      <div className="grid gap-1.5"><Label htmlFor="checklist-order">{t('ลำดับการแสดง')}</Label><Input id="checklist-order" type="number" min={1} step={1} value={draft.order} onChange={(event) => setDraft((current) => ({ ...current, order: event.target.value }))} required /></div>
      <div className="grid grid-cols-1 gap-2 pt-1 sm:flex sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 w-full sm:w-auto">{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="h-11 w-full gap-2 sm:w-auto">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button></div>
    </form>
  </DialogContent></Dialog>
}
