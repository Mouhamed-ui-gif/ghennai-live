import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, X, CheckCircle2, GitBranch, Loader2, Copy, ExternalLink, Settings, TriangleAlert, KeyRound, Globe2, ShieldCheck, Save } from 'lucide-react'
import { useApp } from '../../store/app'
import { publishToGitHub } from '../../hooks/useChat'
import { deploy } from '../../api/client'
import { onGlobalEvent } from '../../api/events'
import { useI18n } from '../../i18n'

const PROVIDERS = [
  { id: 'github', label: 'GitHub Pages', hint: 'مباشر عبر توكن أو gh CLI', ready: true },
  { id: 'vercel', label: 'Vercel', hint: 'أضِف توكن Vercel في الإعدادات', ready: false },
  { id: 'netlify', label: 'Netlify', hint: 'أضِف توكن Netlify في الإعدادات', ready: false },
]

interface AuthStatus {
  hasToken: boolean
  ghAvailable: boolean
}

export function PublishDrawer() {
  const { t } = useI18n()
  const state = useApp((s) => s.deployState)
  const url = useApp((s) => s.deployUrl)
  const error = useApp((s) => s.deployError)
  const stages = useApp((s) => s.deployStages)
  const built = useApp((s) => s.built)
  const projectName = useApp((s) => s.projectName)
  const deployInvoke = useApp((s) => s.deployInvoke)
  const [open, setOpen] = useState(false)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [tokInput, setTokInput] = useState('')
  const [savingTok, setSavingTok] = useState(false)

  const refreshAuth = async () => {
    try {
      const d = (await deploy.status()) as AuthStatus
      if (d) setAuth(d)
    } catch { /* noop */ }
  }

  useEffect(() => {
    if (built && state === 'idle') setOpen(true)
  }, [built, state])

  useEffect(() => {
    if (deployInvoke) setOpen(true)
  }, [deployInvoke])

  useEffect(() => {
    if (open) void refreshAuth()
  }, [open])

  useEffect(() => {
    const off = onGlobalEvent((e) => {
      if (e.type === 'deploy_progress') {
        const m = String((e as { message?: string }).message || '')
        useApp.getState().pushDeployStage(m)
      }
      if (e.type === 'deploy_done') {
        const u = String((e as { url?: string }).url || '')
        useApp.getState().setDeployState('done', u)
      }
      if (e.type === 'deploy_error') {
        const msg = String((e as { error?: string }).error || 'خطأ')
        useApp.getState().setDeployState('error', null, msg)
        useApp.getState().pushToast({ kind: 'error', title: t('arena.publish') + ' ✕', message: msg })
      }
    })
    return () => { off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = async () => {
    useApp.getState().clearDeploy()
    useApp.getState().setDeployState('deploying')
    try {
      const d = (await publishToGitHub(projectName === 'project' ? '.' : projectName)) as { ok: boolean; url?: string; error?: string }
      if (d.ok && d.url) useApp.getState().setDeployState('done', d.url)
      else if (!d.ok && d.error) {
        useApp.getState().setDeployState('error', null, d.error)
        useApp.getState().pushToast({ kind: 'error', title: 'نشر ✕', message: d.error })
      } else if (!d.ok) {
        useApp.getState().setDeployState('error', null, String(d))
      }
    } catch (er) {
      const msg = String((er as Error).message || er)
      useApp.getState().setDeployState('error', null, msg)
      useApp.getState().pushToast({ kind: 'error', title: 'نشر ✕', message: msg })
    }
  }

  const saveToken = async () => {
    const val = tokInput.trim()
    if (!val) return
    setSavingTok(true)
    try {
      await deploy.saveToken(val)
      useApp.getState().pushToast({ kind: 'success', title: '✓ حُفظ التوكن', message: 'جارٍ النشر مباشرة…' })
      setTokInput('')
      await refreshAuth()
      await start()
    } catch (er) {
      useApp.getState().pushToast({ kind: 'error', title: 'تعذّر حفظ التوكن', message: String((er as Error).message || er) })
    } finally {
      setSavingTok(false)
    }
  }

  const copy = async () => {
    if (url) await navigator.clipboard.writeText(url)
  }

  const percent = state === 'done' ? 100 : state === 'error' ? 100 : Math.min(92, stages.length * 22)
  const canRun = auth ? auth.ghAvailable || auth.hasToken : true

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-night-950/60 backdrop-blur-sm"
            onClick={() => state !== 'deploying' && setOpen(false)}
          />
          <motion.div
            initial={{ x: 120, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="glass-strong fixed inset-y-0 end-0 z-[81] flex w-full max-w-[420px] flex-col border-s border-white/10 p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                <Rocket size={18} className="text-cyan-400" /> {t('arena.publish')}
              </h3>
              <button onClick={() => setOpen(false)} disabled={state === 'deploying'} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            <p className="mt-1 text-xs text-slate-400">
              {t('arena.publishAsk')} — <span dir="ltr" className="font-mono text-cyan-300">{projectName}</span>
            </p>

            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/90">
              <Globe2 size={12} /> الرابط الناتج عامّ — يمكن لأي شخص فتحه دون تسجيل دخول
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <div
                  key={p.id}
                  data-provider={p.id}
                  className={`rounded-2xl border p-2.5 text-center transition ${
                    p.ready ? 'border-cyan-400/40 bg-cyan-400/5 text-cyan-200' : 'border-white/10 bg-white/5 text-slate-500 opacity-60'
                  }`}
                >
                  <p className="text-[12px] font-bold">{p.label}</p>
                  <p className="mt-0.5 text-[9px] leading-tight opacity-80">{p.hint}</p>
                </div>
              ))}
            </div>

            {auth && !auth.ghAvailable && !auth.hasToken && state !== 'deploying' && (
              <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
                <div className="flex items-start gap-2">
                  <KeyRound size={15} className="mt-0.5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-amber-200">أضِف توكن GitHub لأتمكن من النشر (مرة واحدة)</p>
                    <ol className="mt-1 list-decimal space-y-0.5 ps-4 text-[10px] leading-relaxed text-slate-400">
                      <li>افتح{' '}
                        <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-cyan-300 underline">
                          github.com/settings/tokens
                        </a>
                      </li>
                      <li>Generate new token (classic) → فعِّل صلاحية <b className="text-white">repo</b></li>
                      <li>الصق التوكن هنا واضغط حفظ ونشر</li>
                    </ol>
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={tokInput}
                        onChange={(e) => setTokInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void saveToken()}
                        dir="ltr"
                        type="password"
                        placeholder="ghp_…"
                        className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-2.5 py-1.5 font-mono text-[12px] text-white placeholder:text-slate-600 outline-none focus:border-cyan-400/50"
                      />
                      <button
                        onClick={saveToken}
                        disabled={savingTok || !tokInput.trim()}
                        className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-400/90 px-2.5 py-1.5 text-[11px] font-bold text-night-950 transition hover:bg-amber-300 disabled:opacity-40"
                      >
                        {savingTok ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} حفظ ونشر
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {auth && (auth.ghAvailable || auth.hasToken) && state === 'idle' && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-[12px] text-emerald-300">
                <ShieldCheck size={14} className="shrink-0" />
                {auth.ghAvailable ? 'GitHub CLI متصل ✓ — النشر عبر gh CLI' : 'توكن GitHub محفوظ ✓'}
              </div>
            )}

            {state === 'deploying' && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">{percent}% — جارٍ النشر…</p>
              </div>
            )}

            {stages.length > 0 && (
              <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
                {stages.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                    {state === 'deploying' && i === stages.length - 1 ? (
                      <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-cyan-400" />
                    ) : (
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                    )}
                    <span className="text-slate-200">{s}</span>
                  </div>
                ))}
              </div>
            )}

            {state === 'done' && url && (
              <div className="mt-4 flex-1 text-center">
                <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }}>
                  <CheckCircle2 size={52} className="mx-auto text-emerald-400" />
                </motion.div>
                <h4 className="mt-2 text-xl font-bold text-white">{t('arena.deployed')}</h4>
                <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-slate-400">
                  <Globe2 size={12} className="text-emerald-400" /> الرابط عامّ — أرسله لأي شخص ليشاهد موقعك مباشرة
                </p>
                <p className="mt-2 break-all rounded-xl bg-white/5 p-3 font-mono text-sm text-cyan-300" dir="ltr">{url}</p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button onClick={copy} className="btn-ghost !px-4 !py-2 text-sm">
                    <Copy size={15} /> نسخ
                  </button>
                  <a href={url} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2 text-sm">
                    <ExternalLink size={15} /> {t('arena.visit')}
                  </a>
                </div>
              </div>
            )}

            {state === 'error' && (
              <div className="mt-4 flex-1">
                <div className="flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  <p className="break-words">{error}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
                    <Settings size={15} /> {t('settings.title')}
                  </button>
                  <button onClick={start} className="btn-primary text-sm">
                    <GitBranch size={16} /> أعد المحاولة
                  </button>
                </div>
              </div>
            )}

            {state === 'idle' && (
              <div className="mt-auto pt-4">
                <button onClick={start} disabled={!canRun} className="btn-primary w-full justify-center !py-3 text-sm disabled:opacity-40">
                  <Rocket size={16} /> {t('arena.publishYes')}
                </button>
                <button onClick={() => setOpen(false)} className="btn-ghost mt-2 w-full justify-center !py-2 text-sm">
                  {t('arena.publishNo')}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}