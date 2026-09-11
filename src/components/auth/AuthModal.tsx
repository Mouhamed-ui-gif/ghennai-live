import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, User, Loader2, X } from 'lucide-react'
import { api } from '../../api/client'
import { useApp } from '../../store/app'
import { useI18n } from '../../i18n'
import { Logo } from '../common/Logo'
import { StreamBg } from '../common/StreamBg'
import { CLIENT_ID, loadScript, renderGoogleButton } from './google'

export function AuthModal({ open, initial = 'login', onClose }: { open: boolean; initial?: 'login' | 'signup'; onClose: () => void }) {
  const { t } = useI18n()
  const login = useApp((s) => s.login)
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>(initial)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const gBtnRef = useRef<HTMLDivElement>(null)
  const [gReady, setGReady] = useState(false)

  const isStatic =
    typeof window !== 'undefined' &&
    !!(window.location?.hostname ?? '') &&
    !['localhost', '::1', '[::1]', '127.0.0.1'].includes(window.location.hostname) &&
    !/^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname) &&
    !/^\[?([0-9a-f]{0,4}:){2,7}[0-9a-f]+\]?$/i.test(window.location.hostname)

  useEffect(() => {
    if (open) {
      setErr('')
      setMode(initial)
    }
  }, [open, initial])

  useEffect(() => {
    if (!open || !CLIENT_ID || !gBtnRef.current) return
    let cancelled = false
    loadScript()
      .then(async () => {
        if (cancelled || !gBtnRef.current) return
        const ok = await renderGoogleButton(gBtnRef.current, handleGoogle)
        if (ok) setGReady(true)
      })
      .catch(() => setGReady(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleGoogle = async (idToken: string) => {
    setLoading(true)
    setErr('')
    try {
      const d = await api.google(idToken, CLIENT_ID)
      login(d.token, d.user)
      nav('/app')
    } catch (er) {
      setErr(String((er as Error).message || er))
    } finally {
      setLoading(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (isStatic) return setErr(t('auth.err.static'))
    if (password.length < 6) return setErr(t('auth.err.short'))
    if (mode === 'signup' && password !== confirm) return setErr(t('auth.err.confirm'))
    setLoading(true)
    try {
      const d =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password, name)
      login(d.token, d.user)
      nav('/app')
    } catch (er) {
      setErr(String((er as Error).message || er))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'login' ? t('auth.login') : t('auth.signup')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-night-950/80 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <StreamBg
          images={[
            'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=70',
            'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70',
          ]}
          opacity={0.3}
          cycleMs={9000}
          className="auth-modal-video opacity-40"
        />
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="glass-strong relative w-full max-w-md rounded-3xl p-8 shadow-[0_0_80px_rgba(6,182,212,.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute end-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <X size={18} />
            </button>

            <div className="mb-6 flex flex-col items-center">
              <Logo size={44} textClass="grad-text" />
              <h2 className="mt-3 text-xl font-bold">
                {mode === 'login' ? t('auth.login') : t('auth.signup')}
              </h2>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {isStatic && (
                <div className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
                  <p>{t('auth.err.static')}</p>
                  <a
                    href={t('auth.static.url')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block rounded-lg bg-cyan-500/90 px-3 py-2 text-center font-semibold text-night-950 transition hover:bg-cyan-400"
                  >
                    {t('auth.static.title')} ← {t('auth.static.url').replace('https://', '')}
                  </a>
                  <p className="mt-1.5 text-[11px] text-amber-300/70">{t('auth.static.hint')}</p>
                </div>
              )}
              {mode === 'signup' && (
                <div className="relative">
                  <User size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input-lg ps-10" placeholder={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              <div className="relative">
                <Mail size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input-lg ps-10" type="email" required placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input-lg ps-10" type="password" required placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
              </div>
              {mode === 'signup' && (
                <div className="relative">
                  <Lock size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input-lg ps-10" type="password" required placeholder={t('auth.confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
                </div>
              )}

              {err && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{err}</p>}

              <button type="submit" disabled={loading} className="btn-primary mt-1 disabled:opacity-60">
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === 'login' ? t('auth.submit') : t('auth.create')}
              </button>
            </form>

            {(CLIENT_ID || gReady) && (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  أو
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <div className="flex justify-center" ref={gBtnRef}>
                  {!gReady && <div className="text-xs text-slate-500">يتم تحميل تسجيل الدخول عبر Google…</div>}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setErr('')
              }}
              className="mt-4 w-full text-center text-sm text-slate-400 transition hover:text-cyan-300"
            >
              {mode === 'login' ? t('auth.switchToSignup') : t('auth.switchToLogin')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}