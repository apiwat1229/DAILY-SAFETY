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
import { InspectionFormPage } from '@/pages/inspection-form-page'
import { LanguageSwitch } from '@/components/language-switch'

function getPublicRoute(): { type: 'assessment' | 'training' | 'hiyari'; token: string } | null {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts.length < 2 || !['assessment', 'training', 'hiyari'].includes(parts[0])) return null
  try { return { type: parts[0] as 'assessment' | 'training' | 'hiyari', token: decodeURIComponent(parts[parts.length - 1]) } } catch { return null }
}

function isDailyInspectionRoute() {
  return window.location.pathname.replace(/\/+$/, '') === '/daily-inspection'
}

function getAppLocation() {
  return { publicRoute: getPublicRoute(), dailyInspectionRoute: isDailyInspectionRoute() }
}

function App() {
  return <LanguageProvider><AppContent /></LanguageProvider>
}

function AppContent() {
  const [appLocation, setAppLocation] = useState(getAppLocation)
  const { publicRoute, dailyInspectionRoute } = appLocation
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!publicRoute && !dailyInspectionRoute)
  const [page, setPage] = useState<PageKey>(() => dailyInspectionRoute ? 'new' : 'dashboard')
  const { t } = useI18n()

  useEffect(() => {
    const updateLocation = () => setAppLocation(getAppLocation())
    window.addEventListener('popstate', updateLocation)
    return () => window.removeEventListener('popstate', updateLocation)
  }, [])

  useEffect(() => {
    if (publicRoute || dailyInspectionRoute) return
    api.me().then(({ user: currentUser }) => {
      setUser(currentUser)
      if (currentUser && (currentUser.role !== 'admin' || dailyInspectionRoute)) setPage('new')
    }).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [publicRoute, dailyInspectionRoute])

  if (publicRoute) return <>
    {publicRoute.type === 'assessment' ? <PublicAssessmentPage token={publicRoute.token} /> : publicRoute.type === 'training' ? <PublicTrainingPage token={publicRoute.token} /> : <PublicHiyariPage token={publicRoute.token} />}
    <Toaster position="top-right" richColors closeButton />
  </>

  if (dailyInspectionRoute) return <>
    <main className="min-h-screen bg-background px-4 py-5 sm:px-7 sm:py-8">
      <div className="mx-auto mb-4 flex max-w-6xl justify-end"><LanguageSwitch /></div>
      <InspectionFormPage user={null} publicMode onCreated={() => undefined} />
    </main>
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
