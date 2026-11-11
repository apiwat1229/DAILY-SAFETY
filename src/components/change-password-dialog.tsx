import { useState, type FormEvent } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  function close() {
    setCurrent(''); setNext(''); setConfirm('')
    onOpenChange(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (next.length < 6 || next.length > 32) return toast.error(t('รหัสผ่านต้องมี 6–32 ตัวอักษร'))
    if (next !== confirm) return toast.error(t('รหัสผ่านไม่ตรงกัน'))
    setBusy(true)
    try {
      await api.changePassword(current, next)
      toast.success(t('เปลี่ยนรหัสผ่านแล้ว'))
      close()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <div className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-primary"><KeyRound size={17} /></div>
        <DialogTitle>{t('เปลี่ยนรหัสผ่าน')}</DialogTitle>
        <DialogDescription>{t('ใช้รหัสผ่านใหม่ที่คาดเดายากสำหรับบัญชีของคุณ')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-4 pt-1">
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="current-password">{t('รหัสผ่านปัจจุบัน')}</Label><Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="new-password">{t('รหัสผ่านใหม่')}</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={6} maxLength={32} value={next} onChange={(event) => setNext(event.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="confirm-password">{t('ยืนยันรหัสผ่านใหม่')}</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} maxLength={32} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>{t('ยกเลิก')}</Button>
          <Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle className="animate-spin" size={15} />}{t('บันทึก')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
