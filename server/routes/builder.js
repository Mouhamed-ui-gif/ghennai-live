import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireAuth } from './auth.js'
import { userWorkspace, safeResolve } from '../lib/paths.js'
import { ensureProject } from '../lib/projects.js'
import { ensureShare } from '../lib/share.js'
import terminal from '../tools/terminal.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'

const router = express.Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates')

const META = {
  agency: { nameAr: 'وكالة', nameEn: 'Agency', descAr: 'موقع وكالة إبداعية' },
  'modern-saas': { nameAr: 'SaaS عصري', nameEn: 'Modern SaaS', descAr: 'صفحة منتج تقني' },
  portfolio: { nameAr: 'محفظة أعمال', nameEn: 'Portfolio', descAr: 'عرض أعمال ومشاريع' },
  restaurant: { nameAr: 'مطعم', nameEn: 'Restaurant', descAr: 'قائمة مطعم وعرض' },
  store: { nameAr: 'متجر', nameEn: 'Store', descAr: 'عرض منتجات وأسعار' },
}

function listFilesRecursive(dir, base = '') {
  const out = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...listFilesRecursive(path.join(dir, e.name), rel))
    else out.push(rel)
  }
  return out.sort()
}

/** القوالب الحقيقية فقط: مجلدات تحت server/templates تحوي index.html */
router.get('/templates', requireAuth, (req, res) => {
  let dirs = []
  try {
    dirs = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return res.json({ templates: [] })
  }
  const templates = []
  for (const id of dirs) {
    const dir = path.join(TEMPLATES_DIR, id)
    if (!fs.existsSync(path.join(dir, 'index.html'))) continue
    const files = listFilesRecursive(dir)
    const meta = META[id] || { nameAr: id, nameEn: id, descAr: '' }
    templates.push({ id, ...meta, files, count: files.length })
  }
  res.json({ templates })
})

const slugify = (s) =>
  String(s || 'site').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site'

/** إنشاء مشروع حقيقي من قالب حقيقي: نسخ ملفات + تسجيل + رابط /live */
router.post('/scaffold', requireAuth, async (req, res) => {
  const email = req.user.email
  const { template, name } = req.body || {}
  if (!template || !/^[a-z0-9-]+$/i.test(String(template))) {
    return res.status(400).json({ ok: false, error: 'template غير صالح' })
  }
  const tplDir = path.join(TEMPLATES_DIR, String(template))
  let st
  try {
    st = fs.statSync(tplDir)
  } catch {
    return res.status(404).json({ ok: false, error: `القالب غير موجود: ${template}` })
  }
  if (!st.isDirectory() || !fs.existsSync(path.join(tplDir, 'index.html'))) {
    return res.status(400).json({ ok: false, error: `القالب غير صالح (لا يحوي index.html): ${template}` })
  }
  const ws = userWorkspace(email)
  let s = slugify(name)
  if (!/^[a-z0-9-]+$/.test(s)) s = `site-${Date.now().toString(36)}`
  let root = `sites/${s}`
  let n = 1
  while (fs.existsSync(safeResolve(ws, root)) && fs.readdirSync(safeResolve(ws, root)).length > 0) {
    n += 1
    root = `sites/${s}-${n}`
  }
  try {
    const dest = safeResolve(ws, root)
    fs.mkdirSync(dest, { recursive: true })
    fs.cpSync(tplDir, dest, { recursive: true })
    const files = listFilesRecursive(dest)
    const project = ensureProject(email, root, String(name || template))
    const share = ensureShare(email, root, String(name || template))
    // git حقيقي داخل المشروع نفسه (مساحة العمل مُتجاهَلة في مستودع التطبيق)
    let git = { ok: false }
    try {
      const gi = await terminal('git init -b main && git add -A && git -c user.email="ghennai@local" -c user.name="Ghennai" commit -qm "scaffold from template" && git rev-parse --short HEAD', {
        workspace: ws, cwd: root, timeoutMs: 30000,
      })
      git = gi.ok
        ? { ok: true, commit: String(gi.output || '').trim().split('\n').filter(Boolean).pop()?.slice(0, 12) || null }
        : { ok: false, error: String(gi.stderr || gi.output || '').slice(0, 200) }
    } catch (e) {
      git = { ok: false, error: String(e.message || e).slice(0, 200) }
    }
    emitUser(email, { type: 'workspace_changed', path: `${root}/index.html` })
    emitUser(email, { type: 'project_state', project: share.project })
    audit({ user: email, agent: 'builder', action: 'scaffold', input: `${template} -> ${root}`, status: 'success' })
    res.json({ ok: true, root, files, count: files.length, url: share.url, code: share.code, git, project: share.project || project })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) })
  }
})

