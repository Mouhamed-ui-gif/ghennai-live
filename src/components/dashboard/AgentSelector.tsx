import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, Code2, Globe, BookOpen, Palette, Gem, Mic, ChevronsUpDown, Search, Check } from 'lucide-react'
import { AGENTS } from '../../config/agents'
import { useApp } from '../../store/app'
import { useI18n } from '../../i18n'

const ICONS = { brain: Brain, code: Code2, globe: Globe, book: BookOpen, palette: Palette, gem: Gem, mic: Mic }

const ROLES: Record<string, [string, string]> = {
  Core: ['المعمار', 'Architect'],
  Coding: ['المنفّذ', 'Executor'],
  Research: ['المحقّق', 'Researcher'],
  Study: ['المعلّم', 'Teacher'],
  Design: ['المصمّم', 'Designer'],
  Genie: ['المنفّذ الأسمى', 'Supreme Executor'],
  Voice: ['الصوتي', 'Voice'],
}

export function AgentSelector() {
  const { t, lang } = useI18n()
  const agent = useApp((s) => s.agent)
  const setAgent = useApp((s) => s.setAgent)
  const busy = useApp((s) => s.busy)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const active = AGENTS.find((a) => a.id === agent)!
  const ActiveIcon = ICONS[active.icon]

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const list = AGENTS.filter((a) =>
    (t(`agent.${a.id}` as never) + (ROLES[a.id]?.[0] || '') + (a.skillsAr.join(' '))).toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div ref={boxRef} className="relative shrink-0" data-agent-selector>
      <button
        disabled={busy}
        onClick={() => { setOpen((o) => !o); setQ('') }}
        className="relative flex items-center gap-1.5 rounded-2xl border px-2.5 py-2 text-[12px] font-semibold transition disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${active.color}22, ${active.world.glow}11)`, borderColor: `${active.color}55`, color: active.color }}
        title={lang === 'ar' ? 'اختر الوكيل' : 'Choose agent'}
      >
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10">
          <ActiveIcon size={13} />
        </span>
        <span className="max-w-[110px] truncate">{t(`agent.${active.id}` as never)}</span>
        <ChevronsUpDown size={13} className="opacity-60" />
        <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: active.color, boxShadow: `0 0 8px ${active.color}` }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="glass-strong absolute bottom-full mb-2 z-50 w-72 overflow-hidden rounded-2xl border border-white/10"
            style={{ insetInlineEnd: 0 }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <Search size={13} className="text-slate-400" />
              <input
                data-agent-search
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث عن وكيل…' : 'Search agents…'}
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {list.map((a) => {
                const Icon = ICONS[a.icon]
                const isActive = agent === a.id
                const role = ROLES[a.id]?.[lang === 'ar' ? 0 : 1] || ''
                return (
                  <button
                    key={a.id}
                    data-agent={a.id}
                    disabled={busy}
                    onClick={() => { setAgent(a.id); setOpen(false) }}
                    className={`group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 transition group-hover:rotate-6" style={{ color: a.color }}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-white">
                        {t(`agent.${a.id}` as never)}
                        <span className="text-[10px] font-medium" style={{ color: a.color }}>{role}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                        {(lang === 'ar' ? a.skillsAr : a.skillsEn).slice(0, 2).join(' · ')}
                      </span>
                    </span>
                    {isActive && <Check size={15} className="mt-1 shrink-0" style={{ color: a.color }} />}
                  </button>
                )
              })}
              {!list.length && <p className="px-3 py-4 text-center text-xs text-slate-500">لا نتائج</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}