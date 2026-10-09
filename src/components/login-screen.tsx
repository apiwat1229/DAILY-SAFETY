import { useState } from 'react'
import { ArrowRight, ClipboardCheck, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n'
import { LanguageSwitch } from '@/components/language-switch'

type Props = { onLogin: (user: User) => void }

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const { user } = await api.login(username, password)
      onLogin(user)
      toast.success(`${t('ยินดีต้อนรับ')} ${user.name}`)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f1f6f5] lg:grid lg:grid-cols-[1.04fr_.96fr]">
      <section className="relative hidden overflow-hidden bg-[#123538] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute inset-0 opacity-30 soft-grid" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#d1eee6] text-[#14574e]"><ShieldCheck size={23} /></div>
          <div><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="text-xs text-[#a9c5bf]">{t('ระบบความปลอดภัยประจำวัน')}</p></div>
        </div>
        <div className="relative max-w-xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.07] px-3 py-1.5 text-xs text-[#c5ded8]"><ClipboardCheck size={14} /> Daily safety workspace</div>
          <h1 className="mb-5 max-w-lg text-4xl font-semibold leading-[1.2] tracking-tight xl:text-5xl">{t('พื้นที่ทำงานที่ปลอดภัย เริ่มจากการตรวจที่ทำได้ทุกวัน')}</h1>
          <p className="max-w-md text-base leading-7 text-[#b5cbc7]">{t('บันทึกผลตรวจ แนบหลักฐาน และติดตามการแก้ไขในที่เดียว')}</p>
          <div className="mt-9 grid max-w-md grid-cols-3 gap-3">
            {[['13', 'หัวข้อตรวจ'], ['3', 'ผลตรวจ'], ['1', 'พื้นที่ติดตาม']].map(([number, label]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.06] px-4 py-3"><p className="text-xl font-semibold">{number}</p><p className="mt-1 text-xs text-[#a9c5bf]">{t(label)}</p></div>)}
          </div>
        </div>
        <p className="relative text-xs text-[#8eaaa5]">{t('บันทึกครบ ตรวจสอบย้อนหลังได้')}</p>
      </section>
      <section className="relative flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <LanguageSwitch className="absolute right-5 top-5 sm:right-8 sm:top-8" />
        <div className="w-full max-w-[430px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#d6eee8] text-primary"><ShieldCheck size={23} /></div>
            <div><p className="text-sm font-semibold">Y.T. RUBBER</p><p className="text-xs text-muted-foreground">{t('ระบบความปลอดภัยประจำวัน')}</p></div>
          </div>
          <div className="mb-8">
            <p className="mb-2 text-sm font-medium text-primary">{t('ยินดีต้อนรับ')}</p>
            <h2 className="text-3xl font-semibold tracking-tight">{t('เข้าสู่ระบบ')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('ใช้บัญชีหัวหน้างานหรือผู้ดูแลระบบเพื่อดำเนินการต่อ')}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="username">{t('ชื่อผู้ใช้')}</Label><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder={t('กรอกชื่อผู้ใช้')} required className="h-11 bg-white" /></div>
            <div className="space-y-2"><Label htmlFor="password">{t('รหัสผ่าน')}</Label><div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder={t('กรอกรหัสผ่าน')} required className="h-11 bg-white pr-12" /><Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 h-full w-11 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label={t(showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน')}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</Button></div></div>
            <Button type="submit" disabled={busy} className="h-11 w-full gap-2 text-sm">{busy ? t('กำลังเข้าสู่ระบบ…') : t('เข้าสู่ระบบ')} {!busy && <ArrowRight size={16} />}</Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">{t('ใช้บัญชีและรหัสผ่านที่ผู้ดูแลระบบกำหนด')}<br />{t('หากลืมรหัสผ่าน โปรดติดต่อผู้ดูแลระบบ')}</p>
        </div>
      </section>
    </main>
  )
}
