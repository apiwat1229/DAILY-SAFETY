import { useState } from 'react'
import { Activity, BookOpenText, ClipboardCheck, ClipboardPenLine, ContactRound, FileBarChart2, FileSpreadsheet, ListChecks, LogOut, Menu, Plus, ShieldCheck, UserRoundCog, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { DashboardPage } from '@/pages/dashboard-page'
import { InspectionFormPage } from '@/pages/inspection-form-page'
import { InspectionsPage } from '@/pages/inspections-page'
import { UsersPage } from '@/pages/users-page'
import { ChecklistAdminPage } from '@/pages/checklist-admin-page'
import { EmployeesPage } from '@/pages/employees-page'
import { AssessmentsPage } from '@/pages/assessments-page'
import { AssessmentReportsPage } from '@/pages/assessment-reports-page'
import { TrainingMaterialsPage } from '@/pages/training-materials-page'
import { HiyariPage } from '@/pages/hiyari-page'
import { HiyariReportsPage } from '@/pages/hiyari-reports-page'
import { useI18n } from '@/lib/i18n'
import { LanguageSwitch } from '@/components/language-switch'

export type PageKey = 'dashboard' | 'inspections' | 'new' | 'users' | 'employees' | 'checklist' | 'assessments' | 'assessment-reports' | 'training-materials' | 'hiyari' | 'hiyari-reports'
type Props = { user: User; page: PageKey; onPage: (page: PageKey) => void; onUserChange: (user: User | null) => void }

export function AppShell({ user, page, onPage, onUserChange }: Props) {
  const [mobileMenu, setMobileMenu] = useState(false)
  const { t } = useI18n()
  const pageMeta: Record<PageKey, { title: string; subtitle: string }> = {
    dashboard: { title: t('ภาพรวมความปลอดภัย'), subtitle: t('สรุปผลการตรวจและรายการที่ต้องติดตาม') },
    inspections: { title: t('รายการตรวจ'), subtitle: t('ค้นหา ตรวจสอบ และติดตามรายการบันทึก') },
    new: { title: t('บันทึกการตรวจ'), subtitle: t('แบบตรวจความปลอดภัยประจำวัน') },
    users: { title: t('ผู้ใช้งาน'), subtitle: t('จัดการบัญชีและสิทธิ์การใช้งาน') },
    employees: { title: t('รายชื่อพนักงาน'), subtitle: t('จัดการข้อมูลพนักงานและรหัสสำหรับค้นหาในรายงาน') },
    checklist: { title: t('แบบตรวจความปลอดภัยประจำวัน'), subtitle: t('เพิ่มและจัดการหัวข้อตรวจ') },
    assessments: { title: t('แบบประเมิน'), subtitle: t('สร้างข้อสอบและจัดการลิงก์สำหรับผู้ทำแบบประเมิน') },
    'assessment-reports': { title: t('รายงานแบบประเมิน'), subtitle: t('ตรวจคำตอบและส่งออกผลประเมินเป็น Excel') },
    'training-materials': { title: t('สื่ออบรม'), subtitle: t('จัดการเอกสารและสื่อสำหรับแชร์ให้พนักงาน') },
    hiyari: { title: t('Hiyari Hat'), subtitle: t('จัดการแบบฟอร์มออนไลน์และลิงก์สำหรับพนักงาน') },
    'hiyari-reports': { title: t('รายงาน Hiyari Hat'), subtitle: t('ค้นหา เปิดดู และดาวน์โหลดรายงานในรูปแบบ PDF') },
  }
  const navItems = user.role === 'admin'
    ? [
        { key: 'dashboard' as const, label: t('ภาพรวม'), icon: Activity },
        { key: 'inspections' as const, label: t('รายการตรวจ'), icon: FileBarChart2 },
        { key: 'new' as const, label: t('บันทึกการตรวจ'), icon: Plus },
        { key: 'users' as const, label: t('ผู้ใช้งาน'), icon: UserRoundCog },
        { key: 'employees' as const, label: t('รายชื่อพนักงาน'), icon: ContactRound },
        { key: 'checklist' as const, label: t('หัวข้อตรวจ'), icon: ListChecks },
        { key: 'assessments' as const, label: t('แบบประเมิน'), icon: ClipboardCheck },
        { key: 'assessment-reports' as const, label: t('รายงานแบบประเมิน'), icon: FileSpreadsheet },
        { key: 'training-materials' as const, label: t('สื่ออบรม'), icon: BookOpenText },
        { key: 'hiyari' as const, label: t('Hiyari Hat'), icon: ClipboardPenLine },
        { key: 'hiyari-reports' as const, label: t('รายงาน Hiyari Hat'), icon: FileSpreadsheet },
      ]
    : [
        { key: 'new' as const, label: t('บันทึกการตรวจ'), icon: Plus },
        { key: 'inspections' as const, label: t('ประวัติของฉัน'), icon: FileBarChart2 },
      ]
  async function handleLogout() {
    try { await api.logout() } catch { /* session may already have expired */ }
    onUserChange(null)
    toast.success(t('ออกจากระบบแล้ว'))
  }

  return (
    <div className="app-shell min-h-screen md:flex">
      <aside className="sidebar sticky top-0 z-30 hidden h-screen w-[var(--app-sidebar-width)] shrink-0 flex-col px-4 py-5 md:flex">
        <Brand />
        <div className="mt-9 px-3 text-xs font-semibold uppercase tracking-[.14em] text-sidebar-muted">{t('เมนูหลัก')}</div>
        <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{navItems.map((item) => <NavLink key={item.key} label={item.label} icon={item.icon} active={page === item.key} onClick={() => onPage(item.key)} />)}</nav>
        <ProfileBlock user={user} onLogout={handleLogout} />
      </aside>

      <div className="page-scroll min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-md">
          <div className="app-content-frame app-header-frame">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" aria-label={t('เปิดเมนู')} onClick={() => setMobileMenu(true)} className="md:hidden"><Menu size={18} /></Button>
              <div><h1 className="app-shell-title text-lg font-semibold tracking-tight md:text-xl">{pageMeta[page].title}</h1><p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{pageMeta[page].subtitle}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-success" /> {t('ระบบพร้อมใช้งาน')}</div>
              <LanguageSwitch />
              <div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary md:hidden">{user.name.slice(0, 1)}</div>
            </div>
          </div>
        </header>
        <main className="app-content-frame app-main-frame">
          {page === 'dashboard' && user.role === 'admin' ? <DashboardPage user={user} onPage={onPage} /> : null}
          {page === 'inspections' ? <InspectionsPage user={user} initialFilter={null} onInitialFilterApplied={() => undefined} /> : null}
          {page === 'new' ? <InspectionFormPage user={user} onCreated={() => onPage('inspections')} /> : null}
          {page === 'users' && user.role === 'admin' ? <UsersPage currentUser={user} onCurrentUserUpdate={onUserChange} /> : null}
          {page === 'employees' && user.role === 'admin' ? <EmployeesPage /> : null}
          {page === 'checklist' && user.role === 'admin' ? <ChecklistAdminPage /> : null}
          {page === 'assessments' && user.role === 'admin' ? <AssessmentsPage /> : null}
          {page === 'assessment-reports' && user.role === 'admin' ? <AssessmentReportsPage /> : null}
          {page === 'training-materials' && user.role === 'admin' ? <TrainingMaterialsPage /> : null}
          {page === 'hiyari' && user.role === 'admin' ? <HiyariPage /> : null}
          {page === 'hiyari-reports' && user.role === 'admin' ? <HiyariReportsPage /> : null}
        </main>
      </div>

      {mobileMenu && <div className="fixed inset-0 z-50 bg-black/30 md:hidden" onClick={() => setMobileMenu(false)}>
        <aside className="sidebar flex h-full w-[var(--app-sidebar-width)] flex-col px-4 py-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between"><Brand /><Button variant="ghost" size="icon" className="text-sidebar-muted hover:bg-white/10 hover:text-white" onClick={() => setMobileMenu(false)} aria-label={t('ปิดเมนู')}><X size={18} /></Button></div>
          <div className="mt-8 px-3 text-xs font-semibold uppercase tracking-[.14em] text-sidebar-muted">{t('เมนูหลัก')}</div>
          <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{navItems.map((item) => <NavLink key={item.key} label={item.label} icon={item.icon} active={page === item.key} onClick={() => { onPage(item.key); setMobileMenu(false) }} />)}</nav>
          <ProfileBlock user={user} onLogout={handleLogout} />
        </aside>
      </div>}
    </div>
  )
}

function Brand() {
  const { t } = useI18n()
  return <div className="flex items-center gap-3 px-2">
    <div className="grid size-10 place-items-center rounded-lg bg-secondary text-primary"><ShieldCheck size={21} /></div>
    <div><p className="text-xs font-semibold tracking-[.1em] text-sidebar-foreground">Y.T. RUBBER</p><p className="mt-0.5 text-xs text-sidebar-muted">{t('ระบบความปลอดภัยประจำวัน')}</p></div>
  </div>
}

function ProfileBlock({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useI18n()
  return <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.05] p-3.5">
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-soft text-xs font-semibold text-sidebar-foreground">{user.name.slice(0, 1)}</div>
      <div className="min-w-0"><p className="truncate text-xs font-medium text-sidebar-foreground">{user.name}</p><p className="mt-0.5 text-xs text-sidebar-muted">{user.role === 'admin' ? t('ผู้ดูแลระบบ') : `${t(user.role === 'leader' ? 'หัวหน้างาน' : 'พนักงาน')} · ${user.employeeCode}`}</p></div>
      <Button variant="ghost" size="icon" aria-label={t('ออกจากระบบ')} onClick={onLogout} className="ml-auto text-sidebar-muted hover:bg-white/10 hover:text-white"><LogOut size={15} /></Button>
    </div>
  </div>
}

type NavLinkProps = { label: string; icon: typeof Activity; active: boolean; onClick: () => void }
function NavLink({ label, icon: Icon, active, onClick }: NavLinkProps) {
  return <Button type="button" variant="ghost" data-active={active} onClick={onClick} className="side-link flex h-auto w-full items-center justify-start gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium">
    <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{active && <span className="ml-auto size-1.5 rounded-full bg-sidebar-active" />}
  </Button>
}
