import dotenv from 'dotenv'
dotenv.config()

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
const OLLAMA_FALLBACK = process.env.OLLAMA_FALLBACK_MODEL || 'gemma3:4b'
const CLOUD_TIMEOUT_MS = Number(process.env.CLOUD_TIMEOUT_MS || 40000)
/** مهلة "حقّ البداية" للمزوّد الأول حتى يُرسل أول حرف قبل الانتقال للتالي */
const CLOUD_HEADSTART_MS = Number(process.env.CLOUD_HEADSTART_MS || 15000)
/** ترتيب أولوية الجودة: النموذج الأقوى أولًا، والباقي احتياط فوري */
const PROVIDER_PRIORITY = (process.env.PROVIDER_PRIORITY || 'gemini,groq,openrouter,openai,anthropic').split(',').map((s) => s.trim())

/** تعقّب "كلفة الحالة": عندما يعيد أي مزوّد 429 (حدّ الاستخدام/الحصّة)، نجمّده مؤقتًا بدل ضربه بلا فائدة */
const blocked = new Map()
const markBlocked = (name, ms = 25000) => blocked.set(name, Date.now() + ms)
const isBlocked = (name) => (blocked.get(name) || 0) > Date.now()
function markBlockedOnQuota(name, res) {
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(res?.error || res?.text || ''))) markBlocked(name)
}

