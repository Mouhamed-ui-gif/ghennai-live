import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { requireAuth, verifyToken } from './auth.js'
import { userWorkspace, safeResolve } from '../lib/paths.js'
import * as procs from '../lib/processes.js'
import terminal from '../tools/terminal.js'
import { ensureShare } from '../lib/share.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'

const router = express.Router()

function projectType(dir) {
  try {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      return { kind: 'npm', scripts: pkg.scripts || {}, name: pkg.name || path.basename(dir) }
    }
  } catch { /* invalid package.json → treat as static below */ }
  if (fs.existsSync(path.join(dir, 'index.html'))) return { kind: 'static' }
  return { kind: 'empty' }
}

/** بدء معاينة حقيقية: static → رابط /live · npm → تثبيت ثم dev server حقيقي */
router.post('/start', requireAuth, async (req, res) => {
  const email = req.user.email
  const cwd = String(req.body?.cwd || req.body?.root || '.')
  const ws = userWorkspace(email)
  let dir
  try {
    dir = safeResolve(ws, cwd)
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e.message || e) })
  }
  if (!fs.existsSync(dir)) return res.status(404).json({ ok: false, error: `المجلد غير موجود: ${cwd}` })

  const pt = projectType(dir)
  if (pt.kind === 'empty') {
    return res.status(400).json({ ok: false, error: 'لا يوجد index.html ولا package.json — لا شيء لمعاينته' })
  }

  if (pt.kind === 'static') {
    try {
      const rel = path.relative(ws, dir) || ''
      const share = ensureShare(email, rel, pt.name || path.basename(dir) || 'الموقع')
      audit({ user: email, agent: 'preview', action: 'static', input: rel, status: 'success' })
      return res.json({ ok: true, kind: 'static', url: share.url, id: null })
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e) })
    }
  }

  // ── مشروع npm ──
  const script = pt.scripts.dev ? 'dev' : pt.scripts.start ? 'start' : pt.scripts.preview ? 'preview' : null
  if (!script) {
    return res.status(400).json({ ok: false, error: 'لا يوجد سكربت dev/start/preview في package.json' })
  }
  try {
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      emitUser(email, { type: 'agent', agent: 'Preview', message: `📦 تثبيت الاعتماديات في ${cwd}…`, status: 'running' })
      const inst = await terminal('npm install', {
        workspace: ws, cwd: path.relative(ws, dir) || '.', timeoutMs: 300000,
        onData: (kind, chunk) => emitUser(email, { type: 'preview_log', id: 'install', kind, text: chunk.slice(0, 4000) }),
      })
      if (!inst.ok) {
        return res.status(500).json({ ok: false, error: `فشل npm install:\n${String(inst.stderr || inst.output || '').slice(0, 1500)}` })
      }
    }
    const r = await procs.start({ email, cwd: path.relative(ws, dir) || '.', command: `npm run ${script}` })
    if (!r.ok) return res.status(500).json({ ok: false, error: r.error, id: r.id || null })
    audit({ user: email, agent: 'preview', action: 'npm', input: `${cwd} :${r.port}`, status: 'success' })
    const proto = `${req.protocol}://${req.get('host')}`
    return res.json({ ok: true, kind: 'npm', id: r.id, port: r.port, url: `${proto}/api/preview/p/${r.id}/` })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) })
  }
})

router.post('/stop', requireAuth, (req, res) => {
  const r = procs.stop(req.user.email, String(req.body?.id || ''))
  if (!r.ok) return res.status(404).json(r)
  res.json(r)
})

router.get('/list', requireAuth, (req, res) => {
  res.json({ previews: procs.list(req.user.email) })
})

router.get('/logs', requireAuth, (req, res) => {
  const r = procs.logs(req.user.email, String(req.query.id || ''), Number(req.query.tail || 200))
  if (!r.ok) return res.status(404).json(r)
  res.json(r)
})

function authed(req) {
  const h = req.headers.authorization?.split(' ')[1]
  const q = req.query.token
  const tok = h || q
  if (!tok) return null
  try {
    return verifyToken(String(tok))
  } catch {
    return null
  }
}

/** بروكسي عكسي حقيقي: يعرض dev server المحلي عبر رابط الخادم (يعمل عبر النفق) */
router.use('/p/:id', (req, res) => {
  const user = authed(req)
  if (!user) return res.status(401).send('Unauthorized')
  const rec = procs.get(user.email, String(req.params.id))
  if (!rec || rec.status !== 'running') return res.status(404).send('المعاينة غير نشطة')
  const target = `http://127.0.0.1:${rec.port}${req.url || '/'}`
  const headers = { ...req.headers }
  delete headers.host
  delete headers.authorization
  delete headers.cookie
  const preq = http.request(target, { method: req.method, headers }, (pres) => {
    const out = { ...pres.headers }
    if (out.location && typeof out.location === 'string' && out.location.startsWith('/')) {
      out.location = `/api/preview/p/${rec.id}${out.location}`
    }
    delete out['content-security-policy']
    res.writeHead(pres.statusCode || 200, out)
    pres.pipe(res)
  })
  preq.on('error', (e) => {
    if (!res.headersSent) res.status(502).send(`المعاينة لا تستجيب: ${String(e.message || e).slice(0, 200)}`)
    else res.end()
  })
  req.pipe(preq)
})

export default router
