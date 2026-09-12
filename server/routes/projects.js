import express from 'express'
import { requireAuth } from './auth.js'
import { guessProjectRoot, projectsFor, ensureProject, listVersions, restoreVersion, touchProject } from '../lib/projects.js'
import { emitUser } from '../lib/events.js'
import { userWorkspace } from '../lib/paths.js'

const router = express.Router()

router.get('/', requireAuth, (req, res) => {
  const email = req.user?.email
  const items = projectsFor(email)
  const ws = userWorkspace(email)
  const out = Object.values(items)
    .map((p) => {
      let status = p.status || 'idle'
      try {
        if (status === 'live' && p.url && !/^https:\/\/[a-z0-9-]+\.github\.io/.test(p.url)) status = 'deployed'
      } catch {}
      return { ...p, status }
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  res.json({ projects: out })
})

router.get('/:id', requireAuth, (req, res) => {
  const email = req.user?.email
  const items = projectsFor(email)
  const p = items[req.params.id]
  if (!p) return res.status(404).json({ error: 'not found' })
  const versions = listVersions(email, p.root)
  res.json({ project: p, versions })
})

router.post('/rollback', requireAuth, (req, res) => {
  const email = req.user?.email
  const { id, version } = req.body || {}
  if (!id || typeof version !== 'number') return res.status(400).json({ error: 'id & version required' })
  try {
    const r = restoreVersion(email, projectsFor(email)[id]?.root || '', version)
    touchProject(email, id)
    emitUser(email, { type: 'project_restored', id, version: r.version })
    res.json({ ok: true, ...r })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) })
  }
})

router.post('/register', requireAuth, (req, res) => {
  const email = req.user?.email
  const { name, root } = req.body || {}
  const p = ensureProject(email, root || guessProjectRoot(userWorkspace(email), root), name)
  res.json({ project: p })
})

export default router