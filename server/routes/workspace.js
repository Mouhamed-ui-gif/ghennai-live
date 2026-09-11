import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import archiver from 'archiver'
import { requireAuth } from './auth.js'
import { userWorkspace, safeResolve } from '../lib/paths.js'
import terminal from '../tools/terminal.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'

const router = express.Router()

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const ws = userWorkspace(req.user?.email)
        const rel = String(req.body.path || 'uploads/').replace(/^\/+/, '')
        const dir = safeResolve(ws, rel)
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
      } catch (e) {
        cb(e)
      }
    },
    filename: (_req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
})

function walk(root, rel, depth, acc) {
  if (depth > 4) return
  const full = path.join(root, rel)
  let entries
  try {
    entries = fs.readdirSync(full, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
  for (const e of entries) {
    if (e.name.startsWith('.git') || e.name === 'node_modules') continue
    const rp = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      const node = { name: e.name, path: rp, type: 'dir', children: [] }
      acc.push(node)
      walk(root, rp, depth + 1, node.children)
    } else {
      acc.push({ name: e.name, path: rp, type: 'file' })
    }
  }
}

router.get('/tree', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  const tree = []
  let relDir = req.query.path ? String(req.query.path) : '.'
  relDir = relDir.replace(/^\.\//, '')
  const targetFolder = relDir === '.' ? '' : relDir
  walk(ws, targetFolder, 0, tree)
  res.json({ root: ws, tree })
})

router.get('/file', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  try {
    if (!req.query.path) return res.status(400).json({ error: 'path required' })
    const rel = safeResolve(ws, String(req.query.path))
    const stat = fs.statSync(rel)
    if (stat.isDirectory()) return res.json({ path: String(req.query.path), directory: true })
    const content = fs.readFileSync(rel, 'utf8')
    res.json({ path: String(req.query.path), content })
  } catch (e) {
    res.status(404).json({ error: String(e.message || e) })
  }
})

router.put('/file', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  const { path: relPath, content } = req.body || {}
  if (!relPath || typeof content !== 'string') return res.status(400).json({ error: 'path + content required' })
  try {
    const rel = safeResolve(ws, String(relPath))
    fs.mkdirSync(path.dirname(rel), { recursive: true })
    fs.writeFileSync(rel, content, 'utf8')
    emitUser(req.user.email, { type: 'workspace_changed', path: relPath, action: 'write' })
    audit({ user: req.user.email, agent: 'editor', action: 'writeFile', input: relPath.slice(0, 120), status: 'success' })
    res.json({ ok: true, path: relPath })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

router.post('/mkdir', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  const { path: relPath } = req.body || {}
  if (!relPath) return res.status(400).json({ error: 'path required' })
  try {
    const rel = safeResolve(ws, String(relPath))
    fs.mkdirSync(rel, { recursive: true })
    emitUser(req.user.email, { type: 'workspace_changed', path: String(relPath), action: 'mkdir' })
    audit({ user: req.user.email, agent: 'files', action: 'mkdir', input: relPath.slice(0, 120), status: 'success' })
    res.json({ ok: true, path: String(relPath) })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

router.post('/touch', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  const { path: relPath } = req.body || {}
  if (!relPath) return res.status(400).json({ error: 'path required' })
  try {
    const rel = safeResolve(ws, String(relPath))
    fs.mkdirSync(path.dirname(rel), { recursive: true })
    fs.writeFileSync(rel, '', 'utf8')
    emitUser(req.user.email, { type: 'workspace_changed', path: String(relPath), action: 'touch' })
    audit({ user: req.user.email, agent: 'files', action: 'touch', input: relPath.slice(0, 120), status: 'success' })
    res.json({ ok: true, path: String(relPath) })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

router.delete('/file', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  if (!req.query.path) return res.status(400).json({ error: 'path required' })
  try {
    const rel = safeResolve(ws, String(req.query.path))
    if (path.resolve(rel) === path.resolve(ws)) return res.status(400).json({ error: 'cannot delete workspace root' })
    const stat = fs.statSync(rel)
    fs.rmSync(rel, { recursive: true, force: true })
    emitUser(req.user.email, { type: 'workspace_changed', path: String(req.query.path), action: 'delete' })
    audit({ user: req.user.email, agent: 'files', action: 'delete', input: String(req.query.path).slice(0, 120), status: 'success' })
    res.json({ ok: true, path: String(req.query.path), type: stat.isDirectory() ? 'dir' : 'file' })
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

/** تنزيل ملف واحد من مساحة العمل */
router.get('/download', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  if (!req.query.path) return res.status(400).json({ error: 'path required' })
  try {
    const rel = safeResolve(ws, String(req.query.path))
    const stat = fs.statSync(rel)
    if (stat.isDirectory()) return res.status(400).json({ error: 'path is a directory, use /zip' })
    audit({ user: req.user.email, agent: 'files', action: 'download', input: String(req.query.path).slice(0, 120), status: 'success' })
    res.download(rel, path.basename(rel))
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) })
  }
})

router.post('/run', requireAuth, (req, res) => {
  const { cwd, command } = req.body || {}
  if (!command) return res.status(400).json({ error: 'command required' })
  const ws = userWorkspace(req.user?.email)
  emitUser(req.user.email, { type: 'terminal_data', kind: 'cmd', data: `$ ${command}\n` })
  terminal(String(command), { workspace: ws, cwd: cwd || '.', onData: (kind, chunk) => emitUser(req.user.email, { type: 'terminal_data', kind, data: chunk }) })
    .then((r) => res.json(r))
    .catch((e) => res.status(500).json({ error: String(e) }))
})

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' })
  const rel = String(req.body.path || 'uploads/').replace(/^\/+/, `/${req.file.filename}`)
  emitUser(req.user.email, { type: 'workspace_changed', path: rel, action: 'write' })
  res.json({ ok: true, path: rel, name: req.file.filename, size: req.file.size, mime: req.file.mimetype })
})

/** تنزيل المشروع كملف ZIP (مسار اختياري: مجلد مشروع داخل مساحة العمل) */
router.get('/zip', requireAuth, (req, res) => {
  const ws = userWorkspace(req.user?.email)
  const rel = String(req.query.path || '').replace(/^\.?\//, '').replace(/\.\./g, '')
  const base = rel && rel !== '.' ? safeResolve(ws, rel) : ws
  let stat
  try {
    stat = fs.statSync(base)
    if (!stat.isDirectory()) return res.status(400).json({ error: 'path is not a directory' })
  } catch {
    return res.status(404).json({ error: 'directory not found' })
  }
  const name = rel && rel !== '.' ? rel.split('/').filter(Boolean).pop() : 'ghennai-project'
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`)
  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', (err) => { audit({ user: req.user.email, agent: 'workspace', action: 'zip', result: String(err), status: 'error' }); res.status(500).end() })
  archive.pipe(res)
  archive.glob('**/*', { cwd: base, ignore: ['node_modules/**', '.git/**'] })
  archive.finalize()
})

export default router