function checkRefs(dir) {
  const missing = []
  const idx = path.join(dir, 'index.html')
  let html = ''
  try {
    html = fs.readFileSync(idx, 'utf8')
  } catch {
    return { ok: false, missing: ['index.html unreadable'] }
  }
  const refs = new Set()
  for (const m of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)) {
    const u = m[1].trim()
    if (!u || /^(https?:|data:|mailto:|tel:|#|blob:)/i.test(u) || u.startsWith('//')) continue
    refs.add(u.replace(/^\.\//, ''))
  }
  for (const r of refs) {
    const clean = r.split('?')[0]
    if (clean && !fs.existsSync(path.join(dir, clean))) missing.push(clean)
  }
  return { ok: missing.length === 0, missing }
}

function checkJsSyntax(dir) {
  const bad = []
  for (const f of listFilesRecursive(dir).filter((f) => /\.(js|mjs)$/i.test(f) && !/node_modules/.test(f))) {
    try {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      // فحص بناء الجملة فقط دون تنفيذ
      new Function(`"use strict";\n${src}`)
    } catch (e) {
      bad.push({ file: f, error: String(e.message || e).slice(0, 200) })
    }
  }
  return bad
}

function checkCssBalance(dir) {
  const bad = []
  for (const f of listFilesRecursive(dir).filter((f) => /\.css$/i.test(f))) {
    try {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      let open = 0
      let inStr = null
      for (let i = 0; i < src.length; i++) {
        const c = src[i]
        if (inStr) {
          if (c === inStr && src[i - 1] !== '\\') inStr = null
          continue
        }
        if (c === '"' || c === "'") inStr = c
        else if (c === '{') open++
        else if (c === '}') open--
        if (open < 0) break
      }
      if (open !== 0) bad.push({ file: f, error: `unbalanced braces (depth ${open})` })
    } catch (e) {
      bad.push({ file: f, error: String(e.message || e).slice(0, 200) })
    }
  }
  return bad
}

/**
 * فحص جودة حقيقي قبل الاكتمال: ملفات + مراجع + بناء جملة JS + توازن CSS
 * + (لمشاريع npm فقط) npm run build حقيقي.
 * لا يوجد "نجاح" إلا بتحقق فعلي — كل فحص يعيد ok صريحًا.
 */
router.post('/verify', requireAuth, async (req, res) => {
  const email = req.user.email
  const root = String(req.body?.root || '')
  const ws = userWorkspace(email)
  let dir
  try {
    dir = safeResolve(ws, root || '.')
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e.message || e) })
  }
  const rel = path.relative(ws, dir) || '.'
  const checks = []
  const push = (label, ok, detail = null, file = null) => checks.push({ label, ok: !!ok, detail, file })

  // 1. index.html موجود وحجمه معقول
  const idx = path.join(dir, 'index.html')
  let htmlSize = 0
  try {
    htmlSize = fs.statSync(idx).size
    push('index.html موجود', htmlSize > 500, `${htmlSize} bytes`, 'index.html')
  } catch {
    push('index.html موجود', false, 'missing', 'index.html')
  }

  // 2. بنية HTML مكتملة
  if (htmlSize > 0) {
    try {
      const html = fs.readFileSync(idx, 'utf8')
      const complete = /<\/html\s*>/i.test(html) && /<head[\s>]/i.test(html)
      push('بنية HTML مكتملة', complete, complete ? 'head + closing html' : 'ناقص وسم الإغلاق', 'index.html')
    } catch {
      push('بنية HTML مكتملة', false, 'unreadable', 'index.html')
    }
  }

  // 3. المراجع المحلية كلها موجودة
  const refs = checkRefs(dir)
  push('المراجع المحلية سليمة', refs.ok, refs.ok ? 'كل الملفات المشار إليها موجودة' : `مفقود: ${refs.missing.slice(0, 5).join(', ')}`)

  // 4. بناء جملة JS
  const jsBad = checkJsSyntax(dir)
  push('بناء جملة JavaScript', jsBad.length === 0, jsBad.length === 0 ? 'سليم' : jsBad.map((b) => `${b.file}: ${b.error}`).join(' | ').slice(0, 300))

  // 5. توازن أقواس CSS
  const cssBad = checkCssBalance(dir)
  push('توازن أقواس CSS', cssBad.length === 0, cssBad.length === 0 ? 'سليم' : cssBad.map((b) => `${b.file}: ${b.error}`).join(' | ').slice(0, 300))

  // 6. مشاريع npm: build حقيقي
  let npmBuild = null
  const pkgPath = path.join(dir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    let scripts = {}
    try {
      scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {}
    } catch { /* noop */ }
    if (scripts.build) {
      emitUser(email, { type: 'agent', agent: 'Builder', message: `🏗️ فحص البناء: npm run build في ${rel}…`, status: 'running' })
      try {
        const r = await terminal('npm run build', {
          workspace: ws, cwd: rel, timeoutMs: 240000,
          onData: (kind, chunk) => emitUser(email, { type: 'preview_log', id: 'verify-build', kind, text: chunk.slice(0, 4000) }),
        })
        npmBuild = { ok: r.ok, code: r.code }
        push('npm run build', r.ok, r.ok ? `exit ${r.code}` : `exit ${r.code}: ${String(r.stderr || r.output || '').slice(-400)}`)
      } catch (e) {
        npmBuild = { ok: false, error: String(e.message || e) }
        push('npm run build', false, String(e.message || e).slice(0, 300))
      }
    } else {
      push('npm run build', true, 'لا يوجد سكربت build — تُخطّي (مشروع static)')
    }
  }

  const ok = checks.every((c) => c.ok)
  audit({ user: email, agent: 'builder', action: 'verify', input: rel, result: `${checks.filter((c) => c.ok).length}/${checks.length}`, status: ok ? 'success' : 'error' })
  res.json({ ok, root: rel, checks, npmBuild })
})

