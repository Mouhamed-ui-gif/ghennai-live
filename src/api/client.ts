export const TOKEN_KEY = 'ghennai_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

async function http(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
  return data
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    http('/api/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    http('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  google: (idToken: string, clientId?: string) =>
    http('/api/google', { method: 'POST', body: JSON.stringify({ idToken, clientId }) }),
  me: () => http('/api/me'),
  status: () => http('/api/status'),
}

export interface SSEvent {
  type: string
  [k: string]: unknown
}

export type EventHandler = (e: SSEvent) => void

export function chatStream(body: Record<string, unknown>, onEvent: EventHandler, onDone?: () => void) {
  const token = getToken()
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => '')
        throw new Error(err || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const flush = () => {
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          try {
            const e = JSON.parse(trimmed.slice(5).trim())
            onEvent(e as SSEvent)
          } catch {
            /* noop */
          }
        }
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        flush()
      }
      flush()
      onDone?.()
    })
    .catch((err) => onEvent({ type: 'error', error: String(err?.message || err) }))
}

export const vision = (imageData: string, mode?: 'describe' | 'build', prompt?: string) =>
  http('/api/vision', {
    method: 'POST',
    body: JSON.stringify({ image: imageData, mode, prompt }),
  })

export const workspace = {
  tree: (path = '.') => http(`/api/workspace/tree?path=${encodeURIComponent(path)}`),
  read: (path: string) => http(`/api/workspace/file?path=${encodeURIComponent(path)}`),
  write: (path: string, content: string) =>
    http('/api/workspace/file', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  del: (path: string) => http(`/api/workspace/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  mkdir: (path: string) => http('/api/workspace/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),
  touch: (path: string) => http('/api/workspace/touch', { method: 'POST', body: JSON.stringify({ path }) }),
  download: (path: string) => {
    const token = getToken()
    return fetch(`/api/workspace/download?path=${encodeURIComponent(path)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (r) => {
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = path.split('/').pop() || 'file'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    })
  },
  run: (cwd: string, command: string) =>
    http('/api/workspace/run', { method: 'POST', body: JSON.stringify({ cwd, command }) }),
  zip: (path = '.') => {
    const token = getToken()
    return fetch(`/api/workspace/zip?path=${encodeURIComponent(path)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (r) => {
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      return r.blob()
    })
  },
  upload: (file: File, path = 'uploads/') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('path', path)
    const token = getToken()
    return fetch('/api/workspace/upload', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async (r) => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      return d
    })
  },
}

export const brain = {
  state: () => http('/api/brain/state'),
  prefs: () => http('/api/brain/prefs'),
  setPref: (key: string, value: unknown) => http('/api/brain/prefs', { method: 'POST', body: JSON.stringify({ key, value }) }),
  pause: () => http('/api/brain/pause', { method: 'POST' }),
  resume: () => http('/api/brain/resume', { method: 'POST' }),
  cycle: () => http('/api/brain/cycle', { method: 'POST' }),
  models: () => http('/api/brain/models'),
  sessions: () => http('/api/brain/sessions'),
  sessionCurrent: (id?: string) => http(`/api/brain/sessions/current${id ? `?id=${encodeURIComponent(id)}` : ''}`),
  exportText: () => {
    const token = getToken()
    return fetch('/api/brain/export', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.text())
      .catch(() => '')
  },
}

export const deploy = {
  run: (project: string, provider = 'github') =>
    http('/api/deploy', { method: 'POST', body: JSON.stringify({ project, provider }) }),
  status: () => http('/api/deploy/status'),
  saveToken: (token: string) =>
    http('/api/deploy/token', { method: 'POST', body: JSON.stringify({ token }) }),
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  rel?: string
  children?: FileNode[]
}