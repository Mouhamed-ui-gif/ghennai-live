async function http(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) }
  const token = localStorage.getItem('ghennai_token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data
}

export interface BuilderTemplate {
  id: string
  nameAr: string
  nameEn: string
  descAr: string
  files: string[]
  count: number
}

export interface VerifyCheck {
  label: string
  ok: boolean
  detail: string | null
  file: string | null
}

export interface GitInfo {
  ok: boolean
  isRepo: boolean
  root?: string
  branch?: string
  files?: { code: string; path: string }[]
  changed?: number
  added?: number
  removed?: number
  stat?: string | null
}

export interface ProviderStatus {
  name: string
  kind: string
  capabilities: string[]
  available: boolean
  path?: string | null
  version?: string | null
  reason?: string | null
  auth?: { configured: boolean; detail?: string } | null
}

export const builder = {
  templates: () => http('/api/builder/templates') as Promise<{ templates: BuilderTemplate[] }>,
  scaffold: (template: string, name: string) =>
    http('/api/builder/scaffold', { method: 'POST', body: JSON.stringify({ template, name }) }) as Promise<{
      ok: boolean
      root: string
      files: string[]
      count: number
      url: string
      code: string
      git: { ok: boolean; commit?: string; error?: string }
      project: { id: string; name: string; root: string; url?: string }
    }>,
  verify: (root: string) =>
    http('/api/builder/verify', { method: 'POST', body: JSON.stringify({ root }) }) as Promise<{
      ok: boolean
      root: string
      checks: VerifyCheck[]
    }>,
  git: (root: string) => http(`/api/builder/git?root=${encodeURIComponent(root)}`) as Promise<GitInfo>,
  commit: (root: string, message: string) =>
    http('/api/builder/git/commit', { method: 'POST', body: JSON.stringify({ root, message }) }) as Promise<{
      ok: boolean
      empty?: boolean
      commit?: string | null
    }>,
  providers: () => http('/api/providers?fresh=1') as Promise<{ providers: ProviderStatus[] }>,
  agentRun: (root: string, task: string, provider?: string | null) =>
    http('/api/builder/agent-run', { method: 'POST', body: JSON.stringify({ root, task, provider }) }) as Promise<{
      ok: boolean
      provider?: string
      exitCode?: number
      timedOut?: boolean
      cancelled?: boolean
      output?: string
      stderr?: string
      error?: string
    }>,
  agentStop: () => http('/api/builder/agent-stop', { method: 'POST' }) as Promise<{ ok: boolean; error?: string }>,
}
