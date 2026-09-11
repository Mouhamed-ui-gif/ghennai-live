import { createServer } from 'node:http'
import app from './app.js'
import dotenv from 'dotenv'
import { warmup } from './lib/warmup.js'
import { bindSocket } from './lib/socketBridge.js'
import { ensureWhisperServer } from './routes/voice.js'

dotenv.config()
const PORT = process.env.PORT || 3001

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  if (!/abort|AbortError/i.test(msg)) console.error('[unhandledRejection]', msg)
})

process.on('uncaughtException', (err) => {
  if (!/abort|AbortError/i.test(String(err?.message || err))) console.error('[uncaughtException]', err?.message || err)
})

const server = createServer(app)
bindSocket(server)

server.listen(PORT, async () => {
  console.log(`GHENNAI server running on http://localhost:${PORT}`)
  console.log(`Chat endpoint: POST /api/chat`)
  console.log(`SSE events:   GET /api/events`)
  console.log(`Live socket:  socket.io (conversation channel)`)
  ensureWhisperServer().then((ok) => console.log(`Whisper STT: ${ok ? 'running ✓ (local, all browsers)' : 'starting in background…'}`))
  warmup()
})