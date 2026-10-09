import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { publicLink } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

export function ShareLinkDialog({ kind, token, title, open, onOpenChange }: { kind: 'assessment' | 'training' | 'hiyari'; token: string; title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [qrImage, setQrImage] = useState('')
  const [copied, setCopied] = useState(false)
  const link = token ? publicLink(kind, token) : ''

  useEffect(() => {
    if (!open || !link) return
    let cancelled = false
    QRCode.toDataURL(link, { width: 280, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#123f3a', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setQrImage(url) })
      .catch(() => { if (!cancelled) toast.error(t('สร้าง QR Code ไม่สำเร็จ')) })
    return () => { cancelled = true }
  }, [link, open, t])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      toast.success(t('คัดลอกลิงก์แล้ว'))
    } catch { toast.error(t('คัดลอกลิงก์ไม่สำเร็จ')) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf5f3] text-primary"><QrCode size={20} /></div><DialogTitle>{t('ลิงก์และ QR Code')}</DialogTitle><DialogDescription>{title} · {t('เปิดได้โดยไม่ต้องเข้าสู่ระบบ')}</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="flex gap-2"><Input readOnly value={link} aria-label={t('ลิงก์สาธารณะ')} className="h-11" /><Button type="button" variant="outline" onClick={copyLink} className="h-11 shrink-0 gap-2">{copied ? <Check size={16} /> : <Copy size={16} />}{t(copied ? 'คัดลอกแล้ว' : 'คัดลอก')}</Button></div>
      <div className="grid place-items-center rounded-2xl border bg-white p-5">{qrImage ? <img src={qrImage} alt={`${t('QR Code สำหรับเปิด')}: ${title}`} className="size-56 max-w-full" /> : <div className="grid size-56 place-items-center text-sm text-muted-foreground">{t('กำลังสร้าง QR Code…')}</div>}<p className="mt-2 text-center text-sm text-muted-foreground">{t('สแกนเพื่อเปิดลิงก์สาธารณะ')}</p></div>
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('ปิด')}</Button><Button type="button" asChild className="gap-2"><a href={link} target="_blank" rel="noreferrer">{t('เปิดลิงก์')} <ExternalLink size={15} /></a></Button></div>
    </div>
  </DialogContent></Dialog>
}
