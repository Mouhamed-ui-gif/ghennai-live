import './env.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
const OLLAMA_FALLBACK = process.env.OLLAMA_FALLBACK_MODEL || 'gemma3:4b'
const CLOUD_TIMEOUT_MS = Number(process.env.CLOUD_TIMEOUT_MS || 40000)
const DATA_QUIET_MS = Number(process.env.DATA_QUIET_MS || 40000)
/** مهلة "حقّ البداية" للمزوّد الأول حتى يُرسل أول حرف قبل الانتقال للتالي */
const CLOUD_HEADSTART_MS = Number(process.env.CLOUD_HEADSTART_MS || 15000)
/** ترتيب أولوية الجودة: النموذج الأقوى أولًا، والباقي احتياط فوري */
const PROVIDER_PRIORITY = (process.env.PROVIDER_PRIORITY || 'gemini,groq,openrouter,openai,anthropic').split(',').map((s) => s.trim())
/** أولوية مزوّدات بثّ أدوات البرمجة (تسريع + live code): groq أسرع ثم openrouter ثم openai */
const TOOL_STREAM_PRIORITY = (process.env.TOOL_STREAM_PRIORITY || 'groq,groq120,openrouter,openai').split(',').map((s) => s.trim())

/** تعقّب "كلفة الحالة": عندما يعيد أي مزوّد 429 (حدّ الاستخدام/الحصّة)، نجمّده مؤقتًا بدل ضربه بلا فائدة */
const blocked = new Map()
const markBlocked = (name, ms = 25000) => blocked.set(name, Date.now() + ms)
const isBlocked = (name) => (blocked.get(name) || 0) > Date.now()
function markBlockedOnQuota(name, res) {
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(res?.error || res?.text || ''))) markBlocked(name)
}

