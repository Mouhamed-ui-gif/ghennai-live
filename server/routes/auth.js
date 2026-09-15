import express from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { RevokedToken } from '../lib/db.js'

const router = express.Router()

function secret() {
  const s = process.env.JWT_SECRET
  if (!s || s === 'dev-secret' || s === 'ghennai-super-secret') {
    if (process.env.NODE_ENV === 'production') {
      console.error('⚠️  JWT_SECRET غير مُعدّل — التوكنات غير آمنة في الإنتاج!')
    } else {
      console.warn('⚠️  JWT_SECRET افتراضي — استخدم قيمة عشوائية في الإنتاج')
    }
  }
  return s || 'dev-secret'
}

export function signToken(user) {
  return jwt.sign({ email: user.email, name: user.name, jti: randomUUID() }, secret(), { expiresIn: '7d' })
}

export function verifyToken(token) {
  const payload = jwt.verify(token, secret())
  if (payload.jti && RevokedToken.isRevoked(payload.jti)) {
    throw new Error('Token revoked')
  }
  return payload
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export { secret }

const GOOGLE_VERIFY = 'https://oauth2.googleapis.com/tokeninfo'

router.post('/google', async (req, res) => {
  const idToken = req.body?.idToken
  const clientId = req.body?.clientId || ''
  if (!idToken) return res.status(400).json({ error: 'idToken required' })

  try {
    const checks = [`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`]
    if (clientId) checks.push(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}&audience=${encodeURIComponent(clientId)}`)
    let info = null
    for (const url of checks) {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (r.ok) {
        info = await r.json()
        break
      }
    }
    if (!info || !info.email || info.aud !== clientId) {
      return res.status(401).json({ error: 'تعذر التحقق من هوية Google' })
    }
    const email = String(info.email).toLowerCase()
    const name = String(info.name || info.given_name || email.split('@')[0])
    const { User } = await import('../lib/db.js')
    let user = await User.findByEmail(email)
    if (!user) {
      const secretPwd = 'google-' + Math.random().toString(36).slice(2, 14) + '!X'
      user = await User.create({ email, name, password: secretPwd })
    }
    const token = signToken(user)
    res.json({ token, user: { email: user.email, name: user.name } })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' })
  if (!String(email).includes('@')) return res.status(400).json({ error: 'Invalid email' })
  if (String(password).length < 6) return res.status(400).json({ error: 'Password too short' })

  const { User } = await import('../lib/db.js')
  const existing = await User.findByEmail(email)
  if (existing) return res.status(409).json({ error: 'Email already exists' })

  const user = await User.create({ email, name: name || email.split('@')[0], password })
  const token = signToken(user)
  res.json({ token, user: { email: user.email, name: user.name } })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  const { User } = await import('../lib/db.js')
  const user = await User.findByEmail(email)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const ok = await User.verify(password, user.password)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
  const token = signToken(user)
  res.json({ token, user: { email: user.email, name: user.name } })
})

router.post('/logout', requireAuth, (req, res) => {
  const jti = req.user?.jti
  if (jti) RevokedToken.revoke(jti)
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req, res) => {
  const { User } = await import('../lib/db.js')
  const user = await User.findByEmail(req.user.email)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: { email: user.email, name: user.name } })
})

export default router
