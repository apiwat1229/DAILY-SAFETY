import { useEffect, useState } from 'react'
import { AlertCircle, BookOpenText, ExternalLink, FileText, LoaderCircle } from 'lucide-react'
import { api } from '@/lib/api'
import type { TrainingMaterial } from '@/lib/types'
import { LanguageSwitch } from '@/components/language-switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'

export function PublicTrainingPage({ token }: { token: string }) {
  const { t } = useI18n()
  const [material, setMaterial] = useState<(TrainingMaterial & { fileUrl: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    api.publicTrainingMaterial(token).then(({ material: row }) => { if (current) setMaterial(row) })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token])

  const isPdf = material?.mimeType === 'application/pdf'

  return <div className="min-h-dvh bg-[#f3f7f7] text-foreground">
    <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-lg bg-[#e5f2ef] text-primary"><BookOpenText size={18} /></div><div><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="text-xs text-muted-foreground">{t('สื่อการอบรม')}</p></div></div><LanguageSwitch /></div></header>
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
      <Card className="overflow-hidden rounded-2xl border-[#e5eceb] shadow-sm">
        {loading ? <CardContent className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><LoaderCircle size={20} className="animate-spin" />{t('กำลังโหลดข้อมูล…')}</CardContent>
          : error ? <CardContent className="flex min-h-64 items-center justify-center gap-3 p-6 text-center text-destructive"><AlertCircle size={20} /><p>{t(error)}</p></CardContent>
            : material && <>
              <CardHeader className="border-b p-5 sm:p-7"><div className="mb-2 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#eaf4f1] text-primary">{isPdf ? <FileText size={22} /> : <BookOpenText size={22} />}</div><span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">{isPdf ? 'PDF' : t('รูปภาพ')}</span></div><CardTitle className="text-2xl leading-tight sm:text-3xl">{material.title}</CardTitle>{material.description && <CardDescription className="whitespace-pre-wrap text-base">{material.description}</CardDescription>}</CardHeader>
              <CardContent className="p-3 sm:p-5">
                {isPdf ? <div className="space-y-3"><div className="overflow-hidden rounded-xl border bg-[#303638]"><iframe title={material.title} src={material.fileUrl} className="h-[72dvh] min-h-[420px] w-full bg-white sm:h-[78dvh]" /></div><div className="flex justify-center"><Button asChild variant="outline" className="h-11 gap-2"><a href={material.fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />{t('เปิดเอกสารแยกหน้าต่าง')}</a></Button></div></div>
                  : <a href={material.fileUrl} target="_blank" rel="noreferrer" className="block cursor-zoom-in rounded-xl bg-[#192021] p-2 text-center sm:p-4"><img src={material.fileUrl} alt={material.title} className="mx-auto max-h-[78dvh] max-w-full object-contain" /></a>}
              </CardContent>
            </>}
      </Card>
      <p className="mt-5 text-center text-sm text-muted-foreground">Y.T. RUBBER · {t('สื่อการอบรม')}</p>
    </main>
  </div>
}
