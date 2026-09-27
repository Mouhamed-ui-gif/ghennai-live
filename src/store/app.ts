import { create } from 'zustand'
import type { AgentId } from '../config/agents'
import { getToken, setToken } from '../api/client'

export interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent?: string
  status?: 'running' | 'done' | 'error'
  streaming?: boolean
  ts?: number
}
export interface ActivityItem {
  id: string
  time: number
  agent: string
  tool?: string
  message: string
  status: string
  data?: Record<string, unknown>
}
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  rel?: string
  children?: FileNode[]
}
export interface TermLine {
  kind: 'cmd' | 'out' | 'err'
  text: string
  ts: number
}
export interface ApprovalReq {
  id: number
  tool: string
  command?: string | null
  cwd?: string | null
  path?: string | null
  reason?: string
  kind?: string | null
  ts?: number
}
export interface CodeAction {
  id: string
  ts: number
  kind: 'cmd' | 'ok' | 'info' | 'err' | 'edit' | 'notice'
  text: string
}
export interface EditElement {
  tag: string
  id: string
  className: string
  text: string
  href?: string | null
  src?: string | null
  file?: string | null
  line?: number | null
}
export interface EditPending {
  element?: EditElement | null
  root?: string | null
  request: string
  summary: string
}
export interface ProjectInfo {
  id: string
  name: string
  root: string
  repo?: string
  repoUrl?: string
  url?: string
  pagesUrl?: string
  status?: 'idle' | 'live' | 'deployed' | 'error'
  version?: number
  lastPublish?: number
  lastBuild?: number
  updatedAt?: number
  versions?: number[]
}
export interface CodingShot {
  project: string
  mode: 'build' | 'edit'
  request: string
  running: boolean
  done: boolean
  error: string | null
  built: boolean
  typed: { file: string | null; text: string } | null
  live: { code: string; url: string } | null
  actions: CodeAction[]
}
export interface BrainAgentState {
  status: string
  action: string
  detail: string
  score: number | null
  feedback: string
  updatedAt: number
}
export interface BrainFeed {
  id: string
  ts: number
  from: string
  to: string
  message: string
  kind: string
}
export interface BrainPrefs {
  collab: boolean
  supervisor: boolean
  autoGrade: boolean
  speed: string
  speechOut: boolean
  paused: boolean
  interval: number
  team: boolean
  solo?: boolean
  pipeline?: boolean
  models: Record<string, string>
}
export interface SessionLite {
  id: string
  title: string
  ts: number
}
export interface SessionMsg {
  role: string
  content: string
  agent?: string
  ts: number
}
export interface Toast {
  id: string
  kind: 'success' | 'error' | 'info'
  title?: string
  message: string
  ts: number
}

interface AppState {
  token: string | null
  user: { email: string; name: string } | null
  booting: boolean
  msgs: Msg[]
  /** محادثة مستقلة لكل وكيل: التبديل يفتح محادثة الوكيل الخاصة ويحفظ السابقة */
  agentMsgs: Record<string, Msg[]>
  activity: ActivityItem[]
  agent: AgentId
  busy: boolean
  agentState: string
  pendingApprovals: ApprovalReq[]
  agentMode: 'safe' | 'assisted' | 'autonomous'

  arenaOpen: boolean
  projectName: string
  codingProjectFolder: string | null
  built: boolean
  termOpen: boolean
  files: FileNode[]
  activeFile: string | null
  fileContent: string | null
  termLines: TermLine[]
  previewUrl: string | null
  previewVariant: number

  deployState: 'idle' | 'deploying' | 'done' | 'error'
  deployUrl: string | null
  deployError: string | null
  deployStages: string[]

  codingOpen: boolean
  codingVoice: boolean
  codingShot: CodingShot | null
  codeFiles: { path: string }[]
  liveFiles: Record<string, string>
  activeCodeFile: string | null
  codeFileContent: string | null
  editTarget: EditElement | null
  editBusy: boolean
  editPend: EditPending | null
  studioOpen: boolean

