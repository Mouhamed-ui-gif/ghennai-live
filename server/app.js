import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import './lib/env.js'
import rateLimit from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/auth.js'
import chatRoutes from './routes/chat.js'
import workspaceRoutes from './routes/workspace.js'
import visionRoutes from './routes/vision.js'
import deployRoutes from './routes/deploy.js'
import brainRoutes from './routes/brain.js'
import voiceRoutes, { ttsAvailable, isSttAvailable } from './routes/voice.js'

const app = express()

app.set('trust proxy', 'loopback')

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(cors())
app.use(express.json({ limit: '60mb' }))

const apiLimiter = rateLimit({
  windowMs: 60000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, trustProxy: false },
})
app.use('/api', apiLimiter)

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.get('/api/voice-available', (req, res) => res.json({ tts: ttsAvailable() }))
app.get('/api/stt-available', async (req, res) => res.json({ stt: await isSttAvailable() }))
app.use('/api', authRoutes)
app.use('/api', chatRoutes)
app.use('/api/brain', brainRoutes)
app.use('/api/workspace', workspaceRoutes)
app.use('/api/vision', visionRoutes)
app.use('/api/voice', voiceRoutes)
app.use('/api/deploy', deployRoutes)

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use('/ghennai-app', express.static(distDir))
  app.get(/^(?!\/(api|uploads|assets|ghennai-app)).*/, (req, res) => res.sendFile(join(distDir, 'index.html')))
}

export default app