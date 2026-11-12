import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Eye, EyeOff, FileQuestion, LoaderCircle, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Assessment } from '@/lib/types'
import { AssessmentEditorDialog } from '@/components/assessment-editor-dialog'
import { ShareLinkDialog } from '@/components/share-link-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmActionDialog } from '@/components/confirm-action-dialog'
import { useI18n } from '@/lib/i18n'
import { DataTablePagination, useDataPagination } from '@/components/data-table-pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useConfirm } from '@/components/confirm-provider'

export function AssessmentsPage() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{ assessment: Assessment | null; key: string } | null>(null)
  const [share, setShare] = useState<Assessment | null>(null)
  const [busyId, setBusyId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pagination = useDataPagination(assessments)

  const refresh = useCallback(() => {
    setLoading(true)
    api.assessments().then(({ assessments: rows }) => setAssessments(rows)).catch((error) => toast.error(t(error instanceof Error ? error.message : 'โหลดแบบประเมินไม่สำเร็จ'))).finally(() => setLoading(false))
  }, [t])
  useEffect(refresh, [refresh])

  async function togglePublished(assessment: Assessment) {
    setBusyId(assessment.id)
    try {
      if (!(await confirm('update'))) return
      const { assessment: updated } = await api.updateAssessment(assessment.id, {
        title: assessment.title, description: assessment.description, instructions: assessment.instructions,
        isPublished: !assessment.isPublished, allowMultipleAttempts: assessment.allowMultipleAttempts,
        questions: assessment.questions,
      })
      toast.success(t(updated.isPublished ? 'เผยแพร่แบบประเมินแล้ว' : 'ปิดรับคำตอบแล้ว'))
      refresh()
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusyId('') }
  }

  async function remove() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try { await api.deleteAssessment(deleteTarget.id, deleteTarget.submissionCount > 0); toast.success(t('ลบแบบประเมินแล้ว')); setDeleteTarget(null); refresh() }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'ลบแบบประเมินไม่สำเร็จ')) }
    finally { setDeleting(false) }
  }

  return <div className="page-stack">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">{t('การประเมิน')}</p><h2 className="page-heading mt-1 font-semibold tracking-tight">{t('จัดการแบบประเมิน')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('สร้างข้อสอบ จัดการคำถาม และแชร์ลิงก์หรือ QR Code ให้พนักงาน')}</p></div><Button iconOnly onClick={() => setEditor({ assessment: null, key: 'new' })} className="h-11 w-full gap-2 sm:w-auto"><Plus size={17} /> {t('สร้างแบบประเมิน')}</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label={t('แบบประเมินทั้งหมด')} count={assessments.length} icon={ClipboardList} /><Metric label={t('เผยแพร่แล้ว')} count={assessments.filter((assessment) => assessment.isPublished).length} icon={QrCode} /><Metric label={t('คำตอบที่ได้รับ')} count={assessments.reduce((total, assessment) => total + assessment.submissionCount, 0)} icon={FileQuestion} /></div>
    <Card className="overflow-hidden rounded-2xl border-border"><CardHeader className="border-b border-border-subtle px-5 py-4"><CardTitle>{t('แบบประเมินขององค์กร')}</CardTitle><CardDescription>{t('บันทึกแบบร่างก่อน แล้วเผยแพร่เมื่อตรวจสอบข้อสอบเรียบร้อย')}</CardDescription></CardHeader>
      {assessments.length ? <>
        <div className="overflow-x-auto"><Table className="min-w-[760px]">
          <TableHeader><TableRow><TableHead className="w-12 text-center">{t('ลำดับ')}</TableHead><TableHead>{t('ชื่อแบบประเมิน')}</TableHead><TableHead>{t('รายละเอียด')}</TableHead><TableHead>{t('สถานะ')}</TableHead><TableHead className="text-right">{t('การทำรายการ')}</TableHead></TableRow></TableHeader>
          <TableBody>{pagination.visibleItems.map((assessment, index) => <TableRow key={assessment.id}><TableCell className="text-center text-muted-foreground tabular-nums">{(pagination.page - 1) * pagination.pageSize + index + 1}</TableCell>
            <TableCell className="max-w-[260px] font-medium whitespace-normal">{assessment.title}</TableCell>
            <TableCell className="min-w-[300px] whitespace-normal"><p>{assessment.description || t('ไม่มีคำอธิบาย')}</p><p className="mt-1 text-xs text-muted-foreground">{assessment.questionCount} {t('ข้อ')} · {assessment.submissionCount} {t('คำตอบ')} · {t(assessment.allowMultipleAttempts ? 'อนุญาตให้ทำซ้ำ' : 'ตอบได้ครั้งเดียวต่อรหัสพนักงาน')}</p></TableCell>
            <TableCell><Badge variant="outline" className={assessment.isPublished ? 'border-success/25 bg-success/10 text-success' : 'border-info/20 bg-surface-subtle text-info'}>{t(assessment.isPublished ? 'เผยแพร่' : 'แบบร่าง')}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1"><Button iconOnly variant="ghost" size="icon" onClick={() => setEditor({ assessment, key: assessment.id })} className="size-9 text-muted-foreground hover:text-foreground" aria-label={t('แก้ไข')} title={t('แก้ไข')}><Pencil size={16} /></Button><Button iconOnly variant="ghost" size="icon" disabled={busyId === assessment.id || assessment.questionCount === 0 && !assessment.isPublished} onClick={() => togglePublished(assessment)} className="size-9 text-muted-foreground hover:text-foreground" aria-label={t(assessment.isPublished ? 'ปิดรับ' : 'เผยแพร่')} title={t(assessment.isPublished ? 'ปิดรับ' : 'เผยแพร่')}>{busyId === assessment.id ? <LoaderCircle size={16} className="animate-spin" /> : assessment.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}</Button>{assessment.isPublished && <Button iconOnly variant="ghost" size="icon" onClick={() => setShare(assessment)} className="size-9 text-muted-foreground hover:text-foreground" aria-label={t('ลิงก์ / QR')} title={t('ลิงก์ / QR')}><QrCode size={16} /></Button>}<Button iconOnly variant="ghost" size="icon" onClick={() => setDeleteTarget(assessment)} className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={t('ลบแบบประเมิน')} title={t('ลบแบบประเมิน')}><Trash2 size={16} /></Button></div></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        <DataTablePagination total={assessments.length} page={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} t={t} />
      </> : <CardContent className="grid min-h-48 place-items-center text-center"><div><p className="font-medium">{loading ? t('กำลังโหลดแบบประเมิน…') : t('ยังไม่มีแบบประเมิน')}</p><p className="mt-1 text-sm text-muted-foreground">{t('สร้างแบบประเมินแรกเพื่อเริ่มเก็บคำตอบ')}</p></div></CardContent>}
    </Card>
    <AssessmentEditorDialog key={editor?.key || 'closed'} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh() }} />
    {share && <ShareLinkDialog kind="assessment" token={share.token} title={share.title} open onOpenChange={(open) => !open && setShare(null)} onRotate={async () => (await api.rotatePublicToken('assessments', share.id)).token} onRotated={() => refresh()} />}
    <ConfirmActionDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }} title={t('ลบแบบประเมิน')} description={deleteTarget ? `“${deleteTarget.title}” · ${deleteTarget.submissionCount > 0 ? `${t('มีผู้ตอบแล้ว')} ${deleteTarget.submissionCount} ${t('ราย ผลคำตอบทั้งหมดจะถูกลบด้วย แนะนำให้ปิดเผยแพร่แทน')}` : t('ยังไม่มีผู้ตอบ')} · ${t('การลบนี้ไม่สามารถย้อนกลับได้')}` : ''} confirmLabel={t('ลบ')} cancelLabel={t('ยกเลิก')} pending={deleting} onConfirm={remove} />
  </div>
}

function Metric({ label, count, icon: Icon }: { label: string; count: number; icon: typeof ClipboardList }) {
  return <Card className="py-0"><CardContent className="flex items-center justify-between px-3 py-2"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{count.toLocaleString()}</p></div><div className="grid size-8 place-items-center rounded-lg bg-secondary text-primary"><Icon size={16} /></div></CardContent></Card>
}