  projects: ProjectInfo[]
  prjOpen: boolean
  activeProject: ProjectInfo | null
  previewDevice: 'desktop' | 'tablet' | 'mobile'

  brainOpen: boolean
  sessionsOpen: boolean
  resumeText: string | null
  resumeTitle: string | null
  brainBoard: Record<string, BrainAgentState>
  brainProgress: number
  brainPhase: string
  brainFeed: BrainFeed[]
  brainPaused: boolean
  prefs: BrainPrefs
  sessions: SessionLite[]
  sessionMsgs: SessionMsg[]
  agentModels: string[]
  toasts: Toast[]

  sideCollapsed: boolean
  zen: boolean
  /** لوح الكود الحي بجانب المحادثة */
  railOpen: boolean
  setRailOpen: (b: boolean) => void
  /** جلسة لوح نشطة (بناء جارٍ أو منتهٍ حديثًا) + اكتماله */
  railSession: boolean
  /** مراحل البناء العشر الحقيقية (من آلة الحالة — لا نسب وهمية) */
  buildStages: { id: string; label: string; status: 'idle' | 'active' | 'done' | 'failed' }[]
  buildState: string
  setBuildStages: (stages: AppState['buildStages'], state: string) => void
  railDone: boolean
  setRailSession: (b: boolean) => void
  setRailDone: (b: boolean) => void
  /** تصفير الملفات الحية مع بدء بناء جديد */
  resetLive: () => void
  focusTick: number
  saveTick: number
  codeTab: 'files' | 'code' | 'preview'
  deployInvoke: number

  hydrate: () => Promise<void>
  login: (token: string, user: { email: string; name: string }) => void
  logout: () => void
  resetChat: () => void
  addUserMsg: (content: string) => string
  addAssistantMsg: (content: string, agent?: string) => void
  addStreamChunk: (text: string) => void
  addFinalMessage: (content: string, agent?: string) => void
  replaceMsg: (id: string, content: string) => void
  purgeFrom: (index: number) => void
  setMsgs: (msgs: Msg[]) => void
  pushToast: (t: Omit<Toast, 'id' | 'ts'>) => void
  dismissToast: (id: string) => void
  setBusy: (b: boolean) => void
  setAgentState: (s: string) => void
  setApprovals: (list: ApprovalReq[]) => void
  upsertApproval: (a: ApprovalReq) => void
  removeApproval: (id: number) => void
  setAgentMode: (m: 'safe' | 'assisted' | 'autonomous') => void
  pushActivity: (a: Omit<ActivityItem, 'id' | 'time'>) => void
  setAgent: (a: AgentId) => void

  setBrainOpen: (b: boolean) => void
  setSessionsOpen: (b: boolean) => void
  setResume: (text: string, title: string) => void
  clearResume: () => void
  applyBrainState: (board: Record<string, BrainAgentState>, progress: number, phase: string, paused: boolean) => void
  setBrainProgress: (value: number, phase: string) => void
  pushBrainFeed: (from: string, to: string, message: string, kind: string) => void
  setBrainGrade: (agent: string, score: number | null, feedback: string) => void
  setBrainPaused: (b: boolean) => void
  setPrefs: (p: Partial<BrainPrefs>) => void
  setSessions: (s: SessionLite[]) => void
  setSessionMsgs: (m: SessionMsg[]) => void
  setAgentModels: (list: string[]) => void

  setSideCollapsed: (b: boolean) => void
  setZen: (b: boolean) => void
  requestFocus: () => void
  requestSave: () => void
  setCodeTab: (t: 'files' | 'code' | 'preview') => void
  invokeDeploy: () => void
  restoreMsgs: () => void
  persistMsgs: () => void

  openArena: (project: string) => void
  closeArena: () => void
  setCodingProjectFolder: (root: string | null) => void
  setCodingLive: (live: CodingShot['live']) => void
  setBuilt: (b: boolean) => void
  setTermOpen: (b: boolean) => void
  setFiles: (f: FileNode[]) => void
  setActiveFile: (p: string | null) => void
  setFileContent: (c: string | null) => void
  upsertFileContent: (p: string, c: string) => void
  pushTerm: (line: Omit<TermLine, 'ts'>) => void
  clearTerm: () => void
  setPreview: (url: string | null) => void
  bumpPreview: () => void
  setDeployState: (s: AppState['deployState'], url?: string | null, err?: string | null) => void
  pushDeployStage: (m: string) => void
  clearDeploy: () => void

