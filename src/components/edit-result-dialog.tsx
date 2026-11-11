import { useEffect, useState, type FormEvent } from 'react'
import { ImagePlus, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Assignee, Inspection, InspectionResponse } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { useConfirm } from '@/components/confirm-provider'

type Props = { item: InspectionResponse | null; onOpenChange: (open: boolean) => void; onSaved: (inspection: Inspection) => void }

/** Admin correction of one checklist result (OK / NG / N/A) including NG details, assignee, due date and "before" photos. */
export function EditResultDialog({ item, onOpenChange, onSaved }: Props) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [result, setResult] = useState('OK')
  const [issueDetails, setIssueDetails] = useState('')
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.assignees().then(({ assignees: rows }) => setAssignees(rows)).catch(() => undefined) }, [])
  useEffect(() => {
    if (!item) return
    setResult(item.result)
    setIssueDetails(item.issueDetails)
    setDueDate(item.dueDate)
    setFiles([])
    const current = assignees.find((assignee) => assignee.id === item.responsibleUserId || [assignee.name, assignee.employeeCode].some((value) => value && value.trim().toLocaleLowerCase() === item.responsible.trim().toLocaleLowerCase()))
    setResponsibleUserId(item.responsibleUserId || current?.id || '')
  }, [item, assignees])

  const isNg = result === 'NG'
  const needsBeforePhoto = isNg && !item?.photos.some((photo) => photo.type === 'before') && files.length === 0

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!item) return
    const body = new FormData()
    body.set('result', result)
    if (isNg) {
      body.set('issueDetails', issueDetails)
      body.set('responsibleUserId', responsibleUserId)
      body.set('dueDate', dueDate)
      files.forEach((file) => body.append('photos', file))
    }
    setBusy(true)
    try {
      if (!(await confirm('update'))) return
      const { inspection } = await api.updateResponseResult(item.id, body)
      toast.success(t('แก้ไขผลตรวจแล้ว'))
      onSaved(inspection)
      onOpenChange(false)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  const leavingNg = item?.result === 'NG' && !isNg
  return <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{t('แก้ไขผลตรวจ')}</DialogTitle><DialogDescription>{item && t(item.title)}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4 pt-1">
        <div className="grid gap-2"><Label htmlFor="edit-result">{t('ผลตรวจ')}</Label>
          <Select value={result} onValueChange={setResult}><SelectTrigger id="edit-result" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{(item?.choices ?? ['OK', 'NG', 'N/A']).map((choice) => <SelectItem key={choice} value={choice}>{choice}</SelectItem>)}</SelectContent></Select>
        </div>
        {leavingNg && <p className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-warning">{t('การเปลี่ยนจาก NG จะล้างรายละเอียดปัญหา ผู้รับผิดชอบ และรูปที่แนบของหัวข้อนี้')}</p>}
        {isNg && <>
          <div className="grid gap-2"><Label htmlFor="edit-issue">{t('รายละเอียดปัญหา')}</Label><Textarea id="edit-issue" value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} rows={3} maxLength={4000} required /></div>
          <div className="grid gap-2"><Label htmlFor="edit-assignee">{t('ผู้รับผิดชอบ')}</Label>
            <Select value={responsibleUserId} onValueChange={setResponsibleUserId}><SelectTrigger id="edit-assignee" className="w-full"><SelectValue placeholder={t('เลือกบัญชีผู้รับผิดชอบ')} /></SelectTrigger>
              <SelectContent>{assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.name} ({assignee.employeeCode})</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-2"><Label htmlFor="edit-due">{t('กำหนดเสร็จ')}</Label><DatePicker id="edit-due" ariaLabel={t('กำหนดเสร็จ')} value={dueDate} onChange={setDueDate} clearable placeholder={t('เลือกวัน')} /></div>
          <div className="grid gap-2"><Label htmlFor="edit-before-photos">{t('เพิ่มรูปก่อนแก้ไข')}</Label>
            <label htmlFor="edit-before-photos" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-surface-subtle p-3 text-sm text-muted-foreground hover:border-primary/50"><ImagePlus size={18} />{files.length ? `${files.length} ${t('ไฟล์')}` : t('เลือกรูปภาพ')}</label>
            <input id="edit-before-photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            {needsBeforePhoto && <p className="text-sm text-destructive">{t('หัวข้อ NG ต้องมีรูปก่อนแก้ไขอย่างน้อย 1 รูป')}</p>}
          </div>
        </>}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('ยกเลิก')}</Button>
          <Button type="submit" disabled={busy || (isNg && (!responsibleUserId || !issueDetails.trim() || needsBeforePhoto))} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('บันทึก')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
