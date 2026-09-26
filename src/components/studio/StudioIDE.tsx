import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  X, FolderTree, Eye, Code2, Columns2, Bot, Send, TerminalSquare, Play, Square,
  RotateCw, ExternalLink, RefreshCw, FilePlus2, FolderPlus, Trash2, Search,
  Monitor, Tablet, Smartphone, CheckCircle2, XCircle, Loader2, GitBranch,
  ShieldCheck, ChevronDown, ChevronUp, Plus, ArrowLeft, Copy, Ban,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Cpu, Zap, Maximize2, Minimize2, StopCircle,
} from 'lucide-react'
import { useApp, type FileNode } from '../../store/app'
import { workspace, preview, projects, getToken } from '../../api/client'
import { builder, type BuilderTemplate, type VerifyCheck, type GitInfo, type ProviderStatus } from '../../api/builder'
import { onGlobalEvent } from '../../api/events'
import type { SSEvent } from '../../api/client'
import { useChat } from '../../hooks/useChat'
import '../../components/arena/EditorLoader'

type CenterTab = 'preview' | 'code' | 'split'
type RightTab = 'agent' | 'git' | 'checks'
type Device = 'desktop' | 'tablet' | 'mobile'
type MobileTab = 'files' | 'view' | 'agent' | 'term'
type PreviewState = 'idle' | 'starting' | 'running' | 'failed' | 'stopped'

const absUrl = (u?: string | null) => {
  if (!u) return null
  return u.startsWith('/') ? `${window.location.origin}${u}` : u
}

function langOf(name: string) {
  const e = name.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx'].includes(e)) return 'typescript'
  if (['js', 'jsx', 'mjs'].includes(e)) return 'javascript'
  if (['html', 'htm'].includes(e)) return 'html'
  if (['css', 'scss', 'less'].includes(e)) return 'css'
  if (['json'].includes(e)) return 'json'
  if (['md'].includes(e)) return 'markdown'
  return 'plaintext'
}

const DEV_W: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '390px' }

interface TermLine { kind: 'cmd' | 'out' | 'err' | 'info'; text: string }

function FlatTree({ nodes, depth, openFile, onOpen, onDelete, onRename, filter }: {
  nodes: FileNode[]; depth: number; openFile: string | null
  onOpen: (n: FileNode) => void; onDelete: (n: FileNode) => void; onRename: (n: FileNode) => void
  filter: string
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const q = filter.trim().toLowerCase()
  return (
    <>
      {nodes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.type === 'dir').map((n) => {
        const p = n.path
        if (n.type === 'dir') {
          const shut = collapsed[p]
          const kids = (n.children || []).filter((k) => !q || k.name.toLowerCase().includes(q))
          if (q && kids.length === 0) return null
          return (
            <div key={p}>
              <div className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-slate-300 hover:bg-white/5" style={{ paddingInlineStart: 8 + depth * 12 }}>
                <button onClick={() => setCollapsed((c) => ({ ...c, [p]: !c[p] }))} className="flex flex-1 items-center gap-1.5 text-start">
                  <span className="text-[10px] text-slate-500">{shut ? '▶' : '▼'}</span>
                  <span>📁</span>
                  <span className="truncate font-medium">{n.name}</span>
                </button>
                <button title="حذف المجلد" onClick={() => onDelete(n)} className="hidden rounded p-0.5 text-slate-500 hover:bg-red-500/20 hover:text-red-300 group-hover:block"><Trash2 size={12} /></button>
              </div>
              {!shut && <FlatTree nodes={n.children || []} depth={depth + 1} openFile={openFile} onOpen={onOpen} onDelete={onDelete} onRename={onRename} filter={filter} />}
            </div>
          )
        }
        return (
          <div key={p} className="group flex items-center gap-1 rounded-md pe-1 text-[12px] hover:bg-white/5" style={{ paddingInlineStart: 8 + depth * 12 }}>
            <button onClick={() => onOpen(n)} className={`flex flex-1 items-center gap-1.5 rounded px-1 py-1 text-start ${openFile === p ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-300'}`}>
              <span>📄</span>
              <span className="truncate font-mono" dir="ltr">{n.name}</span>
            </button>
            <button title="إعادة تسمية" onClick={() => onRename(n)} className="hidden rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-white group-hover:block"><Copy size={11} /></button>
            <button title="حذف" onClick={() => onDelete(n)} className="hidden rounded p-0.5 text-slate-500 hover:bg-red-500/20 hover:text-red-300 group-hover:block"><Trash2 size={12} /></button>
          </div>
        )
      })}
    </>
  )
}

