import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { CircleCheck, Send, Save, TriangleAlert } from 'lucide-react'

export type ConfirmKind = 'create' | 'update' | 'submit' | 'danger'
export type ConfirmOptions = { kind?: ConfirmKind; title?: string; description?: string; confirmLabel?: string }
type Confirm = (options?: ConfirmKind | ConfirmOptions) => Promise<boolean>

const defaults: Record<ConfirmKind, { title: string; description: string; confirmLabel: string }> = {
  create: { title: 'ยืนยันการเพิ่มข้อมูล', description: 'ตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน ระบบจะบันทึกรายการนี้ทันที', confirmLabel: 'ยืนยันเพิ่ม' },
  update: { title: 'ยืนยันการบันทึกการแก้ไข', description: 'การเปลี่ยนแปลงนี้จะมีผลทันทีและถูกบันทึกในประวัติการใช้งาน', confirmLabel: 'ยืนยันบันทึก' },
  submit: { title: 'ยืนยันการส่งข้อมูล', description: 'ตรวจสอบข้อมูลก่อนส่ง เมื่อส่งแล้วจะแก้ไขเองไม่ได้', confirmLabel: 'ยืนยันส่ง' },
  danger: { title: 'ยืนยันการดำเนินการ', description: 'การดำเนินการนี้อาจย้อนกลับไม่ได้', confirmLabel: 'ยืนยัน' },
}

const ConfirmContext = createContext<Confirm | null>(null)

/** Mounts one shared confirmation dialog. Use `const confirm = useConfirm(); if (!(await confirm('update'))) return`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [state, setState] = useState<{ kind: ConfirmKind; title: string; description: string; confirmLabel: string } | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((input) => {
    const options: ConfirmOptions = typeof input === 'string' ? { kind: input } : input ?? {}
    const kind = options.kind ?? 'update'
    const base = defaults[kind]
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setState({ kind, title: options.title ?? base.title, description: options.description ?? base.description, confirmLabel: options.confirmLabel ?? base.confirmLabel })
    })
  }, [])

  function settle(value: boolean) {
    resolver.current?.(value)
    resolver.current = null
    setState(null)
  }

  const Icon = state?.kind === 'danger' ? TriangleAlert : state?.kind === 'submit' ? Send : state?.kind === 'create' ? CircleCheck : Save
  const tone = state?.kind === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-primary'
  const value = useMemo(() => confirm, [confirm])

  return <ConfirmContext.Provider value={value}>
    {children}
    <AlertDialog open={Boolean(state)} onOpenChange={(open) => { if (!open) settle(false) }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="items-center text-center sm:items-start sm:text-left">
          <div className={`mb-1 grid size-12 place-items-center rounded-2xl ${tone}`}><Icon size={22} /></div>
          <AlertDialogTitle>{state ? t(state.title) : ''}</AlertDialogTitle>
          <AlertDialogDescription>{state ? t(state.description) : ''}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button type="button" variant="outline">{t('ยกเลิก')}</Button></AlertDialogCancel>
          <AlertDialogAction asChild><Button type="button" variant={state?.kind === 'danger' ? 'destructive' : 'default'} onClick={(event) => { event.preventDefault(); settle(true) }}>{state ? t(state.confirmLabel) : ''}</Button></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </ConfirmContext.Provider>
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider')
  return context
}
