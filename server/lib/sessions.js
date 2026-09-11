import { Memory } from './db.js'

export function createSession(email, title = 'محادثة') {
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  Memory.put({ scope: 'session', user_email: email, key: id, value: { title: String(title).slice(0, 80), ts: Date.now() } })
  return id
}

export function appendMsg(email, sessionId, role, content, agent = null) {
  try {
    if (!sessionId) return
    Memory.put({ scope: `sess:${sessionId}`, user_email: email, key: String(Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), value: { role, content: String(content).slice(0, 4000), agent, ts: Date.now() } })
  } catch { /* noop */ }
}

export function listSessions(email) {
  try {
    const rows = Memory.search({ scope: 'session', user_email: email, limit: 300 })
    const byKey = {}
    for (const r of rows) byKey[r.key] = { id: r.key, title: r.value.title || 'محادثة', ts: r.value.ts || r.ts || 0 }
    return Object.values(byKey).sort((a, b) => Number(b.ts) - Number(a.ts)).slice(0, 40)
  } catch {
    return []
  }
}

export function getSession(email, id) {
  try {
    const rows = Memory.search({ scope: `sess:${id}`, user_email: email, limit: 500 })
    return rows.map((r) => r.value).sort((a, b) => Number(a.ts) - Number(b.ts))
  } catch {
    return []
  }
}

export function currentSessionId(email) {
  try {
    const rows = Memory.search({ scope: 'session', user_email: email, limit: 1 })
    return rows.length ? rows[0].key : null
  } catch {
    return null
  }
}