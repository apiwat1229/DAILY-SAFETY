import { useEffect, useState } from 'react'
import { AlertCircle, BookOpenText, Download, ExternalLink, LoaderCircle, Presentation, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { TrainingMaterial } from '@/lib/types'
import { LanguageSwitch } from '@/components/language-switch'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'

export function PublicTrainingPage({ token }: { token: string }) {
  const { t } = useI18n()
  const [material, setMaterial] = useState<(TrainingMaterial & { fileUrl: string; presentationUrl?: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    api.publicTrainingMaterial(token).then(({ material: row }) => { if (current) setMaterial(row) })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token])

  function closeReader() {
    if (window.history.length > 1) window.history.back()
    else window.location.assign('/')
  }

  const isPdf = material?.mimeType === 'application/pdf'
  const isPptx = material?.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  const isImage = Boolean(material && !isPdf && !isPptx)
  const pptxDownloadUrl = isPptx && material ? `${material.fileUrl}?download=1` : material?.presentationUrl
  return <Dialog open onOpenChange={(open) => { if (!open) closeReader() }}>
    <DialogOverlay className="bg-slate-950/55 backdrop-blur-sm" />
    <DialogContent
      showCloseButton={false}
      className="fixed inset-0 left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground shadow-2xl ring-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[calc(100dvh-2rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:ring-1 sm:ring-foreground/10"
    >
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><BookOpenText size={18} /></div>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-sm font-semibold leading-5 sm:text-base">{loading ? t('สื่อการอบรม') : material?.title ?? t('สื่อการอบรม')}</DialogTitle>
          <DialogDescription className="truncate text-xs text-muted-foreground">{material?.description || t('Y.T. RUBBER · สื่อการอบรม')}</DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <LanguageSwitch compact />
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('ปิด')} title={t('ปิด')}>
              <X size={18} />
            </Button>
          </DialogClose>
        </div>
      </header>

      {loading ? <main className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle size={19} className="animate-spin" />{t('กำลังโหลดข้อมูล…')}</span></main>
        : error || !material ? <main className="grid min-h-0 flex-1 place-items-center p-6 text-center text-destructive"><span className="flex items-center gap-2"><AlertCircle size={20} />{t(error || 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว')}</span></main>
          : <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/30 p-2 sm:overflow-hidden sm:p-4">
            {isPdf ? <div className="flex min-h-[62dvh] flex-1 flex-col overflow-hidden rounded-lg border bg-white shadow-sm sm:min-h-0 sm:rounded-xl">
              <iframe title={material.title} src={`${material.fileUrl}#page=1&zoom=page-width&navpanes=0`} allowFullScreen className="h-[calc(100dvh-8.5rem)] min-h-[62dvh] w-full flex-1 bg-white sm:h-full sm:min-h-0" />
            </div> : isPptx ? <div className="grid min-h-0 flex-1 place-items-center rounded-lg border bg-background p-6 text-center sm:rounded-xl">
              <div className="max-w-md space-y-3">
                <div className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary text-primary"><Presentation size={24} /></div>
                <p className="text-sm text-muted-foreground">{t('กำลังเตรียมตัวอย่างสำหรับมือถือไม่สำเร็จ โปรดดาวน์โหลด PowerPoint')}</p>
                {pptxDownloadUrl && <Button asChild className="gap-2"><a href={pptxDownloadUrl}><Download size={16} />{t('ดาวน์โหลด PowerPoint')}</a></Button>}
              </div>
            </div> : isImage ? <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-lg bg-[#192021] p-2 sm:rounded-xl sm:p-4">
              <img src={material.fileUrl} alt={material.title} className="max-h-full max-w-full object-contain" />
            </div> : null}

            {(isPdf || isImage) && <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 pb-1 pt-2 sm:pt-3">
              <Button asChild variant="outline" size="sm" className="gap-2"><a href={isPdf ? `${material.fileUrl}#page=1&zoom=page-width&navpanes=0` : material.fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />{t('เปิดเอกสารแยกหน้าต่าง')}</a></Button>
              {pptxDownloadUrl && <Button asChild variant="outline" size="sm" className="gap-2"><a href={pptxDownloadUrl}><Download size={15} />{t('ดาวน์โหลด PowerPoint')}</a></Button>}
            </div>}
          </main>}
    </DialogContent>
  </Dialog>
}
