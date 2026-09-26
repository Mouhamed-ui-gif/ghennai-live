import express from 'express'
import { requireAuth } from './auth.js'
import { Approval, Log } from '../lib/db.js'
import { emitUser } from '../lib/events.js'
import { getPrefs, setPref } from '../lib/brainPrefs.js'

const router = express.Router()

/** قائمة الموافقات المعلّقة للمستخدم */
router.get('/pending', requireAuth, (req, res) => {
  try {
    const rows = Approval.pendingFor(req.user.email)
    res.json({ pending: rows })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

/** قرار المستخدم: approve / deny — هو ما يُحرر حلقة الـAgent فعليًا */
router.post('/:id/decision', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const decision = String(req.body?.decision || '').toLowerCase()
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })
  if (!['approved', 'rejected', 'approve', 'deny', 'deny'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved|rejected' })
  }
  const norm = decision.startsWith('approv') ? 'approved' : 'rejected'
  try {
    const row = Approval.byId(id)
    if (!row) return res.status(404).json({ error: 'approval not found' })
    if (row.user_email !== req.user.email) return res.status(403).json({ error: 'forbidden' })
    if (row.status !== 'pending') return res.json({ ok: true, id, decision: row.status, already: true })
    Approval.decide(id, norm)
    try {
      Log.record({ channel: 'agent', task_id: row.task_id, user_email: req.user.email, agent: 'user', tool: row.tool, action: 'approval_decision', result: norm, status: norm })
    } catch { /* noop */ }
    emitUser(req.user.email, { type: 'approval_resolved', id, decision: norm })
    res.json({ ok: true, id, decision: norm })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

/** وضع الـAgent: safe | assisted | autonomous */
router.get('/mode', requireAuth, (req, res) => {
  const m = getPrefs(req.user.email)?.agentMode || 'assisted'
  res.json({ mode: ['safe', 'assisted', 'autonomous'].includes(m) ? m : 'assisted' })
})

router.post('/mode', requireAuth, (req, res) => {
  const mode = String(req.body?.mode || '')
  if (!['safe', 'assisted', 'autonomous'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be safe|assisted|autonomous' })
  }
  setPref(req.user.email, 'agentMode', mode)
  res.json({ ok: true, mode })
})

export default router
