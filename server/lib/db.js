import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const DB_FILE = path.join(DATA_DIR, 'ghennai.db')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_FILE)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  parent_id INTEGER,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  agent TEXT,
  tools TEXT NOT NULL DEFAULT '[]',
  deps TEXT NOT NULL DEFAULT '[]',
  retries INTEGER NOT NULL DEFAULT 0,
  verification TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  checkpoint TEXT NOT NULL DEFAULT '{}',
  user_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  project_id INTEGER,
  user_email TEXT,
  agent TEXT,
  tool TEXT,
  input_summary TEXT,
  result TEXT,
  error TEXT,
  duration INTEGER,
  status TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  project_id INTEGER,
  user_email TEXT,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  user_email TEXT,
  tool TEXT,
  reason TEXT,
  params_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  type TEXT,
  path TEXT,
  source TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  related_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_path TEXT NOT NULL,
  version INTEGER NOT NULL,
  path TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  platform TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  media_json TEXT NOT NULL DEFAULT '{}',
  calendar_time TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  publish_result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT,
  mode TEXT NOT NULL DEFAULT 'assisted',
  key TEXT,
  value_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  project_id INTEGER,
  state TEXT NOT NULL DEFAULT 'idle',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  task_id INTEGER,
  user_email TEXT,
  agent TEXT,
  tool TEXT,
  action TEXT,
  input_summary TEXT,
  result TEXT,
  error TEXT,
  status TEXT,
  duration INTEGER,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

function toRow(columns) {
  return columns.map((c) => c).join(', ')
}
function placeholders(n) {
  return Array(n).fill('?').join(', ')
}

const User = {
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase())
  },
  create({ email, name, password }) {
    const key = String(email).toLowerCase()
    const hash = bcrypt.hashSync(password, 10)
    db.prepare('INSERT OR IGNORE INTO users (email, name, password) VALUES (?, ?, ?)').run(key, name || key.split('@')[0], hash)
    return { email: key, name: name || key.split('@')[0] }
  },
  verify(password, hash) {
    try { return bcrypt.compareSync(password, hash) } catch { return false }
  },
  getSetting(email, key, def = null) {
    const row = db.prepare('SELECT value_json FROM settings WHERE user_email = ? AND key = ?').get(email, key)
    return row ? JSON.parse(row.value_json) : def
  },
  setSetting(email, key, value) {
    db.prepare(`INSERT INTO settings (user_email, key, value_json, updated_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO NOTHING`).run(email, key, JSON.stringify(value))
    db.prepare(`UPDATE settings SET value_json = ?, updated_at = datetime('now') WHERE user_email = ? AND key = ?`).run(JSON.stringify(value), email, key)
  },
  getMode(email) {
    const row = db.prepare('SELECT value_json FROM settings WHERE user_email = ? AND key = ?').get(email, 'mode')
    return row ? JSON.parse(row.value_json) : 'assisted'
  },
  setMode(email, mode) {
    this.setSetting(email, 'mode', mode)
  },
}

const Project = {
  create({ slug, name, path, metadata = {} }) {
    const exists = this.findBySlug(slug)
    if (exists) return exists
    const info = db.prepare('INSERT INTO projects (slug, name, path, metadata) VALUES (?, ?, ?, ?)').run(slug, name, path, JSON.stringify(metadata))
    return { id: Number(info.lastInsertRowid), slug, name, path, metadata }
  },
  findBySlug(slug) {
    const row = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)
    if (!row) return null
    return { ...row, metadata: JSON.parse(row.metadata || '{}') }
  },
  byId(id) {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    if (!row) return null
    return { ...row, metadata: JSON.parse(row.metadata || '{}') }
  },
  all() {
    return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map((r) => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }))
  },
  updateStatus(id, status) {
    db.prepare('UPDATE projects SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id)
  },
}

