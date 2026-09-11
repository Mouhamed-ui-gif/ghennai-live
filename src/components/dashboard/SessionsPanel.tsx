import { useEffect, useState } from 'react'
import { History, Download, Volume2, X, Loader2, MessageSquare, PlayCircle } from 'lucide-react'
import { useApp, type SessionLite, type SessionMsg } from '../../store/app'
import { brain } from '../../api/client'
import { useI18n } from '../../i18n'
import { AGENT_MAP } from '../../config/agents'

function speak(text: string, lang: string) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
    u.rate = 1
    window.speechSynthesis.speak(u)
  } catch { /* noop */ }
}

export function SessionsPanel({ onClose }: { onClose: () => void }) {
  const { lang } = useI18n()
  const sessions = useApp((s) => s.sessions)
  const msgs = useApp((s) => s.sessionMsgs)
  const setMsgs = useApp((s) => s.setSessionMsgs)
  const [list, setList] = useState<SessionLite[]>([])
  const [currentId, setCurrentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SessionLite | null>(null)
  const [query, setQuery] = useState('')

  const refresh = () =>
    brain.sessions().then((d) => {
      const items = (d as { sessions: SessionLite[] }).sessions || []
      setList(items)
      useApp.getState().setSessions(items)
    }).catch(() => undefined)

  const load = (id?: string) => {
    setLoading(true)
    brain.sessionCurrent(id).then((d) => {
      const ms = (d as { id?: string; messages?: SessionMsg[] }).messages || []
      setMsgs(ms)
      setCurrentId((d as { id?: string }).id || '')
      setSelected(id ? list.find((s) => s.id === id) || null : null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    load()
    const iv = setInterval(() => {
      brain.sessionCurrent().then((d) => {
        const ms = (d as { messages?: SessionMsg[] }).messages || []
        if ((ms.length || 0) > msgs.length) setMsgs(ms)
      }).catch(() => undefined)
    }, 4000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doExport = async () => {
    const text = await brain.exportText()
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ghennai-session.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const roleLabel = (r: string) =>
    r === 'user' ? (lang === 'ar' ? 'أنت' : 'You') : r === 'system' ? (lang === 'ar' ? 'نظام' : 'System') : 'Ghennai'
  const roleColor = (r: string) =>
    r === 'user' ? '#67e8f9' : r === 'system' ? '#94a3b8' : '#a78bfa'

  return (
    <div className="flex h-full w-full max-w-[30rem] min-w-0 gap-2 border-s border-white/10 bg-night-950/35 p-3 backdrop-blur-md">
      {/* قائمة الجلسات */}
      <div className="flex w-2/5 min-w-0 flex-col rounded-2xl border border-white/8 bg-night-900/50 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-white"><History size={12} className="text-cyan-300" /> {lang === 'ar' ? 'المحادثات' : 'History'}</p>
          <button onClick={refresh} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <Loader2 size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'ar' ? 'ابحث في المحادثات…' : 'Search sessions…'}
          aria-label={lang === 'ar' ? 'البحث في المحادثات' : 'Search sessions'}
          className="input-lg mb-2 !rounded-xl !px-3 !py-1.5 text-[11px]"
        />
        <div className="flex-1 space-y-1 overflow-y-auto">
          {!list.length && <p className="p-2 text-[11px] text-slate-500">{lang === 'ar' ? 'لا جلسات بعد' : 'No sessions yet'}</p>}
          {list
            .filter((s) => {
              const q = query.trim().toLowerCase()
              return !q || s.title.toLowerCase().includes(q)
            })
            .map((s) => (
            <button
              key={s.id}
              onClick={() => load(s.id)}
              className={`w-full rounded-xl px-2 py-1.5 text-start transition ${s.id === currentId ? 'bg-cyan-400/10 text-cyan-300' : 'text-slate-300 hover:bg-white/8'}`}
            >
              <p className="truncate text-[11px] font-semibold">{s.title}</p>
              <p className="text-[9px] opacity-50">{new Date(s.ts).toLocaleString(lang === 'ar' ? 'ar' : 'en')}</p>
            </button>
          ))}
        </div>
      </div>

      {/* سجل المحادثة */}
      <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/8 bg-night-900/50 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-white">
            <MessageSquare size={12} className="text-cyan-300" />
            {selected ? selected.title : (lang === 'ar' ? 'الجلسة الحالية' : 'Active session')}
            {loading && <Loader2 size={11} className="animate-spin text-slate-400" />}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const last = [...msgs].reverse().find((m) => m.role === 'user')
                if (!last) return
                useApp.getState().setResume(last.content, selected?.title || (lang === 'ar' ? 'الجلسة السابقة' : 'Previous session'))
                useApp.getState().setSessionsOpen(false)
                useApp.getState().setBrainOpen(false)
                useApp.getState().resetChat()
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-emerald-300 transition hover:bg-emerald-400/10"
              title={lang === 'ar' ? 'تابع هذه الجلسة في المحادثة' : 'Continue this session'}
            >
              <PlayCircle size={13} />
              {lang === 'ar' ? 'واصل' : 'Resume'}
            </button>
            <button onClick={doExport} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="تصدير">
              <Download size={13} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
              <X size={13} />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {!msgs.length && <p className="p-2 text-[11px] text-slate-500">{lang === 'ar' ? 'أرسل رسالة لبدء الجلسة' : 'Send a message to start'}</p>}
          {msgs.map((m, i) => (
            <div key={i} className="rounded-xl border border-white/6 bg-night-950/40 px-2 py-1.5">
              <p className="flex items-center gap-1 text-[9px] font-bold" style={{ color: roleColor(m.role) }}>
                {m.agent && m.role !== 'user' ? ((AGENT_MAP as Record<string, { name?: string }>)[m.agent]?.name || m.agent) : roleLabel(m.role)}
                <span className="opacity-40">{m.role === 'user' ? new Date(m.ts).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en') : ''}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{m.content}</p>
              {m.role !== 'user' && (
                <button onClick={() => speak(m.content, lang)} className="mt-1 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white">
                  <Volume2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}