  enterCodingMode: (project: string, mode: 'build' | 'edit', request: string) => void
  exitCodingMode: () => void
  openStudio: () => void
  closeStudio: () => void
  studioIDEOpen: boolean
  studioRoot: string | null
  openStudioIDE: (root?: string | null) => void
  closeStudioIDE: () => void
  setStudioRoot: (r: string | null) => void
  setCodingVoice: (b: boolean) => void
  codeToken: (chunk: { content?: string | null; file?: string | null; action?: string | null }) => void
  pushCodeAction: (a: Omit<CodeAction, 'id' | 'ts'>) => void
  setCodingDone: (built: boolean) => void
  setCodingError: (msg: string) => void
  upsertCodeFile: (p: string) => void
  setActiveCodeFile: (p: string | null) => void
  setCodeFileContent: (c: string | null) => void
  setEditTarget: (e: EditElement | null) => void
  setEditBusy: (b: boolean) => void
  setEditPend: (p: EditPending | null) => void

  setProjects: (p: ProjectInfo[]) => void
  upsertProject: (p: ProjectInfo) => void
  refreshProjects: () => Promise<void>
  openProjects: () => void
  closeProjects: () => void
  setActiveProject: (p: ProjectInfo | null) => void
  setPreviewDevice: (d: 'desktop' | 'tablet' | 'mobile') => void
}

const uid = () => Math.random().toString(36).slice(2, 10)

/** الأسماء العربية للوكلاء لرسائل الانتقال */
export const AGENT_AR: Record<string, string> = {
  Core: 'المنسق', Coding: 'المبرمج', Research: 'الباحث', Study: 'المعلم', Design: 'المصمم', Genie: 'الجني', Voice: 'الصوتي',
}

const msgKey = (agent: string) => `ghn_msgs_${agent}`

function loadAgentMsgs(agent: string): Msg[] {
  try {
    // ترحيل مرة واحدة من المفتاح القديم المشترك إلى المنسق
    if (agent === 'Core') {
      const legacy = localStorage.getItem('ghn_msgs')
      if (legacy) {
        const arr = JSON.parse(legacy) as Msg[]
        if (Array.isArray(arr) && arr.length) {
          localStorage.setItem(msgKey('Core'), legacy)
          localStorage.removeItem('ghn_msgs')
          return arr
        }
      }
    }
    const raw = localStorage.getItem(msgKey(agent))
    if (!raw) return []
    const arr = JSON.parse(raw) as Msg[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveAgentMsgs(agent: string, msgs: Msg[]) {
  try {
    if (!msgs.length) {
      localStorage.removeItem(msgKey(agent))
      return
    }
    const keep = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, agent: m.agent, streaming: false, ts: m.ts }))
    localStorage.setItem(msgKey(agent), JSON.stringify(keep.slice(-80)))
  } catch { /* noop */ }
}

