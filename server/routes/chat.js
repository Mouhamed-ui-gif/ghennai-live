import express from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth, verifyToken } from './auth.js'
import { handleRequest, status } from '../agents/core.js'
import { attachSSE, bindRequestStream } from '../lib/events.js'
import { audit, getForUser } from '../lib/auditLog.js'

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
  const hardDeadline = setTimeout(() => ac.abort(), Number(process.env.CHAT_MAX_MS || 480000))
  res.on('close', () => ac.abort())

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
    audit({ user: user.email, agent: 'core', action: 'chat', result: String(err), status: 'error' })
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`)
      res.end()
    }
  } finally {
    clearTimeout(hardDeadline)
    unbind()
    ac.abort()
  }
})

router.get('/audit', requireAuth, (req, res) => {
  res.json({ logs: getForUser(req.user.email, 100) })
})

export default router