/** حالة git الحقيقية لمجلد مشروع: فرع + ملفات متغيرة + إحصاء diff */
router.get('/git', requireAuth, async (req, res) => {
  const email = req.user.email
  const root = String(req.query.root || '')
  const ws = userWorkspace(email)
  let dir
  try {
    dir = safeResolve(ws, root || '.')
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e.message || e) })
  }
  const rel = path.relative(ws, dir) || '.'
  const run = (cmd) => terminal(cmd, { workspace: ws, cwd: rel, timeoutMs: 15000 })
  try {
    const repo = await run('git rev-parse --is-inside-work-tree')
    if (!repo.ok || !String(repo.output || '').includes('true')) {
      return res.json({ ok: true, isRepo: false, root: rel })
    }
    // النطاق الصادق: حالة هذا المشروع فقط داخل المستودع الأب (وليس كل تغييرات التطبيق)
    const topOut = await run('git rev-parse --show-toplevel')
    const top = String(topOut.output || '').trim()
    let scope = null
    try {
      const absTop = fs.realpathSync(top)
      const absDir = fs.realpathSync(dir)
      scope = path.relative(absTop, absDir) || '.'
      if (scope.startsWith('..')) scope = null
    } catch { scope = null }
    const scopeArg = scope && scope !== '.' ? ` -- ${JSON.stringify(scope)}` : ''
    const [branch, status, stat] = await Promise.all([
      run('git branch --show-current'),
      run(`git status --porcelain${scopeArg}`),
      run(`git diff --stat${scopeArg}`),
    ])
    const files = String(status.output || '').split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2).trim(), path: l.slice(3) }))
    let added = 0
    let removed = 0
    const m = String(stat.output || '').match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/)
    if (m) {
      added = Number(m[2] || 0)
      removed = Number(m[3] || 0)
    }
    res.json({
      ok: true, isRepo: true, root: rel,
      branch: String(branch.output || '').trim() || 'HEAD',
      files, changed: files.length, added, removed,
      stat: String(stat.output || '').slice(-800) || null,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) })
  }
})

