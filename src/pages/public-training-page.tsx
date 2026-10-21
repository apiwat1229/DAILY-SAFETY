import { useEffect, useState } from 'react'
import { AlertCircle, BookOpenText, Download, ExternalLink, FileText, LoaderCircle, UserRoundCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { PublicEmployeeSuggestion, TrainingMaterial } from '@/lib/types'
import { LanguageSwitch } from '@/components/language-switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PublicTrainingPage({ token }: { token: string }) {
  const { language, t } = useI18n()
  const [material, setMaterial] = useState<(TrainingMaterial & { fileUrl: string; presentationUrl?: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [suggestions, setSuggestions] = useState<PublicEmployeeSuggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [viewSaved, setViewSaved] = useState(false)

  useEffect(() => {
    let current = true
    api.publicTrainingMaterial(token).then(({ material: row }) => { if (current) setMaterial(row) })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'ไม่พบเอกสารหรือปิดการเผยแพร่แล้ว') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token])

  useEffect(() => {
    const query = searchTerm.trim()
    if (query.length < 2) { setSuggestions([]); setSuggesting(false); return }
    let current = true
    const timer = window.setTimeout(() => {
      setSuggesting(true)
      api.publicEmployeeSuggestions(query, language).then(({ employees }) => { if (current) setSuggestions(employees) })
        .catch(() => { if (current) setSuggestions([]) })
        .finally(() => { if (current) setSuggesting(false) })
    }, 220)
    return () => { current = false; window.clearTimeout(timer) }
  }, [language, searchTerm])

  function chooseEmployee(employee: PublicEmployeeSuggestion) {
    setEmployeeName(employee.name)
    setEmployeeCode(employee.employeeCode)
    setSelectedEmployeeCode(employee.employeeCode)
    setSearchTerm('')
    setSuggestions([])
    setViewSaved(false)
  }

  async function markViewed() {
    if (savingView || viewSaved) return
    if (!employeeName.trim() || !employeeCode.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase()) {
      return toast.error(t('กรุณาเลือกชื่อและรหัสพนักงานจากรายการทะเบียน'))
    }
    setSavingView(true)
    try {
      await api.markTrainingViewed(token, { employeeCode: employeeCode.trim(), employeeName: employeeName.trim() })
      setViewSaved(true)
      toast.success(t('บันทึกการอ่านสื่อแล้ว'))
    } catch (reason) { toast.error(reason instanceof Error ? t(reason.message) : t('บันทึกไม่สำเร็จ')) }
    finally { setSavingView(false) }
  }

  const isPdf = material?.mimeType === 'application/pdf'

  return <div className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur"><div className={`mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 ${isPdf ? 'h-12 sm:h-16' : 'h-16'}`}><div className="flex items-center gap-2.5"><div className={`grid place-items-center rounded-lg bg-secondary text-primary ${isPdf ? 'size-8 sm:size-9' : 'size-9'}`}><BookOpenText size={18} /></div><div><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="text-xs text-muted-foreground">{t('สื่อการอบรม')}</p></div></div><LanguageSwitch /></div></header>
    <main className={`mx-auto px-0 py-2 sm:px-6 sm:py-8 ${isPdf ? 'max-w-none sm:max-w-6xl' : 'max-w-6xl'}`}>
      <Card className={`overflow-hidden border-border shadow-sm ${isPdf ? 'rounded-none border-x-0 sm:rounded-2xl sm:border-x' : 'rounded-2xl'}`}>
        {loading ? <CardContent className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><LoaderCircle size={20} className="animate-spin" />{t('กำลังโหลดข้อมูล…')}</CardContent>
          : error ? <CardContent className="flex min-h-64 items-center justify-center gap-3 p-6 text-center text-destructive"><AlertCircle size={20} /><p>{t(error)}</p></CardContent>
            : material && <>
              <CardHeader className={`border-b ${isPdf ? 'px-4 py-2.5 sm:p-6' : 'p-5 sm:p-7'}`}><div className="mb-1.5 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-secondary text-primary sm:size-11">{isPdf ? <FileText size={22} /> : <BookOpenText size={22} />}</div><span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">{isPdf ? 'PDF' : t('รูปภาพ')}</span></div><CardTitle as="h1" className={`page-heading ${isPdf ? 'text-lg leading-snug sm:text-2xl' : 'text-2xl leading-tight sm:text-3xl'}`}>{material.title}</CardTitle>{material.description && <CardDescription className={`${isPdf ? 'text-xs sm:text-base' : 'text-base'} whitespace-pre-wrap`}>{material.description}</CardDescription>}</CardHeader>
              <CardContent className={isPdf ? 'p-0 sm:p-4' : 'p-3 sm:p-5'}>
                {isPdf ? <div className="space-y-2 sm:space-y-3"><div className="overflow-hidden border-y bg-muted sm:rounded-xl sm:border"><iframe title={material.title} src={`${material.fileUrl}#page=1&zoom=page-width&navpanes=0`} allowFullScreen className="block h-[calc(100svh-11rem)] min-h-[360px] w-full bg-white sm:h-[76dvh] sm:min-h-[600px] sm:max-h-[920px]" /></div><div className="flex flex-col justify-center gap-2 px-3 sm:flex-row"><Button asChild variant="outline" className="h-11 w-full gap-2 sm:w-auto"><a href={`${material.fileUrl}#page=1&zoom=page-width&navpanes=0`} target="_blank" rel="noreferrer"><ExternalLink size={16} />{t('เปิดเอกสารแยกหน้าต่าง')}</a></Button>{material.presentationUrl && <Button asChild variant="outline" className="h-11 w-full gap-2 sm:w-auto"><a href={material.presentationUrl}><Download size={16} />{t('ดาวน์โหลด PowerPoint')}</a></Button>}</div></div>
                  : <a href={material.fileUrl} target="_blank" rel="noreferrer" className="block cursor-zoom-in rounded-xl bg-[#192021] p-2 text-center sm:p-4"><img src={material.fileUrl} alt={material.title} className="mx-auto max-h-[78dvh] max-w-full object-contain" /></a>}
              </CardContent>
              <CardContent className="border-t p-4 sm:p-6"><section className="mx-auto max-w-3xl space-y-4 rounded-xl border border-border bg-surface-subtle p-4 sm:p-5"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><UserRoundCheck size={19} /></div><div><h2 className="font-semibold">{t('ยืนยันว่าอ่านสื่ออบรมแล้ว')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('เลือกชื่อพนักงานจากทะเบียน เพื่อบันทึกสื่อนี้ในรายงานพนักงาน')}</p></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="training-employee-name">{t('ชื่อพนักงาน')}</Label><Input id="training-employee-name" value={employeeName} autoComplete="off" onChange={(event) => { setEmployeeName(event.target.value); setSelectedEmployeeCode(''); setViewSaved(false); setSearchTerm(event.target.value) }} placeholder={t('พิมพ์ชื่อเพื่อค้นหา')} /></div><div className="grid gap-1.5"><Label htmlFor="training-employee-code">{t('รหัสพนักงาน')}</Label><Input id="training-employee-code" value={employeeCode} autoComplete="off" className="uppercase" onChange={(event) => { setEmployeeCode(event.target.value); setSelectedEmployeeCode(''); setViewSaved(false); setSearchTerm(event.target.value) }} placeholder={t('พิมพ์รหัสเพื่อค้นหา')} /></div></div>{(suggestions.length > 0 || suggesting) && <div className="max-h-52 overflow-y-auto rounded-xl border bg-white" role="listbox" aria-label={t('รายชื่อพนักงาน')}>{suggesting && <p className="p-3 text-sm text-muted-foreground">{t('กำลังค้นหา…')}</p>}{suggestions.map((employee) => <button key={employee.employeeCode} type="button" role="option" onClick={() => chooseEmployee(employee)} className="flex min-h-11 w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-secondary/50"><span className="font-medium">{employee.name}</span><span className="text-sm text-muted-foreground">{employee.employeeCode}</span></button>)}</div>}<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{viewSaved ? t('บันทึกการอ่านสื่อแล้ว') : t('การยืนยันจะเพิ่มรายการนี้ในรายงานรายบุคคล')}</p><Button type="button" onClick={markViewed} disabled={savingView || viewSaved} className="gap-2">{savingView ? <LoaderCircle size={16} className="animate-spin" /> : <UserRoundCheck size={16} />}{t(viewSaved ? 'บันทึกแล้ว' : 'ยืนยันการอ่าน')}</Button></div></section></CardContent>
            </>}
      </Card>
      <p className="mt-5 text-center text-sm text-muted-foreground">Y.T. RUBBER · {t('สื่อการอบรม')}</p>
    </main>
  </div>
}
