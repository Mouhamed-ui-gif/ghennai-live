import express from 'express'
import { requireAuth } from './auth.js'
import { publishSite, ghAvailable } from '../lib/publisher.js'
import { User } from '../lib/db.js'
import { audit } from '../lib/auditLog.js'

const router = express.Router()

router.get('/status', requireAuth, async (req, res) => {
  const email = req.user?.email
  const gh = await ghAvailable()
  const token = User.getSetting(email, 'github_token') || process.env.GITHUB_TOKEN || ''
  res.json({ hasToken: !!token, ghAvailable: gh })
})

router.post('/token', requireAuth, (req, res) => {
  const token = req.body?.token
  if (!token) return res.status(400).json({ error: 'token required' })
  User.setSetting(req.user.email, 'github_token', String(token).trim())
  res.json({ ok: true })
})

router.post('/', requireAuth, async (req, res) => {
  const email = req.user?.email
  const name = req.user?.name || email?.split('@')[0] || 'user'
  const site = String(req.body?.project || req.body?.site || '.')
  try {
    const r = await publishSite({ email, name, folder: site, allowCli: true })
    if (!r.ok) {
      audit({ user: email, agent: 'deploy', action: 'deploy', result: r.error, status: 'error' })
      return res.status(200).json({ ok: false, error: r.error, url: null, repo: null, repoUrl: null, project: null })
    }
    return res.json({ ok: true, url: r.url, repo: r.repo, repoUrl: r.repoUrl, project: r.project })
  } catch (e) {
    const msg = String(e.message || e)
    audit({ user: email, agent: 'deploy', action: 'deploy', result: msg, status: 'error' })
    return res.status(500).json({ ok: false, error: msg, url: null })
  }
})

export default router