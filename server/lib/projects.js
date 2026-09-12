import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { userWorkspace, safeResolve } from './paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const META_FILE = path.join(DATA_DIR, 'projects.json')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

let cache = null

function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(META_FILE, 'utf8'))
  } catch {
    cache = {}
  }
  return cache
}

function save() {
  if (!cache) return
  fs.writeFileSync(META_FILE, JSON.stringify(cache, null, 2))
}

export function projectsFor(email) {
  const all = load()
  if (!all[email]) {
    all[email] = {}
    save()
  }
  return all[email]
}

const HASH = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site'

/** اسم مجلد لاتيني ثابت لكل موقع جديد (مقاوم للعربية): sites/<slug> أو sites/site-<hash> */
export function siteRootFor(email, name) {
  const raw = String(name || 'site')
  const s = slug(raw)
  const folder = /^[a-z0-9-]+$/.test(s) ? s : `site-${HASH(raw).slice(0, 4)}`
  const root = `sites/${folder}`
  const ws = userWorkspace(email)
  const abs = safeResolve(ws, root)
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true })
  return root
}

/** مجلدات/ملفات النظام التي لا تُعدّ مشاريع ولا تُنسَّخ */
export const SYSTEM_DIRS = ['_ghennai', 'uploads', 'node_modules', '.git', 'dist', '.ghennai', 'light-assets', 'assets_old']

export function isProjectRoot(dir) {
  return fs.existsSync(path.join(dir, 'index.html')) || fs.existsSync(path.join(dir, 'package.json'))
}

/** مجلد المشروع الأهم: الجذر أو أحد مجلداته الفرعية المباشرة الذي يحوي index.html (أحدث تعديل) */
export function guessProjectRoot(ws, preferred = null) {
  if (preferred) {
    const p = safeResolve(ws, String(preferred).replace(/^~\/?/, ''))
    try {
      if (fs.statSync(p).isDirectory()) return path.relative(ws, p) || ''
    } catch {}
  }
  let best = ''
  let bestT = 0
  const rootIdx = path.join(ws, 'index.html')
  if (fs.existsSync(rootIdx)) {
    bestT = fs.statSync(rootIdx).mtimeMs
    best = ''
  }
  try {
    for (const e of fs.readdirSync(ws, { withFileTypes: true })) {
      if (!e.isDirectory() || SYSTEM_DIRS.includes(e.name)) continue
      const sub = path.join(ws, e.name, 'index.html')
      if (fs.existsSync(sub)) {
        const t = fs.statSync(sub).mtimeMs
        if (t > bestT) {
          bestT = t
          best = e.name
        }
      }
    }
  } catch {}
  return best
}

export function projectIdFor(email, root) {
  const base = root ? slug(root) : 'main'
  return `${base}-${HASH(`${email}|${root}`).slice(0, 4)}`
}

export function discoverProjects(email) {
  const ws = userWorkspace(email)
  const out = []
  const scan = (dir, rel) => {
    if (!isProjectRoot(dir)) return
    const root = rel || ''
    out.push({ root, name: root ? path.basename(root) : 'الموقع الرئيسي', id: projectIdFor(email, root) })
    if (rel) return
    let entries = []
    try {
      entries = fs.readdirSync(ws, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || SYSTEM_DIRS.includes(e.name)) continue
      scan(path.join(ws, e.name), e.name)
    }
  }
  scan(ws, '')
  // إنشاؤات مسجّلة مالكة (حتى لو المحتوى تغيّر) تُدمج
  const map = projectsFor(email)
  const ids = new Set(out.map((p) => p.id))
  for (const p of Object.values(map)) if (!ids.has(p.id)) out.push(p)
  return out
}

export function getProject(email, id) {
  const map = projectsFor(email)
  const p = map[id]
  if (!p) return null
  return { ...p }
}

export function touchProject(email, id) {
  const map = projectsFor(email)
  if (!map[id]) return null
  map[id].updatedAt = Date.now()
  save()
  return { ...map[id] }
}

export function setProjectMeta(email, id, meta) {
  const map = projectsFor(email)
  if (map[id]) {
    map[id] = { ...map[id], ...meta, updatedAt: Date.now() }
  } else {
    map[id] = { id, name: meta.name || 'مشروع', root: meta.root || '', version: 0, status: 'idle', createdAt: Date.now(), updatedAt: Date.now(), ...meta }
  }
  save()
  return { ...map[id] }
}

/** يضمن وجود سجل للمشروع في مسار root ويعيده */
export function ensureProject(email, root, name) {
  const id = projectIdFor(email, root)
  const map = projectsFor(email)
  if (!map[id]) {
    map[id] = {
      id,
      name: name || (root ? path.basename(root) : 'الموقع الرئيسي'),
      root: root || '',
      version: 0,
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    save()
  }
  return { ...map[id] }
}

const SKIP_FOR_SNAPSHOT = (p) => [...SYSTEM_DIRS, 'README.md'].some((s) => p.split(path.sep)[0] === s || p === s)

function projectAbs(ws, root) {
  return root ? safeResolve(ws, root) : ws
}

/** لقطة نسخة كاملة لمجلد المشروع → <root>/.ghennai/versions/<v>/ */
export function snapshotProject(email, root, version) {
  const ws = userWorkspace(email)
  const base = projectAbs(ws, root)
  const vdir = path.join(base, '.ghennai', 'versions', String(version))
  fs.mkdirSync(vdir, { recursive: true })
  let copied = 0
  const walk = (dir, rel) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.git')) continue
      if (e.name === 'node_modules') continue
      if (rel === '' && e.name === '.ghennai') continue
      const src = path.join(dir, e.name)
      const dstRel = rel ? `${rel}/${e.name}` : e.name
      const dst = path.join(vdir, dstRel)
      if (e.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true })
        walk(src, dstRel)
      } else {
        try {
          const st = fs.statSync(src)
          if (st.size > 5 * 1024 * 1024) continue
          fs.copyFileSync(src, dst)
          copied++
        } catch {}
      }
    }
  }
  walk(base, '')
  return { version, copied, dir: vdir }
}

export function listVersions(email, root) {
  const ws = userWorkspace(email)
  const base = projectAbs(ws, root)
  const vdir = path.join(base, '.ghennai', 'versions')
  if (!fs.existsSync(vdir)) return []
  let entries = []
  try {
    entries = fs.readdirSync(vdir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
    .map((e) => Number(e.name))
    .sort((a, b) => a - b)
}

/** استرجاع نسخة: يمسح ملفات المشروع الحالية (بدون الأنظمة) ويردّها من اللقطة */
export function restoreVersion(email, root, version) {
  const ws = userWorkspace(email)
  const base = projectAbs(ws, root)
  const vdir = path.join(base, '.ghennai', 'versions', String(version))
  if (!fs.existsSync(vdir)) throw new Error(`لا توجد نسخة v${version}`)

  const cleanDir = (dir, rel) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.git')) continue
      if (e.name === 'node_modules') continue
      if (rel === '' && e.name === '.ghennai') continue
      const p = path.join(dir, e.name)
      fs.rmSync(p, { recursive: true, force: true })
    }
  }
  cleanDir(base, '')

  let restored = 0
  const walk = (dir, rel) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const src = path.join(dir, e.name)
      const dstRel = rel ? `${rel}/${e.name}` : e.name
      const dst = path.join(base, dstRel)
      if (e.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true })
        walk(src, dstRel)
      } else {
        fs.copyFileSync(src, dst)
        restored++
      }
    }
  }
  walk(vdir, '')
  return { version, restored }
}