export const useApp = create<AppState>((set, get) => ({
  token: getToken(),
  user: null,
  booting: true,
  msgs: [],
  agentMsgs: {},
  activity: [],
  agent: 'Core',
  busy: false,
  agentState: 'IDLE',
  pendingApprovals: [],
  agentMode: 'assisted',

  arenaOpen: false,
  projectName: 'project',
  codingProjectFolder: null,
  built: false,
  termOpen: false,
  files: [],
  activeFile: null,
  fileContent: null,
  termLines: [],
  previewUrl: null,
  previewVariant: 0,

  deployState: 'idle',
  deployUrl: null,
  deployError: null,
  deployStages: [],

  codingOpen: false,
  codingVoice: true,
  codingShot: null,
  codeFiles: [],
  liveFiles: {},
  activeCodeFile: null,
  codeFileContent: null,
  editTarget: null,
  editBusy: false,
  editPend: null,
  studioOpen: false,
  studioIDEOpen: false,
  studioRoot: null,

  projects: [],
  prjOpen: false,
  activeProject: null,
  previewDevice: 'desktop',

  brainOpen: false,
  sessionsOpen: false,
  resumeText: null,
  resumeTitle: null,
  brainBoard: {},
  brainProgress: 0,
  brainPhase: 'idle',
  brainFeed: [],
  brainPaused: false,
  prefs: { collab: false, supervisor: false, autoGrade: false, speed: 'fast', speechOut: false, paused: false, interval: 0, team: true, models: {} },
  sessions: [],
  sessionMsgs: [],
  agentModels: [],
  toasts: [],

  sideCollapsed: false,
  zen: false,
  railOpen: true,
  setRailOpen: (b) => set({ railOpen: b }),
  railSession: false,
  railDone: false,
  buildStages: [],
  buildState: 'IDLE',
  setBuildStages: (stages, state) => set({ buildStages: stages, buildState: state }),
  setRailSession: (b) => set({ railSession: b }),
  setRailDone: (b) => set({ railDone: b }),
  resetLive: () => set({ liveFiles: {}, codeFiles: [], activeCodeFile: null, codeFileContent: null }),
  focusTick: 0,
  saveTick: 0,
  codeTab: 'code',
  deployInvoke: 0,

  hydrate: async () => {
    try {
      const token = getToken()
      if (!token) {
        set({ user: null, token: null, booting: false })
        return
      }
      const { api } = await import('../api/client')
      const d = await api.me()
      set({ user: d.user, token, booting: false })
    } catch {
      setToken(null)
      set({ user: null, token: null, booting: false })
    }
  },

  login: (token, user) => {
    setToken(token)
    set({ token, user, booting: false })
  },

  logout: () => {
    setToken(null)
    set({
      user: null, token: null, msgs: [], agentMsgs: {}, railSession: false, railDone: false, arenaOpen: false, activity: [],
      termLines: [], previewUrl: null, deployState: 'idle', deployUrl: null,
      codingOpen: false, codingShot: null, codeFiles: [], activeCodeFile: null, codeFileContent: null, editTarget: null, editBusy: false, editPend: null, liveFiles: {}, studioOpen: false, studioIDEOpen: false, studioRoot: null,
      brainOpen: false, sessionsOpen: false, resumeText: null, resumeTitle: null, brainBoard: {}, brainProgress: 0, brainPhase: 'idle', brainFeed: [], brainPaused: false,
prefs: { collab: false, supervisor: false, autoGrade: false, speed: 'fast', speechOut: false, paused: false, interval: 0, team: true, models: {} },
    })
  },

  resetChat: () => {
    // يمسح محادثة الوكيل الحالي فقط — محادثات الوكلاء الآخرين تبقى محفوظة
    const { agent } = get()
    try {
      localStorage.removeItem(msgKey(agent))
    } catch { /* noop */ }
    set((s) => ({ msgs: [], agentMsgs: { ...s.agentMsgs, [agent]: [] }, railSession: false, railDone: false, arenaOpen: false, termOpen: false, termLines: [], previewUrl: null, deployState: 'idle', codingOpen: false, codingShot: null, codeFiles: [], editTarget: null, editBusy: false, editPend: null, liveFiles: {}, studioOpen: false, studioIDEOpen: false }))
  },

  setBrainOpen: (b) => set({ brainOpen: b }),

  setSessionsOpen: (b) => set({ sessionsOpen: b }),

  setResume: (text, title) =>
    set({
      resumeText: text,
      resumeTitle: title,
      activity: [{ id: uid(), time: Date.now(), agent: 'Core', message: `متابعة الجلسة: ${title}`, status: 'info' }, ...get().activity].slice(0, 60),
    }),

  clearResume: () => set({ resumeText: null, resumeTitle: null }),

  applyBrainState: (board, progress, phase, paused) =>
    set({ brainBoard: board, brainProgress: progress, brainPhase: phase, brainPaused: paused }),

  setBrainProgress: (value, phase) => set({ brainProgress: value, brainPhase: phase }),

  pushBrainFeed: (from, to, message, kind) =>
    set((s) => ({ brainFeed: [{ id: uid(), ts: Date.now(), from, to, message, kind }, ...s.brainFeed].slice(0, 60) })),

  setBrainGrade: (agent, score, feedback) =>
    set((s) => ({
      brainBoard: {
        ...s.brainBoard,
        [agent]: { ...(s.brainBoard[agent] || { status: 'done', action: '', detail: '', score: null, feedback: '', updatedAt: Date.now() }), score, feedback },
      },
    })),

  setBrainPaused: (b) => set({ brainPaused: b }),

  setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),

  setSessions: (sessions) => set({ sessions }),

  setSessionMsgs: (sessionMsgs) => set({ sessionMsgs }),

  setAgentModels: (agentModels) => set({ agentModels }),

  setSideCollapsed: (b) => set({ sideCollapsed: b }),
  setZen: (b) => set({ zen: b }),
  requestFocus: () => set((s) => ({ focusTick: s.focusTick + 1 })),
  requestSave: () => set((s) => ({ saveTick: s.saveTick + 1 })),
  setCodeTab: (t) => set({ codeTab: t }),
  invokeDeploy: () => set((s) => ({ deployInvoke: s.deployInvoke + 1 })),

  restoreMsgs: () => {
    const { agent, msgs } = get()
    if (msgs.length) return
    const saved = loadAgentMsgs(agent)
    if (saved.length) {
      set((s) => ({ msgs: saved, agentMsgs: { ...s.agentMsgs, [agent]: saved } }))
    }
  },

  persistMsgs: () => {
    const { msgs, agent } = get()
    set((s) => ({ agentMsgs: { ...s.agentMsgs, [agent]: msgs } }))
    saveAgentMsgs(agent, msgs)
  },

  addUserMsg: (content) => {
    const id = uid()
    set((s) => ({ msgs: [...s.msgs, { id, role: 'user', content, ts: Date.now() }] }))
    return id
  },

  addAssistantMsg: (content, agent) => {
    const id = uid()
    set((s) => ({ msgs: [...s.msgs, { id, role: 'assistant', content, agent, ts: Date.now() }] }))
  },

  addFinalMessage: (content, agent) =>
    set((s) => {
      const msgs = [...s.msgs]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && (last as Msg).streaming) {
        msgs[msgs.length - 1] = { ...last, content, agent, streaming: false, ts: Date.now() } as Msg
      } else {
        msgs.push({ id: uid(), role: 'assistant', content, agent, ts: Date.now() } as Msg)
      }
      return { msgs }
    }),

  addStreamChunk: (text) =>
    set((s) => {
      const msgs = [...s.msgs]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && (last as Msg).streaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + text } as Msg
      } else {
        msgs.push({ id: uid(), role: 'assistant', content: text, streaming: true, ts: Date.now() } as Msg)
      }
      return { msgs }
    }),

  replaceMsg: (id, content) =>
    set((s) => ({ msgs: s.msgs.map((m) => (m.id === id ? { ...m, content } : m)) })),

  purgeFrom: (index) =>
    set((s) => ({ msgs: s.msgs.slice(0, Math.max(0, index)) })),

  setMsgs: (msgs) => set({ msgs }),

  pushToast: (t) => {
    const id = uid()
    const toast: Toast = { id, ts: Date.now(), kind: t.kind, title: t.title, message: t.message }
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    }, 4400)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  setBusy: (b) => set({ busy: b }),
  setAgentState: (s) => set({ agentState: s, busy: !['IDLE', 'READY', 'FAILED', 'STOPPED'].includes(s) }),
  setApprovals: (list) => set({ pendingApprovals: list }),
  upsertApproval: (a) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.some((x) => x.id === a.id)
        ? s.pendingApprovals.map((x) => (x.id === a.id ? { ...x, ...a } : x))
        : [...s.pendingApprovals, a],
    })),
  removeApproval: (id) => set((s) => ({ pendingApprovals: s.pendingApprovals.filter((x) => x.id !== id) })),
  setAgentMode: (m) => set({ agentMode: m }),
  pushActivity: (a) => set((s) => ({ activity: [{ id: uid(), time: Date.now(), ...a }, ...s.activity].slice(0, 60) })),

  setAgent: (a) => {
    const { agent: prev, msgs: cur, busy } = get()
    if (a === prev) return
    if (busy) {
      get().pushToast({ kind: 'info', title: 'انتظر قليلًا', message: 'انتهاء الرد الحالي قبل الانتقال لوكيل آخر' })
      return
    }
    // حفظ محادثة الوكيل السابق
    saveAgentMsgs(prev, cur)
    // تحميل محادثة الوكيل الجديد (من الذاكرة أو التخزين)
    const cached = get().agentMsgs[a]
    const next = cached !== undefined ? cached : loadAgentMsgs(a)
    const fromName = AGENT_AR[prev] || prev
    const toName = AGENT_AR[a] || a
    set((s) => ({
      agent: a,
      msgs: next,
      agentMsgs: { ...s.agentMsgs, [prev]: cur, [a]: next },
      activity: [{ id: uid(), time: Date.now(), agent: a, message: `🔁 انتقلت من ${fromName} إلى ${toName} — محادثة خاصة جديدة${next.length ? ` (${next.length} رسالة محفوظة)` : ''}`, status: 'info' }, ...s.activity].slice(0, 60),
    }))
    get().pushToast({ kind: 'info', title: `الوكيل: ${toName}`, message: next.length ? `عدت لمحادثتك مع ${toName} (${next.length} رسالة)` : `محادثة جديدة مع ${toName} — السابقة محفوظة` })
  },

  openArena: (project) => set({ arenaOpen: true, projectName: project || 'project' }),
  setCodingProjectFolder: (root) => set({ codingProjectFolder: root }),
  closeArena: () => set({ arenaOpen: false, previewUrl: null }),
  setBuilt: (b) => set({ built: b }),
  setTermOpen: (b) => set({ termOpen: b }),
  setFiles: (f) => set({ files: f }),
  setActiveFile: (p) => set({ activeFile: p }),
  setFileContent: (c) => set({ fileContent: c }),

  upsertFileContent: (p, c) => {
    set({ fileContent: c, activeFile: p, previewVariant: get().previewVariant + 1 })
  },

  pushTerm: (line) => set((s) => ({ termLines: [...s.termLines, { ...line, ts: Date.now() }].slice(-400) })),
  clearTerm: () => set({ termLines: [] }),

  setPreview: (url) => set({ previewUrl: url }),
  bumpPreview: () => set((s) => ({ previewVariant: s.previewVariant + 1 })),

  setDeployState: (st, url = null, err = null) => set({ deployState: st, deployUrl: url, deployError: err }),
  pushDeployStage: (m) => set((s) => ({ deployStages: [...s.deployStages, m] })),
  clearDeploy: () => set({ deployState: 'idle', deployUrl: null, deployError: null, deployStages: [] }),

  enterCodingMode: (project, mode, request) =>
    set((s) => ({
      codingOpen: true,
      codingShot: {
        project: project || s.codingShot?.project || 'الموقع الجديد',
        mode: mode ?? s.codingShot?.mode ?? 'build',
        request: request || s.codingShot?.request || '',
        running: true,
        done: false,
        error: null,
        built: false,
        typed: null,
        live: s.codingShot?.live || null,
        actions: s.codingShot?.actions?.slice(-60) || [],
      },
    })),

  setCodingLive: (live) => set((s) => (s.codingShot ? { codingShot: { ...s.codingShot, live } } : {})),

  exitCodingMode: () => set({ codingOpen: false, liveFiles: {} }),

  openStudio: () => set({ studioOpen: true }),
  closeStudio: () => set({ studioOpen: false }),

  openStudioIDE: (root = null) => set((s) => ({ studioIDEOpen: true, studioRoot: root ?? s.studioRoot ?? s.codingProjectFolder ?? null })),
  closeStudioIDE: () => set({ studioIDEOpen: false }),
  setStudioRoot: (r) => set({ studioRoot: r }),

  setCodingVoice: (b) => set({ codingVoice: b }),

  codeToken: (chunk) =>
    set((s) => {
      // اللوح الحي يعمل مستقلًا عن غطاء ملء الشاشة: يكفي جلسة لوح نشطة
      if (!s.codingShot && !s.railSession) return {}
      const shot = s.codingShot
      const withShot = (patch: Partial<CodingShot>) => (shot ? { codingShot: { ...shot, ...patch } } : {})
      if (chunk.action === 'open' || chunk.action === 'edit') {
        const liveFiles = { ...s.liveFiles }
        if (chunk.file) liveFiles[chunk.file] = ''
        return {
          ...withShot({ typed: { file: chunk.file || null, text: '' }, error: null }),
          liveFiles,
          activeCodeFile: chunk.file || s.activeCodeFile,
        }
      }
      if (chunk.action === 'done') {
        const lastContent = s.activeCodeFile && s.liveFiles[s.activeCodeFile] ? s.liveFiles[s.activeCodeFile] : s.codeFileContent
        // نُبقي آخر ملفات حية للّوح بدل مسحها فورًا — تُمسح مع بدء بناء جديد
        return { ...withShot({ typed: null }), codeFileContent: lastContent }
      }
      if (chunk.action === 'boot') {
        const liveFiles = { ...s.liveFiles }
        if (chunk.file) liveFiles[chunk.file] = chunk.content || ''
        return { liveFiles }
      }
      return {
        ...withShot({
          typed: { file: chunk.file ?? shot?.typed?.file ?? null, text: (shot?.typed?.text || '') + (chunk.content || '') },
        }),
        liveFiles:
          chunk.file && chunk.content
            ? { ...s.liveFiles, [chunk.file]: (s.liveFiles[chunk.file] || '') + chunk.content }
            : s.liveFiles,
      }
    }),

  pushCodeAction: (a) =>
    set((s) => (s.codingShot ? { codingShot: { ...s.codingShot, actions: [...s.codingShot.actions, { id: uid(), ts: Date.now(), ...a }].slice(-60) } } : {})),

  setCodingDone: (built) =>
    set((s) => (s.codingShot ? { codingShot: { ...s.codingShot, running: false, done: true, typed: null, built } } : {})),

  setCodingError: (msg) =>
    set((s) => (s.codingShot ? { codingShot: { ...s.codingShot, running: false, error: msg, typed: null } } : {})),

  upsertCodeFile: (p) =>
    set((s) => ({
      codeFiles: s.codeFiles.some((f) => f.path === p) ? s.codeFiles : [...s.codeFiles, { path: p }].slice(-40),
      activeCodeFile: s.activeCodeFile || p,
    })),

  setActiveCodeFile: (p) => set({ activeCodeFile: p, codeFileContent: null }),

  setCodeFileContent: (c) => set({ codeFileContent: c }),

  setEditTarget: (e) => set({ editTarget: e, editBusy: false }),

  setEditBusy: (b) => set({ editBusy: b }),

  setEditPend: (p) => set({ editPend: p }),

  setProjects: (p) => set({ projects: p }),

  upsertProject: (p) =>
    set((s) => {
      const exists = s.projects.some((x) => x.id === p.id)
      const list = exists ? s.projects.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [{ ...p }, ...s.projects]
      return {
        projects: list,
        activeProject: s.activeProject?.id === p.id ? { ...s.activeProject, ...p } : s.activeProject,
      }
    }),

  refreshProjects: async () => {
    try {
      const { projects } = await import('../api/client')
      const d = await projects.list()
      set({ projects: d.projects || [] })
    } catch {
      /* noop */
    }
  },

  openProjects: () => set({ prjOpen: true }),
  closeProjects: () => set({ prjOpen: false }),
  setActiveProject: (p) => set({ activeProject: p }),
  setPreviewDevice: (d) => set({ previewDevice: d }),
}))

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
  ;(window as unknown as Record<string, unknown>).__app = useApp
}