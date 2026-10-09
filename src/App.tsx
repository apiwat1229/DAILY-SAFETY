import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { AppShell, type PageKey } from '@/components/app-shell'
import { LoginScreen } from '@/components/login-screen'
import { LanguageProvider, useI18n } from '@/lib/i18n'
import { PublicAssessmentPage } from '@/pages/public-assessment-page'
import { PublicTrainingPage } from '@/pages/public-training-page'

function getPublicRoute(): { type: 'assessment' | 'training'; token: string } | null {
  const match = window.location.pathname.match(/^\/(assessment|training)\/([^/]+)\/?$/)
  if (!match) return null
  try { return { type: match[1] as 'assessment' | 'training', token: decodeURIComponent(match[2]) } } catch { return null }
}

function App() {
  return <LanguageProvider><AppContent /></LanguageProvider>
}

function AppContent() {
  const [publicRoute] = useState(getPublicRoute)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!publicRoute)
  const [page, setPage] = useState<PageKey>('dashboard')
  const { t } = useI18n()

  useEffect(() => {
    if (publicRoute) return
    api.me().then(({ user: currentUser }) => {
      setUser(currentUser)
      if (currentUser && currentUser.role !== 'admin') setPage('new')
    }).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [publicRoute])

  if (publicRoute) return <>
    {publicRoute.type === 'assessment' ? <PublicAssessmentPage token={publicRoute.token} /> : <PublicTrainingPage token={publicRoute.token} />}
    <Toaster position="top-right" richColors closeButton />
  </>

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f4f7f8] text-sm text-muted-foreground">{t('กำลังเชื่อมต่อระบบ…')}</div>

  return (
    <>
      {user ? <AppShell user={user} page={page} onPage={setPage} onUserChange={setUser} /> : <LoginScreen onLogin={(currentUser) => {
        setUser(currentUser)
        setPage(currentUser.role === 'admin' ? 'dashboard' : 'new')
      }} />}
      <Toaster position="top-right" richColors closeButton />
    </>
  )
}

export default App
