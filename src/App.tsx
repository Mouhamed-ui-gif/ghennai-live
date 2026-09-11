import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { useApp } from './store/app'
import { rearmEvents } from './api/events'
import { Logo } from './components/common/Logo'
import { Toaster } from './components/common/Toaster'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-night-950">
      <Logo size={72} withText={false} className="animate-float" />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" />
      </div>
      <p className="text-sm text-slate-500">Ghennai · جارٍ تحميل عالمك…</p>
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const token = useApp((s) => s.token)
  const user = useApp((s) => s.user)
  if (!token || !user) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  const token = useApp((s) => s.token)
  const booting = useApp((s) => s.booting)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    rearmEvents()
  }, [token])

  useEffect(() => {
    void useApp.getState().hydrate()
  }, [])

  if (booting) return <Splash />

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-night-950">
          <Logo size={56} withText={false} className="animate-pulse" />
        </div>
      }
    >
      <Toaster />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}