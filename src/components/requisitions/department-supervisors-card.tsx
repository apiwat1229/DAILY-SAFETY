import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { workflowApi } from '@/lib/requisition-api'
import type { ApproverUser, DepartmentRow } from '@/lib/requisition-types'
import { useI18n } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/confirm-provider'

/** Who approves for each department (from the employee directory), with optional backups. */
export function DepartmentSupervisorsCard() {
  const { t } = useI18n()
  const [rows, setRows] = useState<DepartmentRow[]>([])
  const [editing, setEditing] = useState<DepartmentRow | null>(null)

  const reload = useCallback(() => {
    workflowApi.departments().then(({ departments }) => setRows(departments))
      .catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดแผนกไม่สำเร็จ')))
  }, [t])
  useEffect(reload, [reload])

  return <Card className="rounded-2xl border-border">
    <CardHeader className="px-5 pt-4"><CardTitle className="flex items-center gap-2 text-base"><UsersRound size={17} className="text-primary" />{t('หัวหน้างานตามแผนก')}</CardTitle>
      <CardDescription>{t('ใบเบิกของพนักงานแต่ละแผนกจะส่งให้หัวหน้างานของแผนกนั้น แผนกที่ยังไม่กำหนดจะส่งให้ผู้ดูแลระบบ')}</CardDescription></CardHeader>
    <CardContent className="px-5 pb-5">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('ยังไม่มีข้อมูลแผนกในรายชื่อพนักงาน')}</p> : <ul className="divide-y divide-border-subtle rounded-xl border border-border">
        {rows.map((row) => <li key={row.department} className="flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-0 flex-1"><p className="font-medium">{row.department}</p>
            <div className="mt-1 flex flex-wrap gap-1">{row.entries.length ? row.entries.map((entry) => <Badge key={entry.userId} variant="outline" className={entry.isBackup ? 'text-muted-foreground' : 'border-primary/25 bg-secondary text-primary'}>{entry.name}{entry.isBackup ? ` (${t('สำรอง')})` : ''}</Badge>) : <span className="text-xs text-warning">{t('ยังไม่กำหนด — ส่งให้ผู้ดูแลระบบ')}</span>}</div></div>
          <Button iconOnly type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}><Pencil size={15} />{t('กำหนดหัวหน้างาน')}</Button>
        </li>)}</ul>}
    </CardContent>
    {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
  </Card>
}

function EditDialog({ row, onClose, onSaved }: { row: DepartmentRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [entries, setEntries] = useState(row.entries.map((entry) => ({ userId: entry.userId, isBackup: entry.isBackup })))
  const [users, setUsers] = useState<ApproverUser[]>([])
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { workflowApi.approvers().then(({ users: rows }) => setUsers(rows)).catch(() => undefined) }, [])
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? row.entries.find((entry) => entry.userId === id)?.name ?? id
  const available = users.filter((user) => !entries.some((entry) => entry.userId === user.id))

  async function save() {
    setBusy(true)
    try {
      if (!(await confirm('update'))) return
      await workflowApi.setSupervisors(row.department, entries)
      toast.success(t('บันทึกหัวหน้างานของแผนกแล้ว'))
      onSaved()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle>{t('หัวหน้างานแผนก')} {row.department}</DialogTitle><DialogDescription>{t('คนสำรองจะได้รับเรื่องเมื่อไม่มีหัวหน้าหลักที่เปิดใช้งาน')}</DialogDescription></DialogHeader>
    <ul className="space-y-2">{entries.map((entry) => <li key={entry.userId} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{nameOf(entry.userId)}</span>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">{t('สำรอง')}<Switch checked={entry.isBackup} onCheckedChange={(value) => setEntries((current) => current.map((item) => (item.userId === entry.userId ? { ...item, isBackup: value } : item)))} /></label>
      <Button iconOnly type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => setEntries((current) => current.filter((item) => item.userId !== entry.userId))}><Trash2 size={15} />{t('นำออก')}</Button></li>)}
      {entries.length === 0 && <li className="text-sm text-muted-foreground">{t('ยังไม่มีหัวหน้างาน')}</li>}</ul>
    <div className="flex gap-2"><Select value={adding} onValueChange={(value) => value && setAdding(value)}><SelectTrigger className="h-10 w-full" aria-label={t('เพิ่มหัวหน้างาน')}><SelectValue placeholder={t('เลือกผู้ใช้เพื่อเพิ่ม')} /></SelectTrigger>
      <SelectContent>{available.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} · {user.employeeCode}</SelectItem>)}</SelectContent></Select>
      <Button type="button" variant="outline" disabled={!adding} className="shrink-0 gap-2" onClick={() => { setEntries((current) => [...current, { userId: adding, isBackup: current.length > 0 }]); setAdding('') }}><Plus size={15} />{t('เพิ่ม')}</Button></div>
    <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button><Button type="button" disabled={busy} onClick={() => void save()}>{t('บันทึก')}</Button></div>
  </DialogContent></Dialog>
}