/** كل موفّر سحابي بمفتاحه ونموذجه؛ وOpenAI-format تُدعم الأدوات function/tool_calls */
const PROVIDERS = {
  gemini: { key: process.env.GEMINI_API_KEY || '', model: process.env.GEMINI_MODEL || 'gemini-2.0-flash', tools: false },
  openai: { key: process.env.OPENAI_API_KEY || '', base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', tools: true },
  groq: { key: process.env.GROQ_API_KEY || '', base: 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', tools: true },
  openrouter: { key: process.env.OPENROUTER_API_KEY || '', base: 'https://openrouter.ai/api/v1', model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct', tools: true },
  anthropic: { key: process.env.ANTHROPIC_API_KEY || '', model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', tools: false },
}

async function fetchJson(url, options, timeoutMs = 15000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { ok: res.ok, status: res.status, json, text }
  } catch (err) {
    return { ok: false, status: 0, error: err }
  } finally {
    clearTimeout(t)
  }
}

async function ollamaIsAvailable() {
  const res = await fetchJson(`${OLLAMA_URL}/api/tags`, { method: 'GET' }, 4000)
  return res.ok
}

/** قائمة بترتيب أولوية المزوّدات عند استدعاء الأدوات (موثوقية استدعاء الأدوات قبل السرعة) */
const TOOL_PRIORITY = (process.env.TOOL_PRIORITY || 'openrouter,groq,openai').split(',').map((s) => s.trim())

/** قائمة المزوّدات السحابية المرتبطة (مفاتيح صالحة) واستبعد المتجمّد مؤقتًا بسبب 429 */
function cloudProviders(withToolsOnly = false) {
  return Object.entries(PROVIDERS).filter(
    ([name, p]) => p.key && !isBlocked(name) && (!withToolsOnly || p.tools)
  )
}

/** المزوّدات السحابية بترتيب أولوية الجودة (مفيدة لأول موفّر على القائمة تُجرب أولًا) */
function priorityProviders(withToolsOnly = false) {
  const ready = cloudProviders(withToolsOnly)
  const order = withToolsOnly ? TOOL_PRIORITY : PROVIDER_PRIORITY
  const byPriority = order.map((n) => ready.find(([name]) => name === n)).filter(Boolean)
  const rest = ready.filter(([name]) => !order.includes(name))
  return [...byPriority, ...rest]
}

/** أول موفّر سحابي جاهز للبث */
function firstStreamProvider() {
  return cloudProviders()[0]?.[0] || null
}

function chooseModel() {
  return new Promise(async (resolve) => {
    if (await ollamaIsAvailable()) return resolve('ollama')
    if (cloudProviders().length) return resolve('cloud')
    resolve(null)
  })
}

/** تحويل رسائل المغذّية إلى صيغة OpenAI/Chat الموحدة */
function normalizeMessages(options) {
  const messages = [...(options.messages || [])]
  if (options.system) messages.unshift({ role: 'system', content: options.system })
  if (options.prompt) messages.push({ role: 'user', content: options.prompt })
  return messages.filter((m) => m.content !== undefined)
}

function openAIPayload(provider, options, messages, stream = false) {
  const payload = {
    model: provider.model,
    messages: messages.map((m) => ({
      role: m.role === 'tool' ? 'tool' : m.role,
      content:
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      ...(m.role === 'tool' ? { tool_call_id: m.tool_call_id, name: m.name } : {}),
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    })),
    temperature: options.temperature ?? 0.7,
    stream,
  }
  if (options.tools && provider.tools) payload.tools = options.tools
  return payload
}

async function cloudChat(provider, options, messages) {
  const headers = { 'Content-Type': 'application/json' }
  if (provider.name === 'gemini') return cloudGemini(provider, options, messages, headers)
  if (provider.name === 'anthropic') return cloudAnthropic(provider, options, messages, headers)
  headers.Authorization = `Bearer ${provider.key}`
  if (provider.name === 'openrouter') headers['HTTP-Referer'] = 'http://localhost:3001'
  const res = await fetchJson(
    `${provider.base}/chat/completions`,
    { method: 'POST', headers, body: JSON.stringify(openAIPayload(provider, options, messages)) },
    CLOUD_TIMEOUT_MS
  )
  if (!res.ok || !res.json?.choices?.[0]) return { ok: false, error: `cloud ${provider.name} ${res.status}: ${(res.text || '').slice(0, 200)}` }
  const c = res.json.choices[0]
  const content = c.message?.content || ''
  const toolCalls = c.message?.tool_calls || null
  return { ok: true, provider: provider.name, model: provider.model, content: typeof content === 'string' ? content : JSON.stringify(content), toolCalls }
}

async function cloudGemini(provider, options, messages, headers) {
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : m.role === 'tool' ? 'user' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }] }))
  const system = messages.find((m) => m.role === 'system')?.content
  const body = { contents, ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}) }
  const res = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.key}`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    CLOUD_TIMEOUT_MS
  )
  const text = res.json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || ''
  if (!res.ok && !text) {
    if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(res.text || '')) markBlocked('gemini')
    return { ok: false, error: `gemini ${res.status}: ${(res.text || '').slice(0, 200)}` }
  }
  return { ok: true, provider: 'gemini', model: provider.model, content: text, toolCalls: null }
}

async function cloudAnthropic(provider, options, messages, headers) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n')
  let conv = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
  }))
  const merged = []
  for (const m of conv) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) last.content += '\n\n' + m.content
    else merged.push(m)
  }
  if (!merged.length) merged.push({ role: 'user', content: '' })
  const body = { model: provider.model, max_tokens: options.max_tokens ?? 2048, ...(sys ? { system: sys } : {}), messages: merged }
  const res = await fetchJson(
    'https://api.anthropic.com/v1/messages',
    { method: 'POST', headers: { ...headers, 'x-api-key': provider.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) },
    CLOUD_TIMEOUT_MS
  )
  const text = res.json?.content?.map((c) => c.text).filter(Boolean).join('') || ''
  if (!res.ok && !text) return { ok: false, error: `anthropic ${res.status}: ${(res.text || '').slice(0, 200)}` }
  return { ok: true, provider: 'anthropic', model: provider.model, content: text, toolCalls: null }
}

/** يتحقق أن النتيجة "مرضية" (نص غير فارغ أو استدعاء أدوات) */
function usable(r, options) {
  if (!r?.ok) return false
  const hasText = typeof r.content === 'string' && r.content.trim().length > 0
  const hasTools = Array.isArray(r.toolCalls) && r.toolCalls.length > 0
  return hasText || hasTools
}

/**
 * توليد عبر أولوية الجودة: نجرب المزوّد الأقوى أولًا، فإن فشل/حُجب ننتقل لاحتياط التالي فورًا.
 * لا سباق بين المزوّدات — لا داعي أن يسبق النموذج الصغير الكبير.
 */
async function raceCloud(options, messages) {
  const withTools = !!(options.tools?.length)
  const cands = priorityProviders(withTools)
  if (!cands.length) return null
  let lastErr = null
  for (const [name, p] of cands) {
    let r
    try {
      r = await cloudChat({ name, ...p }, options, messages)
    } catch (e) {
      r = { ok: false, error: String(e) }
    }
    if (usable(r, options)) return r
    lastErr = r?.error || 'no usable content'
    markBlockedOnQuota(name, r)
  }
  return { ok: false, error: lastErr }
}

async function generateOllama(options) {
  const { messages = [], prompt, tools, model, raw = false, keepAlive = '30m', think = true, numCtx = 32768 } = options
  const chat = []
  if (options.system) chat.push({ role: 'system', content: options.system })
  for (const m of messages) {
    if (m.role === 'system') continue
    chat.push({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') })
  }
  if (prompt) chat.push({ role: 'user', content: prompt })

  const payload = {
    model: model || OLLAMA_MODEL,
    messages: chat,
    stream: false,
    keep_alive: keepAlive,
    think: think === false ? false : true,
    options: { num_ctx: numCtx },
  }
  if (tools && tools.length) payload.tools = tools
  if (raw) {
    payload.raw = true
    payload.format = 'json'
  }

  const tryChat = async () => {
    const r = await fetchJson(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok && /does not support thinking/i.test(String(r.text || ''))) {
      payload.think = false
      return fetchJson(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    return r
  }

  let res = await tryChat()

  if (!res.ok && res.status !== 0) {
    payload.model = payload.model === OLLAMA_MODEL ? OLLAMA_FALLBACK : OLLAMA_MODEL
    if (payload.model === OLLAMA_MODEL && payload.model === OLLAMA_FALLBACK) throw new Error(`Ollama failed: ${JSON.stringify(res)}`)
    res = await tryChat()
  }
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${JSON.stringify(res)}`)

  const message = res.json?.message
  if (!message) throw new Error('Ollama: no assistant message in response')
  return { content: message.content, provider: 'ollama', model: payload.model, toolCalls: message.tool_calls || null }
}

