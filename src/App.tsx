import { useCallback, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { AppShell } from '@/components/app-shell'
import { pageFromPath, pagePath, resolvePage, type PageKey } from '@/lib/pages'
import { ErrorBoundary } from '@/components/error-boundary'
import { LoginScreen } from '@/components/login-screen'
import { LanguageProvider, useI18n } from '@/lib/i18n'
import { PublicAssessmentPage } from '@/pages/public-assessment-page'
import { PublicTrainingPage } from '@/pages/public-training-page'
import { PublicHiyariPage } from '@/pages/public-hiyari-page'
import { InspectionFormPage } from '@/pages/inspection-form-page'
import { LanguageSwitch } from '@/components/language-switch'
import { ConfirmProvider } from '@/components/confirm-provider'
import { PwaStatus } from '@/components/pwa-status'
import { useViewMode } from '@/lib/use-view-mode'

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
  return <ErrorBoundary><LanguageProvider><ConfirmProvider><AppContent /><PwaStatus /></ConfirmProvider></LanguageProvider></ErrorBoundary>
}

function AppContent() {
  const [appLocation, setAppLocation] = useState(getAppLocation)
  const { publicRoute, dailyInspectionRoute } = appLocation
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!publicRoute && !dailyInspectionRoute)
  const [requestedPage, setRequestedPage] = useState<PageKey | null>(() => pageFromPath(window.location.pathname))
  const { t } = useI18n()
  const { mode } = useViewMode()
  // Mobile-only CSS hangs off this attribute, so it also applies to the login screen.
  useEffect(() => { document.documentElement.dataset.view = mode }, [mode])

  useEffect(() => {
    const updateLocation = () => { setAppLocation(getAppLocation()); setRequestedPage(pageFromPath(window.location.pathname)) }
    window.addEventListener('popstate', updateLocation)
    return () => window.removeEventListener('popstate', updateLocation)
  }, [])

  useEffect(() => {
    if (publicRoute || dailyInspectionRoute) return
    api.me().then(({ user: currentUser }) => {
      setUser(currentUser)
    }).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [publicRoute, dailyInspectionRoute])

  // The page comes from the URL (/app/<page>); roles that may not open it fall back to their home page.
  const page = user ? resolvePage(user.role, requestedPage) : null
  useEffect(() => {
    if (!page || publicRoute || dailyInspectionRoute) return
    if (window.location.pathname.replace(/\/+$/, '') !== pagePath(page)) window.history.replaceState(null, '', pagePath(page))
  }, [page, publicRoute, dailyInspectionRoute])
  const navigate = useCallback((next: PageKey, query = '') => {
    window.history.pushState(null, '', `${pagePath(next)}${query}`)
    setRequestedPage(next)
    // Pages already mounted (e.g. Stock receiving a ?action=receive shortcut) cannot see pushState, so tell them.
    window.dispatchEvent(new Event('ds:navigate'))
    window.scrollTo({ top: 0 })
  }, [])

  if (publicRoute) return <>
    {publicRoute.type === 'assessment' ? <PublicAssessmentPage token={publicRoute.token} /> : publicRoute.type === 'training' ? <PublicTrainingPage token={publicRoute.token} /> : <PublicHiyariPage token={publicRoute.token} />}
    <Toaster position="top-center" richColors closeButton />
  </>

  if (dailyInspectionRoute) return <>
    <main className="min-h-screen bg-background px-4 py-5 sm:px-7 sm:py-8">
      <div className="mx-auto mb-4 flex max-w-6xl justify-end"><LanguageSwitch /></div>
      <InspectionFormPage user={null} publicMode onCreated={() => undefined} />
    </main>
    <Toaster position="top-center" richColors closeButton />
  </>

  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">{t('กำลังเชื่อมต่อระบบ…')}</div>

  return (
    <>
      {user && page ? <AppShell user={user} page={page} onPage={navigate} onUserChange={setUser} /> : <LoginScreen onLogin={setUser} />}
      <Toaster position="top-center" richColors closeButton />
    </>
  )
}

export default App