/** كل موفّر سحابي بمفتاحه ونموذجه؛ وOpenAI-format تُدعم الأدوات function/tool_calls */
const PROVIDERS = {
  // منصة Kimi K3 المحلية (مجانية، بلا مفتاح — OpenAI-compatible على 127.0.0.1:8899).
  // tools:false عمدًا: منصة وكيلة تنفّذ بنفسها وترد نصًا — لا تصلح لحلقة tool_calls،
  // لكنها ممتازة للدردشة (مُتحقق: رد صحيح في ~3 ثوانٍ).
  kimiLocal: { key: 'local', base: process.env.KIMI_LOCAL_URL || 'http://127.0.0.1:8899/v1', model: process.env.KIMI_LOCAL_MODEL || 'kimi-k3-agent', tools: false },
  // Moonshot المباشر (kimi-k3) — يُفعَّل تلقائيًا لحظة وضع KIMI_API_KEY (مستبعد بدونه، بلا ادعاء).
  moonshot: { key: process.env.KIMI_API_KEY || '', base: 'https://api.moonshot.ai/v1', model: process.env.KIMI_MODEL || 'kimi-k3', tools: true },
  gemini: { key: process.env.GEMINI_API_KEY || '', model: process.env.GEMINI_MODEL || 'gemini-2.0-flash', tools: true },
  openai: { key: process.env.OPENAI_API_KEY || '', base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', tools: true },
  groq: { key: process.env.GROQ_API_KEY || '', base: 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', tools: true },
  groq120: { key: process.env.GROQ_API_KEY || '', base: 'https://api.groq.com/openai/v1', model: process.env.GROQ_TOOLS_MODEL_120 || 'openai/gpt-oss-120b', tools: true },
  openrouter: { key: process.env.OPENROUTER_API_KEY || '', base: 'https://openrouter.ai/api/v1', model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct', tools: true },
  anthropic: { key: process.env.ANTHROPIC_API_KEY || '', model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', tools: false },
}

/** الالتقاط: كل مزوّد يمكن أن يحمل نموذجًا مخصصًا للأدوات (X_TOOLS_MODEL) */
for (const [name, p] of Object.entries(PROVIDERS)) {
  const tm = process.env[`${name.toUpperCase()}_TOOLS_MODEL`]
  if (tm) p.toolsModel = tm
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

let ollamaModelCache = null
let ollamaModelCacheAt = 0

/**
 * اختيار نموذج Ollama موجود فعلًا: المفضل → الاحتياطي → أول نموذج محلي.
 * يمنع موت السلسلة كاملة بخطأ 404 عندما يُحذف النموذج المُعدّ (حدث حقيقي:
 * qwen2.5:3b اختفى وبقي qwen2.5:1.5b فقط). الكاش 60 ثانية.
 */
export async function resolveOllamaModel(preferred = null) {
  const want = preferred || OLLAMA_MODEL
  const now = Date.now()
  if (!ollamaModelCache || now - ollamaModelCacheAt > 60000) {
    try {
      const res = await fetchJson(`${OLLAMA_URL}/api/tags`, { method: 'GET' }, 4000)
      const names = (res.json?.models || []).map((m) => m.name || m.model).filter(Boolean)
      ollamaModelCache = names
      ollamaModelCacheAt = now
    } catch {
      ollamaModelCache = []
      ollamaModelCacheAt = now
    }
  }
  const names = ollamaModelCache
  if (names.includes(want)) return want
  if (names.includes(OLLAMA_FALLBACK)) return OLLAMA_FALLBACK
  const base = (s) => String(s).split(':')[0]
  const sameFamily = names.find((n) => base(n) === base(want))
  if (sameFamily) return sameFamily
  return names[0] || null
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

/** ضغط مخططات الأدوات قبل الإرسال: يبقي الأسماء والـrequired ويحذف أوصاف السمات الطويلة (يوفّر رموزًا) */
function compactSchemas(tools) {
  if (!Array.isArray(tools)) return tools
  return tools.map((t) => {
    const fn = t.function || {}
    const p = fn.parameters || {}
    const props = Object.fromEntries(Object.entries(p.properties || {}).map(([k, v]) => [k, { type: v.type || 'string' }]))
    return { type: 'function', function: { name: fn.name, description: String(fn.description || '').slice(0, 200), parameters: { type: 'object', properties: props, required: p.required || [] } } }
  })
}

function openAIPayload(provider, options, messages, stream = false, model) {
  const payload = {
    model: model || provider.model,
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
  if (options.tools && provider.tools) payload.tools = compactSchemas(options.tools)
  return payload
}

/** اختيار النموذج: عند استدعاء الأدوات نفضّل نموذجًا مخصصًا إن وُجد (X_TOOLS_MODEL) */
function modelForCall(provider, options) {
  return options.tools?.length && provider.toolsModel ? provider.toolsModel : provider.model
}

async function cloudChat(provider, options, messages) {
  const headers = { 'Content-Type': 'application/json' }
  if (provider.name === 'gemini') return cloudGemini(provider, options, messages, headers)
  if (provider.name === 'anthropic') return cloudAnthropic(provider, options, messages, headers)
  headers.Authorization = `Bearer ${provider.key}`
  if (provider.name === 'openrouter') headers['HTTP-Referer'] = 'http://localhost:3001'
  const res = await fetchJson(
    `${provider.base}/chat/completions`,
    { method: 'POST', headers, body: JSON.stringify(openAIPayload(provider, options, messages, false, modelForCall(provider, options))) },
    CLOUD_TIMEOUT_MS
  )
  if (!res.ok || !res.json?.choices?.[0]) return { ok: false, error: `cloud ${provider.name} ${res.status}: ${(res.text || '').slice(0, 200)}` }
  const c = res.json.choices[0]
  const content = c.message?.content || ''
  const toolCalls = c.message?.tool_calls || null
  return { ok: true, provider: provider.name, model: modelForCall(provider, options), content: typeof content === 'string' ? content : JSON.stringify(content), toolCalls }
}

/** تحويل مخطط أدوات OpenAI إلى functionDeclarations الخاص بـ Gemini */
function toGeminiTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return null
  const decls = tools
    .filter((t) => t?.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || { type: 'object', properties: {} },
    }))
  if (!decls.length) return null
  return [{ functionDeclarations: decls }]
}

async function cloudGemini(provider, options, messages, headers) {
  const contents = []
  const pending = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'assistant') {
      const parts = []
      if (m.content) parts.push({ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })
      for (const tc of m.tool_calls || []) {
        const name = tc?.function?.name
        if (name) {
          parts.push({ functionCall: { name, args: typeof tc.function.arguments === 'string' ? safeJson(tc.function.arguments) : tc.function.arguments } })
          pending.push(name)
        }
      }
      if (parts.length) contents.push({ role: 'model', parts })
      continue
    }
    if (m.role === 'tool') {
      const idx = pending.indexOf(m.name)
      if (idx !== -1) {
        pending.splice(idx, 1)
        let parsed
        try { parsed = JSON.parse(m.content ?? '') } catch { parsed = { result: String(m.content ?? '') } }
        contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: parsed } }] })
      }
      continue
    }
    const last = contents[contents.length - 1]
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    if (last && last.role === 'user' && last.parts?.[0] && !last.parts[0].functionResponse) {
      last.parts[0].text = (last.parts[0].text || '') + (last.parts[0].text ? '\n\n' : '') + text
    } else {
      contents.push({ role: 'user', parts: [{ text }] })
    }
  }
  const system = messages.find((m) => m.role === 'system')?.content
  const body = {
    contents,
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    ...(toGeminiTools(options.tools) ? { tools: toGeminiTools(options.tools) } : {}),
  }
  const res = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelForCall(provider, options)}:generateContent?key=${provider.key}`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    CLOUD_TIMEOUT_MS
  )
  const parts = res.json?.candidates?.[0]?.content?.parts || []
  const text = parts.map((p) => p.text).filter(Boolean).join('')
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `gcall_${Date.now()}_${i}`,
      type: 'function',
      function: { name: p.functionCall.name, arguments: typeof p.functionCall.args === 'string' ? p.functionCall.args : JSON.stringify(p.functionCall.args || {}) },
    }))
  if (!res.ok && !text && !toolCalls.length) {
    if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(res.text || '')) markBlocked('gemini')
    return { ok: false, error: `gemini ${res.status}: ${(res.text || '').slice(0, 200)}` }
  }
  return { ok: true, provider: 'gemini', model: provider.model, content: text, toolCalls: toolCalls.length ? toolCalls : null }
}

/** يجهّز سلسلة JSON أو يعيد كائن فارغًا — محمي ضد المدخلات الخاطئة */
function safeJson(str) {
  try { return JSON.parse(str) } catch { return {} }
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
  const { messages = [], prompt, tools, model, raw = false, keepAlive = '30m', think = true, numCtx = 8192 } = options
  const resolvedModel = await resolveOllamaModel(model || null)
  if (!resolvedModel) throw new Error('Ollama: no local models installed (ollama list is empty)')
  const chat = []
  if (options.system) chat.push({ role: 'system', content: options.system })
  for (const m of messages) {
    if (m.role === 'system') continue
    chat.push({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') })
  }
  if (prompt) chat.push({ role: 'user', content: prompt })

  const payload = {
    model: resolvedModel,
    messages: chat,
    stream: false,
    keep_alive: keepAlive,
    think: think === false ? false : true,
    options: { num_ctx: numCtx },
  }
  if (payload.think && payload.model.includes('qwen2.5')) payload.think = false
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

  // ollama قد يرفض الاتصال لحظيًا أثناء تبديل النماذج — نحاول مجددًا مرتين مع فاصل قصير
  if (!res.ok && res.status === 0) {
    for (let i = 0; i < 2 && !res.ok; i++) {
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
      res = await tryChat()
    }
  }

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
    if (local) {
      try {
        return await generateOllama(options)
      } catch (e) {
        // فشل ollama (انقطاع/حمل نموذج) — نلجأ للسحابة بدل إسقاط المهمة إن توفرت
        const raced = await raceCloud(options, normalizeMessages(options))
        if (raced?.ok) return raced
        throw e
      }
    }
    const raced = await raceCloud(options, normalizeMessages(options))
    if (raced?.ok) return raced
    throw new Error('لا يوجد مولد نشط. شغّل Ollama (ollama serve) أو ضع مفتاحًا (GEMINI/OPENAI/GROQ/OPENROUTER/ANTHROPIC_API_KEY) في server/.env')
  }

  const messages = normalizeMessages(options)
  const raced = await raceCloud(options, messages)
  if (raced?.ok) return raced
  if (local) {
    try {
      return await generateOllama(options)
    } catch (e) {
      throw new Error(`Cloud inference failed: ${raced?.error || 'unknown'}; local ollama also errored: ${String(e?.message || e)}`)
    }
  }
  throw new Error(`Cloud inference failed: ${raced?.error || 'unknown'}`)
}

/** تنبيه: البث بأسطر ndjson */
async function streamNdjson(url, options, body, handle, externalSignal) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS * 2)
  const signal = externalSignal || controller.signal
  const isAbort = (e) => e?.name === 'AbortError' || e?.cause?.name === 'AbortError'
  let res
  try {
    res = await fetch(url, { ...options, signal })
  } catch (err) {
    clearTimeout(t)
    if (isAbort(err)) return -1
    throw err
  }
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
 * بث حروف ردّ (chat): سباق متوازٍ على المزوّدات السحابية —
 * نطلقها كلها دفعةً واحدة، وأول من يُرسل أول حرف يفوز ويبثّ، والباقي يُقطع فورًا.
 * إن لم يبدأ أي سحابة خلال المهلة نعود إلى Ollama المحلي.
 * onToken: يستقبل النص التزايدي. onDone(result): عند الانتهاء.
 */
async function streamChat(options, onToken, onDone) {
  const withTools = !!(options.tools?.length)
  const messages = normalizeMessages(options)
  const local = await ollamaIsAvailable()
  const cands = priorityProviders(withTools)
  if (!cands.length) {
    if (local) return streamOllama(options, messages, onToken, onDone)
    return onDone?.({ ok: false, error: 'لا يوجد موفّر بث متاح' })
  }

  /** ollama فشل بثًّا — نعطي النص عبر سحابة (بدون بث) بدل إسقاط الرد */
  const localOrCloud = async (label) => {
    try {
      return await streamOllama(options, messages, onToken, onDone)
    } catch (e) {
      if (cloudProviders().length) {
        const raced = await raceCloud(options, messages)
        if (raced?.ok) {
          onToken(raced.content)
          return onDone?.({ ...raced, streamed: true, fallback: label })
        }
      }
      return onDone?.({ ok: false, error: String(e?.message || e) })
    }
  }

  const buffers = new Map()
  const controllers = new Map()
  const results = new Map()
  let finishedCnt = 0

  const winner = await new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null) }
    }, CLOUD_HEADSTART_MS)
    const win = (name) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(name) }
    }
    for (const [name, p] of cands) {
      const ac = new AbortController()
      controllers.set(name, ac)
      buffers.set(name, [])
      let got = false
      const pms = streamCloud(name, p, options, messages, (t) => {
        if (!String(t).trim()) return
        buffers.get(name).push(t)
        if (!got) { got = true; win(name) }
      }, ac.signal).then(
        (res) => (res?.ok ? res : { ...res, ok: true }),
        (err) => {
          if (/429|quota|RESOURCE_EXHAUSTED/i.test(String(err?.message || err))) markBlocked(name)
          return { ok: false, error: String(err?.message || err) }
        }
      )
      results.set(name, pms)
      pms.then((res) => {
        finishedCnt++
        if (settled) return
        if (res?.ok && String(res.content || '').trim()) win(name)
        else if (finishedCnt >= cands.length) win(null)
      })
    }
  })

  if (!winner) {
    for (const ac of controllers.values()) ac.abort()
    if (local) return localOrCloud('no_first_token')
    return raceCloud(options, messages).then((r) =>
      r?.ok ? (onToken(r.content), onDone({ ...r, streamed: true })) : onDone({ ok: false, error: r?.error || 'لا يوجد موفّر بث متاح' })
    )
  }

  for (const [name, ac] of controllers) if (name !== winner) ac.abort()
  for (const t of buffers.get(winner)) onToken(t)
  const res = await results.get(winner)
  if (res?.ok) return onDone?.({ ...res, streamed: true })

  if (local) return localOrCloud('winner_empty')
  return raceCloud(options, messages).then((r) =>
    r?.ok ? (onToken(r.content), onDone({ ...r, streamed: true })) : onDone({ ok: false, error: String(res?.error || 'stream failed') })
  )
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
  const useModel = await resolveOllamaModel(model || null)
  if (!useModel) throw new Error('Ollama: no local models installed (ollama list is empty)')
  const chat = messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }))
  const payload = { model: useModel, messages: chat, stream: true, think: think === false ? false : true, keep_alive: '30m', options: { num_ctx: numCtx } }
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

/** تتبّع حالة أداة أثناء بث وسائطها */
function trackToolsState() {
  const m = new Map()
  return {
    delta(index, id, name, argsDelta) {
      let s = m.get(index)
      if (!s) {
        s = { id, name, args: '', prevDec: 0 }
        m.set(index, s)
      }
      if (id) s.id = id
      if (name) s.name = name
      s.args += argsDelta || ''
      return s
    },
    pathOf(s) {
      const x = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s.args)
      return x ? x[1] : null
    },
    contentSpan(s) {
      const pat = /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g
      let raw = ''
      let p
      while ((p = pat.exec(s.args))) raw = p[1]
      if (!raw) return { file: this.pathOf(s), delta: '' }
      let dec = ''
      try { dec = JSON.parse(`"${raw}"`) } catch { dec = raw }
      const delta = dec.length > s.prevDec ? dec.slice(s.prevDec) : ''
      s.prevDec = Math.max(s.prevDec, dec.length)
      return { file: this.pathOf(s), delta }
    },
    calls() {
      return [...m.values()].map((s) => ({ id: s.id, type: 'function', function: { name: s.name, arguments: s.args } }))
    },
  }
}

/** قراءة خطية (مولّدة) لتدفق JSON: AI يمكن للمتصل أن يثمر بين قراءات */
function parseResetMs(v) {
  if (!v) return 0
  const m = String(v).trim().match(/^([\d.]+)\s*(ms|s|m)$/)
  if (!m) return 0
  const n = parseFloat(m[1])
  return m[2] === 'ms' ? n : m[2] === 's' ? n * 1000 : n * 60000
}

async function* readNdjsonLines(url, options, signal, quietMs) {
  // المهلة هنا خمول (idle) تُصفَّر مع كل قطعة مستلمة — لا إجماليًا.
  // (كانت خطأً إجماليةً: قتلت أي turn محلي يتجاوز 25 ثانية → "This operation was aborted")
  const limit = quietMs || CLOUD_TIMEOUT_MS * 2
  const controller = new AbortController()
  let t = setTimeout(() => controller.abort(), limit)
  const poke = () => {
    clearTimeout(t)
    t = setTimeout(() => controller.abort(), limit)
  }
  const onExt = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExt, { once: true })
  }
  let res
  try {
    res = await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    clearTimeout(t)
    signal?.removeEventListener('abort', onExt)
    throw err
  }
  if (!res.ok || !res.body) {
    clearTimeout(t)
    signal?.removeEventListener('abort', onExt)
    const txt = await res.text().catch(() => '')
    const err = new Error(`stream http ${res.status}: ${txt.slice(0, 160)}`)
    if (res.status === 429) err.retryAfterMs = parseResetMs(res.headers.get('x-ratelimit-reset-tokens'))
    throw err
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      let chunk
      try {
        chunk = await reader.read()
      } catch {
        break
      }
      if (chunk.done) break
      poke()
      buf += decoder.decode(chunk.value, { stream: true })
      let nl = buf.indexOf('\n')
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) yield line
        nl = buf.indexOf('\n')
      }
    }
  } finally {
    clearTimeout(t)
    signal?.removeEventListener('abort', onExt)
  }
}

/**
 * بثّ البرمجة الحقيقي: يولّد أحداثًا فور وصولها.
 *  - {kind:'text', text}           شرَدة شرح (يذهب لمسجّل المحادثة)
 *  - {kind:'toolArgs', file?, delta}  محتوى ملف يُكتب الآن (يذهب لعارض الكود + المعاينة)
 *  - {kind:'fix', message}訊息 خطأ واصل
 *  - {kind:'done', result}         {content, toolCalls, provider}
 * الترتيب: groq → openrouter → openai → بقية السحابة → ollama → generate() غير المدفّق.
 */
export async function* codestreamGen(options = {}) {
  const withTools = !!(options.tools?.length)
  const messages = normalizeMessages(options)
  const tracker = trackToolsState()
  let lastErr = null

  const wantLocalFirst = options.provider === 'ollama'
  const cloudCands = priorityProviders(withTools)
  const ordered = [
    ...TOOL_STREAM_PRIORITY.map((n) => cloudCands.find(([name]) => name === n)).filter(Boolean),
    ...cloudCands.filter(([name]) => !TOOL_STREAM_PRIORITY.includes(name)),
  ]

  const tryChain = wantLocalFirst ? [null, ...(ordered.length ? ordered.map((o) => o) : [])] : [...ordered, null]
  for (const cand of tryChain) {
    if (options.signal?.aborted) throw new Error('aborted')
    if (cand === null) {
      if (!(await ollamaIsAvailable())) continue
      try {
        yield* streamOllamaToolsGen(options, messages)
        return
      } catch (e) {
        console.error(`[STREAM CHAIN] ollama FAILED:`, String(e?.message || e).slice(0, 160))
        lastErr = String(e?.message || e)
        continue
      }
    }
    const [name, p] = cand
    if (name === 'gemini' || name === 'anthropic') {
      const r = await cloudChat({ name, ...p }, options, messages).catch((e) => ({ ok: false, error: String(e) }))
      if (r?.ok && (String(r.content || '').trim() || r.toolCalls?.length)) {
        if (r.content) yield { kind: 'text', text: r.content }
        yield { kind: 'done', result: { ...r, streamed: false } }
        return
      }
      lastErr = r?.error || lastErr
      continue
    }
    try {
      yield* streamOpenAICompatToolsGen(name, p, options, messages, tracker)
      return
    } catch (e) {
      console.error(`[STREAM CHAIN] ${name} FAILED:`, String(e?.message || e).slice(0, 160))
      lastErr = e instanceof Error ? e : new Error(String(e))
      const msg = lastErr.message
      if (name === ordered[0]?.[0] && /429|rate.limit|insufficient_quota/i.test(msg)) {
        const backoffs = [10000, 20000, 35000]
        for (let w = 0; w < backoffs.length && !options.signal?.aborted; w++) {
          const wait = Math.max(backoffs[w], parseResetMs(lastErr.retryAfterMs) || 0)
          if (!options.signal?.aborted) await new Promise((r) => setTimeout(r, wait))
          if (options.signal?.aborted) break
          try {
            yield* streamOpenAICompatToolsGen(name, p, options, messages, tracker)
            return
          } catch (e2) {
            lastErr = e2 instanceof Error ? e2 : new Error(String(e2))
            console.error(`[STREAM CHAIN] ${name} retry${w + 1} FAILED:`, String(e2?.message || e2).slice(0, 160))
          }
        }
      } else if (/429|rate.limit|insufficient_quota/i.test(msg) && /groq/.test(name)) {
        const wait = parseResetMs(lastErr.retryAfterMs)
        if (wait > 0 && !options.signal?.aborted) {
          await new Promise((r) => setTimeout(r, wait))
          if (!options.signal?.aborted) {
            try {
              yield* streamOpenAICompatToolsGen(name, p, options, messages, tracker)
              return
            } catch (e2) {
              lastErr = e2 instanceof Error ? e2 : new Error(String(e2))
              console.error(`[STREAM CHAIN] ${name} after-wait FAILED:`, String(e2?.message || e2).slice(0, 160))
            }
          }
        }
      }
      if (options.signal?.aborted || /^abort/i.test(lastErr.message)) break
      if (/401|403|invalid/i.test(lastErr.message) || /429|rate.limit/i.test(lastErr.message)) markBlocked(name, name === ordered[0]?.[0] ? 6000 : 30000)
      if (/413|Request too large|context_length|context length/i.test(lastErr.message)) markBlocked(name, 120000)
    }
  }

  const raced = await raceCloud(options, messages)
  if (raced?.ok) {
    if (raced.content) yield { kind: 'text', text: raced.content }
    yield { kind: 'done', result: { ...raced, streamed: false } }
    return
  }
  throw new Error(lastErr ? `Coding stream failed: ${lastErr}` : 'لا يوجد مولد نشط للبرمجة')
}

/** بعد اكتمال التدفق: نبثّ النتيجة فقط (الشرح بُثّ حيًا سطرًا سطرًا داخل المولد) */

/** دفقة المزوّد OpenAI-المتوافق مع الأدوات: يولّد أحداثًا حيّة أثناء القراءة + حدث done */
async function* streamOpenAICompatToolsGen(name, p, options, messages, tracker) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` }
  if (name === 'openrouter') headers['HTTP-Referer'] = 'http://localhost:3001'
  const payload = openAIPayload(p, options, messages, true, modelForCall(p, options))
  const controller = new AbortController()
  const quiet = setTimeout(() => controller.abort(), DATA_QUIET_MS)
  const ext = options.signal || null
  const onExt = () => controller.abort()
  if (ext) {
    if (ext.aborted) controller.abort()
    else ext.addEventListener('abort', onExt, { once: true })
  }
  let full = ''
  const seen = new Set()
  let sawLine = false
  try {
    for await (const line of readNdjsonLines(`${p.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload) }, controller.signal)) {
      if (!line.startsWith('data:')) continue
      sawLine = true
      quiet.refresh()
      const data = line.slice(5).trim()
      if (data === '[DONE]') break
      let j
      try { j = JSON.parse(data) } catch { continue }
      const d = j.choices?.[0]?.delta
      if (!d) continue
      if (d.content) {
        full += d.content
        yield { kind: 'text', text: d.content }
        if (controller.signal.aborted) throw new Error('aborted')
      }
      for (const tc of d.tool_calls || []) {
        const s = tracker.delta(tc.index, tc.id, tc.function?.name, tc.function?.arguments || '')
        const { file, delta } = tracker.contentSpan(s)
        if (delta) {
          if (!seen.has(file || `${tc.index}`)) seen.add(file || `${tc.index}`)
          yield { kind: 'toolArgs', index: tc.index, file, delta }
          if (controller.signal.aborted) throw new Error('aborted')
        }
      }
    }
  } finally {
    clearTimeout(quiet)
    ext?.removeEventListener('abort', onExt)
  }
  if (!sawLine || controller.signal.aborted) throw new Error('aborted')
  const calls = tracker.calls()
  yield { kind: 'done', result: { ok: true, provider: name, model: modelForCall(p, options), content: full, toolCalls: calls.length ? calls : null, streamed: !!full } }
}

/** بث Ollama مع جمع tool_calls (وسائط الأدوات تصل كاملة في النهاية) */
async function* streamOllamaToolsGen(options, messages) {
  const model = await resolveOllamaModel(options.model || null)
  if (!model) throw new Error('Ollama: no local models installed (ollama list is empty)')
  const chat = messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') }))
  const payload = { model, messages: chat, stream: true, keep_alive: '30m', options: { num_ctx: options.numCtx || 8192 } }
  if (options.tools?.length) payload.tools = options.tools
  let full = ''
  let toolCalls = null
  let saw = false
  for await (const line of readNdjsonLines(`${OLLAMA_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, options.signal || null, 180000)) {
    if (options.signal?.aborted) throw new Error('aborted')
    let j
    try { j = JSON.parse(line) } catch { continue }
    if (j.message?.content) { saw = true; full += j.message.content; yield { kind: 'text', text: j.message.content } }
    if (j.message?.tool_calls?.length) toolCalls = j.message.tool_calls
  }
  if (!saw && !toolCalls) throw new Error('ollama streaming empty')
  yield { kind: 'done', result: { ok: true, provider: 'ollama', model, content: full, toolCalls } }
}
export const providers = () => ({
  ollama: OLLAMA_URL,
  ollamaModels: [OLLAMA_MODEL, OLLAMA_FALLBACK],
  cloud: cloudProviders().map(([name, p]) => ({ name, model: p.model })),
  geminiKey: !!PROVIDERS.gemini.key,
  prefersCloud: cloudProviders().length > 0,
  cloudBlocked: Object.fromEntries([...blocked.entries()].map(([n, until]) => [n, until - Date.now()])),
})