/**
 * توليد استجابة عبر أسرع موفّر متاح (سحابة بالتوازي أو Ollama محلي).
 * options: { system, messages, prompt, tools, model, raw, keepAlive, think, numCtx, provider }
 * options.provider = 'ollama' تمنع السحابة (بدون تعارض مع الأسئلة العامة البسيطة).
 */
async function generate(options = {}) {
  const local = await ollamaIsAvailable()

  if (options.provider === 'ollama' || !cloudProviders().length || !local) {
    if (local) return generateOllama(options)
    const raced = await raceCloud(options, normalizeMessages(options))
    if (raced?.ok) return raced
    throw new Error('لا يوجد مولد نشط. شغّل Ollama (ollama serve) أو ضع مفتاحًا (GEMINI/OPENAI/GROQ/OPENROUTER/ANTHROPIC_API_KEY) في server/.env')
  }

  const messages = normalizeMessages(options)
  const raced = await raceCloud(options, messages)
  if (raced?.ok) return raced
  if (local) return generateOllama(options)
  throw new Error(`Cloud inference failed: ${raced?.error || 'unknown'}`)
}

/** تنبيه: البث بأسطر ndjson */
async function streamNdjson(url, options, body, handle, externalSignal) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS * 2)
  const signal = externalSignal || controller.signal
  const res = await fetch(url, { ...options, signal })
  if (!res.ok || !res.body) {
    clearTimeout(t)
    const txt = await res.text().catch(() => '')
    throw new Error(`stream http ${res.status}: ${txt.slice(0, 160)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    let chunk
    try {
      chunk = await reader.read()
    } catch {
      break // أُلغِي أثناء السباق — نوقف القراءة بهدوء
    }
    if (chunk.done) break
    buf += decoder.decode(chunk.value, { stream: true })
    let nl = buf.indexOf('\n')
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) handle(line)
      nl = buf.indexOf('\n')
    }
  }
  clearTimeout(t)
  return res.status
}

/**
 * بث حروف ردّ (chat): أولوية الجودة المتسلسلة — نجرّب أقوى المزوّدات أولًا،
 * لكلٍّ مهلة "حق بداية" حتى يُرسل أول حرف؛ فإن لم يفعل ننتقل للاحتياط التالي فورًا.
 * إن فشل الجميع نعود إلى Ollama المحلي.
 * onToken: يستقبل النص التزايدي. onDone(result): عند الانتهاء.
 */
async function streamChat(options, onToken, onDone) {
  const withTools = !!(options.tools?.length)
  const messages = normalizeMessages(options)
  const local = await ollamaIsAvailable()
  const cands = priorityProviders(withTools)

  for (const [name, p] of cands) {
    const ac = new AbortController()
    let marked = false
    let finished = false
    let doneRes = null
    let err = null
    const mark = () => { if (!marked) { marked = true } }
    const firstToken = new Promise((resolve) => {
      streamCloud(name, p, options, messages, (t) => {
        if (String(t).trim() && !finished) mark()
        onToken(t)
      }, ac.signal).then(
        (res) => { doneRes = res; finished = true },
        (e) => { err = e; finished = true }
      )
      const iv = setInterval(() => {
        if (marked) { clearInterval(iv); resolve(); return }
        if (!finished) return // ما زال يعمل — نمنحه حقوق البداية حتى المهلة
        clearInterval(iv)
        // انتهى قبل المهلة: إن نجح بنتيجة نعتبره فائزًا، وإن فشل فانتقل فورًا للتالي
        if (doneRes?.ok && String(doneRes.content || '').trim()) mark()
        resolve()
      }, 30)
      setTimeout(() => { clearInterval(iv); resolve() }, CLOUD_HEADSTART_MS)
    })
    await firstToken

    if (marked && (!finished || (doneRes && doneRes.content?.trim()))) {
      // هذا المزوّد بدأ ويفوز بالرد — نمهل البث حتى يكتمل
      while (!finished) await new Promise((r) => setTimeout(r, 30))
      if (doneRes?.ok) {
        if (onDone) onDone({ ...doneRes, streamed: true })
        return
      }
    } else {
      ac.abort()
      markBlockedOnQuota(name, { error: String(err || '') })
      if (finished && doneRes?.ok && doneRes.content?.trim()) {
        // اكتمل قبل انتهاء المهلة رغمًا عنّا — نعتبره النتيجة
        if (onDone) onDone({ ...doneRes, streamed: true })
        return
      }
    }
  }

  if (local) {
    await streamOllama(options, messages, onToken, onDone)
    return
  }
  if (onDone) onDone({ ok: false, error: 'لا يوجد موفّر بث متاح' })
}

async function streamCloud(name, p, options, messages, onToken, signal) {
  let full = ''
  let gotDelta = false
  if (name === 'gemini') {
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }] }))
    const system = messages.find((m) => m.role === 'system')?.content
    const body = { contents, ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}) }
    try {
      await streamNdjson(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:streamGenerateContent?key=${p.key}&alt=sse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, null, (line) => {
        if (!line.startsWith('data:')) return
        try {
          const j = JSON.parse(line.slice(5).trim())
          const t = j.candidates?.[0]?.content?.parts?.map((x) => x.text).filter(Boolean).join('') || ''
          if (t) { gotDelta = true; full += t; onToken(t) }
        } catch { /* noop */ }
      }, signal)
    } catch (e) {
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(e?.message || e))) markBlocked('gemini')
      throw e
    }
    return { ok: true, provider: 'gemini', model: p.model, content: full, toolCalls: null, streamed: gotDelta }
  }
  if (name === 'anthropic') {
    throw new Error('anthropic stream fallback to local')
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` }
  const payload = openAIPayload(p, options, messages, true)
  await streamNdjson(`${p.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload) }, null, (line) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (data === '[DONE]') return
    try {
      const j = JSON.parse(data)
      const t = j.choices?.[0]?.delta?.content || ''
      if (t) { gotDelta = true; full += t; onToken(t) }
    } catch { /* noop */ }
  }, signal)
  return { ok: true, provider: name, model: p.model, content: full, toolCalls: null, streamed: gotDelta }
}

async function streamOllama(options, messages, onToken, onDone) {
  const { model, tools, think = false, numCtx = 4096 } = options
  const chat = messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }))
  const payload = { model: model || OLLAMA_MODEL, messages: chat, stream: true, think: think === false ? false : true, keep_alive: '30m', options: { num_ctx: numCtx } }
  if (tools && tools.length) payload.tools = tools
  let full = ''
  let gotDelta = false
  await streamNdjson(`${OLLAMA_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, null, (line) => {
    try {
      const j = JSON.parse(line)
      if (j.message?.content) { gotDelta = true; full += j.message.content; onToken(j.message.content) }
    } catch { /* noop */ }
  })
  onDone?.({ ok: true, provider: 'ollama', model: payload.model, content: full, toolCalls: null, streamed: gotDelta })
}

export { generate, streamChat, cloudProviders, chooseModel, ollamaIsAvailable, OLLAMA_URL }
export const providers = () => ({
  ollama: OLLAMA_URL,
  ollamaModels: [OLLAMA_MODEL, OLLAMA_FALLBACK],
  cloud: cloudProviders().map(([name, p]) => ({ name, model: p.model })),
  geminiKey: !!PROVIDERS.gemini.key,
  prefersCloud: cloudProviders().length > 0,
  cloudBlocked: Object.fromEntries([...blocked.entries()].map(([n, until]) => [n, until - Date.now()])),
})