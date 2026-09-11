import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Bell, Rocket, ExternalLink, Server } from 'lucide-react'
import { useApp } from '../../store/app'
import { onLiveStatus, liveConnected } from '../../api/live'
import { api } from '../../api/client'
import { useI18n } from '../../i18n'
import { AGENT_MAP } from '../../config/agents'

const PUBLISHED_URL = 'https://mouhamed-ui-gif.github.io/ghennai-app/'

export function StatusBar() {
  const { lang } = useI18n()
  const agent = useApp((s) => s.agent)
  const busy = useApp((s) => s.busy)
  const toasts = useApp((s) => s.toasts)
  const deployState = useApp((s) => s.deployState)
  const deployUrl = useApp((s) => s.deployUrl)
  const [live, setLive] = useState<'on' | 'connecting' | 'off'>(liveConnected() ? 'on' : 'off')
  const [server, setServer] = useState(true)
  const [pings, setPings] = useState(0)

  useEffect(() => onLiveStatus((s) => setLive(s)), [])

  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      try {
        await api.status()
        if (!cancelled) {
          setServer(true)
          setPings((n) => n + 1)
        }
      } catch {
        if (!cancelled) setServer(false)
      }
    }
    void ping()
    const t = setInterval(ping, 15000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const agentColor = AGENT_MAP[agent]?.color || '#22d3ee'

  return (
    <footer data-statusbar className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-white/10 bg-night-950/75 px-3 text-[10px] text-slate-400 backdrop-blur-sm">
      <span className={`flex items-center gap-1.5 ${live === 'on' ? 'text-emerald-400' : live === 'connecting' ? 'text-amber-400' : 'text-rose-400'}`}>
        {live === 'on' ? <Wifi size={11} /> : <WifiOff size={11} />}
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
        {lang === 'ar' ? (live === 'on' ? 'حي' : 'مقطوع') : live === 'on' ? 'Live' : 'Offline'}
      </span>
      <span className={`flex items-center gap-1.5 ${server ? 'text-slate-300' : 'text-rose-400'}`} title="حالة الخادم">
        <Server size={11} />
        {server ? (lang === 'ar' ? 'الخادم متصل' : 'Server up') : (lang === 'ar' ? 'الخادم متوقف' : 'Server down')}
      </span>
      <span className="flex items-center gap-1.5 font-medium" style={{ color: agentColor }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: agentColor }} />
        {agent}
      </span>
      {busy && <span className="animate-pulse text-cyan-300">{lang === 'ar' ? '… الجني يعمل' : '… genie working'}</span>}
      <span className="flex items-center gap-1" title={lang === 'ar' ? 'الإشعارات' : 'Notifications'}>
        <Bell size={11} className={toasts.length ? 'text-amber-300' : ''} />
        {toasts.length}
      </span>

      <span className="min-w-0 flex-1" />

      {deployUrl && (
        <a href={deployUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-300 transition hover:text-white">
          <Rocket size={11} />
          <span className="max-w-[180px] truncate font-mono" dir="ltr">{deployUrl}</span>
          <ExternalLink size={10} />
        </a>
      )}
      {deployState === 'done' && !deployUrl && <span className="text-emerald-400">{lang === 'ar' ? 'تم النشر ✓' : 'Published ✓'}</span>}
      <a href={deployUrl || PUBLISHED_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-cyan-300 transition hover:text-white" title={lang === 'ar' ? 'افتح رابط الموقع المنشور مباشرة' : 'Open the published site link'}>
        <ExternalLink size={10} />
        {lang === 'ar' ? 'الرابط المباشر' : 'Direct link'}
      </a>
      <span className="hidden font-mono text-slate-600 sm:inline">ghennai · {pings ? `p${pings}` : ''}</span>
    </footer>
  )
}