/** commit حقيقي داخل مستودع المشروع: git add -A + commit برسالة المستخدم */router.post('/git/commit', requireAuth, async (req, res) => {
  const email = req.user.email
  const root = String(req.body?.root || '')
  const message = String(req.body?.message || '').slice(0, 200) || 'update via studio'
  const ws = userWorkspace(email)
  let dir
  try {
    dir = safeResolve(ws, root || '.')
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e.message || e) })
  }
  const rel = path.relative(ws, dir) || '.'
  const safeMsg = message.replace(/["`$\\]/g, '')
  try {
    const r = await terminal(`git add -A && git -c user.email="ghennai@local" -c user.name="Ghennai" commit -qm "${safeMsg}" && git rev-parse --short HEAD`, {
      workspace: ws, cwd: rel, timeoutMs: 30000,
    })
    if (!r.ok) {
      const err = String(r.stderr || r.output || '')
      if (/nothing to commit/i.test(err)) return res.json({ ok: true, empty: true, root: rel })
      return res.status(500).json({ ok: false, error: err.slice(0, 400) })
    }
    emitUser(email, { type: 'workspace_changed', path: `${rel}/.git`, action: 'commit' })
    audit({ user: email, agent: 'builder', action: 'git-commit', input: `${rel}: ${safeMsg}`, status: 'success' })
    res.json({ ok: true, root: rel, commit: String(r.output || '').trim().split('\n').filter(Boolean).pop()?.slice(0, 12) || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) })
  }
})

/**
 * تنفيذ مهمة بناء عبر مزود CLI حقيقي يختاره المستخدم (opencode/codex/claude/crush).
 * التوجيه عبر ProviderManager حسب القدرة + الصحة الحية — لا أسماء ثابتة.
 * البثّ حيّ عبر terminal_data، والإلغاء حقيقي عبر AbortController لكل مستخدم.
 */
import { route as routeProvider } from '../agent/providers/registry.js'

const agentRuns = new Map() // email -> AbortController

router.post('/agent-run', requireAuth, async (req, res) => {
  const email = req.user.email
  const root = String(req.body?.root || '')
  const task = String(req.body?.task || '').trim()
  const prefer = req.body?.provider ? String(req.body.provider) : null
  if (!task) return res.status(400).json({ ok: false, error: 'task required' })
  const ws = userWorkspace(email)
  try {
    safeResolve(ws, root || '.')
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e.message || e) })
  }
  if (agentRuns.has(email)) {
    return res.status(409).json({ ok: false, error: 'تنفيذ آخر نشط بالفعل — أوقفه أولاً' })
  }
  let routed
  try {
    routed = await routeProvider({ capability: 'coding', prefer })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) })
  }
  if (!routed.ok) return res.status(503).json({ ok: false, error: routed.error })
  const provider = routed.provider
  const controller = new AbortController()
  agentRuns.set(email, controller)
  emitUser(email, { type: 'terminal_data', kind: 'cmd', data: `$ [${provider.name}] ${task.slice(0, 200)}\n` })
  emitUser(email, { type: 'agent', agent: provider.name, message: `⚙️ ينفّذ عبر ${provider.name} في ${root || '.'}…`, status: 'running' })
  try {
    const r = await provider.stream(
      { prompt: task, cwd: root || '.', email, timeoutMs: 600000, signal: controller.signal },
      (kind, chunk) => emitUser(email, { type: 'terminal_data', kind, data: String(chunk).slice(0, 4000) })
    )
    emitUser(email, { type: 'workspace_changed', path: `${root || '.'}/index.html`, action: 'agent-run' })
    audit({ user: email, agent: provider.name, action: 'agent-run', input: `${root}: ${task.slice(0, 120)}`, result: `exit ${r.exitCode}`, status: r.ok ? 'success' : 'error' })
    res.json({
      ok: r.ok, provider: provider.name, exitCode: r.exitCode,
      timedOut: !!r.timedOut, cancelled: !!r.cancelled,
      output: String(r.output || '').slice(-3000),
      stderr: String(r.stderr || '').slice(-1500),
    })
  } catch (e) {
    res.status(500).json({ ok: false, provider: provider.name, error: String(e?.message || e).slice(0, 400) })
  } finally {
    if (agentRuns.get(email) === controller) agentRuns.delete(email)
  }
})

router.post('/agent-stop', requireAuth, (req, res) => {
  const email = req.user.email
  const c = agentRuns.get(email)
  if (!c) return res.json({ ok: false, error: 'لا يوجد تنفيذ نشط' })
  try { c.abort() } catch { /* noop */ }
  agentRuns.delete(email)
  res.json({ ok: true })
})

export default router
