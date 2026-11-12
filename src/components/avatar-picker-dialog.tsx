import { useRef, useState } from 'react'
import { Camera, LoaderCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AVATAR_PRESETS, PresetArt, UserAvatar } from '@/components/user-avatar'

/** Pick a cartoon avatar or upload your own photo; every choice is saved straight away. */
export function AvatarPickerDialog({ open, onOpenChange, user, onUserChange }: { open: boolean; onOpenChange: (open: boolean) => void; user: User; onUserChange: (user: User) => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function run(action: () => Promise<{ user: User }>, message: string) {
    setBusy(true)
    try { const result = await action(); onUserChange(result.user); toast.success(message) }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกรูปโปรไฟล์ไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{t('รูปโปรไฟล์')}</DialogTitle>
      <DialogDescription>{t('เลือกรูปการ์ตูน หรืออัปโหลดรูปถ่ายของคุณ (JPG, PNG, WebP ไม่เกิน 4 MB)')}</DialogDescription>
    </DialogHeader>
    <div className="flex items-center gap-4"><UserAvatar user={user} className="size-20 ring-2 ring-border" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Camera size={15} />}{t('อัปโหลดรูปถ่าย')}</Button>
        {user.avatar && <Button type="button" variant="ghost" className="gap-2 text-destructive" disabled={busy} onClick={() => void run(() => api.deleteAvatar(), t('กลับไปใช้ตัวการ์ตูนเริ่มต้นแล้ว'))}><Trash2 size={15} />{t('ใช้ค่าเริ่มต้น')}</Button>}
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('อัปโหลดรูปถ่าย')}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => api.uploadAvatar(file), t('อัปเดตรูปโปรไฟล์แล้ว')) }} />
    </div>
    <div className="grid grid-cols-4 gap-3">{AVATAR_PRESETS.map((preset) => {
      const active = user.avatar === `preset:${preset.id}`
      return <button key={preset.id} type="button" disabled={busy} aria-pressed={active} aria-label={t(preset.label)} title={t(preset.label)} onClick={() => void run(() => api.setAvatarPreset(preset.id), t('อัปเดตรูปโปรไฟล์แล้ว'))}
        className={`overflow-hidden rounded-full border-2 transition-transform hover:scale-105 disabled:opacity-60 ${active ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`}><PresetArt id={preset.id} className="aspect-square w-full" /></button>
    })}</div>
  </DialogContent></Dialog>
}
