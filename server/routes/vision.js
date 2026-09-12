import express from 'express'
import '../lib/env.js'
import { requireAuth } from './auth.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'

const router = express.Router()
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream'

async function ollamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

router.post('/', requireAuth, async (req, res) => {
  const image = req.body?.image
  if (!image) return res.status(400).json({ error: 'image required' })

  const base64 = String(image).includes(',') ? String(image).split(',')[1] : String(image)
  const buildMode = req.body?.mode === 'build'
  const prompt = buildMode
    ? String(
        req.body?.prompt ||
          'Study this image as a web/UX designer and developer. Return a detailed, buildable specification in Arabic for a complete professional website: 1) Page name & purpose. 2) Sections IN ORDER with each section\'s goal. 3) Layout & structure (header/hero/cards/footer). 4) Exact color palette (hex values), including background gradient. 5) Typography style. 6) Visual motifs, shadows, rounded corners, glass effects. 7) Animations & micro-interactions. 8) Responsive behavior (mobile/tablet). Output as a compact structured list that a coding agent can convert directly into HTML/CSS/JS.'
      )
    : String(req.body?.prompt || 'Describe this image in full detail: what it shows, colors, layout, text content. If it is a website or UI screenshot, describe the structure like a web developer would.')

  emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `🖼️ تحليل الصورة محليًا (${VISION_MODEL})…`, status: 'running' })

  try {
    if (!(await ollamaStatus())) throw new Error('Ollama غير متاح — شغّل ollama serve أولاً')
    const t0 = Date.now()
    const resOllama = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: 'user', content: prompt, images: [base64] }],
        stream: false,
        options: { num_ctx: 4096, temperature: 0.2 },
        keep_alive: '20m',
      }),
      signal: AbortSignal.timeout(300000),
    })
    if (!resOllama.ok) {
      const txt = await resOllama.text()
      throw new Error(`Ollama ${resOllama.status}: ${txt.slice(0, 200)}`)
    }
    const json = await resOllama.json()
    const text = json?.message?.content || '—'
    audit({ user: req.user.email, agent: 'vision', action: buildMode ? 'analyze+spec' : 'analyze', result: text.slice(0, 300), status: 'success', duration: Date.now() - t0 })
    emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `✅ تحليل مكتمل (${((Date.now() - t0) / 1000).toFixed(1)}s)`, status: 'success' })
    res.json({ ok: true, content: text, mode: buildMode ? 'build' : 'describe', model: VISION_MODEL, ms: Date.now() - t0 })
  } catch (e) {
    audit({ user: req.user.email, agent: 'vision', action: 'analyze', result: String(e.message || e), status: 'error' })
    res.status(500).json({ error: String(e.message || e) })
  }
})

export default router