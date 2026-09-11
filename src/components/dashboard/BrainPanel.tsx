import { useEffect, useMemo, useState } from 'react'
import {
  Brain, GitMerge, Layers, TrendingUp, Pause, Play, RotateCcw, Download, Volume2, Loader2, X, Cpu, Radio,
} from 'lucide-react'
import { useApp, type BrainAgentState } from '../../store/app'
import { brain } from '../../api/client'
import { onGlobalEvent } from '../../api/events'
import { useI18n } from '../../i18n'
import { AGENT_KEYS } from '../../config/agents'

const ROLES: Record<string, string> = { Core: 'المعمار', Coding: 'المنفّذ', Research: 'المحقّق', Study: 'المعلّم', Design: 'المصمّم', Genie: 'الجني الأسمى', Voice: 'الصوتي' }
const ROLES_EN: Record<string, string> = { Core: 'Architect', Coding: 'Executor', Research: 'Researcher', Study: 'Teacher', Design: 'Designer', Genie: 'Supreme Executor', Voice: 'Voice' }
const COLORS: Record<string, string> = { Core: '#22d3ee', Coding: '#a78bfa', Research: '#fbbf24', Study: '#34d399', Design: '#fb7185', Genie: '#f472b6', Voice: '#38bdf8' }
const ICON_BY_AGENT: Record<string, string> = { Core: '🧠', Coding: '⌨️', Research: '🌍', Study: '📚', Design: '🎨', Genie: '🧞', Voice: '🎙️' }

const statusLabel = (s: string, l: string) =>
  ({ idle: '', running: l === 'ar' ? 'يعمل…' : 'working…', done: l === 'ar' ? 'اكتمل ✓' : 'done ✓', error: l === 'ar' ? 'خطأ' : 'error', paused: l === 'ar' ? 'متوقف' : 'paused' }[s] || s)

function speak(text: string, lang: string) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
    u.rate = 1
    window.speechSynthesis.speak(u)
  } catch { /* noop */ }
}

function AgentCard({ name, st, lang }: { name: string; st?: BrainAgentState; lang: string }) {
  const a = st || { status: 'idle', action: '', detail: '', score: null, feedback: '', updatedAt: 0 }
  const color = COLORS[name] || '#22d3ee'
  const active = a.status === 'running'
  const flash = useMemo(() => {
    if (a.status === 'done' || a.status === 'error') return Math.random().toString(36).slice(2, 8)
    return ''
  }, [a.status, a.updatedAt])

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--rx', `${(-py * 14).toFixed(2)}deg`)
    el.style.setProperty('--ry', `${(px * 16).toFixed(2)}deg`)
    el.style.setProperty('--td', '0.06s')
  }
  const onLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--td', '0.3s')
  }

  return (
    <div
      key={`${name}-${flash}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`brain-card tilt-3d relative overflow-hidden rounded-2xl border p-3 transition-all duration-500 ${
        active ? 'border-white/20 bg-white/5' : 'border-white/8 bg-night-900/40'
      } ${flash ? 'brain-flash' : ''}`}
      style={{ '--tilt-glow': `${color}66` } as React.CSSProperties}
    >
      <div className="tilt-child">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative grid h-8 w-8 place-items-center rounded-xl text-base" style={{ background: `${color}22` }}>
              {ICON_BY_AGENT[name] || '🤖'}
              {active && <span className="absolute inset-0 animate-ping rounded-xl border" style={{ borderColor: color, opacity: 0.6 }} />}
            </span>
            <div>
              <p className="text-[13px] font-bold text-white">{name}</p>
              <p className="text-[10px]" style={{ color }}>{lang === 'ar' ? (ROLES[name] || '') : (ROLES_EN[name] || '')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {a.score != null && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${a.score >= 7 ? 'bg-emerald-400/15 text-emerald-300' : a.score >= 4 ? 'bg-amber-400/15 text-amber-300' : 'bg-rose-400/15 text-rose-300'}`}
              >
                {a.score}/10
              </span>
            )}
            {a.status !== 'idle' && <span className="brain-dot" style={{ background: a.status === 'error' ? '#f43f5e' : a.status === 'paused' ? '#fbbf24' : a.status === 'done' ? '#34d399' : color }} />}
          </div>
        </div>
        {a.detail && (
          <button onClick={() => speak(a.detail, lang)} title="استماع" className="mt-2 flex w-full items-start gap-1 text-start">
            <Volume2 size={11} className="mt-1 shrink-0 opacity-60" />
            <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-300">{a.detail}</p>
          </button>
        )}
        {a.feedback && <p className="mt-1 text-[10px] text-amber-300/90">✍️ {a.feedback}</p>}
      </div>
    </div>
  )
}

