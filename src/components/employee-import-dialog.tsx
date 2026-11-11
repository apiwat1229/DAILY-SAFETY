import { useState, type FormEvent } from 'react'
import { FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }

export function EmployeeImportDialog({ open, onOpenChange, onImported }: Props) {
  const { t } = useI18n()
  const [thai, setThai] = useState<File | null>(null)
  const [english, setEnglish] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  function close() { setThai(null); setEnglish(null); onOpenChange(false) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!thai && !english) return toast.error(t('กรุณาเลือกไฟล์ Excel อย่างน้อย 1 ไฟล์'))
    const body = new FormData()
    if (thai) body.set('thai', thai)
    if (english) body.set('english', english)
    setBusy(true)
    try {
      const result = await api.importEmployees(body)
      toast.success(`${t('นำเข้าสำเร็จ')} ${result.imported} ${t('คน')} (${t('เพิ่มใหม่')} ${result.created}, ${t('อัปเดต')} ${result.updated})`)
      onImported()
      close()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'นำเข้าไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) close() }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><FileSpreadsheet size={18} /></div>
        <DialogTitle>{t('นำเข้ารายชื่อพนักงานจาก Excel')}</DialogTitle>
        <DialogDescription>{t('ไฟล์ต้องมีหัวคอลัมน์ Code, Name, Position, Department ถ้าเลือกทั้งสองภาษา รหัสพนักงานต้องตรงกัน ข้อมูลที่ว่างจะไม่ทับข้อมูลเดิม')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 pt-1">
        <div className="grid gap-1.5"><Label htmlFor="roster-th">{t('ไฟล์ภาษาไทย (.xlsx)')}</Label><Input id="roster-th" type="file" accept=".xlsx" className="h-auto py-1.5" onChange={(event) => setThai(event.target.files?.[0] ?? null)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="roster-en">{t('ไฟล์ภาษาอังกฤษ (.xlsx)')}</Label><Input id="roster-en" type="file" accept=".xlsx" className="h-auto py-1.5" onChange={(event) => setEnglish(event.target.files?.[0] ?? null)} /></div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>{t('ยกเลิก')}</Button>
          <Button type="submit" disabled={busy || (!thai && !english)} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{t('นำเข้า')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
