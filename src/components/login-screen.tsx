import { useState } from 'react'
import { ArrowRight, ClipboardCheck, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useI18n } from '@/lib/i18n'
import { LanguageSwitch } from '@/components/language-switch'
import { SafetyBackdrop } from '@/components/safety-backdrop'
import { SafetyMascots } from '@/components/safety-mascots'

type Props = { onLogin: (user: User) => void }

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const { user } = await api.login(username, password, rememberMe)
      onLogin(user)
      toast.success(`${t('ยินดีต้อนรับ')} ${user.name}`)
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      {/* Left: brand, hero copy and the cartoon safety team */}
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <SafetyBackdrop />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur"><ShieldCheck size={23} /></div>
          <div><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="text-xs text-sidebar-muted">{t('ระบบความปลอดภัยประจำวัน')}</p></div>
        </div>
        <div className="relative my-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300"><ClipboardCheck size={14} /> Daily safety workspace</div>
          <h1 className="mb-4 max-w-lg text-4xl font-bold leading-[1.2] tracking-tight xl:text-[44px]">{t('พื้นที่ทำงานที่ปลอดภัย เริ่มจากการตรวจที่ทำได้ทุกวัน')}</h1>
          <p className="max-w-md text-base leading-7 text-slate-300">{t('บันทึกผลตรวจ แนบหลักฐาน และติดตามการแก้ไขในที่เดียว')}</p>
          <div className="mt-7 grid max-w-md grid-cols-3 gap-3">
            {[['13', 'หัวข้อตรวจ', 'text-white'], ['3', 'ผลตรวจ', 'text-emerald-400'], ['1', 'พื้นที่ติดตาม', 'text-amber-400']].map(([number, label, tone]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.06] px-4 py-3 backdrop-blur-sm"><p className={`text-2xl font-bold ${tone}`}>{number}</p><p className="mt-1 text-xs text-slate-300">{t(label)}</p></div>)}
          </div>
        </div>
        <div className="relative">
          <SafetyMascots className="ml-auto max-w-[440px] xl:max-w-[500px]" />
          <p className="mt-2 pb-3 text-xs text-slate-400">{t('บันทึกครบ ตรวจสอบย้อนหลังได้')} • Safety First</p>
        </div>
      </section>

      {/* Right: sign-in form */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8">
        <div className="absolute inset-0 bg-sidebar lg:hidden"><SafetyBackdrop /></div>
        <LanguageSwitch compact className="absolute right-5 top-5 z-10 bg-white/90 text-muted-foreground shadow-sm hover:bg-white hover:text-primary sm:right-8 sm:top-8" />
        <div className="relative w-full max-w-[430px]">
          <div className="mb-5 flex items-center gap-3 text-white lg:hidden">
            <div className="grid size-11 place-items-center rounded-xl border border-white/15 bg-white/10"><ShieldCheck size={23} /></div>
            <div><p className="text-sm font-semibold">Y.T. RUBBER</p><p className="text-xs text-slate-300">{t('ระบบความปลอดภัยประจำวัน')}</p></div>
          </div>
          <div className="rounded-2xl bg-background p-6 shadow-xl max-lg:border max-lg:border-white/20 lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold text-primary">{t('ยินดีต้อนรับ')}</p>
              <h2 className="text-3xl font-bold tracking-tight">{t('เข้าสู่ระบบ')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t('ใช้บัญชีหัวหน้างานหรือผู้ดูแลระบบเพื่อดำเนินการต่อ')}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="username">{t('ชื่อผู้ใช้')}</Label>
                <div className="relative"><UserRound size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder={t('กรอกชื่อผู้ใช้')} required className="h-12 rounded-xl bg-white pl-11" /></div></div>
              <div className="space-y-2"><Label htmlFor="password">{t('รหัสผ่าน')}</Label>
                <div className="relative"><LockKeyhole size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder={t('กรอกรหัสผ่าน')} required className="h-12 rounded-xl bg-white pl-11 pr-12" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 h-full w-11 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label={t(showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน')}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</Button></div></div>
              <label htmlFor="remember-me" className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
                <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked === true)} />
                <span>{t('จดจำฉัน')}</span>
              </label>
              <Button type="submit" disabled={busy} className="h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-lg shadow-primary/25">{busy ? t('กำลังเข้าสู่ระบบ…') : t('เข้าสู่ระบบ')} {!busy && <ArrowRight size={18} />}</Button>
            </form>
            <p className="mt-6 border-t border-border-subtle pt-5 text-center text-xs leading-5 text-muted-foreground">{t('ใช้บัญชีและรหัสผ่านที่ผู้ดูแลระบบกำหนด')}<br />{t('หากลืมรหัสผ่าน โปรดติดต่อผู้ดูแลระบบ')}</p>
          </div>
          <div className="mx-auto mt-5 w-full max-w-[300px] lg:hidden"><SafetyMascots /></div>
        </div>
      </section>
    </main>
  )
}