export function BrainPanel({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const board = useApp((s) => s.brainBoard)
  const progress = useApp((s) => s.brainProgress)
  const phase = useApp((s) => s.brainPhase)
  const feed = useApp((s) => s.brainFeed)
  const paused = useApp((s) => s.brainPaused)
  const prefs = useApp((s) => s.prefs)
  const models = useApp((s) => s.agentModels)
  const [exporting, setExporting] = useState(false)
  const [showModels, setShowModels] = useState(false)

  useEffect(() => {
    brain.state().then((d) => {
      useApp.getState().applyBrainState(
        (d as { board?: Record<string, BrainAgentState> }).board || {},
        (d as { progress?: number }).progress || 0,
        (d as { phase?: string }).phase || 'idle',
        !!(d as { paused?: boolean }).paused
      )
    }).catch(() => undefined)
    brain.prefs().then((p) => useApp.getState().setPrefs(p as never)).catch(() => undefined)
    brain.models().then((m) => useApp.getState().setAgentModels((m as { models: string[] }).models || [])).catch(() => undefined)

    const off = onGlobalEvent((e) => {
      const s = useApp.getState()
      switch (e.type) {
        case 'brain_state': {
          const d = e as unknown as { board?: Record<string, BrainAgentState>; progress?: number; phase?: string; paused?: boolean }
          s.applyBrainState(d.board || {}, d.progress || 0, d.phase || 'idle', !!d.paused)
          break
        }
        case 'brain_progress': {
          const d = e as unknown as { value?: number; phase?: string }
          s.setBrainProgress(d.value || 0, d.phase || '')
          break
        }
        case 'brain_feed': {
          const d = e as unknown as { from?: string; to?: string; message?: string; kind?: string }
          s.pushBrainFeed(d.from || '?', d.to || '', d.message || '', d.kind || 'normal')
          break
        }
        case 'brain_grade': {
          const d = e as unknown as { agent?: string; score?: number; feedback?: string }
          s.setBrainGrade(d.agent || 'Core', d.score ?? null, d.feedback || '')
          break
        }
        case 'brain_cycle':
          s.pushBrainFeed('Iteration', '', 'دورة تلقائية جديدة…', 'retry')
          break
        case 'brain_cycle_done':
          s.pushBrainFeed('Iteration', '', 'اكتملت الدورة ✓', 'done')
          break
      }
    })
    return () => { off() }
  }, [])

  const setP = (key: string, value: unknown) => {
    useApp.getState().setPrefs({ [key]: value } as never)
    brain.setPref(key, value).then((p) => useApp.getState().setPrefs(p as never)).catch(() => undefined)
  }

  useEffect(() => {
    if (!prefs.interval) return
    const iv = setInterval(() => {
      if (useApp.getState().prefs.paused) return
      brain.cycle().catch(() => undefined)
    }, prefs.interval * 1000)
    return () => clearInterval(iv)
  }, [prefs.interval])

  const doExport = async () => {
    setExporting(true)
    try {
      const text = await brain.exportText()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ghennai-session.txt'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } finally {
      setExporting(false)
    }
  }

  const toggle = (key: 'collab' | 'supervisor' | 'autoGrade' | 'pipeline') => setP(key, !prefs[key])

  return (
    <div className="flex h-full w-full max-w-[30rem] min-w-0 flex-col gap-3 overflow-y-auto border-s border-white/10 bg-night-950/35 p-3 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300"><Brain size={15} /></span>
          {lang === 'ar' ? 'خريطة العقول' : 'Agent Brain'}
          <span className="chip !py-0.5 text-[10px] text-slate-300">{phase}</span>
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowModels((s) => !s)} title={lang === 'ar' ? 'اختيار النموذج لكل وكيل' : 'Pick a model per agent'} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <Cpu size={15} />
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* شريط تقدم المهمة */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
          <span>{lang === 'ar' ? 'إنجاز المهمة' : 'Task progress'}</span>
          <span className="font-bold text-cyan-300">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <div className="brain-bar h-full rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* الأزرار */}
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <button onClick={() => toggle('collab')} className={`chip justify-between !py-2 ${prefs.collab ? '!border-cyan-400/40 !text-cyan-300' : ''}`}>
          <span className="flex items-center gap-1.5"><Layers size={12} /> {lang === 'ar' ? 'التعاون' : 'Collab'}</span>
          <span className={`brain-sw ${prefs.collab ? 'on' : ''}`}><i /></span>
        </button>
        <button onClick={() => toggle('supervisor')} className={`chip justify-between !py-2 ${prefs.supervisor ? '!border-violet-400/40 !text-violet-300' : ''}`}>
          <span className="flex items-center gap-1.5"><GitMerge size={12} /> {lang === 'ar' ? 'المشرف' : 'Supervisor'}</span>
          <span className={`brain-sw ${prefs.supervisor ? 'on' : ''}`}><i /></span>
        </button>
        <button onClick={() => toggle('autoGrade')} className={`chip justify-between !py-2 ${prefs.autoGrade ? '!border-amber-400/40 !text-amber-300' : ''}`}>
          <span className="flex items-center gap-1.5"><TrendingUp size={12} /> {lang === 'ar' ? 'تقييم تلقائي' : 'Auto-grade'}</span>
          <span className={`brain-sw ${prefs.autoGrade ? 'on' : ''}`}><i /></span>
        </button>
        <button onClick={() => toggle('pipeline')} className={`chip justify-between !py-2 ${prefs.pipeline !== false ? '!border-sky-400/40 !text-sky-300' : ''}`} title={lang === 'ar' ? 'خطّ البناء: المعمار → المبرمج → المصمم → المعلّم → الجني' : 'Build pipeline: Architect → Coder → Designer → Teacher → Genie'}>
          <span className="flex items-center gap-1.5"><Layers size={12} /> {lang === 'ar' ? 'خطّ البناء' : 'Pipeline'}</span>
          <span className={`brain-sw ${prefs.pipeline !== false ? 'on' : ''}`}><i /></span>
        </button>
        <button
          onClick={() => setP('paused', !prefs.paused)}
          className={`chip justify-between !py-2 ${prefs.paused ? '!border-amber-400/40 !text-amber-300' : '!border-emerald-400/20 !text-emerald-300'}`}
        >
          {prefs.paused ? <span className="flex items-center gap-1.5"><Play size={12} /> {lang === 'ar' ? 'استئناف' : 'Resume'}</span> : <span className="flex items-center gap-1.5"><Pause size={12} /> {lang === 'ar' ? 'إيقاف مؤقت' : 'Pause'}</span>}
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <Radio size={12} className="text-slate-400" />
        <span className="text-slate-400">{lang === 'ar' ? 'السرعة' : 'Speed'}</span>
        {['slow', 'normal', 'fast'].map((sp) => (
          <button
            key={sp}
            onClick={() => setP('speed', sp)}
            className={`chip !py-1 ${prefs.speed === sp ? '!border-cyan-400/50 !text-cyan-300' : ''}`}
          >
            {sp === 'slow' ? (lang === 'ar' ? 'بطيء' : 'Slow') : sp === 'fast' ? (lang === 'ar' ? 'سريع' : 'Fast') : (lang === 'ar' ? 'متوسط' : 'Normal')}
          </button>
        ))}
        <span className="ms-auto flex items-center gap-1.5">
          <Volume2 size={12} className="text-slate-400" />
          <button
            onClick={() => setP('speechOut', !prefs.speechOut)}
            className={`chip !py-1 ${prefs.speechOut ? '!border-emerald-400/40 !text-emerald-300' : ''}`}
            title={lang === 'ar' ? 'نطق ردود الوكلاء بالصوت' : 'Speak agent replies'}
          >
            {prefs.speechOut ? '🔊' : '🔇'} {lang === 'ar' ? 'نطق الردود' : 'Speak'}
          </button>
        </span>
        <button onClick={doExport} className="chip !py-1 !border-sky-400/40 !text-sky-300" title="تصدير كملف نصي">
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {lang === 'ar' ? 'تصدير' : 'Export'}
        </button>
      </div>

      {showModels && (
        <div className="rounded-2xl border border-white/10 bg-night-900/60 p-2.5">
          <p className="mb-2 text-[11px] font-bold text-white">{lang === 'ar' ? 'النموذج لكل وكيل' : 'Model per agent'}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {AGENT_KEYS.map((k) => (
              <label key={k} className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                {k}
                <select
                  dir="ltr"
                  className="input-lg !py-1.5 !text-[11px]"
                  value={prefs.models[k] || ''}
                  onChange={(e) => setP('models', { ...prefs.models, [k]: e.target.value })}
                >
                  <option value="">{lang === 'ar' ? 'الافتراضي' : 'Default'}</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* لوحة الوكلاء الحيّة */}
      <div className="grid grid-cols-2 gap-2">
        {AGENT_KEYS.map((name) => (
          <AgentCard key={name} name={name} st={board[name]} lang={lang} />
        ))}
      </div>

      {/* القناة الداخلية */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-white">
          <GitMerge size={12} className="text-cyan-300" /> {lang === 'ar' ? 'التواصل الداخلي بين الوكلاء' : 'Agent message channel'}
        </p>
        <div className="space-y-1.5">
          {!feed.length && <p className="text-[11px] text-slate-500">{lang === 'ar' ? 'لا رسائل بعد — أرسل مهمة وراقب الحوار هنا.' : 'No messages yet — send a task and watch here.'}</p>}
          {feed.map((f) => (
            <div key={f.id} className="brain-feed rounded-xl border border-white/8 bg-night-900/50 px-2.5 py-1.5">
              <p className="text-[10px] font-semibold text-slate-400">
                <span style={{ color: COLORS[f.from] || '#67e8f9' }}>{f.from}</span>
                {f.to ? <span className="opacity-60"> → <span style={{ color: COLORS[f.to] || '#67e8f9' }}>{f.to}</span></span> : null}
                <span className="ms-1 opacity-40">{new Date(f.ts).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en')}</span>
              </p>
              <p className="text-[11px] leading-relaxed text-slate-300">{f.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}