const Task = {
  create({ project_id, parent_id = null, goal, agent = null, tools = [], deps = [], verification = {}, user_email }) {
    const info = db.prepare(`INSERT INTO tasks (project_id, parent_id, goal, agent, tools, deps, verification, user_email)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(project_id, parent_id, goal, agent, JSON.stringify(tools), JSON.stringify(deps), JSON.stringify(verification), user_email)
    return { id: Number(info.lastInsertRowid), project_id, parent_id, goal, agent, tools, deps, verification, status: 'pending', retries: 0, checkpoint: {} }
  },
  byId(id) {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) return null
    return { ...row, tools: JSON.parse(row.tools || '[]'), deps: JSON.parse(row.deps || '[]'), verification: JSON.parse(row.verification || '{}'), checkpoint: JSON.parse(row.checkpoint || '{}') }
  },
  byProject(project_id) {
    return db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY id ASC').all(project_id).map((r) => ({ ...r, tools: JSON.parse(r.tools || '[]'), deps: JSON.parse(r.deps || '[]'), verification: JSON.parse(r.verification || '{}'), checkpoint: JSON.parse(r.checkpoint || '{}') }))
  },
  update(id, patch) {
    const fields = []
    const values = []
    for (const k of ['status', 'agent', 'result', 'checkpoint']) {
      if (k in patch) { fields.push(`${k} = ?`); values.push(k === 'result' || k === 'checkpoint' ? JSON.stringify(patch[k]) : patch[k]) }
    }
    if ('retries' in patch) { fields.push('retries = ?'); values.push(patch.retries) }
    if (fields.length) {
      fields.push('updated_at = datetime(\'now\')')
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
    }
  },
  countByStatus(status) {
    return db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE status = ?').get(status).n
  },
}

const Memory = {
  put({ scope, project_id = null, user_email = null, key, value }) {
    db.prepare('INSERT INTO memories (scope, project_id, user_email, key, value_json) VALUES (?, ?, ?, ?, ?)')
      .run(scope, project_id, user_email, key, JSON.stringify(value))
  },
  get({ scope, project_id = null, user_email = null, key }) {
    const row = db.prepare('SELECT * FROM memories WHERE scope = ? AND key = ? AND (? IS NULL OR project_id = ?) AND (? IS NULL OR user_email = ?) ORDER BY id DESC LIMIT 1')
      .get(scope, key, project_id, project_id, user_email, user_email)
    return row ? JSON.parse(row.value_json) : null
  },
  search({ scope, project_id = null, user_email = null, limit = 20 }) {
    const rows = db.prepare('SELECT * FROM memories WHERE scope = ? AND (? IS NULL OR project_id = ?) AND (? IS NULL OR user_email = ?) ORDER BY id DESC LIMIT ?')
      .all(scope, project_id, project_id, user_email, user_email, limit)
    return rows.map((r) => ({ key: r.key, value: JSON.parse(r.value_json), ts: r.ts }))
  },
}

const Approval = {
  create({ task_id, user_email, tool, reason, params }) {
    const info = db.prepare('INSERT INTO approvals (task_id, user_email, tool, reason, params_json) VALUES (?, ?, ?, ?, ?)')
      .run(task_id, user_email, tool, reason, JSON.stringify(params))
    return Number(info.lastInsertRowid)
  },
  pendingFor(user_email) {
    return db.prepare('SELECT * FROM approvals WHERE user_email = ? AND status = \'pending\' ORDER BY id DESC').all(user_email).map((r) => ({ ...r, params: JSON.parse(r.params_json) }))
  },
  byId(id) {
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id)
    return row ? { ...row, params: JSON.parse(row.params_json) } : null
  },
  decide(id, status) {
    db.prepare('UPDATE approvals SET status = ?, decided_at = datetime(\'now\') WHERE id = ?').run(status, id)
  },
  pendingByTask(task_id) {
    return db.prepare('SELECT * FROM approvals WHERE task_id = ? AND status = \'pending\'').all(task_id)
  },
}

const Asset = {
  create({ project_id, type, path, source, metadata = {}, related = {} }) {
    const info = db.prepare('INSERT INTO assets (project_id, type, path, source, metadata_json, related_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(project_id, type, path, source, JSON.stringify(metadata), JSON.stringify(related))
    return Number(info.lastInsertRowid)
  },
  byProject(project_id) {
    return db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY id DESC').all(project_id).map((r) => ({ ...r, metadata: JSON.parse(r.metadata_json), related: JSON.parse(r.related_json) }))
  },
  version(asset_path, path) {
    const last = db.prepare('SELECT MAX(version) AS v FROM versions WHERE asset_path = ?').get(asset_path)
    const v = (last?.v || 0) + 1
    db.prepare('INSERT INTO versions (asset_path, version, path) VALUES (?, ?, ?)').run(asset_path, v, path)
    return v
  },
  versions(asset_path) {
    return db.prepare('SELECT * FROM versions WHERE asset_path = ? ORDER BY version DESC').all(asset_path)
  },
}

const Social = {
  create({ project_id, platform, content = {}, media = [], calendar_time = null }) {
    const info = db.prepare('INSERT INTO social_posts (project_id, platform, content_json, media_json, calendar_time) VALUES (?, ?, ?, ?, ?)')
      .run(project_id, platform, JSON.stringify(content), JSON.stringify(media), calendar_time)
    return Number(info.lastInsertRowid)
  },
  byProject(project_id) {
    return db.prepare('SELECT * FROM social_posts WHERE project_id = ? ORDER BY id DESC').all(project_id).map((r) => ({ ...r, content: JSON.parse(r.content_json), media: JSON.parse(r.media_json) }))
  },
  updateStatus(id, status, publish_result = null) {
    db.prepare('UPDATE social_posts SET status = ?, publish_result = ? WHERE id = ?').run(status, publish_result ? JSON.stringify(publish_result) : null, id)
  },
}

const Log = {
  record(entry) {
    const info = db.prepare(`INSERT INTO logs (channel, task_id, user_email, agent, tool, action, input_summary, result, error, status, duration)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entry.channel || 'agent', entry.task_id ?? null, entry.user_email ?? null, entry.agent ?? null, entry.tool ?? null,
           entry.action ?? null, entry.input_summary ?? null, entry.result ?? null, entry.error ?? null, entry.status ?? null, entry.duration ?? null)
    return Number(info.lastInsertRowid)
  },
  recent(channel, n = 100) {
    return db.prepare('SELECT * FROM logs WHERE channel = ? ORDER BY id DESC LIMIT ?').all(channel, n)
  },
}

const AgentState = {
  set(name, state, project_id = null) {
    const exists = db.prepare('SELECT id FROM agent_state WHERE name = ?').get(name)
    if (exists) db.prepare('UPDATE agent_state SET state = ?, project_id = ?, updated_at = datetime(\'now\') WHERE name = ?').run(state, project_id, name)
    else db.prepare('INSERT INTO agent_state (name, state, project_id) VALUES (?, ?, ?)').run(name, state, project_id)
  },
  get() {
    return db.prepare('SELECT * FROM agent_state ORDER BY name').all()
  },
}

export { db, User, Project, Task, Memory, Approval, Asset, Social, Log, AgentState }
