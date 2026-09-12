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
  activity: ActivityItem[]
  agent: AgentId
  busy: boolean

  arenaOpen: boolean
  projectName: string
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
  activeCodeFile: string | null
  codeFileContent: string | null
  editTarget: EditElement | null
  editBusy: boolean

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
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const useApp = create<AppState>((set, get) => ({
  token: getToken(),
  user: null,
  booting: true,
  msgs: [],
  activity: [],
  agent: 'Core',
  busy: false,

  arenaOpen: false,
  projectName: 'project',
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
  activeCodeFile: null,
  codeFileContent: null,
  editTarget: null,
  editBusy: false,

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
      user: null, token: null, msgs: [], arenaOpen: false, activity: [],
      termLines: [], previewUrl: null, deployState: 'idle', deployUrl: null,
      codingOpen: false, codingShot: null, codeFiles: [], activeCodeFile: null, codeFileContent: null, editTarget: null, editBusy: false,
      brainOpen: false, sessionsOpen: false, resumeText: null, resumeTitle: null, brainBoard: {}, brainProgress: 0, brainPhase: 'idle', brainFeed: [], brainPaused: false,
prefs: { collab: false, supervisor: false, autoGrade: false, speed: 'fast', speechOut: false, paused: false, interval: 0, team: true, models: {} },
    })
  },

  resetChat: () => {
    try {
      localStorage.removeItem('ghn_msgs')
    } catch { /* noop */ }
    set({ msgs: [], activity: [], arenaOpen: false, termOpen: false, termLines: [], previewUrl: null, deployState: 'idle', codingOpen: false, codingShot: null, codeFiles: [], editTarget: null, editBusy: false })
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
    try {
      const raw = localStorage.getItem('ghn_msgs')
      if (!raw) return
      const saved = JSON.parse(raw) as Msg[]
      if (Array.isArray(saved) && saved.length && !get().msgs.length) set({ msgs: saved })
    } catch { /* noop */ }
  },

  persistMsgs: () => {
    try {
      const { msgs } = get()
      if (!msgs.length) return
      const keep = msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, agent: m.agent, streaming: false, ts: m.ts }))
      localStorage.setItem('ghn_msgs', JSON.stringify(keep.slice(-80)))
    } catch { /* noop */ }
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
  pushActivity: (a) => set((s) => ({ activity: [{ id: uid(), time: Date.now(), ...a }, ...s.activity].slice(0, 60) })),

  setAgent: (a) => set({ agent: a }),

  openArena: (project) => set({ arenaOpen: true, projectName: project || 'project' }),
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
        actions: s.codingShot?.actions?.slice(-60) || [],
      },
    })),

  exitCodingMode: () => set({ codingOpen: false }),

  setCodingVoice: (b) => set({ codingVoice: b }),

  codeToken: (chunk) =>
    set((s) => {
      if (!s.codingShot) return {}
      const shot = s.codingShot
      if (chunk.action === 'open' || chunk.action === 'edit') {
        return { codingShot: { ...shot, typed: { file: chunk.file || null, text: '' }, error: null } }
      }
      if (chunk.action === 'done') {
        return { codingShot: { ...shot, typed: null } }
      }
      return {
        codingShot: {
          ...shot,
          typed: { file: chunk.file ?? shot.typed?.file ?? null, text: (shot.typed?.text || '') + (chunk.content || '') },
        },
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
}))

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
  ;(window as unknown as Record<string, unknown>).__app = useApp
}