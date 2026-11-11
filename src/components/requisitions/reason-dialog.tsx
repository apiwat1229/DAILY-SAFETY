import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  open: boolean
  title: string
  description?: string
  label?: string
  required?: boolean
  confirmLabel: string
  danger?: boolean
  onClose: () => void
  /** Resolve to close the dialog; reject (throw) to keep it open (the caller shows the error). */
  onSubmit: (reason: string) => Promise<void>
}

/** Small dialog that collects a reason (or comment) before an action such as reject, cancel or close. */
export function ReasonDialog({ open, title, description, label, required = true, confirmLabel, danger = false, onClose, onSubmit }: Props) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (required && !reason.trim()) { setError(t('กรุณาระบุเหตุผล')); return }
    setBusy(true)
    try { await onSubmit(reason.trim()); setReason(''); setError('') } catch { /* the caller already reported the error */ }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) { setError(''); onClose() } }}><DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
    <div className="grid gap-1.5"><Label htmlFor="reason-text">{label ?? t('เหตุผล')}{required && <span className="text-destructive"> *</span>}</Label>
      <Textarea id="reason-text" value={reason} onChange={(event) => { setReason(event.target.value); setError('') }} rows={3} maxLength={500} aria-invalid={Boolean(error) || undefined} />
      {error && <p className="text-xs text-destructive">{error}</p>}</div>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('ยกเลิก')}</Button>
      <Button type="button" variant={danger ? 'destructive' : 'default'} disabled={busy} onClick={submit} className="gap-2">{busy && <LoaderCircle size={15} className="animate-spin" />}{confirmLabel}</Button></div>
  </DialogContent></Dialog>
}
