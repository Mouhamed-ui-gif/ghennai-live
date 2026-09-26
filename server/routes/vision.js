import express from 'express'
import '../lib/env.js'
import { requireAuth } from './auth.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'
import { Memory } from '../lib/db.js'
import { generate } from '../lib/modelRouter.js'
import { appendMsg, createSession, currentSessionId } from '../lib/sessions.js'

const router = express.Router()
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream'
const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

async function ollamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

async function ollamaHasModel(name) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    const j = await res.json()
    const names = (j.models || []).map((m) => m.name || m.model || '')
    return names.some((n) => n === name || String(n).startsWith(`${name}:`))
  } catch {
    return false
  }
}

/** تحليل الصورة عبر Gemini Vision (احتياط سحابي — المفتاح لا يُسجَّل أبدًا) */
async function geminiVision(base64, mime, prompt) {
  if (!GEMINI_KEY) throw new Error('no GEMINI_API_KEY configured')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(120000),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Gemini vision ${res.status}: ${txt.slice(0, 160)}`)
  let j = null
  try { j = JSON.parse(txt) } catch { throw new Error('Gemini vision: bad JSON') }
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (!text.trim()) throw new Error('Gemini vision: empty response')
  return text
}

/** تحليل محلي عبر moondream — سياق مضغوط ومهلة أقصر للسرعة */
async function ollamaVision(base64, prompt) {
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
    signal: AbortSignal.timeout(120000),
  })
  if (!resOllama.ok) {
    const txt = await resOllama.text()
    throw new Error(`Ollama ${resOllama.status}: ${txt.slice(0, 200)}`)
  }
  const json = await resOllama.json()
  const text = json?.message?.content || ''
  if (!text.trim()) throw new Error('Ollama: empty vision response')
  return text
}

router.post('/', requireAuth, async (req, res) => {
  const image = req.body?.image
  if (!image) return res.status(400).json({ error: 'image required' })

  const raw = String(image)
  const mimeMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const base64 = raw.includes(',') ? raw.split(',')[1] : raw
  const buildMode = req.body?.mode === 'build'
  const AR = '\n\nأجب باللغة العربية حصرًا، بأسلوب واضح ومنظم.'
  const prompt = buildMode
    ? String(
        req.body?.prompt ||
          'ادرس هذه الصورة كمصمم ومطور ويب، وأعد مواصفة بناء كاملة واحترافية لموقع: 1) اسم الصفحة وهدفها. 2) الأقسام بالترتيب مع هدف كل قسم. 3) الهيكل (ترويسة/بطل/بطاقات/تذييل). 4) لوحة الألوان الدقيقة (قيم hex) بما فيها خلفية متدرجة. 5) أسلوب الخطوط. 6) الزخارف والظلال والزوايا الدائرية والتأثيرات الزجاجية. 7) الحركات والتفاعلات. 8) السلوك المتجاوب (جوال/تابلت). أخرجها قائمة منظمة ومضغوطة يمكن لوكيل البرمجة تحويلها مباشرة إلى HTML/CSS/JS.'
      ) + AR
    : String(req.body?.prompt || 'صِف هذه الصورة بالتفصيل الكامل: ماذا تُظهر، الألوان، التخطيط، النصوص. إن كانت لقطة موقع أو واجهة فاشرح بنيتها كأنك مطور ويب.') + AR

  emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `🖼️ تحليل الصورة…`, status: 'running' })

  // السحابة أولًا (أسرع بأضعاف) — المحلي احتياطًا. لا نجاح مُدّعى: الفشل يُرجع السبب الحقيقي.
  const wantCloud = !!GEMINI_KEY
  const useLocal = !wantCloud && (await ollamaStatus()) && (await ollamaHasModel(VISION_MODEL))
  if (wantCloud) {
    emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `⚡ تحليل سريع عبر السحابة…`, status: 'running' })
  } else if (!useLocal) {
    emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `ℹ️ النموذج المحلي غير متوفر — التحليل عبر السحابة…`, status: 'running' })
  }
  try {
    const t0 = Date.now()
    let text = ''
    let via = ''
    if (wantCloud) {
      try {
        text = await geminiVision(base64, mime, prompt)
        via = `gemini/${GEMINI_MODEL}`
      } catch (cloudErr) {
        // السحابة فشلت → المحلي احتياطًا (إن وُجد)، وإلا نفشل بصدق
        if ((await ollamaStatus()) && (await ollamaHasModel(VISION_MODEL))) {
          emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `⚠️ السحابة تعذّرت — أُكمل محليًا…`, status: 'running' })
          text = await ollamaVision(base64, prompt)
          via = `ollama/${VISION_MODEL}`
        } else {
          throw cloudErr
        }
      }
      audit({ user: req.user.email, agent: 'vision', action: buildMode ? 'analyze+spec' : 'analyze', result: text.slice(0, 300), status: 'success', duration: Date.now() - t0 })
    } else if (useLocal) {
      if (!(await ollamaStatus())) throw new Error('Ollama غير متاح — شغّل ollama serve أولاً')
      text = await ollamaVision(base64, prompt)
      via = `ollama/${VISION_MODEL}`
      // moondream الصغير يتجاهل تعليمة اللغة غالبًا → ترجمة سريعة للعربية
      const latinCount = (text.match(/[a-zA-Z]/g) || []).length
      const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length
      if (latinCount > 30 && latinCount > arabicCount * 3) {
        try {
          const tr = await generate({
            provider: 'ollama',
            system: 'ترجم النص التالي إلى اللغة العربية الفصحى الواضحة حصرًا. لا تضف شيئًا من عندك، فقط الترجمة.',
            prompt: text.slice(0, 1500),
          })
          const ar = String(tr?.content || '').trim()
          if (ar.length > 10) { text = ar; via += '+ar' }
        } catch { /* نُبقي الإنجليزية بدل الفشل */ }
      }
      audit({ user: req.user.email, agent: 'vision', action: buildMode ? 'analyze+spec' : 'analyze', result: text.slice(0, 300), status: 'success', duration: Date.now() - t0 })
    } else {
      throw new Error('لا يوجد محلل صور متاح — أضف GEMINI_API_KEY أو شغّل moondream محليًا')
    }
    // ── حفظ التحليل في ذاكرة المستخدم + الجلسة: أي وكيل لاحق يتذكره ──
    try {
      Memory.put({ scope: 'vision', user_email: req.user.email, key: `v${Date.now().toString(36)}`, value: { desc: text.slice(0, 2500), mode: buildMode ? 'build' : 'describe', ts: Date.now() } })
      let sid = null
      try { sid = currentSessionId(req.user.email) } catch { /* noop */ }
      if (!sid) { try { sid = createSession(req.user.email, 'محادثة') } catch { /* noop */ } }
      if (sid) appendMsg(req.user.email, sid, 'assistant', `🖼️ تحليل الصورة المرفوعة:\n${text.slice(0, 3500)}`, 'Vision')
    } catch { /* الحفظ اختياري — لا يفشل الطلب */ }
    emitUser(req.user.email, { type: 'agent_event', agent: 'Vision', message: `✅ تحليل مكتمل`, status: 'success' })
    res.json({ ok: true, content: text, mode: buildMode ? 'build' : 'describe', model: via, ms: Date.now() - t0 })
  } catch (e) {
    audit({ user: req.user.email, agent: 'vision', action: 'analyze', result: String(e.message || e), status: 'error' })
    res.status(500).json({ error: String(e.message || e) })
  }
})

export default router