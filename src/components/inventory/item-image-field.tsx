import { useEffect, useMemo, useRef } from 'react'
import { Camera, ImageOff, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { ItemThumb } from '@/components/item-thumb'

const MAX_BYTES = 8 * 1024 * 1024
type Props = {
  /** Saved image of an existing item. */
  url: string | null
  name: string
  /** Image picked for a new item (uploaded after the item is created). */
  pending: File | null
  busy: boolean
  /** Existing item: upload now. New item: hold the file. */
  onPick: (file: File) => void
  onRemove: () => void
}

/** Photo of the item: preview, take/choose a photo, remove. */
export function ItemImageField({ url, name, pending, busy, onPick, onRemove }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending])
  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl) }, [pendingUrl])
  const shown = pendingUrl ?? url

  function choose(files: FileList | null) {
    const file = files?.[0]
    if (input.current) input.current.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return void toast.error(t('รองรับไฟล์ JPG, PNG หรือ WebP เท่านั้น'))
    if (file.size > MAX_BYTES) return void toast.error(t('ไฟล์รูปใหญ่เกิน 8 MB'))
    onPick(file)
  }

  return <div className="flex items-center gap-3 sm:col-span-2">
    {pendingUrl ? <img src={pendingUrl} alt={name} className="size-24 shrink-0 rounded-lg border border-border object-cover" /> : <ItemThumb url={shown} name={name || t('รูปสินค้า')} size={96} />}
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm font-medium">{t('รูปสินค้า')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} className="gap-2">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Camera size={15} />}{shown ? t('เปลี่ยนรูป') : t('เพิ่มรูป')}</Button>
        {shown && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemove} className="gap-2 text-destructive"><ImageOff size={15} />{t('ลบรูป')}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{t('ใช้แสดงในรายการสินค้า สต็อก และตะกร้าเบิกของ')}</p>
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => choose(event.target.files)} />
  </div>
}
