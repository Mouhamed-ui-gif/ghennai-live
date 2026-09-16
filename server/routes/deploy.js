import express from 'express'
import path from 'path'
import { requireAuth } from './auth.js'
import { publishSite, ghAvailable } from '../lib/publisher.js'
import { ensureShare } from '../lib/share.js'
import { User } from '../lib/db.js'
import { audit } from '../lib/auditLog.js'
import { emitUser } from '../lib/events.js'
import { userWorkspace } from '../lib/paths.js'

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

/** إيجاد مجلد الموقع الفعلي صراحةً: '.' = الجذر أو مجلد مشروع */
function resolveSiteRoot(email, project) {
  const req = String(project || '')
  const ws = userWorkspace(email)
  if (req && req !== '.' && req !== '~') {
    const clean = String(req).replace(/^~\/?/, '').replace(/^\/+/, '')
    if (!clean || clean === '.') return ''
    if (clean.includes('..')) return null
    const abs = path.resolve(ws, clean)
    if (abs.startsWith(ws + path.sep)) return clean.replace(/\/+$/, '')
    return null
  }
  return ''
}

/** الرابط الفوري: يعيد رابط /live فورًا (ثوانٍ) دون أي إعداد خارجي */
router.post('/', requireAuth, async (req, res) => {
  const email = req.user?.email
  const name = req.user?.name || email?.split('@')[0] || 'user'
  const site = String(req.body?.project || req.body?.site || '.')
  const provider = String(req.body?.provider || 'instant')

  // ── الدفع عبر GitHub: خيار «رابط دائم» منفصل ──
  if (provider === 'github') {
    try {
      const r = await publishSite({ email, name, folder: site, allowCli: true })
      if (!r.ok) {
        audit({ user: email, agent: 'deploy', action: 'deploy', result: r.error, status: 'error' })
        return res.status(200).json({ ok: false, error: r.error, url: null, repo: null, repoUrl: null, project: null })
      }
      return res.json({ ok: true, url: r.url, repo: r.repo, repoUrl: r.repoUrl, project: r.project, provider: 'github' })
    } catch (e) {
      const msg = String(e.message || e)
      audit({ user: email, agent: 'deploy', action: 'deploy', result: msg, status: 'error' })
      return res.status(500).json({ ok: false, error: msg, url: null })
    }
  }

  // ── الرابط الفوري من خادمنا ──
  try {
    const root = resolveSiteRoot(email, site)
    if (root === null) return res.status(400).json({ ok: false, error: 'مسار موقع غير صالح' })
    const { url: rel } = ensureShare(email, root, site !== '.' ? path.basename(site.replace(/[/\\]+$/, '')) : 'الموقع الرئيسي')
    const abs = `${req.protocol}://${req.get('host')}${rel}`
    emitUser(email, { type: 'deploy_progress', stage: 'init', message: 'الرابط الفوري جاهز — قابل للمشاركة فورًا ✓' })
    emitUser(email, { type: 'deploy_verified', url: abs })
    emitUser(email, { type: 'deploy_done', url: abs })
    audit({ user: email, agent: 'deploy', action: 'share', result: abs, status: 'success' })
    return res.json({ ok: true, url: abs, path: rel, provider: 'instant', project: null })
  } catch (e) {
    const msg = String(e.message || e)
    audit({ user: email, agent: 'deploy', action: 'share', result: msg, status: 'error' })
    return res.status(500).json({ ok: false, error: msg, url: null })
  }
})

export default router