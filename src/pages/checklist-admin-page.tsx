import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, ClipboardCheck, Link2, LoaderCircle, Pencil, Plus, Search } from 'lucide-react'
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
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'

type ChecklistDraft = { title: string; description: string; choices: InspectionResult[]; order: string }
const resultChoices: InspectionResult[] = ['OK', 'NG', 'N/A']
const emptyDraft: ChecklistDraft = { title: '', description: '', choices: resultChoices, order: '' }

export function ChecklistAdminPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChecklistItem | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const filteredItems = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return items
    return items.filter((item) => [item.title, item.description, item.order, item.isActive ? 'เปิดใช้งาน' : 'ปิดใช้แล้ว']
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(search)))
  }, [items, query])
  const pagination = useDataPagination(filteredItems)
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

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('การตั้งค่าแบบตรวจ')}</p><h2 className="page-heading mt-1 text-2xl font-semibold tracking-tight">{t('แบบตรวจความปลอดภัยประจำวัน')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('เพิ่ม แก้ไข จัดลำดับ และปิดใช้หัวข้อตรวจ')}</p></div>
      <div className="grid gap-2 sm:flex">
        <Button variant="outline" onClick={() => setShareOpen(true)} className="h-11 w-full gap-2 sm:w-auto"><Link2 size={16} /> {t('ลิงก์และ QR Code')}</Button>
        <Button onClick={openCreate} className="h-11 w-full gap-2 sm:w-auto"><Plus size={17} /> {t('เพิ่มหัวข้อตรวจ')}</Button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <ChecklistMetric label={t('หัวข้อที่เปิดใช้')} value={items.filter((item) => item.isActive).length} />
      <ChecklistMetric label={t('หัวข้อทั้งหมด')} value={items.length} />
      <ChecklistMetric label={t('หัวข้อที่ปิดใช้')} value={items.filter((item) => !item.isActive).length} />
    </div>

    <Card className="overflow-hidden rounded-2xl border-border">
      <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">{t('รายการหัวข้อตรวจ')}</CardTitle><CardDescription>{t('หัวข้อที่ปิดใช้จะไม่แสดงในแบบตรวจใหม่ แต่ข้อมูลย้อนหลังยังเก็บชื่อเดิมไว้')}</CardDescription></div><div className="relative w-full sm:max-w-sm"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ค้นหาหัวข้อตรวจ')} aria-label={t('ค้นหาหัวข้อตรวจ')} className="h-9 pl-9" /></div></CardHeader>
      {filteredItems.length ? <>
        <div className="hidden overflow-x-auto md:block"><Table>
          <TableHeader><TableRow className="bg-surface-subtle hover:bg-surface-subtle"><TableHead className="w-20 pl-5">{t('ลำดับ')}</TableHead><TableHead>{t('ชื่อหัวข้อ')}</TableHead><TableHead>{t('รายละเอียด')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="pr-5 text-right">{t('จัดการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((item) => <TableRow key={item.key} className={!item.isActive ? 'opacity-60' : ''}>
            <TableCell className="pl-5 font-medium">{item.order}</TableCell><TableCell className="min-w-48 font-semibold">{item.title}</TableCell><TableCell className="min-w-64 whitespace-normal text-muted-foreground">{item.description || '—'}</TableCell>
            <TableCell><StatusBadge isActive={Boolean(item.isActive)} /></TableCell>
            <TableCell className="pr-5"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openEdit(item)}><Pencil size={14} /> {t('แก้ไข')}</Button><Button variant="outline" size="sm" disabled={busyKey === item.key} onClick={() => toggleItem(item)} className="h-9 gap-1.5">{busyKey === item.key ? <LoaderCircle size={14} className="animate-spin" /> : item.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />}{item.isActive ? t('ปิดใช้') : t('เปิดใช้งาน')}</Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        <div className="space-y-3 p-3 md:hidden">{pagination.visibleItems.map((item) => <Card key={item.key} className={`rounded-xl border-border ${!item.isActive ? 'opacity-70' : ''}`}><CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-semibold text-primary">{item.order.toString().padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{item.title}</h2><StatusBadge isActive={Boolean(item.isActive)} /></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description || '—'}</p></div></div>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-11 w-full gap-1.5" onClick={() => openEdit(item)}><Pencil size={15} /> {t('แก้ไข')}</Button><Button variant="outline" className="h-11 w-full gap-1.5" disabled={busyKey === item.key} onClick={() => toggleItem(item)}>{busyKey === item.key ? <LoaderCircle size={15} className="animate-spin" /> : item.isActive ? <Archive size={15} /> : <ArchiveRestore size={15} />}{item.isActive ? t('ปิดใช้') : t('เปิดใช้งาน')}</Button></div>
        </CardContent></Card>)}</div>
        <DataTablePagination total={filteredItems.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div><ClipboardCheck className="mx-auto mb-3 text-primary" size={26} /><p className="text-base font-medium">{loading ? t('กำลังโหลดรายการตรวจ…') : items.length ? t('ไม่พบหัวข้อตรวจที่ตรงกับคำค้น') : t('ไม่พบหัวข้อตรวจ')}</p><p className="mt-1 text-sm text-muted-foreground">{items.length ? t('ปรับคำค้นหาแล้วลองอีกครั้ง') : t('เพิ่มหัวข้อเพื่อให้แสดงในแบบตรวจใหม่')}</p></div></CardContent>}
    </Card>
    <ShareLinkDialog kind="inspection" token="" title={t('แบบตรวจความปลอดภัยประจำวัน')} open={shareOpen} onOpenChange={setShareOpen} />
    <ChecklistDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} nextOrder={items.reduce((max, current) => Math.max(max, current.order), 0) + 1} onSaved={refresh} />
  </div>
}

function ChecklistMetric({ label, value }: { label: string; value: number }) {
  return <Card className="rounded-xl border-border py-0"><CardContent className="px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p></CardContent></Card>
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useI18n()
  return <Badge variant="outline" className={isActive ? 'border-success/25 bg-success/10 text-success' : 'border-info/20 bg-surface-subtle text-info'}>{isActive ? t('เปิดใช้งาน') : t('ปิดใช้แล้ว')}</Badge>
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
    <DialogHeader><div className="flex items-start gap-3 pr-8"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ClipboardCheck size={18} /></div><div className="min-w-0"><DialogTitle>{item ? t('แก้ไขหัวข้อตรวจ') : t('เพิ่มหัวข้อตรวจ')}</DialogTitle><DialogDescription className="mt-1">{t('ชื่อและรายละเอียดจะแสดงให้หัวหน้างานเห็นตอนบันทึกแบบตรวจ')}</DialogDescription></div></div></DialogHeader>
    <form onSubmit={save} className="space-y-4 pt-1">
      <div className="grid gap-1.5"><Label htmlFor="checklist-title">{t('ชื่อหัวข้อ')}</Label><Input id="checklist-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={160} required placeholder={t('กรอกชื่อหัวข้อ')} /></div>
      <div className="grid gap-1.5"><Label htmlFor="checklist-description">{t('รายละเอียด')}</Label><Textarea id="checklist-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={1000} rows={4} placeholder={t('อธิบายสิ่งที่ต้องตรวจ')} /></div>
      <fieldset className="grid gap-2 rounded-xl border border-border bg-surface-subtle p-3">
        <legend className="px-1 text-sm font-medium">{t('ตัวเลือกคำตอบ')}</legend>
        <p className="text-xs text-muted-foreground">{t('เลือกคำตอบที่ให้แสดงในหัวข้อนี้')}</p>
        <div className="grid grid-cols-3 gap-2">
          {resultChoices.map((choice) => <Label key={choice} htmlFor={`checklist-choice-${choice}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-secondary">
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
