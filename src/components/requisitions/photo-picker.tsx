import { useEffect, useMemo, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

const MAX_BYTES = 8 * 1024 * 1024
type Props = { files: File[]; onChange: (files: File[]) => void; max?: number; disabled?: boolean }

/** Picks up to `max` photos (camera on phones) and shows removable previews. Files stay local until the form is submitted. */
export function PhotoPicker({ files, onChange, max = 6, disabled }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  function add(list: FileList | null) {
    if (!list) return
    const accepted: File[] = []
    for (const file of Array.from(list)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error(`${file.name}: ${t('รองรับไฟล์ JPG, PNG หรือ WebP เท่านั้น')}`); continue }
      if (file.size > MAX_BYTES) { toast.error(`${file.name}: ${t('ไฟล์รูปใหญ่เกิน 8 MB')}`); continue }
      accepted.push(file)
    }
    if (files.length + accepted.length > max) toast.error(`${t('แนบรูปได้ไม่เกิน')} ${max} ${t('รูป')}`)
    onChange([...files, ...accepted].slice(0, max))
    if (input.current) input.current.value = ''
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {previews.map((url, index) => <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-border">
        <img src={url} alt={files[index].name} className="size-full object-cover" />
        <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={t('ลบรูป')} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X size={13} /></button>
      </div>)}
      {files.length < max && <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()} className="size-20 flex-col gap-1 border-dashed text-xs"><Camera size={20} />{t('เพิ่มรูป')}</Button>}
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={(event) => add(event.target.files)} />
    <p className="text-xs text-muted-foreground">{files.length}/{max} {t('รูป')} · {t('ถ่ายรูปของที่ชำรุดหรือหลักฐานประกอบได้')}</p>
  </div>
}
