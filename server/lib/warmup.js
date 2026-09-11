import { OLLAMA_URL } from './modelRouter.js'

let warming = false
let warmed = false

async function pingLocal(model) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
      think: false,
      keep_alive: '30m',
      options: { num_ctx: 2048 },
    }),
  })
  if (!res.ok) throw new Error(`warmup ${model} HTTP ${res.status}`)
  return res.json()
}

/** تسخين النموذج المحلي حصريًا (بدون النظر إلى السحابة) حتى يبقى جاهزًا للاحتياط بسرعة */
async function warmup() {
  if (warming || warmed) return
  warming = true
  const t0 = Date.now()
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
  console.log(`[warmup] تحميل النموذج المحلي مسبقًا (${model})...`)
  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await pingLocal(model)
      warmed = true
      console.log(`[warmup] النموذج جاهز خلال ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      break
    } catch (err) {
      lastErr = err
      console.warn(`[warmup] محاولة ${attempt}/3 فشلت: ${err.message}`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  if (!warmed) console.warn('[warmup] فشل التسخين:', lastErr?.message)
  warming = false
}

export { warmup, warmed }