import { useEffect, useState } from 'react'
import { MessageSquarePlus, FolderKanban, Settings, LogOut, Languages, Brain, History, Sparkles, Rocket, Cpu, PanelLeftClose, PanelLeftOpen, FolderTree, FileText, Focus as ZenIcon } from 'lucide-react'
import { useApp } from '../../store/app'
import { useI18n } from '../../i18n'
import { workspace, deploy, api, type FileNode } from '../../api/client'
import { Logo } from '../common/Logo'
import { FileTree } from '../arena/FileTree'

export function Sidebar() {
  const { t, lang, toggle } = useI18n()
  const user = useApp((s) => s.user)
  const resetChat = useApp((s) => s.resetChat)
  const logout = useApp((s) => s.logout)
  const collapsed = useApp((s) => s.sideCollapsed)
  const setCollapsed = useApp((s) => s.setSideCollapsed)
  const zen = useApp((s) => s.zen)
  const setZen = useApp((s) => s.setZen)
  const [view, setView] = useState<'projects' | 'settings' | 'files' | null>(null)

  const showFiles = view === 'files'

  const nav = [
    { icon: MessageSquarePlus, label: lang === 'ar' ? 'محادثة جديدة' : 'New chat', key: 'chat', hint: '⌘N' },
    { icon: Brain, label: lang === 'ar' ? 'خريطة العقول' : 'Agent Brain', key: 'brain' },
    { icon: History, label: lang === 'ar' ? 'المحادثات' : 'Chat History', key: 'sessions' },
    { icon: FolderTree, label: t('nav.files'), key: 'files', hint: lang === 'ar' ? 'شجرة' : 'tree' },
    { icon: FolderKanban, label: t('nav.projects'), key: 'projects' },
    { icon: Settings, label: t('nav.settings'), key: 'settings' },
  ]

  const item = (n: { icon: typeof Brain; label: string; key: string; hint?: string }) => {
    const Icon = n.icon
    return (
      <li key={n.key}>
        <button
          data-nav={n.key}
          title={collapsed ? n.label : undefined}
          onClick={() => {
            if (n.key === 'chat') {
              setView(null)
              useApp.getState().setBrainOpen(false)
              useApp.getState().setSessionsOpen(false)
              resetChat()
            } else if (n.key === 'brain') {
              setView(null)
              useApp.getState().setSessionsOpen(false)
              useApp.getState().setBrainOpen(true)
            } else if (n.key === 'sessions') {
              setView(null)
              useApp.getState().setBrainOpen(false)
              useApp.getState().setSessionsOpen(true)
            } else if (n.key === 'files') {
              setView(view === 'files' ? null : 'files')
              useApp.getState().setBrainOpen(false)
              useApp.getState().setSessionsOpen(false)
            } else if (n.key === 'projects') setView('projects')
            else setView('settings')
          }}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition hover:bg-white/5 hover:text-white ${
            (n.key === 'files' && showFiles) || (view === n.key) ? 'bg-white/8 text-white' : 'text-slate-300'
          }`}
        >
          <Icon size={16} className="shrink-0 text-slate-400" />
          {!collapsed && <span className="min-w-0 flex-1 truncate text-start">{n.label}</span>}
          {!collapsed && n.hint && <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{n.hint}</span>}
        </button>
      </li>
    )
  }

  return (
    <aside
      className={`sidebar-glass flex h-full flex-col border-e border-white/10 bg-night-950/40 backdrop-blur-xl ${collapsed ? 'w-[68px]' : 'w-[280px]'}`}
      data-sidebar
    >
      <div className="flex items-center justify-between px-3 py-4">
        {!collapsed && <Logo size={30} textClass="text-base text-white font-bold" />}
        {collapsed && <div className="mx-auto"><Logo size={28} withText={false} /></div>}
        <button
          data-collapse
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? (lang === 'ar' ? 'توسيع الشريط' : 'Expand sidebar') : (lang === 'ar' ? 'طيّ الشريط' : 'Collapse sidebar')}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-violet-500/15 to-cyan-500/15 px-3 py-2 ring-1 ring-white/10">
            <Sparkles size={13} className="text-amber-300" />
            <span className="text-[10px] leading-tight text-slate-300">
              {lang === 'ar' ? 'صُنع بإتقان بواسطة' : 'Crafted by'} <b className="text-white">محمد غناي</b> ⚡
            </span>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {collapsed && <ul className="flex flex-col items-center gap-1 px-2">{nav.map(item)}</ul>}
        {!collapsed && view === 'settings' && <SettingsPanel onBack={() => setView(null)} />}
        {!collapsed && view === 'projects' && <ProjectsPanel onBack={() => setView(null)} />}
        {!collapsed && view === 'files' && (
          <div className="flex h-full flex-col overflow-hidden">
            <button onClick={() => setView(null)} className="px-3 py-1 text-start text-xs text-cyan-400 hover:underline">
              ← {t('nav.home')}
            </button>
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('nav.files')}</p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FileTree />
            </div>
          </div>
        )}
        {!collapsed && !view && (
          <nav className="h-full overflow-y-auto px-3 pb-2">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('agents.title')}</p>
            <ul className="space-y-1">{nav.map(item)}</ul>
          </nav>
        )}
      </div>

      <div className="border-t border-white/5 p-3">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-center gap-2">
            <button onClick={toggle} className="chip w-full justify-center hover:bg-white/10">
              <Languages size={12} /> {lang === 'ar' ? 'English' : 'عربي'}
            </button>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setZen(!zen)}
            data-nav-zen
            className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition hover:bg-white/5 ${
              zen ? 'bg-amber-400/10 text-amber-300' : 'text-slate-300 hover:text-white'
            }`}
          >
            <ZenIcon size={16} className="text-slate-400" />
            {lang === 'ar' ? 'وضع التركيز (زين)' : 'Zen Mode'}
          </button>
        )}
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/5 p-2.5">
          {!collapsed && (
            <>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 text-sm font-bold text-white">
                {(user?.name || '؟')[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                <p className="truncate text-[11px] text-slate-500" dir="ltr">{user?.email}</p>
              </div>
            </>
          )}
          {collapsed && (
            <div className="mx-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 text-sm font-bold text-white">
              {(user?.name || '؟')[0]}
            </div>
          )}
          <button data-collapse-logout onClick={logout} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400" title={t('nav.logout')}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n()
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<{ hasToken: boolean; ghAvailable: boolean } | null>(null)
  const [providers, setProviders] = useState<{ local: boolean; cloud: { name: string; model: string }[] } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const s = (await deploy.status()) as { hasToken?: boolean; ghAvailable?: boolean }
        setStatus({ hasToken: !!s.hasToken, ghAvailable: !!s.ghAvailable })
      } catch {
        setStatus({ hasToken: false, ghAvailable: false })
      }
    })()
  }, [])

  useEffect(() => {
    api
      .status()
      .then((s) => {
        const p = s as { providers?: { ollama?: string; prefersCloud?: boolean; cloud?: { name: string; model: string }[] } }
        setProviders({ local: !!p.providers?.ollama, cloud: p.providers?.cloud || [] })
      })
      .catch(() => undefined)
  }, [])

  const save = async () => {
    try {
      const r = await fetch('/api/deploy/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useApp.getState().token}` },
        body: JSON.stringify({ token }),
      })
      if (r.ok) setSaved(true)
    } catch { /* noop */ }
  }

  return (
    <div className="space-y-3 px-1">
      <button onClick={onBack} className="text-xs text-cyan-400 hover:underline">← {t('nav.home')}</button>
      <p className="text-sm font-bold text-white">{t('settings.title')}</p>

      <div className="rounded-2xl bg-white/5 p-3">
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <Rocket size={12} className="text-cyan-400" /> {t('settings.deploy')}
        </label>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className={`chip ${status?.ghAvailable ? '!border-emerald-400/30 !text-emerald-300' : ''}`}>
            {status?.ghAvailable ? 'gh ✓ متصل' : 'gh غير متصل'}
          </span>
          <span className={`chip ${status?.hasToken ? '!border-emerald-400/30 !text-emerald-300' : ''}`}>
            {status?.hasToken ? 'توكن ✓' : 'بلا توكن'}
          </span>
        </div>
        <input
          className="input-lg mt-2 !py-2 text-xs"
          placeholder={t('settings.token')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          dir="ltr"
        />
        <button onClick={save} className="btn-primary mt-2 w-full !py-2 text-sm">
          {saved ? `✓ ${t('settings.saved')}` : t('settings.save')}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          {lang === 'ar' ? 'التوكن من GitHub Settings → Developer settings → Personal access tokens. يُخزَّن محليًا فقط.' : 'Token from GitHub Settings → Developer settings → Personal access tokens. Stored locally only.'}
        </p>
      </div>

      <div className="rounded-2xl bg-white/5 p-3 text-xs">
        <p className="mb-1.5 flex items-center gap-1 font-bold text-slate-200">
          <Cpu size={12} className="text-violet-400" /> {t('settings.model')}
        </p>
        <div className="grid gap-1 font-mono text-[11px] text-slate-400">
          <div className="flex justify-between"><span>مولد الردود</span><bdi>qwen2.5:3b</bdi></div>
          <div className="flex justify-between"><span>رؤية الصور</span><bdi>moondream</bdi></div>
          <div className="flex justify-between"><span>التشغيل</span><bdi>{providers?.local ? 'locally · Ollama' : 'بلا خادم'}</bdi></div>
        </div>
        {providers && (providers.cloud.length > 0 || providers.local) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {providers.local && <span className="chip !border-emerald-400/30 !text-emerald-300">Ollama ✓</span>}
            {providers.cloud.map((c) => (
              <span key={c.name} className="chip !border-violet-400/30 !text-violet-300" title={c.model}>
                {c.name} ✓
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          {lang === 'ar'
            ? 'أضِف مفاتيح في server/.env (GEMINI/OPENAI/GROQ/OPENROUTER/ANTHROPIC_API_KEY) — يردّ Ghennai عبر أسرع موفّر متصل ويتبقّى آخرهم كاحتياط.'
            : 'Add keys in server/.env (GEMINI/OPENAI/GROQ/OPENROUTER/ANTHROPIC_API_KEY) — Ghennai answers via the fastest connected provider and keeps the rest as fallback.'}
        </p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-3 text-xs ring-1 ring-white/10">
        <p className="flex items-center gap-1 text-[12px] font-bold text-white">
          <Sparkles size={12} className="text-amber-300" /> GHENNAI
        </p>
        <p className="mt-1.5 leading-relaxed text-slate-300">
          {lang === 'ar'
            ? 'محرك وكلاء ذكاء اصطناعي: 7 وكلاء (معمار، مبرمج، محلّق، معلّم، مصمّم، جني، صوتي) بعقل جماعي، ذاكرة، خط بناء (Architect→Coder→Designer→Teacher→Genie)، نشر مباشر على GitHub.'
            : 'An AI agent engine: 7 agents (Architect, Coder, Researcher, Teacher, Designer, Genie, Voice) with a shared brain, memory, build pipeline, GitHub deploy & vision.'}
        </p>
        <p className="mt-2 flex items-center gap-1 border-t border-white/10 pt-2 text-slate-400">
          {lang === 'ar' ? 'صُنع بحب بواسطة' : 'Crafted with love by'} <b className="text-white">محمد غناي</b>
        </p>
      </div>
    </div>
  )
}

function ProjectsPanel({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  useEffect(() => {
    useApp.getState().setBusy(true)
    workspace
      .tree()
      .then((d) => useApp.getState().setFiles((d as { tree: FileNode[] }).tree))
      .catch(() => undefined)
      .finally(() => useApp.getState().setBusy(false))
  }, [])

  const dirs = useApp((s) => s.files).filter((f) => f.type === 'dir')
  return (
    <div className="space-y-2 px-1">
      <button onClick={onBack} className="text-xs text-cyan-400 hover:underline">← {t('nav.home')}</button>
      <p className="text-sm font-bold text-white">{t('nav.projects')}</p>
      {!dirs.length && <p className="text-xs text-slate-500">لا مشاريع بعد.</p>}
      {dirs.map((d) => (
        <button key={d.path} className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-start text-sm text-slate-200 transition hover:bg-white/10">
          <FileText size={15} className="text-cyan-400" />
          <span dir="auto">{d.name}</span>
        </button>
      ))}
    </div>
  )
}