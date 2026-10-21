import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { AppShell, type PageKey } from '@/components/app-shell'
import { LoginScreen } from '@/components/login-screen'
import { LanguageProvider, useI18n } from '@/lib/i18n'
import { PublicAssessmentPage } from '@/pages/public-assessment-page'
import { PublicTrainingPage } from '@/pages/public-training-page'
import { PublicHiyariPage } from '@/pages/public-hiyari-page'

function getPublicRoute(): { type: 'assessment' | 'training' | 'hiyari'; token: string } | null {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts.length < 2 || !['assessment', 'training', 'hiyari'].includes(parts[0])) return null
  try { return { type: parts[0] as 'assessment' | 'training' | 'hiyari', token: decodeURIComponent(parts[parts.length - 1]) } } catch { return null }
}

function isDailyInspectionRoute() {
  return window.location.pathname.replace(/\/+$/, '') === '/daily-inspection'
}

function App() {
  return <LanguageProvider><AppContent /></LanguageProvider>
}

function AppContent() {
  const [publicRoute] = useState(getPublicRoute)
  const [dailyInspectionRoute] = useState(isDailyInspectionRoute)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!publicRoute)
  const [page, setPage] = useState<PageKey>(() => dailyInspectionRoute ? 'new' : 'dashboard')
  const { t } = useI18n()

  useEffect(() => {
    if (publicRoute) return
    api.me().then(({ user: currentUser }) => {
      setUser(currentUser)
      if (currentUser && (currentUser.role !== 'admin' || dailyInspectionRoute)) setPage('new')
    }).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [publicRoute, dailyInspectionRoute])

  if (publicRoute) return <>
    {publicRoute.type === 'assessment' ? <PublicAssessmentPage token={publicRoute.token} /> : publicRoute.type === 'training' ? <PublicTrainingPage token={publicRoute.token} /> : <PublicHiyariPage token={publicRoute.token} />}
    <Toaster position="top-right" richColors closeButton />
  </>

  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">{t('กำลังเชื่อมต่อระบบ…')}</div>

  return (
    <>
      {user ? <AppShell user={user} page={page} onPage={setPage} onUserChange={setUser} /> : <LoginScreen onLogin={(currentUser) => {
        setUser(currentUser)
        setPage(currentUser.role === 'admin' && !dailyInspectionRoute ? 'dashboard' : 'new')
      }} />}
      <Toaster position="top-right" richColors closeButton />
    </>
  )
}

export default App
