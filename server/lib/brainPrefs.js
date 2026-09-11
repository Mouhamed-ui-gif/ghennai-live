import { db } from './db.js'
import { ollamaIsAvailable } from './modelRouter.js'

const cache = new Map()

const DEFAULTS = {
  collab: false,
  supervisor: false,
  autoGrade: false,
  speed: 'fast',
  speechOut: false,
  paused: false,
  interval: 0,
  team: true,
  solo: true,
  pipeline: true,
  models: { Core: '', Coding: '', Research: '', Study: '', Design: '', Genie: '', Voice: '' },
}

function rowsFor(email) {
  const rows = db.prepare("SELECT key, value_json FROM settings WHERE user_email = ? AND key LIKE 'brain:%'").all(email)
  const out = {}
  for (const r of rows) out[r.key.replace('brain:', '')] = JSON.parse(r.value_json)
  return out
}

export function getPrefs(email, fresh = false) {
  if (fresh) cache.delete(email)
  if (cache.has(email)) return cache.get(email)
  const stored = rowsFor(email)
  const prefs = { ...DEFAULTS, ...stored }
  for (const k of Object.keys(DEFAULTS.models)) {
    if (typeof prefs.models[k] !== 'string') prefs.models[k] = ''
  }
  cache.set(email, prefs)
  return prefs
}

export function setPref(email, key, value) {
  const cur = getPrefs(email, true)
  if (key === 'models') {
    cur.models = { ...cur.models, ...value }
  } else {
    cur[key] = value
  }
  const json = JSON.stringify(key === 'models' ? cur.models : cur[key])
  const row = db.prepare("SELECT id FROM settings WHERE user_email = ? AND key = ?").get(email, `brain:${key}`)
  if (row) db.prepare("UPDATE settings SET value_json = ?, updated_at = datetime('now') WHERE id = ?").run(json, row.id)
  else db.prepare("INSERT INTO settings (user_email, mode, key, value_json) VALUES (?, 'assisted', ?, ?)").run(email, `brain:${key}`, json)
  cache.set(email, cur)
  return cur
}

export function modelFor(email, agent) {
  const m = getPrefs(email).models?.[agent]
  if (m) return m
  return null
}

export async function availableModels() {
  const out = []
  if (await ollamaIsAvailable()) {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(4000) })
      const data = await res.json()
      out.push(...(data.models || []).map((m) => m.name))
    } catch { /* noop */ }
  }
  return out
}