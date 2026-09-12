import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { useApp } from '../store/app'
import { workspace } from '../api/client'
import { initVoiceTts } from '../components/dashboard/voice'
import { Sidebar } from '../components/dashboard/Sidebar'
import { ChatPanel } from '../components/dashboard/ChatPanel'
import { ActivityFeed } from '../components/dashboard/ActivityFeed'
import { WorldBackground } from '../components/dashboard/WorldBackground'
import { Logo } from '../components/common/Logo'
import { rearmEvents } from '../api/events'
import { initLive, closeLive } from '../api/live'
import { AGENT_MAP } from '../config/agents'
import { StarDust } from '../components/common/StarDust'
import { StatusBar } from '../components/dashboard/StatusBar'
import { Menu, LogOut, Loader2 } from 'lucide-react'

const ArenaWorkbench = lazy(() => import('../components/arena/ArenaWorkbench').then((m) => ({ default: m.ArenaWorkbench })))
const BrainPanel = lazy(() => import('../components/dashboard/BrainPanel').then((m) => ({ default: m.BrainPanel })))
const SessionsPanel = lazy(() => import('../components/dashboard/SessionsPanel').then((m) => ({ default: m.SessionsPanel })))
const CodingMode = lazy(() => import('../components/coding/CodingMode').then((m) => ({ default: m.CodingMode })))

function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width:1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width:1024px)')
    const fn = () => setD(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return d
}

function Fallback() {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-night-950/30">
      <Loader2 size={22} className="animate-spin text-cyan-400" />
    </div>
  )
}

export function Dashboard() {
  const arenaOpen = useApp((s) => s.arenaOpen)
  const brainOpen = useApp((s) => s.brainOpen)
  const sessionsOpen = useApp((s) => s.sessionsOpen)
  const user = useApp((s) => s.user)
  const agent = useApp((s) => s.agent)
  const zen = useApp((s) => s.zen)
  const codingOpen = useApp((s) => s.codingOpen)
  const isDesktop = useIsDesktop()
  const [sideOpen, setSideOpen] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    rearmEvents()
    initVoiceTts()
    initLive()
    workspace
      .tree()
      .then((d) => useApp.getState().setFiles((d as { tree: never }).tree))
      .catch(() => undefined)
    useApp.getState().restoreMsgs()
    mounted.current = true
    return () => {
      closeLive()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) {
        if (e.key === 'Escape') {
          if (useApp.getState().codingOpen) useApp.getState().exitCodingMode()
          else if (zen) useApp.getState().setZen(false)
        }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        useApp.getState().requestFocus()
      } else if (k === 'n') {
        e.preventDefault()
        useApp.getState().resetChat()
      } else if (k === 'b') {
        e.preventDefault()
        if (isDesktop) useApp.getState().setSideCollapsed(!useApp.getState().sideCollapsed)
        else setSideOpen((o) => !o)
      } else if (k === 'c' && e.altKey) {
        e.preventDefault()
        useApp.getState().exitCodingMode()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [zen, isDesktop])

  const world = AGENT_MAP[agent].world
  const rightVisible = isDesktop && !zen

  const rightSlot = arenaOpen ? (
    <ArenaWorkbench onClose={() => useApp.getState().closeArena()} />
  ) : brainOpen ? (
    <BrainPanel onClose={() => useApp.getState().setBrainOpen(false)} />
  ) : sessionsOpen ? (
    <SessionsPanel onClose={() => useApp.getState().setSessionsOpen(false)} />
  ) : (
    <aside className="flex h-full min-h-0 flex-col border-s border-white/5 p-3">
      <ActivityFeed />
      <p className="mt-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: world.glow }} />
        <span style={{ color: AGENT_MAP[agent].color }}>{agent}</span> · {world.symbol}
      </p>
    </aside>
  )

  return (
    <div className="bg-animated relative flex h-screen w-full overflow-hidden">
      <WorldBackground agent={agent} />
      <StarDust color={AGENT_MAP[agent].color} density={14} />

      {codingOpen && (
        <Suspense fallback={<Fallback />}>
          <CodingMode />
        </Suspense>
      )}

      {!zen && (
        <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/5 bg-night-900/80 px-3 py-2 backdrop-blur-lg lg:hidden">
          <Logo size={26} textClass="text-base" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{user?.name}</span>
            <button onClick={() => useApp.getState().logout()} className="rounded-lg p-1.5 text-slate-400">
              <LogOut size={16} />
            </button>
            <button onClick={() => setSideOpen((o) => !o)} className="rounded-lg p-1.5 text-slate-300">
              <Menu size={20} />
            </button>
          </div>
        </div>
      )}

      {!zen && (
        <div
          className={`fixed inset-y-0 z-30 shadow-2xl transition-transform lg:static lg:translate-x-0 lg:shadow-none lg:transition-none ${
            sideOpen ? 'translate-x-0 ltr:translate-x-0 rtl:translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0'
          }`}
        >
          <Sidebar />
        </div>
      )}
      {sideOpen && !zen && <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setSideOpen(false)} />}

      <div className="relative z-10 flex h-full min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <Group orientation="horizontal" className="flex h-full min-w-0 flex-1">
            <Panel id="chat" minSize={30} defaultSize={rightVisible ? 55 : 100}>
              <div className="h-full">
                <ChatPanel />
              </div>
            </Panel>
            {rightVisible && (
              <>
                <Separator className="w-1.5 bg-white/5 transition-colors hover:bg-cyan-400/40" />
                <Panel id="right" minSize={28} defaultSize={45}>
                  <div className="h-full min-h-0 overflow-hidden lg:block">
                    <Suspense fallback={<Fallback />}>{rightSlot}</Suspense>
                  </div>
                </Panel>
              </>
            )}
          </Group>
        </div>
        <StatusBar />
      </div>
    </div>
  )
}