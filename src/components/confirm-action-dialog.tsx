import { LoaderCircle } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  pending: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmActionDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel, pending, onConfirm }: Props) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel asChild><Button type="button" variant="outline" disabled={pending}>{cancelLabel}</Button></AlertDialogCancel>
        <AlertDialogAction asChild>
          <Button type="button" variant="destructive" disabled={pending} onClick={(event) => { event.preventDefault(); void onConfirm() }}>
            {pending && <LoaderCircle size={15} className="animate-spin" />}{confirmLabel}
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
