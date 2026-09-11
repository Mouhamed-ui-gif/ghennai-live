import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { onGlobalEvent } from '../../api/events'
import { AGENT_MAP } from '../../config/agents'
import { useI18n } from '../../i18n'

interface ActivityItem {
  id: string
  time: number
  agent: string
  tool?: string
  message?: string
  status: string
}

export function ActivityFeed() {
  const { t } = useI18n()
  const [items, setItems] = useState<ActivityItem[]>([])

  useEffect(() => {
    const off = onGlobalEvent((e) => {
      if (e.type === 'agent_event') {
        const ev = e as unknown as { agent?: string; message?: string; status?: string; tool?: string }
        const item: ActivityItem = {
          id: Math.random().toString(36).slice(2, 9),
          time: Date.now(),
          agent: ev.agent || 'Core',
          tool: ev.tool,
          message: ev.message || '',
          status: ev.status || 'running',
        }
        setItems((p) => [item, ...p].slice(0, 40))
      }
    })
    return () => { off() }
  }, [])

  const badgeFor = (status: string) =>
    status === 'success' ? 'bg-emerald-500/15 text-emerald-300' : status === 'error' ? 'bg-rose-500/15 text-rose-300' : 'bg-cyan-500/15 text-cyan-300 animate-pulse'

  return (
    <div className="flex h-full flex-col rounded-2xl bg-night-900/70 p-3">
      <p className="flex items-center gap-2 px-1 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
        <Activity size={13} /> النشاط المباشر
      </p>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {!items.length && <p className="px-1 text-xs text-slate-600">{t('activity.empty')}</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-start gap-2 rounded-xl bg-white/[0.03] p-2 text-[12px] leading-snug">
            <span className={`chip w-fit shrink-0 !px-1.5 !py-0.5 text-[10px] ${badgeFor(it.status)}`}>{it.status === 'running' ? '···' : it.status === 'success' ? '✓' : '✗'}</span>
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: AGENT_MAP[it.agent as keyof typeof AGENT_MAP]?.color || '#94a3b8' }}>
                {it.agent}
              </p>
              <p className="break-words text-slate-400" dir="auto">
                {it.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}