export function StudioIDE() {
  const closeStudioIDE = useApp((s) => s.closeStudioIDE)
  const studioRoot = useApp((s) => s.studioRoot)
  const setStudioRoot = useApp((s) => s.setStudioRoot)
  const codingProjectFolder = useApp((s) => s.codingProjectFolder)
  const busy = useApp((s) => s.busy)
  const activity = useApp((s) => s.activity)
  const previewVariant = useApp((s) => s.previewVariant)
  const liveFiles = useApp((s) => s.liveFiles)
  const pushToast = useApp((s) => s.pushToast)
  const { send } = useChat()

  const [root, setRoot] = useState<string | null>(studioRoot)
  const [projList, setProjList] = useState<{ id: string; name: string; root: string; url?: string }[]>([])
  const [tree, setTree] = useState<FileNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [centerTab, setCenterTab] = useState<CenterTab>('preview')
  const [device, setDevice] = useState<Device>('desktop')
  const [rightTab, setRightTab] = useState<RightTab>('agent')
  const [mobileTab, setMobileTab] = useState<MobileTab>('view')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [termOpen, setTermOpen] = useState(true)

  const [pvState, setPvState] = useState<PreviewState>('idle')
  const [pvUrl, setPvUrl] = useState<string | null>(null)
  const [pvId, setPvId] = useState<string | null>(null)
  const [pvErr, setPvErr] = useState<string | null>(null)
  const [pvKey, setPvKey] = useState(0)

  const [termLines, setTermLines] = useState<TermLine[]>([])
  const [termInput, setTermInput] = useState('')
  const [termBusy, setTermBusy] = useState(false)
  const termBoxRef = useRef<HTMLDivElement>(null)
  const termAuto = useRef(true)

  const [chatInput, setChatInput] = useState('')
  const [checks, setChecks] = useState<VerifyCheck[] | null>(null)
  const [verifyState, setVerifyState] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle')
  const [git, setGit] = useState<GitInfo | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')

  const [showNew, setShowNew] = useState(false)
  const [templates, setTemplates] = useState<BuilderTemplate[] | null>(null)
  const [tplSel, setTplSel] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [scaffolding, setScaffolding] = useState(false)

  // المزودون الحقيقيون + التنفيذ عبرهم
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null)
  const [provider, setProvider] = useState<string | null>(() => {
    try { return localStorage.getItem('ghn_provider') } catch { return null }
  })
  const [agentTask, setAgentTask] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [liveTab, setLiveTab] = useState<string | null>(null)
  const liveBoxRef = useRef<HTMLDivElement>(null)
  const prevBusy = useRef(false)

  const pushTerm = useCallback((l: TermLine) => {
    setTermLines((prev) => [...prev.slice(-400), l])
  }, [])

  useEffect(() => {
    if (termAuto.current && termBoxRef.current) termBoxRef.current.scrollTop = termBoxRef.current.scrollHeight
  }, [termLines])

  // اعتماد مجلد المشروع القادم من الـ agent تلقائيًا إن لم يختر المستخدم مشروعًا
  useEffect(() => {
    if (!root && codingProjectFolder) {
      setRoot(codingProjectFolder)
      setStudioRoot(codingProjectFolder)
    }
  }, [codingProjectFolder, root, setStudioRoot])

  const loadProjects = useCallback(async () => {
    try {
      const d = await projects.list() as { projects: { id: string; name: string; root: string; url?: string }[] }
      setProjList(d.projects || [])
      return d.projects || []
    } catch {
      return []
    }
  }, [])

  const loadTree = useCallback(async (r: string) => {
    setTreeLoading(true)
    try {
      const d = await workspace.tree(r) as { tree: FileNode[] }
      setTree(d.tree || [])
    } catch {
      setTree([])
    } finally {
      setTreeLoading(false)
    }
  }, [])

  const loadGit = useCallback(async (r: string) => {
    try {
      setGit(await builder.git(r))
    } catch {
      setGit({ ok: false, isRepo: false })
    }
  }, [])

  useEffect(() => {
    void loadProjects().then((list) => {
      if (!root && list.length > 0) {
        setRoot(list[0].root)
        setStudioRoot(list[0].root)
      }
    })
    builder.providers().then((d) => {
      setProviders(d.providers || [])
      const avail = (d.providers || []).filter((p) => p.available && (p.capabilities || []).includes('coding'))
      setProvider((cur) => {
        if (cur && avail.some((p) => p.name === cur)) return cur
        return avail[0]?.name || null
      })
    }).catch(() => setProviders([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!root) return
    void loadTree(root)
    void loadGit(root)
    setOpenFile(null)
    setFileContent('')
    setDirty(false)
    setChecks(null)
    setVerifyState('idle')
    setPvState('idle')
    setPvUrl(null)
    setPvId(null)
    setPvErr(null)
    pushTerm({ kind: 'info', text: `📂 المشروع: ${root}\n` })
  }, [root, loadTree, loadGit, pushTerm])

  // عند انتهاء الوكيل: أرِه المعاينة تلقائيًا (طلب صريح) — فقط إن وُجدت معاينة
  useEffect(() => {
    if (prevBusy.current && !busy && pvUrl) {
      setCenterTab('preview')
      pushToast({ kind: 'success', title: 'اكتمل العمل ✓', message: 'المعاينة محدّثة أمامك الآن' })
    }
    prevBusy.current = busy
  }, [busy, pvUrl, pushToast])

  // تتبع الملف الجاري كتابته حرفًا بحرف (بثّ حقيقي من code_token)
  const liveEntries = useMemo(() => Object.entries(liveFiles).filter(([, v]) => v), [liveFiles])
  const streaming = busy && liveEntries.length > 0
  useEffect(() => {
    if (streaming) {
      const last = liveEntries[liveEntries.length - 1][0]
      setLiveTab((cur) => cur || last)
      if (centerTab === 'preview') setCenterTab('split')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])
  useEffect(() => {
    if (liveBoxRef.current) liveBoxRef.current.scrollTop = liveBoxRef.current.scrollHeight
  }, [liveFiles, liveTab])

  const pickProvider = useCallback((name: string | null) => {
    setProvider(name)
    try {
      if (name) localStorage.setItem('ghn_provider', name)
      else localStorage.removeItem('ghn_provider')
    } catch { /* noop */ }
  }, [])

  const runViaProvider = useCallback(async () => {
    const task = agentTask.trim()
    if (!task || !root || agentRunning) return
    setAgentRunning(true)
    setTermOpen(true)
    pushTerm({ kind: 'cmd', text: `$ agent-run [${provider || 'auto'}] ${task.slice(0, 160)}\n` })
    try {
      const r = await builder.agentRun(root, task, provider)
      if (r.output) pushTerm({ kind: 'out', text: (r.output.endsWith('\n') ? r.output : r.output + '\n').slice(-4000) })
      if (r.stderr) pushTerm({ kind: 'err', text: (r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n').slice(-2000) })
      pushTerm({ kind: r.ok ? 'out' : 'err', text: r.ok ? `✓ [${r.provider}] exit ${r.exitCode}\n` : `✗ [${r.provider || '?'}] ${r.error || `exit ${r.exitCode}`}\n`.slice(0, 300) })
      if (r.ok) {
        pushToast({ kind: 'success', title: `نفّذ عبر ${r.provider} ✓`, message: 'حُدّثت الملفات والمعاينة' })
        await loadTree(root)
        await loadGit(root)
        if (centerTab === 'code') setCenterTab('split')
        setPvKey((k) => k + 1)
      } else {
        pushToast({ kind: 'error', title: 'فشل التنفيذ', message: (r.error || '').slice(0, 140) })
      }
      setAgentTask('')
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    } finally {
      setAgentRunning(false)
    }
  }, [agentTask, root, agentRunning, provider, pushTerm, pushToast, loadTree, loadGit, centerTab])

  const stopAgentRun = useCallback(async () => {
    try {
      await builder.agentStop()
      pushTerm({ kind: 'info', text: '⏹ أُرسل طلب الإيقاف…\n' })
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    }
  }, [pushTerm])
  useEffect(() => {
    const off = onGlobalEvent((e: SSEvent) => {
      const t = e.type
      if (t === 'workspace_changed') {
        const p = String((e as unknown as { path?: string }).path || '')
        if (root && (p === root || p.startsWith(root + '/'))) {
          void loadTree(root)
          setPvKey((k) => k + 1)
        }
      } else if (t === 'terminal_data' || t === 'preview_log') {
        const ev = e as unknown as { kind?: string; text?: string; data?: string }
        const text = String(ev.text ?? ev.data ?? '')
        if (!text) return
        const kind = ev.kind === 'err' ? 'err' : ev.kind === 'cmd' ? 'cmd' : 'out'
        pushTerm({ kind, text })
      } else if (t === 'preview_started') {
        const ev = e as unknown as { id?: string; port?: number }
        if (ev.id) {
          setPvId(ev.id)
          setPvState('running')
          setPvErr(null)
          setPvUrl(`/api/preview/p/${encodeURIComponent(ev.id)}/?token=${encodeURIComponent(getToken() || '')}`)
        }
      } else if (t === 'preview_stopped') {
        const ev = e as unknown as { reason?: string; code?: number }
        setPvState((s) => (s === 'running' ? 'stopped' : s))
        if (ev.reason) pushTerm({ kind: 'info', text: `⏹️ ${ev.reason}\n` })
      }
    })
    return () => { off() }
  }, [root, loadTree, pushTerm])

  // إعادة تحميل المعاينة عند bump من الـ agent
  useEffect(() => {
    if (previewVariant > 0 && pvUrl) setPvKey((k) => k + 1)
  }, [previewVariant, pvUrl])

  const openFileAt = useCallback(async (path: string) => {
    try {
      const d = await workspace.read(path) as { content?: string; directory?: boolean }
      if (d.directory) return
      setOpenFile(path)
      setFileContent(String(d.content ?? ''))
      setDirty(false)
      if (centerTab === 'preview') setCenterTab('split')
    } catch {
      pushTerm({ kind: 'err', text: `تعذر فتح ${path}\n` })
    }
  }, [centerTab, pushTerm])

  const saveFile = useCallback(async (content?: string) => {
    if (!openFile) return
    const text = content ?? fileContent
    setSaving(true)
    try {
      await workspace.write(openFile, text)
      setDirty(false)
    } catch {
      pushTerm({ kind: 'err', text: `تعذر حفظ ${openFile}\n` })
    } finally {
      setSaving(false)
    }
  }, [openFile, fileContent, pushTerm])

  const createFile = useCallback(async () => {
    if (!root) return
    const name = window.prompt('اسم الملف الجديد (مثال: about.html):')
    if (!name?.trim()) return
    const p = `${root}/${name.trim().replace(/^\/+/, '')}`
    try {
      await workspace.touch(p)
      await loadTree(root)
      await openFileAt(p)
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    }
  }, [root, loadTree, openFileAt, pushTerm])

  const createFolder = useCallback(async () => {
    if (!root) return
    const name = window.prompt('اسم المجلد الجديد:')
    if (!name?.trim()) return
    try {
      await workspace.mkdir(`${root}/${name.trim().replace(/^\/+/, '')}`)
      await loadTree(root)
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    }
  }, [root, loadTree, pushTerm])

  const deleteNode = useCallback(async (n: FileNode) => {
    if (!window.confirm(`حذف «${n.name}» نهائيًا؟`)) return
    try {
      await workspace.del(n.path)
      if (openFile === n.path) { setOpenFile(null); setFileContent(''); setDirty(false) }
      if (root) await loadTree(root)
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    }
  }, [openFile, root, loadTree, pushTerm])

  const renameNode = useCallback(async (n: FileNode) => {
    if (n.type !== 'file') { pushTerm({ kind: 'info', text: 'إعادة التسمية مدعومة للملفات حاليًا\n' }); return }
    const base = n.path.split('/').slice(0, -1).join('/')
    const to = window.prompt('الاسم الجديد:', n.name)
    if (!to?.trim() || to.trim() === n.name) return
    const dest = `${base}/${to.trim()}`
    try {
      const d = await workspace.read(n.path) as { content?: string }
      await workspace.write(dest, String(d.content ?? ''))
      await workspace.del(n.path)
      if (openFile === n.path) setOpenFile(dest)
      if (root) await loadTree(root)
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    }
  }, [openFile, root, loadTree, pushTerm])

  const startPreview = useCallback(async () => {
    if (!root) return
    setPvState('starting')
    setPvErr(null)
    pushTerm({ kind: 'cmd', text: `$ preview start ${root}\n` })
    try {
      const r = await preview.start(root) as { ok: boolean; kind: string; url?: string; id?: string | null }
      if (r.kind === 'static' && r.url) {
        setPvUrl(absUrl(r.url))
        setPvId(null)
        setPvState('running')
        pushTerm({ kind: 'out', text: `👁️ معاينة ثابتة: ${r.url}\n` })
      } else if (r.id) {
        setPvId(r.id)
        setPvUrl(preview.url(r.id))
        setPvState('running')
      } else {
        throw new Error('استجابة غير متوقعة من خادم المعاينة')
      }
    } catch (err) {
      setPvState('failed')
      setPvErr(String((err as Error).message || err))
      pushTerm({ kind: 'err', text: `🔴 فشلت المعاينة: ${String((err as Error).message || err).slice(0, 300)}\n` })
    }
  }, [root, pushTerm])

  const stopPreview = useCallback(async () => {
    if (!pvId) { setPvState('stopped'); setPvUrl(null); return }
    try {
      await preview.stop(pvId)
    } catch { /* الحالة ستتحدث عبر SSE */ }
    setPvState('stopped')
  }, [pvId])

  const runVerify = useCallback(async () => {
    if (!root) return
    setVerifyState('running')
    setRightTab('checks')
    pushTerm({ kind: 'cmd', text: `$ verify ${root}\n` })
    try {
      const r = await builder.verify(root)
      setChecks(r.checks)
      setVerifyState(r.ok ? 'ok' : 'fail')
      pushTerm({ kind: r.ok ? 'out' : 'err', text: r.ok ? '✓ كل الفحوصات ناجحة\n' : `✗ ${r.checks.filter((c) => !c.ok).length} فحص فاشل — راجع تبويب الفحوصات\n` })
    } catch (err) {
      setVerifyState('fail')
      setChecks(null)
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    }
  }, [root, pushTerm])

  const runTerm = useCallback(async () => {
    const cmd = termInput.trim()
    if (!cmd || !root || termBusy) return
    setTermInput('')
    setTermBusy(true)
    try {
      const r = await workspace.run(root, cmd) as { ok: boolean; output?: string; stderr?: string; code?: number }
      if (r.output) pushTerm({ kind: 'out', text: r.output.endsWith('\n') ? r.output : r.output + '\n' })
      if (r.stderr) pushTerm({ kind: 'err', text: r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n' })
      pushTerm({ kind: r.ok ? 'info' : 'err', text: `— exit ${r.code ?? '?'} ${r.ok ? '✓' : '✗'}\n` })
    } catch (err) {
      pushTerm({ kind: 'err', text: `${String((err as Error).message || err)}\n` })
    } finally {
      setTermBusy(false)
    }
  }, [termInput, root, termBusy, pushTerm])

  const doCommit = useCallback(async () => {
    if (!root || committing) return
    const msg = commitMsg.trim() || 'update via studio'
    setCommitting(true)
    try {
      const r = await builder.commit(root, msg)
      if (r.empty) pushTerm({ kind: 'info', text: 'لا تغييرات لـ commit\n' })
      else {
        pushTerm({ kind: 'out', text: `✓ commit ${r.commit || ''}: ${msg}\n` })
        setCommitMsg('')
      }
      await loadGit(root)
    } catch (err) {
      pushTerm({ kind: 'err', text: `فشل الـ commit: ${String((err as Error).message || err)}\n` })
    } finally {
      setCommitting(false)
    }
  }, [root, committing, commitMsg, loadGit, pushTerm])

  const sendScoped = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || !root || busy) return
    setChatInput('')
    await send(`[المشروع: ${root} — اعمل داخل هذا المجلد فقط، عدّل الملفات الموجودة بدل إنشاء بدائل، ثم تحقق بالقراءة]\n${text}`, 'Coding')
    if (root) void loadGit(root)
  }, [chatInput, root, busy, send, loadGit])

  const openTemplates = useCallback(async () => {
    setShowNew(true)
    setTemplates(null)
    try {
      const d = await builder.templates()
      setTemplates(d.templates)
      if (d.templates.length > 0) setTplSel(d.templates[0].id)
    } catch {
      setTemplates([])
    }
  }, [])

  const doScaffold = useCallback(async () => {
    if (!tplSel || !newName.trim() || scaffolding) return
    setScaffolding(true)
    try {
      const r = await builder.scaffold(tplSel, newName.trim())
      const list = await loadProjects()
      setProjList(list)
      setRoot(r.root)
      setStudioRoot(r.root)
      setShowNew(false)
      setNewName('')
      setPvUrl(absUrl(r.url))
      setPvState('running')
      setPvErr(null)
      pushTerm({ kind: 'out', text: `✓ أُنشئ المشروع: ${r.root} (${r.count} ملفات) — ${r.url}\n` })
      if (!r.git?.ok) pushTerm({ kind: 'err', text: `⚠️ تعذر تهيئة git: ${r.git?.error || '؟'}\n` })
    } catch (err) {
      pushTerm({ kind: 'err', text: `فشل إنشاء المشروع: ${String((err as Error).message || err)}\n` })
    } finally {
      setScaffolding(false)
    }
  }, [tplSel, newName, scaffolding, loadProjects, setStudioRoot, pushTerm])

  const status = useMemo(() => {
    if (busy) return { label: 'الوكيل يعمل…', cls: 'bg-sky-500/15 text-sky-300', dot: 'bg-sky-400 animate-pulse' }
    if (pvState === 'starting') return { label: 'تشغيل المعاينة…', cls: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400 animate-pulse' }
    if (pvState === 'failed') return { label: '🔴 المعاينة فشلت', cls: 'bg-red-500/15 text-red-300', dot: 'bg-red-400' }
    if (pvState === 'running') return { label: '🟢 حي', cls: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400' }
    if (verifyState === 'fail') return { label: 'به مشاكل', cls: 'bg-red-500/15 text-red-300', dot: 'bg-red-400' }
    if (verifyState === 'ok') return { label: '✓ مُتحقق', cls: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400' }
    return { label: 'خامل', cls: 'bg-white/5 text-slate-400', dot: 'bg-slate-500' }
  }, [busy, pvState, verifyState])

  const recentActivity = useMemo(() => activity.slice(0, 80), [activity])

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#070b14] text-slate-200" style={{ backgroundImage: 'radial-gradient(1200px 600px at 70% -10%, rgba(56,189,248,0.07), transparent), linear-gradient(to bottom, #0c1322, #070b14)' }}>
      {/* ── الشريط العلوي ── */}
      <header className="flex items-center gap-2 border-b border-white/10 bg-night-900/95 px-3 py-2">
        <button onClick={closeStudioIDE} title="رجوع" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><ArrowLeft size={17} /></button>
        <span className="hidden text-sm font-bold text-white sm:block">استوديو البناء</span>
        <select
          value={root || ''}
          onChange={(e) => { setRoot(e.target.value || null); setStudioRoot(e.target.value || null) }}
          className="max-w-[180px] truncate rounded-lg border border-white/10 bg-night-950 px-2 py-1.5 font-mono text-[12px] text-cyan-200 sm:max-w-[260px]"
          dir="ltr"
        >
          <option value="">— اختر مشروعًا —</option>
          {projList.map((p) => <option key={p.id} value={p.root}>{p.name} · {p.root}</option>)}
        </select>
        <button onClick={openTemplates} className="flex items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1.5 text-[12px] font-semibold text-violet-200 hover:bg-violet-500/30">
          <Plus size={14} /> جديد
        </button>
        <span title="منفّذ مهام البناء" className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-night-950 px-2 py-1.5 sm:flex">
          <Cpu size={13} className="shrink-0 text-amber-300" />
          <select
            value={provider || ''}
            onChange={(e) => pickProvider(e.target.value || null)}
            className="max-w-[130px] truncate bg-transparent text-[12px] font-semibold text-slate-200 outline-none"
            title={providers ? providers.map((p) => `${p.name}: ${p.available ? (p.version || 'ok') : 'غير متاح'}`).join('\n') : 'تحميل المزودين…'}
          >
            <option value="">تلقائي</option>
            {(providers || []).filter((p) => (p.capabilities || []).includes('coding')).map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}{p.available ? '' : ' (غير متاح)'}
              </option>
            ))}
          </select>
          <span title={provider ? 'متصل' : 'اختيار تلقائي'} className={`h-2 w-2 shrink-0 rounded-full ${!providers ? 'bg-slate-600' : (provider ? providers.find((p) => p.name === provider)?.available : (providers.some((p) => p.available && (p.capabilities || []).includes('coding')))) ? 'bg-emerald-400' : 'bg-red-400'}`} />
        </span>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.cls}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}
        </span>
        <div className="ms-auto flex items-center gap-1">
          {pvState === 'running' ? (
            <button onClick={stopPreview} className="flex items-center gap-1 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-200 hover:bg-red-500/20"><Square size={13} /> إيقاف</button>
          ) : (
            <button onClick={startPreview} disabled={!root || pvState === 'starting'} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[12px] font-bold text-night-950 hover:bg-emerald-400 disabled:opacity-40">
              {pvState === 'starting' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} معاينة
            </button>
          )}
          <button onClick={runVerify} disabled={!root || verifyState === 'running'} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-slate-200 hover:bg-white/10 disabled:opacity-40">
            {verifyState === 'running' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} فحص
          </button>
          <button onClick={closeStudioIDE} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X size={17} /></button>
        </div>
      </header>

      {/* ── الجسم ── */}
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* اللوحة اليسرى: المستكشف */}
        <aside className={`${!focusMode && leftOpen ? 'flex' : 'hidden'} w-60 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-night-900/60 lg:flex ${mobileTab === 'files' ? '!flex max-lg:w-full' : 'max-lg:hidden'}`}>
          <div className="flex items-center gap-1 border-b border-white/5 px-2 py-2">
            <FolderTree size={14} className="text-slate-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">المستكشف</span>
            <div className="ms-auto flex gap-0.5">
              <button onClick={createFile} title="ملف جديد" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><FilePlus2 size={14} /></button>
              <button onClick={createFolder} title="مجلد جديد" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><FolderPlus size={14} /></button>
              <button onClick={() => root && loadTree(root)} title="تحديث" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><RefreshCw size={13} /></button>
            </div>
          </div>
          <div className="border-b border-white/5 p-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-night-950 px-2 py-1.5">
              <Search size={13} className="shrink-0 text-slate-500" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="بحث…" className="w-full bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5" dir="ltr" style={{ textAlign: 'start' }}>
            {!root ? (
              <p className="p-3 text-center text-[12px] text-slate-500">اختر مشروعًا أو أنشئ واحدًا جديدًا</p>
            ) : treeLoading ? (
              <p className="flex items-center justify-center gap-2 p-4 text-[12px] text-slate-500"><Loader2 size={14} className="animate-spin" /> تحميل…</p>
            ) : tree.length === 0 ? (
              <p className="p-3 text-center text-[12px] text-slate-500">المجلد فارغ</p>
            ) : (
              <FlatTree nodes={tree} depth={0} openFile={openFile} onOpen={(n) => void openFileAt(n.path)} onDelete={(n) => void deleteNode(n)} onRename={(n) => void renameNode(n)} filter={filter} />
            )}
          </div>
          {git && (
            <div className="flex items-center gap-1.5 border-t border-white/5 px-3 py-1.5 font-mono text-[11px] text-slate-500" dir="ltr">
              <GitBranch size={12} />
              {git.isRepo ? <span>{git.branch} · {git.changed ?? 0} changed{typeof git.added === 'number' ? ` +${git.added} -${git.removed}` : ''}</span> : <span>no git repo</span>}
            </div>
          )}
        </aside>

        {/* الوسط: معاينة / كود */}
        <main className={`min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-night-900/40 ${mobileTab === 'view' ? 'flex' : 'hidden'} lg:flex`}>
          <div className="flex items-center gap-1 border-b border-white/10 bg-night-900/60 px-2 py-1.5">
            <div className="flex rounded-lg border border-white/10 bg-night-950 p-0.5 text-[12px]">
              {([['preview', 'معاينة', Eye], ['code', 'الكود', Code2], ['split', 'مقسم', Columns2]] as const).map(([v, l, I]) => (
                <button key={v} onClick={() => setCenterTab(v)} className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${centerTab === v ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-white'}`}>
                  <I size={13} />{l}
                </button>
              ))}
            </div>
            {(centerTab !== 'code') && (
              <div className="flex rounded-lg border border-white/10 bg-night-950 p-0.5">
                {([['desktop', Monitor, 'سطح مكتب'], ['tablet', Tablet, 'تابلت'], ['mobile', Smartphone, 'جوال']] as const).map(([v, I, t]) => (
                  <button key={v} title={t} onClick={() => setDevice(v)} className={`rounded-md p-1.5 ${device === v ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-white'}`}><I size={14} /></button>
                ))}
              </div>
            )}
        <div className="ms-auto flex items-center gap-1">
          <button onClick={() => setFocusMode((v) => !v)} title={focusMode ? 'إظهار اللوحات' : 'وضع التركيز — مساحة أوسع للمعاينة'} className="hidden rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:block">
            {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={() => setLeftOpen((v) => !v)} title={leftOpen ? 'إخفاء المستكشف' : 'إظهار المستكشف'} className="hidden rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:block">
            {leftOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
              <button onClick={() => setRightOpen((v) => !v)} title={rightOpen ? 'إخفاء لوحة الوكيل' : 'إظهار لوحة الوكيل'} className="hidden rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:block">
                {rightOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              </button>
              {(centerTab !== 'code') && pvUrl && <button onClick={() => setPvKey((k) => k + 1)} title="إعادة تحميل" className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><RotateCw size={14} /></button>}
              {(centerTab !== 'code') && pvUrl && <a href={pvUrl} target="_blank" rel="noreferrer" title="فتح في تبويب" className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><ExternalLink size={14} /></a>}
              {openFile && centerTab !== 'preview' && (
                <button onClick={() => void saveFile()} disabled={!dirty || saving} className="rounded-lg bg-cyan-500/20 px-2.5 py-1 text-[12px] font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40">
                  {saving ? 'يحفظ…' : dirty ? '● حفظ' : '✓ محفوظ'}
                </button>
              )}
            </div>
          </div>
          {/* البناء الحي: الكود يُكتب حرفًا بحرف (بثّ حقيقي من code_token) */}
          {streaming && (
            <div className="flex max-h-56 min-h-0 shrink-0 flex-col border-b border-cyan-400/20 bg-black/50">
              <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-1">
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-cyan-300">
                  <Loader2 size={12} className="animate-spin" /> يُكتب الآن…
                </span>
                {liveEntries.map(([f]) => {
                  const short = f.split('/').pop() || f
                  return (
                    <button key={f} onClick={() => setLiveTab(f)} title={f} className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] ${liveTab === f ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-400 hover:text-white'}`} dir="ltr">
                      {short}
                    </button>
                  )
                })}
              </div>
              <div ref={liveBoxRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[12px] leading-relaxed text-emerald-200/90" dir="ltr">
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{(liveTab && liveFiles[liveTab]) || liveEntries[liveEntries.length - 1][1]}</pre>
                <span className="inline-block h-4 w-2 animate-pulse bg-emerald-400" />
              </div>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            {(centerTab === 'preview' || centerTab === 'split') && (
              <div className={`${centerTab === 'split' ? 'w-1/2 border-e border-white/10' : 'flex-1'} flex min-h-0 flex-col bg-[#0b0f16]`}>
                {!pvUrl ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    {pvState === 'failed' ? (
                      <>
                        <span className="text-4xl">🔴</span>
                        <p className="text-sm font-bold text-red-300">فشلت المعاينة</p>
                        <pre className="max-h-40 max-w-full overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-red-200/90" dir="ltr">{pvErr}</pre>
                        <button onClick={startPreview} className="rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-bold text-night-950">إعادة المحاولة</button>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl">👁️</span>
                        <p className="text-sm text-slate-400">{root ? 'لا توجد معاينة نشطة — ابدأها من الزر أعلاه' : 'اختر مشروعًا أولاً'}</p>
                        {root && <button onClick={startPreview} className="rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-bold text-night-950">▶ بدء المعاينة</button>}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 justify-center overflow-auto p-2">
                    <iframe
                      key={`${pvUrl}#${pvKey}`}
                      src={pvUrl}
                      title="live preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      className="min-h-0 flex-1 rounded-lg border border-white/10 bg-white"
                      style={{ maxWidth: DEV_W[device], width: '100%' }}
                    />
                  </div>
                )}
              </div>
            )}
            {(centerTab === 'code' || centerTab === 'split') && (
              <div className={`${centerTab === 'split' ? 'w-1/2' : 'flex-1'} flex min-h-0 flex-col`}>
                {!openFile ? (
                  <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">اختر ملفًا من المستكشف لعرض الكود الحقيقي</div>
                ) : (
                  <>
                    <div className="border-b border-white/5 px-3 py-1 font-mono text-[11px] text-slate-400" dir="ltr">{openFile}</div>
                    <div className="min-h-0 flex-1">
                      <Editor
                        language={langOf(openFile)}
                        value={fileContent}
                        onChange={(v) => { setFileContent(v || ''); setDirty(true) }}
                        theme="vs-dark"
                        options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true, tabSize: 2, scrollBeyondLastLine: false, lineHeight: 20 }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        {/* اللوحة اليمنى: الوكيل / git / الفحوصات */}
        <aside className={`${!focusMode && rightOpen ? 'flex' : 'hidden'} w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-night-900/60 lg:flex ${mobileTab === 'agent' ? '!flex max-lg:w-full' : 'max-lg:hidden'}`}>
          <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
            <div className="flex rounded-lg border border-white/10 bg-night-950 p-0.5 text-[12px]">
              {([['agent', 'الوكيل', Bot], ['checks', `الفحص${checks ? ` (${checks.filter((c) => c.ok).length}/${checks.length})` : ''}`, ShieldCheck], ['git', 'Git', GitBranch]] as const).map(([v, l, I]) => (
                <button key={v} onClick={() => setRightTab(v as RightTab)} className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${rightTab === v ? 'bg-violet-500/20 text-violet-200' : 'text-slate-400 hover:text-white'}`}>
                  <I size={13} />{l}
                </button>
              ))}
            </div>
          </div>
          {rightTab === 'agent' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 p-2">
                {recentActivity.length === 0 && <p className="p-3 text-center text-[12px] text-slate-500">لا نشاط بعد — تحدث مع الوكيل أدناه</p>}
                {recentActivity.map((a) => (
                  <div key={a.id} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 text-[12px]">
                    <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="font-bold text-slate-300">{a.agent}</span>
                      <span>{new Date(a.time).toLocaleTimeString()}</span>
                    </div>
                    <p className="leading-relaxed text-slate-300">{a.message}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 p-2">
                {/* تنفيذ مباشر عبر مزود CLI المختار (opencode/codex/claude/crush) */}
                <div className="mb-1.5 rounded-xl border border-amber-400/20 bg-amber-500/5 p-2">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                    <Zap size={12} /> نفّذ عبر {provider || 'الأفضل تلقائيًا'}
                  </div>
                  <div className="flex items-end gap-1.5">
                    <textarea
                      value={agentTask}
                      onChange={(e) => setAgentTask(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void runViaProvider() } }}
                      rows={1}
                      placeholder={root ? 'مهمة للمنفذ المباشر…' : 'اختر مشروعًا أولاً…'}
                      disabled={!root || agentRunning || busy}
                      className="flex-1 resize-none rounded-lg border border-white/10 bg-night-950 px-2 py-1.5 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-400/40 disabled:opacity-50"
                    />
                    {agentRunning ? (
                      <button onClick={() => void stopAgentRun()} title="إيقاف التنفيذ" className="rounded-lg bg-red-500/20 p-2 text-red-200 hover:bg-red-500/30"><StopCircle size={15} /></button>
                    ) : (
                      <button onClick={() => void runViaProvider()} disabled={!root || !agentTask.trim() || busy} title="تنفيذ" className="rounded-lg bg-amber-500 p-2 text-night-950 hover:bg-amber-400 disabled:opacity-40"><Zap size={15} /></button>
                    )}
                  </div>
                </div>
                <div className="flex items-end gap-1.5">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendScoped() } }}
                    rows={2}
                    placeholder={root ? `اطلب تعديلًا في ${root}…` : 'اختر مشروعًا أولاً…'}
                    disabled={!root || busy}
                    className="flex-1 resize-none rounded-xl border border-white/10 bg-night-950 px-2.5 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-400/50 disabled:opacity-50"
                  />
                  <button onClick={() => void sendScoped()} disabled={!root || busy || !chatInput.trim()} className="rounded-xl bg-violet-500 p-2.5 text-white hover:bg-violet-400 disabled:opacity-40">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </div>
          )}
          {rightTab === 'checks' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <button onClick={runVerify} disabled={!root || verifyState === 'running'} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-500/20 px-3 py-2 text-[12px] font-bold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40">
                {verifyState === 'running' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} تشغيل الفحص الشامل
              </button>
              {!checks && verifyState !== 'running' && <p className="p-3 text-center text-[12px] text-slate-500">لم يُشغَّل أي فحص بعد</p>}
              {checks?.map((c, i) => (
                <div key={i} className={`mb-1.5 rounded-lg border px-2.5 py-2 ${c.ok ? 'border-emerald-400/20 bg-emerald-500/5' : 'border-red-400/25 bg-red-500/5'}`}>
                  <div className="flex items-center gap-1.5 text-[12px] font-bold">
                    {c.ok ? <CheckCircle2 size={14} className="shrink-0 text-emerald-400" /> : <XCircle size={14} className="shrink-0 text-red-400" />}
                    <span className={c.ok ? 'text-emerald-200' : 'text-red-200'}>{c.label}</span>
                  </div>
                  {c.detail && <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-400" dir="auto">{c.detail}</p>}
                </div>
              ))}
            </div>
          )}
          {rightTab === 'git' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[12px] text-slate-300" dir="ltr"><GitBranch size={13} />{git?.isRepo ? git.branch : '—'}</span>
                <button onClick={() => root && loadGit(root)} className="rounded p-1 text-slate-400 hover:bg-white/10"><RefreshCw size={13} /></button>
              </div>
              {!git?.isRepo ? (
                <p className="p-3 text-center text-[12px] text-slate-500">لا يوجد مستودع git لهذا المشروع</p>
              ) : (
                <>
                  <p className="mb-1.5 text-[12px] text-slate-400">{git.changed} ملفات متغيرة · <span className="text-emerald-400">+{git.added}</span> · <span className="text-red-400">-{git.removed}</span></p>
                  {(git.files || []).length === 0
                    ? <p className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center text-[12px] text-slate-500">شجرة العمل نظيفة ✓</p>
                    : (git.files || []).map((f, i) => (
                      <div key={i} className="mb-1 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 font-mono text-[11px]" dir="ltr">
                        <span className={`w-8 shrink-0 font-bold ${f.code.includes('?') ? 'text-slate-400' : f.code.includes('M') ? 'text-amber-300' : 'text-emerald-300'}`}>{f.code}</span>
                        <span className="truncate text-slate-300">{f.path}</span>
                      </div>
                    ))}
                  {git.stat && <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-2 font-mono text-[10px] text-slate-500" dir="ltr">{git.stat}</pre>}
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void doCommit() }}
                      placeholder="رسالة الـ commit…"
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-night-950 px-2 py-1.5 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-400/40"
                      dir="auto"
                    />
                    <button onClick={() => void doCommit()} disabled={committing || (git.changed ?? 0) === 0} title="حفظ التغييرات في commit جديد" className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-[12px] font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
                      {committing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} commit
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── التيرمينال السفلي ── */}
      <footer className="mx-2 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-night-900/95">
        <button onClick={() => setTermOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white">
          <TerminalSquare size={14} /> التيرمينال {termBusy && <Loader2 size={12} className="animate-spin text-amber-300" />}
          <span className="ms-auto">{termOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
        </button>
        {termOpen && (
          <div className={`${mobileTab === 'term' ? 'max-lg:block' : 'max-lg:hidden'}`}>
            <div ref={termBoxRef} onScroll={(e) => { const el = e.currentTarget; termAuto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }} className="h-36 overflow-y-auto bg-black/50 px-3 py-1.5 font-mono text-[12px] leading-relaxed" dir="ltr">
              {termLines.length === 0 && <span className="text-slate-600">$ — اكتب أمرًا بالأسفل (يُنفَّذ داخل {root || '…'})</span>}
              {termLines.map((l, i) => (
                <div key={i} className={l.kind === 'err' ? 'text-red-300' : l.kind === 'cmd' ? 'font-bold text-cyan-300' : l.kind === 'info' ? 'text-slate-400' : 'text-slate-200'} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.text}</div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 border-t border-white/5 px-3 py-1.5" dir="ltr">
              <span className="font-mono text-[12px] font-bold text-emerald-400">$</span>
              <input
                data-testid="studio-term-input"
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void runTerm() }}
                placeholder={root ? `command… (cwd: ${root})` : 'اختر مشروعًا أولاً'}
                disabled={!root || termBusy}
                className="flex-1 bg-transparent font-mono text-[12px] text-slate-100 outline-none placeholder:text-slate-600 disabled:opacity-50"
              />
              {termBusy && <span className="font-mono text-[11px] text-amber-300">running…</span>}
              <button onClick={() => setTermLines([])} title="مسح" className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"><Ban size={13} /></button>
            </div>
          </div>
        )}
      </footer>

      {/* ── شريط الموبايل ── */}
      <nav data-testid="studio-mobile-nav" className="mx-2 mb-2 flex items-center justify-around rounded-2xl border border-white/10 bg-night-900 px-2 py-1.5 lg:hidden">
        {([['files', 'الملفات', FolderTree], ['view', 'العرض', Eye], ['agent', 'الوكيل', Bot], ['term', 'التيرمينال', TerminalSquare]] as const).map(([v, l, I]) => (
          <button key={v} onClick={() => setMobileTab(v)} className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] ${mobileTab === v ? 'text-cyan-300' : 'text-slate-500'}`}>
            <I size={17} />{l}
          </button>
        ))}
      </nav>

      {/* ── نافذة مشروع جديد ── */}
      {showNew && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4" onClick={() => !scaffolding && setShowNew(false)}>
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-night-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-bold text-white">مشروع جديد من قالب حقيقي</h3>
            <p className="mb-3 text-[12px] text-slate-400">يُنسخ القالب كاملًا إلى مساحة عملك مع git وفحص ورابط معاينة</p>
            {!templates ? (
              <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-slate-500"><Loader2 size={15} className="animate-spin" /> تحميل القوالب…</p>
            ) : templates.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-red-300">لا توجد قوالب متاحة على الخادم</p>
            ) : (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => setTplSel(t.id)} className={`rounded-xl border p-3 text-center transition ${tplSel === t.id ? 'border-violet-400/60 bg-violet-500/15' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}>
                    <p className="text-[13px] font-bold text-white">{t.nameAr}</p>
                    <p className="font-mono text-[10px] text-slate-500" dir="ltr">{t.id}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{t.descAr}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500" dir="ltr">{t.count} files</p>
                  </button>
                ))}
              </div>
            )}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم المشروع…" className="mb-3 w-full rounded-xl border border-white/10 bg-night-950 px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/50" dir="auto" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} disabled={scaffolding} className="rounded-xl border border-white/10 px-4 py-2 text-[12px] text-slate-300 disabled:opacity-40">إلغاء</button>
              <button onClick={() => void doScaffold()} disabled={!tplSel || !newName.trim() || scaffolding} className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-[12px] font-bold text-night-950 disabled:opacity-40">
                {scaffolding && <Loader2 size={14} className="animate-spin" />} إنشاء المشروع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
