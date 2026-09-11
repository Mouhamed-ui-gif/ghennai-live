import express from 'express'
import { requireAuth } from './auth.js'
import { getPrefs, setPref, availableModels } from '../lib/brainPrefs.js'
import { brainStatus } from '../agents/brain.js'
import { listSessions, getSession, currentSessionId } from '../lib/sessions.js'
import { snapshotForExport } from '../agents/brain.js'
import { lastRequest } from '../lib/agentMemory.js'

const router = express.Router()

router.get('/state', requireAuth, (req, res) => {
  res.json(brainStatus(req.user.email))
})

router.get('/prefs', requireAuth, (req, res) => {
  res.json(getPrefs(req.user.email))
})

router.post('/prefs', requireAuth, (req, res) => {
  const { key, value } = req.body || {}
  if (!key) return res.status(400).json({ error: 'key required' })
  const allowed = ['collab', 'supervisor', 'autoGrade', 'speed', 'paused', 'interval', 'models', 'team', 'solo', 'speechOut', 'pipeline']
  if (!allowed.includes(key)) return res.status(400).json({ error: 'invalid key' })
  const prefs = setPref(req.user.email, key, value)
  res.json(prefs)
})

router.post('/pause', requireAuth, (req, res) => {
  res.json(setPref(req.user.email, 'paused', true))
})

router.post('/resume', requireAuth, (req, res) => {
  res.json(setPref(req.user.email, 'paused', false))
})

/** وضع التكرار: إعادة تشغيل آخر طلب بشكل دوري (يقودها العميل بفاصل زمني) */
router.post('/cycle', requireAuth, async (req, res) => {
  const prefs = getPrefs(req.user.email)
  if (prefs.paused) return res.json({ ok: false, error: 'paused' })
  const last = lastRequest(req.user.email)
  if (!last) return res.json({ ok: false, error: 'no last request' })
  const { emitUser } = await import('../lib/events.js')
  const { handleRequest } = await import('../agents/core.js')
  emitUser(req.user.email, { type: 'brain_cycle', started: true, message: 'دورة تلقائية…' })
  const user = { email: req.user.email, name: req.user.name }
  ;(async () => {
    try {
      const run = handleRequest(user, last.message, last.agent)
      for (let n = run.next(); !n.done; n = run.next()) {
        const ev = n.value
        if (ev.type === 'answer') emitUser(user.email, { type: 'brain_cycle_done', message: 'اكتملت الدورة' })
      }
    } catch (e) {
      emitUser(user.email, { type: 'brain_cycle_done', message: `فشلت الدورة: ${String(e.message || e).slice(0, 120)}` })
    }
  })()
  res.json({ ok: true, started: true })
})

router.get('/models', requireAuth, async (req, res) => {
  res.json({ models: await availableModels() })
})

router.get('/sessions', requireAuth, (req, res) => {
  res.json({ sessions: listSessions(req.user.email) })
})

router.get('/sessions/current', requireAuth, (req, res) => {
  const id = req.query.id || currentSessionId(req.user.email)
  res.json({ id, messages: id ? getSession(req.user.email, id) : [] })
})

router.get('/export', requireAuth, (req, res) => {
  const id = req.query.session || currentSessionId(req.user.email)
  const text = snapshotForExport(req.user.email, id)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="ghennai-session.txt"')
  res.send(text)
})

export default router