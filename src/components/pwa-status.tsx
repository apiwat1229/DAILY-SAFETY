import { useCallback, useEffect, useState } from 'react'
import { CloudUpload, Download, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { QUEUE_EVENT, discardFailed, flushQueue, queueStatus } from '@/lib/offline-queue'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** Offline indicator, pending-upload banner and "install app" prompt. Mounted once at the app root. */
export function PwaStatus() {
  const { t } = useI18n()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [queue, setQueue] = useState({ pending: 0, failed: 0 })
  const [sending, setSending] = useState(false)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(() => { try { return sessionStorage.getItem('pwa-install-dismissed') === '1' } catch { return false } })

  const refresh = useCallback(() => { void queueStatus().then(setQueue) }, [])

  const send = useCallback(async (silent = false) => {
    setSending(true)
    try {
      const { sent } = await flushQueue()
      if (sent > 0) toast.success(`${t('ส่งแบบตรวจที่ค้างอยู่แล้ว')} ${sent} ${t('รายการ')}`)
      else if (!silent) toast.info(t('ยังส่งไม่ได้ กรุณาตรวจสอบสัญญาณหรือเข้าสู่ระบบอีกครั้ง'))
    } finally { setSending(false); refresh() }
  }, [refresh, t])

  useEffect(() => {
    refresh()
    void send(true)
    const goOnline = () => { setOnline(true); void send(true) }
    const goOffline = () => setOnline(false)
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallPromptEvent) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener(QUEUE_EVENT, refresh)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    const timer = window.setInterval(() => { void send(true) }, 30_000)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener(QUEUE_EVENT, refresh)
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.clearInterval(timer)
    }
  }, [refresh, send])

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice.catch(() => undefined)
    setInstallEvent(null)
  }

  function dismissInstall() {
    setInstallDismissed(true)
    try { sessionStorage.setItem('pwa-install-dismissed', '1') } catch { /* storage unavailable */ }
  }

  const showBanner = !online || queue.pending > 0 || queue.failed > 0
  return <>
    {showBanner && <div role="status" className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(.5rem,env(safe-area-inset-top))]">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-card px-4 py-2 text-sm shadow-lg">
        {!online && <span className="inline-flex items-center gap-1.5 font-medium text-warning"><WifiOff size={15} />{t('ออฟไลน์ · ข้อมูลที่บันทึกจะเก็บไว้ในเครื่อง')}</span>}
        {queue.pending > 0 && <span className="inline-flex items-center gap-1.5"><CloudUpload size={15} className="text-primary" />{t('รอส่ง')} {queue.pending} {t('รายการ')}</span>}
        {queue.pending > 0 && online && <Button variant="outline" size="sm" disabled={sending} onClick={() => void send()}>{t('ส่งตอนนี้')}</Button>}
        {queue.failed > 0 && <span className="inline-flex items-center gap-2 text-destructive">{t('ส่งไม่สำเร็จ')} {queue.failed} {t('รายการ')}<Button variant="ghost" size="sm" onClick={() => void discardFailed()}>{t('ลบรายการที่ส่งไม่สำเร็จ')}</Button></span>}
      </div>
    </div>}
    {installEvent && !installDismissed && <div className="fixed inset-x-3 bottom-24 z-[55] flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm md:bottom-6">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Download size={18} /></div>
      <p className="min-w-0 flex-1 text-sm">{t('ติดตั้งแอปลงหน้าจอหลักเพื่อเปิดเร็วและใช้งานตอนสัญญาณอ่อน')}</p>
      <Button size="sm" onClick={() => void install()}>{t('ติดตั้ง')}</Button>
      <Button variant="ghost" size="icon" aria-label={t('ภายหลัง')} onClick={dismissInstall}><X size={16} /></Button>
    </div>}
  </>
}
