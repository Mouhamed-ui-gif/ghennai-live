import express from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth, verifyToken } from './auth.js'
import { handleRequest, status } from '../agents/core.js'
import { attachSSE, bindRequestStream, emitUser } from '../lib/events.js'
import { audit, getForUser } from '../lib/auditLog.js'
import { attachRun, detachRun, stopRun, isRunning } from '../lib/execution.js'

const router = express.Router()
const chatLimiter = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false })

router.get('/status', async (req, res) => {
  res.json(status())
})

router.get('/events', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = verifyToken(token)
    attachSSE(req, res)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

router.post('/chat', requireAuth, chatLimiter, async (req, res) => {
  const { message, agent, edit } = req.body
  if (!message) return res.status(400).json({ error: 'Message required' })
  const user = { email: req.user.email, name: req.user.name, history: req.history || [] }

  let unbind = () => {}
  const ac = new AbortController()
  // البناء الكامل (10 turns + فحص + إصلاح + موافقات) يتجاوز 8 دقائق مع النماذج المحلية —
  // المهلة 20 دقيقة افتراضيًا (قابلة للضبط عبر CHAT_MAX_MS) بدل القتل الصامت.
  const hardDeadline = setTimeout(() => ac.abort('deadline'), Number(process.env.CHAT_MAX_MS || 1200000))
  res.on('close', () => { if (!ac.signal.aborted) ac.abort('client-disconnect') })
  attachRun(user.email, ac, 'chat')
  emitUser(user.email, { type: 'agent_state', state: 'PLANNING' })

  const send = (payload) => {
    if (res.writableEnded) return
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    } catch { /* noop */ }
  }

  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    })
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`)

    // كل حدث يُبث للمستخدم (أدوات/طرفية/نشاط) يصل أيضًا لجلسة هذا الطلب
    unbind = bindRequestStream(user.email, send)

    for await (const event of handleRequest(user, message, agent, { edit: edit ? { ...edit } : null, signal: ac.signal })) {
      if (res.writableEnded || ac.signal.aborted) break
      send(event)
      if (event.type === 'answer') {
        send({ type: 'done', content: event.content })
        res.end()
        unbind()
        return
      }
    }
    clearTimeout(hardDeadline)
    if (!res.writableEnded) res.end()
  } catch (err) {
    // سبب الإجهاض الصريح بدل "This operation was aborted" الغامض
    const reason = ac.signal.reason || err?.cause?.reason || err?.reason || null
    const reasonAr =
      reason === 'deadline' ? ' ⏱️ انتهت مهلة التنفيذ (20 دقيقة) قبل اكتمال البناء — قسّم طلبك أو أعد المحاولة'
      : reason === 'client-disconnect' ? ' 🔌 انقطع اتصال المتصفح أثناء البناء (تحديث/إغلاق) — أعد فتح الصفحة وأعد المحاولة'
      : reason === 'user-stop' || reason === 'superseded' ? ' ⏹️ أُوقف التنفيذ'
      : ''
    audit({ user: user.email, agent: 'core', action: 'chat', result: String(err), status: 'error' })
    emitUser(user.email, { type: 'agent_state', state: 'FAILED', reason: String(err?.message || err).slice(0, 200) })
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) + reasonAr, reason: reason || undefined })}\n\n`)
      res.end()
    }
  } finally {
    clearTimeout(hardDeadline)
    unbind()
    // الإيقاف اليدوي حذف التشغيل مسبقًا وأرسل STOPPED — لا نتجاوزه هنا
    if (isRunning(user.email)) detachRun(user.email, ac.signal.aborted ? 'STOPPED' : 'READY')
    ac.abort()
  }
})

router.get('/audit', requireAuth, (req, res) => {
  res.json({ logs: getForUser(req.user.email, 100) })
})

/** إيقاف حقيقي للتنفيذ النشط: يُجهض حلقة الـAgent والعملية الفرعية */
router.post('/chat/stop', requireAuth, (req, res) => {
  const r = stopRun(req.user.email)
  if (!r.ok) return res.json({ ok: false, error: r.error, running: false })
  res.json({ ok: true, stopped: r.stopped })
})

router.get('/chat/running', requireAuth, (req, res) => {
  res.json({ running: isRunning(req.user.email) })
})

export default router