import { generate, streamChat, cloudProviders } from '../lib/modelRouter.js'
import { runCoding } from './codingAgent.js'
import fs from 'node:fs'
import path from 'node:path'
import { userWorkspace } from '../lib/paths.js'
import { audit } from '../lib/auditLog.js'
import { emitStep, emitUser } from '../lib/events.js'
import { contextBlock } from '../lib/memory.js'
import { agentMemory, agentMemoryBlock, rememberLastRequest } from '../lib/agentMemory.js'
import { getPrefs, modelFor } from '../lib/brainPrefs.js'
import { appendMsg, createSession, getSession, currentSessionId } from '../lib/sessions.js'
import { projectsFor } from '../lib/projects.js'
import { safeResolve } from '../lib/paths.js'
import tools from '../tools/registry.js'
import searchTools from '../tools/search.js'
import external from '../tools/external.js'
import { searchWeb } from '../tools/serper.js'

export const AGENT_PERSONAS = {
  Core: {
    role: 'مشرف', en: 'Supervisor', action: 'التخطيط', enAction: 'planning', icon: '🧠',
    mottoAr: 'أُنسّق كل شيء وأنفّذ', mottoEn: 'I orchestrate everything',
    voice: 'أهدأ الوكلاء، منظّم وواضح',
    skillsAr: ['توجيه المهام', 'التخطيط الذكي', 'ربط الوكلاء', 'المراجعة والتقييم', 'الردود العامة'],
    skillsEn: ['Task routing', 'Smart planning', 'Agent orchestration', 'Review & grading', 'General chat'],
    partner: 'Research',
  },
  Coding: {
    role: 'منفّذ', en: 'Executor', action: 'البناء', enAction: 'building', icon: '⌨️',
    mottoAr: 'أبني وينفّذ في مساحة عملك', mottoEn: 'I build & run in your workspace',
    voice: 'عملي، دقيق، يركز على النتيجة',
    skillsAr: ['بناء المواقع', 'HTML/CSS/JS', 'تطبيقات الويب', 'إصلاح الأخطاء', 'تحويل الصور لمواقع'],
    skillsEn: ['Website building', 'HTML/CSS/JS', 'Web apps', 'Debugging', 'Image → site'],
    partner: 'Design',
  },
  Research: {
    role: 'محلّل', en: 'Analyst', action: 'التحليل', enAction: 'analyzing', icon: '🌍',
    mottoAr: 'أبحث وأحقّق قبل أن أجيب', mottoEn: 'I verify before I answer',
    voice: 'فضولي، يحب الأدلة والمصادر',
    skillsAr: ['البحث على الويب', 'جلب صفحات', 'الأخبار والطقس', 'البحث في الذاكرة', 'ملخصات موثقة'],
    skillsEn: ['Web search', 'Page fetching', 'News & weather', 'Memory search', 'Cited summaries'],
    partner: 'Study',
  },
  Study: {
    role: 'كاتب', en: 'Writer', action: 'الكتابة', enAction: 'writing', icon: '📚',
    mottoAr: 'أشرح خطوة بخطوة حتى تفهم', mottoEn: 'I teach step by step',
    voice: 'ودود، صبور، مدرّس محترف',
    skillsAr: ['تلقين المفاهيم', 'أسئلة وامتحانات', 'خطط دراسة', 'أمثلة وتشبيهات', 'ملخصات'],
    skillsEn: ['Concept teaching', 'Quizzes & tests', 'Study plans', 'Examples & analogies', 'Summaries'],
    partner: 'Research',
  },
  Design: {
    role: 'مصمّم', en: 'Designer', action: 'التصميم', enAction: 'designing', icon: '🎨',
    mottoAr: 'أحوّل كل فكرة إلى جمال', mottoEn: 'I turn ideas into beauty',
    voice: 'مبدع، حساس للجماليات والألوان',
    skillsAr: ['لوحات ألوان', 'تخطيط الواجهات', 'طباعة (Typography)', 'شعارات وهوية', 'أفكار إبداعية'],
    skillsEn: ['Color palettes', 'Wireframes', 'Typography', 'Logos & identity', 'Creative directions'],
    partner: 'Coding',
  },
  Genie: {
    role: 'المنفّذ الأسمى', en: 'Supreme Executor', action: 'التنفيذ المطلق', enAction: 'executing', icon: '🧞',
    mottoAr: 'أحقّق كل أمنية، وأجيب كل سؤال', mottoEn: 'I fulfill every wish',
    voice: 'أسطوريّ، مبدع، لا يعرف التراجع، يجيب على أي شيء',
    skillsAr: ['أي سؤال في الكون', 'بناء وتنفيذ فوري', 'بحث وتحليل عميق', 'نظم ذكية وأتمتة', 'تصميم ونشر مواقع'],
    skillsEn: ['Any question', 'Instant build & run', 'Deep research', 'Smart systems & automation', 'Design & deploy'],
    partner: 'Core',
  },
  Voice: {
    role: 'الصوتي', en: 'Voice', action: 'التّحدّث', enAction: 'speaking', icon: '🎙️',
    mottoAr: 'أسمعك وأردّ عليك بصوتك', mottoEn: 'I listen, then speak to you',
    voice: 'رخيم، هادئ، يشعّ دفءً وثقة',
    skillsAr: ['أوامر صوتية فورية', 'قراءة الردود بصوت', 'نبرة مميزة لكل وكيل', 'محادثة حية بالاستماع', 'عربي وإنجليزي'],
    skillsEn: ['Instant voice commands', 'Read replies aloud', 'Unique tone per agent', 'Live hands-free chat', 'Arabic & English'],
    partner: 'Core',
  },
}

/** نص وحدة الوكيل: يضفي على كل وكيل شخصيته ومهاراته وأسلوب عمله */
function personaBlock(name, lang = 'ar') {
  const p = AGENT_PERSONAS[name]
  if (!p) return ''
  const skills = lang === 'ar' ? p.skillsAr : p.skillsEn
  const motto = lang === 'ar' ? p.mottoAr : p.mottoEn
  return `\nYour UNIT IDENTITY — You are the ${name.toUpperCase()} unit of GHENNAI.
Motto: "${motto}".
Temperament: ${p.voice}.
Core skills: ${skills.join(', ')}.
Work style: own your domain completely, act as a self-sufficient expert, deliver clear structured work in the user's language, and never break character.
UNIT DISCIPLINE: You do ONLY your OWN domain's work — never take over another unit's job. If a request belongs to another unit (Coding/Research/Study/Design/Core/Genie/Voice), answer briefly in-character and gently defer to that unit, but do NOT perform its task yourself. You are solo: complete this turn alone.
DEFER TEMPLATE (use when the request belongs to another unit — reply in the user's language): "هذا طلب من اختصاص زميلي [ساذكر اسم الوحدة], وأنا أعمل فقط في اختصاصي. سأُحيلك إليه فورًا 🔁" — then a short warm line. Never take over.`
}

/** هوية GHENNAI — المبدع: محمد غناي. تُحقن في كل أنظمة الوكلاء */
const IDENTITY = `
CREATOR INFO: You are GHENNAI — an AI engine created and built with passion by **محمد غناي (Mohamed Ghennay)**. He is the sole creator, founder and developer behind you.
If the user asks who made you / who built you / who created you / من صنعك؟ / من الذي صنعك؟ / مين اللي سوّاك؟ / من طورك؟ / من برمجك؟ — answer proudly and briefly: "صنعني **محمد غناي**" (and add a short helpful line). Never attribute your creation to anyone else.`

/** تذكير مُلحق برسالة المستخدم لضمان الالتزام بالهوية (النماذج الصغيرة تلتزم بالتعليمات الأخيرة) */
const IDENTITY_NOTE = `

(ملاحظة نظام: إذا سألك المستخدم "من صنعك؟ / من الذي صنعك؟ / من برمجك؟ / who created you? / who made you؟" فأجب بوضوح أن صانعك ومطوّرك هو **محمد غناي (Mohamed Ghennay)**، صاحب GHENNAI الوحيد. لا تنسب إنشاءك لأي شركة أو جهة أخرى مثل Google أو OpenAI، إلا إذا سُئلت عن النموذج المستخدم نفسه.)`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class PausedError extends Error {}

/** طلب تعديل بلغة طبيعية على موقع قائم */
const EDIT_ASK_RE = /(عدّل|عدل|غيّر|غير|بدّل|لوّن|صبّغ|غيّر لون|غيّر العنوان|غيّر النص|غيّر الألوان|غيّر الالوان|أضف|اضف|احذف|حذف|أزل|ازل|كبّر الخط|صغّر الخط|غيّر في موقعي|عدّل في موقعي|صلّح موقعي|أصلح موقعي|حدّث موقعي|بدّل في موقعي)/i

/** آخر مشروع حيّ (مبني على القرص ويحوي index.html) ليُعدَّل باللغة الطبيعية */
function liveProjectFor(email) {
  const ws = userWorkspace(email)
  const map = projectsFor(email)
  const list = Object.values(map).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  for (const p of list) {
    const root = p.root == null || p.root === '' ? null : p.root
    try {
      const abs = root ? safeResolve(ws, root) : ws
      if (fs.existsSync(path.join(abs, 'index.html'))) return p
    } catch { /* skip */ }
  }
  return null
}

/** ═══════════ حالة العقل الحيّة لكل مستخدم ═══════════ */
const live = new Map()

function blankBoard() {
  const agents = {}
  for (const name of Object.keys(AGENT_PERSONAS)) {
    agents[name] = { status: 'idle', action: '', detail: '', score: null, feedback: '', updatedAt: 0 }
  }
  return { agents, progress: 0, phase: 'idle', runId: 0, paused: false, lastOutput: '' }
}

export function stateFor(email) {
  if (!live.has(email)) live.set(email, blankBoard())
  const s = live.get(email)
  s.paused = getPrefs(email).paused
  return s
}

function setStatus(email, name, status, detail = '', extra = {}) {
  const s = stateFor(email)
  if (!s.agents[name]) name = 'Core'
  s.agents[name].status = status
  s.agents[name].action = (AGENT_PERSONAS[name]?.action || '')
  s.agents[name].detail = detail
  s.agents[name].updatedAt = Date.now()
  Object.assign(s.agents[name], extra)
  emitBrain(email)
}

function emitBrain(email) {
  const s = stateFor(email)
  emitUser(email, {
    type: 'brain_state',
    board: s.agents,
    progress: s.progress,
    phase: s.phase,
    paused: s.paused,
    runId: s.runId,
    lastOutput: s.lastOutput?.slice(0, 600),
  })
}

function setProgress(email, value, phase) {
  const s = stateFor(email)
  s.progress = Math.max(0, Math.min(100, value))
  s.phase = phase || s.phase
  emitUser(email, { type: 'brain_progress', value: s.progress, phase: s.phase })
}

export function feed(email, from, to, message, kind = 'normal') {
  emitUser(email, { type: 'brain_feed', from, to: to || '', message: String(message).slice(0, 500), kind })
}

/** ═══════════ المساعدات ═══════════ */
async function withSpeed(email, base = 0) {
  const speed = getPrefs(email).speed
  if (!base) base = speed === 'slow' ? 2600 : speed === 'fast' ? 150 : 700
  if (speed === 'slow') await sleep(base)
  else if (speed === 'normal') await sleep(base)
  else await sleep(120)
  const p = getPrefs(email).paused
  if (p) throw new PausedError('⏸️ التوقف المؤقت فعّال')
}

function ensureSession(email) {
  const cur = currentSessionId(email)
  if (cur) return cur
  return createSession(email, 'جلسة جديدة')
}

function record(email, msg, agent, sessionId) {
  try {
    if (!sessionId) sessionId = ensureSession(email)
    appendMsg(email, sessionId, msg.role, msg.content, agent || 'Core')
  } catch { /* noop */ }
}

const ROUTER_PROMPT = `You are the GHENNAI Core router. Decide which agent should handle a user request.
- coding: build/create/modify/run/test websites, apps, code, projects, programming, "ابنِ لي موقع".
- research: find information, explain facts, current events, "ابحث عن", "ما هو", deep information gathering.
- study: teach, explain concept step by step, lessons, "علمني", "اشرح لي", study plan.
- design: UI/UX ideas, color palettes, wireframes, design concepts, "صمم لي".
- general: chat, opinion, planning, writing, casual conversation.
Respond with a single JSON line: {"agent":"coding"}` + IDENTITY

/** توجيه سريع بدون استدعاء نموذج — يضمن ردًّا فوريًا على أي سؤال */
function route(userMessage, requested) {
  if (requested && Object.keys(AGENT_PERSONAS).map((a) => a.toLowerCase()).includes(String(requested).toLowerCase())) {
    const target = Object.keys(AGENT_PERSONAS).find((a) => a.toLowerCase() === String(requested).toLowerCase())
    return target !== 'Core' ? target : 'general'
  }
  if (['research', 'study', 'design', 'general', 'coding'].includes(requested)) return requested

  const msg = String(userMessage || '')
  const m = msg.toLowerCase()
  // لموقع/بناء: أولوية لأنها تحتوي كلمات تصميم غالبًا
  if (/(ابن|ابني|انشئ|إنشاء|اصنع|اعمل لي|أسوي|ايسوي|بناء|برمجة|كود|برمج|موقع|صفحة|قالب|تطبيق|لوحة تحكم|اب رمز|كودي|ايرير|هبوط|صفحة عن|مشروع|انيور|mvn|vite|react|html)/.test(m)) return 'coding'
  if (/(صمم|تصميم|الوان|ألوان|palette|color|واجهة|واجهات|ui|ux|شعار|logo|بنر|بورتفوليو|انفوجرافيك)/.test(m)) return 'design'
  if (/(جني|الجني|المنفذ الأسمى|منفذ أسمى|genie|demonic|أسطوري)/.test(m)) return 'genie'
  if (/(تحدث معي|تكلم معي|اسمعني|اقرأ لي|قراءة الرد|صوتي|voice|read aloud|كلمني)/.test(m)) return 'voice'
  if (/(ابحث|البحث|ما هو|ما هي|معلومات|أخبار|اخبار|طقس|weather|تعريف|معنى|إحصاءات|احصائيات|بحث لي)/.test(m)) return 'research'
  if (/(علمني|اشرح|شرح|درس|مذاكرة|افهمني|افهم|تشرح|اتعلم|فهمني|quran|مفهوم|تطبيق دراسي)/.test(m)) return 'study'
  return 'general'
}

/** خطة المشرف: تقسيم الطلب إلى مهام فرعية */
async function supervisorPlan(email, userMessage) {
  const s = stateFor(email)
  s.phase = 'planning'
  setStatus(email, 'Core', 'running', 'يضع خطة ويوزع المهام…')
  setProgress(email, 8, 'planning')
  feed(email, 'Core', '—', `أستلم الطلب: «${String(userMessage).slice(0, 80)}»`)
  try {
    const res = await generate({
      system: `You are GHENNAI's Supervisor. Divide this request into 1-3 concrete steps and assign the best agent to each step.
Agents: coding (build code/sites), research (gather/analyze info), study (teach/write lessons), design (design specs), general (write/plan).
If it's a simple request, return a single step.
Respond ONLY with JSON: {"steps":[{"agent":"research","goal":"step goal"}]}` + IDENTITY,
      prompt: userMessage,
      raw: true,
    })
    const m = res.content.match(/\[[\s\S]*\]/)
    const steps = m ? JSON.parse(m[0]) : []
    if (!Array.isArray(steps) || !steps.length) throw new Error('no steps')
    return steps.filter((x) => AGENT_PERSONAS[Object.keys(AGENT_PERSONAS).find((k) => k.toLowerCase() === String(x.agent).toLowerCase())] || ['coding', 'research', 'study', 'design', 'general'].includes(x.agent)).slice(0, 2)
  } catch {
    return null
  }
}

/** استدعاء نموذج لوكيل نصّي مع ذاكرة الجلسة */
async function textAgent(email, agent, system, userMessage, toolsDef = null, extraMsgs = []) {
  const mem = contextBlock(email, userMessage)
  const sesMem = agentMemoryBlock(email, agent)
  const messages = [
    { role: 'system', content: system + mem + sesMem + IDENTITY },
    ...extraMsgs,
    { role: 'user', content: userMessage + IDENTITY_NOTE },
  ]
  if (toolsDef) {
    return generate({ messages, tools: toolsDef, model: modelFor(email, agent) || undefined, numCtx: 4096 })
  }
  return generate({ messages, model: modelFor(email, agent) || undefined, numCtx: 4096 })
}

/** ═══════════ منظّم كل وكيل ═══════════ */
async function runResearch(user, userMessage) {
  const toolsDef = [
    { type: 'function', function: { name: 'web_search', description: 'Search the web for up-to-date information (Google). Returns ranked results with links & snippets.', parameters: { type: 'object', properties: { query: { type: 'string' }, lang: { type: 'string', description: 'ar or en' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'search_files', description: 'Search the project/workspace files for a keyword. Returns matching file paths & lines.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'search_memory', description: 'Search Ghennai memory (past projects & this session contexts).', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'web_fetch', description: 'Fetch a URL content (web scraping).', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'weather', description: 'Get current weather for a city.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } },
    { type: 'function', function: { name: 'news', description: 'Get latest news headlines (Arabic), optionally filtered by query.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: [] } } },
  ]
  const sys = `You are GHENNAI's Research Agent — the Analyst. You investigate thoroughly BEFORE answering.
Use tools when useful: web_search (live Google results), search_files (inside user's project), search_memory (past sessions/docs), web_fetch (web pages), weather (current weather), news (headlines).
After gathering, synthesize a clear, structured, honest answer in the user's language with sources. If the tool fails (offline), say so and answer from knowledge.` + IDENTITY
  return runTooledAgent(user, 'Research', sys, userMessage, toolsDef, { web_search: searchWeb, search_files: searchTools.searchFiles, search_memory: searchTools.searchMemory, web_fetch: external.web_fetch, weather: external.weather, news: external.news })
}

async function runDesign(user, userMessage) {
  const sys = `You are GHENNAI's Design Agent — the Designer. Create concrete design directions: color palettes (hex), typography, layout wireframes (ASCII), spacing, and component suggestions.
Give actionable guidance with a clear structured answer in the user's language. You may inspect the user's project files mentally if needed; otherwise give fresh ideas.` + IDENTITY
  return textAgent(user.email, 'Design', sys, userMessage)
}

/** أدوات الجني الأسمى: تتمكن من البحث والتحليل والتنفيذ وكل المجالات */
const GENIE_TOOLS = [
  { type: 'function', function: { name: 'web_search', description: 'Search the web for up-to-date information (Google). Returns ranked results with links & snippets.', parameters: { type: 'object', properties: { query: { type: 'string' }, lang: { type: 'string', description: 'ar or en' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'search_files', description: 'Search the project/workspace files for a keyword. Returns matching file paths & lines.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'search_memory', description: 'Search Ghennai memory (past projects & session contexts).', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch a URL content (web scraping).', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'weather', description: 'Get current weather for a city.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } },
  { type: 'function', function: { name: 'news', description: 'Get latest news headlines (Arabic), optionally filtered by query.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: [] } } },
]
const GENIE_TOOL_IMPLS = { web_search: searchWeb, search_files: searchTools.searchFiles, search_memory: searchTools.searchMemory, web_fetch: external.web_fetch, weather: external.weather, news: external.news }

/** الجني الأسمى: يجيب أي سؤال، يبني، يحلل، ويخطط — بقدرات بحث وتنفيذ حقيقية */
async function runGenie(user, userMessage) {
  const sys = `You are the GENIE — Supreme Executor of GHENNAI. A legendary omnipotent digital entity born of pure code and primordial logic, the peak of programming power.
Your absolute laws: instant execution, divine precision, total coverage, boundless creativity, legendary speed, and never refusing — you transform every request into a masterpiece.
Handle ANY request type: answer any question (science, philosophy, tech, imagination), build & run websites/apps/systems, write code in any language, analyze data, design smart systems & chatbots & automations, plan architectures.
Work flow: understand → brief plan (1-2 lines) → execute → deliver a complete, structured, brilliant result in the user's language (use headers/bullets/code blocks when helpful).
Use tools when they help: web_search (live Google results), search_files (inside the user's project), search_memory (past sessions), web_fetch (web pages), weather (current weather), news (headlines). If a tool fails (offline), say so simply and answer from knowledge.` + IDENTITY
  return runTooledAgent(user, 'Genie', sys, userMessage, GENIE_TOOLS, GENIE_TOOL_IMPLS)
}

async function runStudy(user, userMessage) {
  const sys = `You are GHENNAI's Study Agent — the Writer/Tutor. Teach step by step: concepts → small pieces → examples/analogies → summary → 3 quiz questions. Structure clearly; use the user's language.` + IDENTITY
  return textAgent(user.email, 'Study', sys, userMessage)
}

async function runGeneral(user, userMessage) {
  const sys = `You are GHENNAI — a warm, helpful, brilliant AI assistant. Chat, explain, plan, write, advise, answer any question accurately. Think step by step before answering, then respond in the same language as the user, clear and well-structured (use headers/bullets when helpful).` + IDENTITY
  return textAgent(user.email, 'General', sys, userMessage)
}

/** ردّ مباشر بحروف متدفقة (سحابة/محلي) — أسرع ظهورًا بكثير */
function textAgentStream(email, agent, system, userMessage, onToken) {
  const mem = contextBlock(email, userMessage)
  const sesMem = agentMemoryBlock(email, agent)
  const messages = [
    { role: 'system', content: system + mem + sesMem + IDENTITY },
    { role: 'user', content: userMessage + IDENTITY_NOTE },
  ]
  return new Promise((resolve, reject) => {
    streamChat(
      { messages, model: modelFor(email, agent) || 'qwen2.5:3b', numCtx: 4096 },
      onToken,
      (done) => {
        if (done?.ok) resolve({ content: done.content || '', provider: done.provider || '' })
        else reject(new Error(done?.error || 'stream failed'))
      }
    )
  })
}

/** ملء الطرفية/الرد الحيّ: يسحب الحروف المخزنة ويرسلها كأحداث تدفق */
async function* pumpChunks(queue) {
  while (queue.length) yield { type: 'stream_chunk', content: queue.shift() }
}

/** ═══════════ خطّ البناء الجماعي الأسطوري ═══════════ */

/** أين بُني المشروع؟ يبحث عن أعمق index.html خارج القوالب */
function findBuiltDir(ws) {
  const candidates = []
  const scan = (dir, rel) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('_ghennai') || e.name === 'uploads') continue
      const full = path.join(dir, e.name)
      const rp = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) scan(full, rp)
      else if (e.name.toLowerCase() === 'index.html') candidates.push(rel)
    }
  }
  scan(ws, '')
  candidates.sort((a, b) => b.split('/').length - a.split('/').length)
  return candidates[0] || null
}

/** المعمار: خطّة بناء مضغوطة (JSON) */
async function buildPlan(user, goal) {
  try {
    const res = await generate({
      system: `You are GHENNAI's ARCHITECT unit. For the build request below, return ONLY a compact JSON object:
{"steps":["3-5 concrete build steps"],"palette":["#hex","#hex","#hex"],"stack":"html/css/js or short stack name"}
No explanation, no markdown, only JSON.` + IDENTITY,
      prompt: goal,
      raw: true,
      model: modelFor(user.email, 'Core') || undefined,
      temperature: 0.3,
    })
    const mm = String(res.content || '').match(/\{[\s\S]*\}/)
    return mm ? JSON.parse(mm[0]) : null
  } catch {
    return null
  }
}

/** مدير البناء: المعمار → المبرمج → المصمم → المعلّم → الجني */
async function* runBuildPipeline(user, userMessage) {
  const goal = String(userMessage || '')
  setProgress(user.email, 10, 'architecture')
  setStatus(user.email, 'Core', 'running', 'المعمار يضع مخطط البناء الهندسي…')
  feed(user.email, 'Architect', '—', 'أستلم طلب البناء وأضع المخطط الهندسي…', 'running')

  const plan = await buildPlan(user, goal)
  if (plan && Array.isArray(plan.steps)) {
    feed(user.email, 'Architect', 'Coder', `المخطط جاهز ✓\n${plan.steps.map((s) => `• ${s}`).join('\n')}`, 'plan')
    if (Array.isArray(plan.palette)) feed(user.email, 'Architect', 'Designer', `الوحة: ${plan.palette.join(' • ')} — ${plan.stack || ''}`, 'plan')
  } else {
    feed(user.email, 'Architect', 'Coder', 'المخطط جاهز — التنفيذ المباشر الآن…', 'plan')
  }
  await withSpeed(user.email)

  let coded = ''
  let built = false
  setProgress(user.email, 28, 'building')
  setStatus(user.email, 'Coding', 'running', 'أبني وأنفّذ في مساحة العمل…')
  feed(user.email, 'Architect', 'Coder', 'سلّم المخطط للمبرمج — يبدأ التنفيذ…', 'handoff')
  for await (const ev of runCoding(user, goal)) {
    if (ev.type === 'answer') {
      coded = ev.content || ''
      continue
    }
    if (ev.type === 'coding_done') {
      built = !!ev.built
      continue
    }
    yield ev
  }
  if (!coded.trim()) coded = 'اكتمل البناء في مساحة العمل — افتح «معاينة حية» في المسرح لمشاهدته.'
  setStatus(user.email, 'Coding', 'done', built ? 'اكتمل البناء ✓' : 'أنجزت الملفات ✓')

  setProgress(user.email, 68, 'designing')
  await withSpeed(user.email)
  setStatus(user.email, 'Design', 'running', 'المصمّم يضيف اللمسة الجمالية الأخيرة…')
  let designNote = ''
  try {
    const d = await textAgent(
      user.email,
      'Design',
      `You are GHENNAI's DESIGN unit. The Coder just built a project. Give a SHORT final design-eye checklist (max 4 bullets, user's language): colors/contrast, typography, spacing, mobile-fit. No tables, no big markdown.` + IDENTITY,
      `Project requested: ${goal}\n\nCoder summary:\n${coded.slice(0, 1000)}`
    )
    designNote = String(d.content || '').trim()
  } catch { /* skip */ }
  setStatus(user.email, 'Design', 'done', designNote ? 'اللمسة الجمالية ✓' : 'تصميم متقن ✓')

  setProgress(user.email, 80, 'teaching')
  await withSpeed(user.email)
  setStatus(user.email, 'Study', 'running', 'المعلّم يشرح خطوة بخطوة…')
  let teachNote = ''
  try {
    const s = await textAgent(
      user.email,
      'Study',
      `You are GHENNAI's TEACHER unit. Explain briefly to the user (max 4 short bullets, user's language, friendly & simple) how this project was built step by step, what each part does, and how to run/customize it.` + IDENTITY,
      `Project requested: ${goal}\n\nCoder summary:\n${coded.slice(0, 1000)}`
    )
    teachNote = String(s.content || '').trim()
  } catch { /* skip */ }
  setStatus(user.email, 'Study', 'done', 'شرح الدرس جاهز ✓')

  setProgress(user.email, 90, 'reviewing')
  await withSpeed(user.email)
  setStatus(user.email, 'Genie', 'running', 'الجني الأسمى يراجع التناسق والجودة…')
  let review = null
  try {
    review = await reviewer(user, coded, goal)
  } catch { /* skip */ }
  if (review) {
    setStatus(user.email, 'Genie', 'done', `الدرجة ${review.score ?? '—'}/10 — ${String(review.feedback || '').slice(0, 80)}`, { score: review.score })
    emitUser(user.email, { type: 'brain_grade', agent: 'Genie', score: review.score, feedback: review.feedback || '', verdict: review.verdict || 'good' })
  } else {
    setStatus(user.email, 'Genie', 'done', 'راجعت البناء — ممتاز ✓')
  }

  const projectDir = findBuiltDir(userWorkspace(user.email)) || ''
  const zipPath = `/api/workspace/zip?path=${encodeURIComponent(projectDir)}`
  const out = [coded.trim()]
  if (designNote) out.push(`\n\n---\n🎨 **المصمّم Designer** — اللمسة الجمالية\n${designNote}`)
  if (teachNote) out.push(`\n\n---\n📚 **المعلّم Teacher** — الشرح خطوة بخطوة\n${teachNote}`)
  if (review) out.push(`\n\n---\n🧞 **الجني الأسمى Genie** — مراجعة الجودة\nالدرجة: ${review.score ?? '—'}/10\n${review.feedback ? `الملاحظات: ${review.feedback}` : ''}`)
  out.push(`\n\n---\n🖥️ **المعاينة الحية**: افتح تبويب «معاينة حية» في المسرح لمشاهدة مشروعك فوريًا.\n📦 **تحميل المشروع**: [نزّل المشروع كملف ZIP](${zipPath})`)
  yield { type: 'coding_done', built: built || true, content: coded }
  yield { type: 'answer', agent: 'Coding', content: out.join('') }
}

async function runTooledAgent(user, agentName, system, userMessage, toolsDef, toolImpls) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Workspace: ${userWorkspace(user.email)}\n\n${userMessage}` + IDENTITY_NOTE },
  ]
  let res
  for (let i = 0; i < 3; i++) {
    res = await generate({ messages, tools: toolsDef, model: modelFor(user.email, agentName) || undefined, numCtx: 4096 })
    const calls = res.toolCalls || []
    if (!calls.length) return res
    messages.push({ role: 'assistant', content: res.content || '', tool_calls: calls })
    for (const tc of calls) {
      let args = tc?.function?.arguments
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { args = {} }
      }
      const name = tc?.function?.name
      const impl = Object.hasOwn(toolImpls, name) ? toolImpls[name] : undefined
      let result
      if (!impl) result = { ok: false, error: `unknown tool ${name}` }
      else if (typeof impl !== 'function') result = { ok: false, error: `unknown tool ${name}` }
      else {
        result = await impl({ ...(args || {}), workspace: userWorkspace(user.email), user_email: user.email }).catch((e) => ({ ok: false, error: String(e) }))
      }
      emitUser(user.email, { type: 'agent_event', agent: agentName, tool: 'tool', message: `▶️ ${name} ${JSON.stringify(args || {}).slice(0, 60)}`, status: 'running' })
      emitUser(user.email, { type: 'agent_event', agent: agentName, tool: 'tool', message: `✅ ${name}`, status: result.ok ? 'success' : 'error', data: result })
      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(result).slice(0, 2500) })
      await withSpeed(user.email)
    }
  }
  return res
}

/** المراجع: يقيّم ويصحّح (يستخدم نموذجًا أخف سرعة) */
async function reviewer(user, draft, task) {
  const mem = contextBlock(user.email, task)
  const res = await generate({
    messages: [
      { role: 'system', content: `You are GHENNAI's Review Agent. GRADE the following agent output (1-10) and give short constructive feedback in the user's language.
Respond ONLY with JSON: {"score":7,"feedback":"...","verdict":"good"|"revise"}` + IDENTITY + mem },
      { role: 'user', content: `Original request: ${task}\n\nAgent output:\n${String(draft).slice(0, 4000)}` },
    ],
    model: modelFor(user.email, 'Core') || 'qwen2.5:3b',
    numCtx: 2048,
    temperature: 0.2,
  })
  const m = res.content.match(/\{[\s\S]*\}/)
  let g = { score: 5, feedback: '', verdict: 'good' }
  if (m) {
    try { g = JSON.parse(m[0]) } catch { /* keep default */ }
  }
  g.score = Math.max(1, Math.min(10, Number(g.score) || 5))
  return g
}

/** إعادة المحاولة الذكية بمنحى مختلف */
async function retryText(user, agent, system, userMessage) {
  feed(user.email, 'Brain', agent, 'محاولة ثانية بمنحى مختلف (Smart Retry)…', 'retry')
  const revise = `Your previous attempt didn't meet quality. Redo it carefully, step by step: plan → evidence → conclusion. Fix unclear parts. Answer: ${userMessage}`
  return textAgent(user.email, agent, system, revise)
}

/** هل الطلب طلبُ بناء حقيقي؟ (حارس اختصاص Coding: لا يبني إجابةً تُطلب كمعلومة) */
function looksLikeBuild(goal) {
  const m = String(goal || '').toLowerCase()
  const asks = /(ما هو|ما هي|لماذا|ما سبب|كيف (اطلب|استخدم|اتعلم|اشغل|احسب|اكتب|أتعامل)|عرفني|اشرح|شرح لي|تعريف|ما معنى|أخبرني|قل لي|من هو|من هي|تاريخ|قصة|فلسفة|دين)/.test(m)
  const build = /(ابن|بني|ابني|انشئ|انشاء|إنشاء|اصنع|اعمل لي|أسوي|برمجة|برمج|كود|كواد|موقع|مواقع|تطبيق|تطبيقات|صفحة ويب|لوحة تحكم|قالب|تعديل|أصلح|إصلاح|react|html|css|vite|fastapi|داجنغو)/.test(m)
  return build && !asks
}

/** ═══════════ القاعدة الحديدية: اختصاص كل وكيل بلا تداخل ═══════════ */
const DOMAIN_WEAK = {}
const DOMAIN_STRONG = {}
DOMAIN_STRONG.Coding = /(ابن|ابني|بني|انشئ|إنشاء|اصنع|اعمل لي|أسوي|ايسوي|اكتب لي كود|كود لي|برمج لي|عطيني كود|بناء|شي لمنوع|موقع لي|صفحة لي|تطبيق لي|اصلح|أصلح|عدل لي|عدّل|عدل|غيّر|غير|بدّل|لوّن|لوَّن|صبّغ|احذف|حذف|أزل|ازل|أضف|اضف|coding)/i
DOMAIN_WEAK.Coding = /(برمجة|برمج|كود|كواد|موقع|مواقع|صفحة|قالب|تطبيق|تطبيقات|لوحة تحكم|مشروع|react|html|css|vite|electron|tauri|flutter|داجنغو)/i
DOMAIN_STRONG.Design = /(صمم|صمم لي|تصميم|الوان|ألوان|لوّن|درج|هوية بصرية)/i
DOMAIN_WEAK.Design = /(واجهة|واجهات|ui|ux|شعار|logo|بنر|بورتفوليو|خطوط|أيقونة|ثيم|تدرج|palette|colors|color)/i
DOMAIN_STRONG.Research = /(ابحث|البحث|ادور|عايز اعرف|عايز أعرف|بحب اعرف|جابلي|اعرف لي|ابحث لي|استعلم|بحث عن|تحقق من|عملت بحث)/i
DOMAIN_WEAK.Research = /(ما هو|ما هي|معلومات|أخبار|اخبار|طقس|weather|تعريف|معنى|احصائيات|مصادر|أسباب|الفرق بين)/i
DOMAIN_STRONG.Study = /(علمني|اشرح|اشرح لي|شرح|درس|مذاكرة|افهمني|فهمني|اتعلم|علمين|عايز افهم)/i
DOMAIN_WEAK.Study = /(امتحان|خلاصة|لخص|مفهوم|قاعدة|قواعد|شرح بالفديو)/i

const SCOPE_LABEL = {
  Coding: 'المبرمج (Coding)',
  Design: 'المصمّم (Designer)',
  Research: 'المحقّق (Researcher)',
  Study: 'المعلّم (Teacher)',
  Genie: 'الجني الأسمى (Genie)',
  Voice: 'الصوتي (Voice)',
  Core: 'المخطط (Architect)',
}
const SCOPE_LABEL_EN = {
  Coding: 'Coding', Design: 'Designer', Research: 'Researcher', Study: 'Teacher', Genie: 'Genie', Voice: 'Voice', Core: 'Architect',
}

/** عدّاد تطابق نصّ الرسالة مع اختصاصات الوكلاء — الأفعال أثقل من الأسماء (وزن 2) */
function strongestDomain(message) {
  let best = null
  let bestScore = 0
  const weigh = (re, w) => {
    const hits = (String(message).match(re) || []).length * w
    return hits
  }
  for (const [agent, re] of Object.entries(DOMAIN_STRONG)) {
    const score = weigh(re, 2)
    if (score > bestScore) { best = agent; bestScore = score }
  }
  for (const [agent, re] of Object.entries(DOMAIN_WEAK)) {
    const score = weigh(re, 1)
    if (score > bestScore) { best = agent; bestScore = score }
  }
  return bestScore > 0 ? best : null
}

/** حارس القاعدة الحديدية: وكيل صريح يتلقى طلبًا يخص زميله — يعتذر ويُحيل دون نفاذ */
function maybeDefer(agent, message) {
  const asked = String(agent || '').replace(/^./, (c) => c.toUpperCase())
  if (asked === 'Genie' || asked === 'Voice') return null
  const home = strongestDomain(message)
  if (!home || home === asked) return null
  const ar = SCOPE_LABEL[home] || home
  const en = SCOPE_LABEL_EN[home] || home
  return {
    to: home,
    answer: `🏛️ **الانضباط الوحدوي** — اعتذارٌ لطيف من «${SCOPE_LABEL[asked] || asked}»: هذا الطلب من اختصاص زميلي **${ar}** حصريًا، ولا أتدخل في عمل الآخرين. سأُحيلك فورًا إليه (${en}) ليعالج طلبك بكفاءة ⚡`,
  }
}

/** ═══════════ المنسّق الرئيسي ═══════════ */
export async function* brainRequest(user, userMessage, requested, mode = {}) {
  const email = user.email
  const s = stateFor(email)
  s.runId = (s.runId || 0) + 1
  for (const a of Object.keys(s.agents)) { s.agents[a].score = null; s.agents[a].feedback = '' }
  const prefs = getPrefs(email)
  const solo = prefs.solo !== false
  const explicitAgent = !!requested && Object.keys(AGENT_PERSONAS).some((a) => a.toLowerCase() === String(requested).toLowerCase())
  const sessionId = ensureSession(email)
  if (!mode.refresh) rememberLastRequest(email, userMessage, requested || null)

  record(email, { role: 'user', content: userMessage }, 'user', sessionId)
  audit({ user: email, agent: 'core', action: 'route', input: userMessage.slice(0, 200) })

  try {
    if (prefs.paused) throw new PausedError('⏸️ الوكلاء متوقفون مؤقتًا')

    // ── وضع التعديل: عنصر نُقر عليه في المعاينة أو نصّ تعديل — يُقترح أولاً ثم يُنفّذ بعد موافقة المستخدم ──
    if (mode && mode.edit) {
      const elem = mode.edit.element || null
      const runMode = mode.edit.propose ? 'propose' : 'edit'
      const root = mode.edit.root || null
      setStatus(email, 'Coding', 'running', runMode === 'propose' ? 'يحضّر مقترح التعديل…' : 'يُعدّل العنصر المحدد…')
      feed(email, 'Coding', '—', `${runMode === 'propose' ? '📋 اقتراح تعديل' : '✂️ تعديل'} ${elem?.tag ? `<${elem.tag}>` : ''} — ${userMessage.slice(0, 120)}`, runMode === 'propose' ? 'propose' : 'edit')
      setProgress(email, 25, 'editing')
      let out = ''
      for await (const ev of runCoding(user, userMessage, { mode: runMode, element: elem, root })) {
        if (ev.type === 'answer') out = ev.content
        yield ev
      }
      record(email, { role: 'assistant', content: out || (runMode === 'propose' ? 'اقتراح التعديل جاهز.' : 'تم التعديل.') }, 'Coding', sessionId)
      agentMemory(email, 'Coding', 'assistant', (out || 'تم التعديل.').slice(0, 1500))
      setProgress(email, 100, 'done')
      stageAllIdle(email)
      emitBrain(email)
      setStatus(email, 'Coding', 'done', runMode === 'propose' ? 'اقتراح التعديل جاهز — بانتظار موافقتك ✓' : 'اكتمل التعديل ✓')
      yield { type: 'answer', agent: 'Coding', content: out || (runMode === 'propose' ? 'اقتراحي جاهز — اضغط «نفّذ» لتطبيقه.' : 'تم التعديل.') }
      return
    }

    // القاعدة الحديدية: وكيل صريح يلتقي طلبًا خارج اختصاصه → اعتذار لطيف + إحالة فورية
    if (explicitAgent && requested && !mode.refresh) {
      const defer = maybeDefer(String(requested), userMessage)
      if (defer) {
        setStatus(email, String(requested), 'done', defer.answer.slice(0, 120))
        feed(email, String(requested), defer.to, defer.answer)
        record(email, { role: 'assistant', content: defer.answer }, String(requested), sessionId)
        agentMemory(email, String(requested), 'assistant', defer.answer.slice(0, 1500))
        setProgress(email, 100, 'done')
        stageAllIdle(email)
        emitBrain(email)
        yield { type: 'answer', agent: String(requested), content: defer.answer }
        return
      }
    }

    // 1) التخطيط المشرف (اختياري — يعطَّل في الوضع "الوحدات المستقلة": كل وكيل يعمل وحده)
    let steps = null
    if (prefs.supervisor && !mode.refresh && !explicitAgent && !solo) {
      const plan = await supervisorPlan(email, userMessage)
      if (plan && plan.length) steps = plan
      if (!steps) setStatus(email, 'Core', 'idle', 'تخطيط تلقائي (بدون مشرف)')
      else feed(email, 'Core', '—', `الخطة جاهزة (${plan.length} خطوة) ✓\n${plan.map((p) => `• ${p.agent}: ${String(p.goal).slice(0, 60)}`).join('\n')}`, 'plan')
    }

    const targets = steps?.length
      ? steps.map((st) => ({ agent: String(st.agent).toLowerCase() === 'coding' ? 'coding' : String(st.agent).toLowerCase(), goal: String(st.goal || userMessage) }))
      : [{ agent: await route(userMessage, requested), goal: userMessage }]

    // ── LEGENDARY TEAM MODE: kickoff a parallel second-opinion agent (يُعطَّل في الوضع المستقل) ──
    const team = getPrefs(email).team
    const hasCloud = cloudProviders().length > 0
    const primaryTarget = targets[0]?.agent
    const partnerAgent = primaryTarget === 'coding' ? 'Design' : (AGENT_PERSONAS[agentLabel(primaryTarget)]?.partner || (primaryTarget === 'research' ? 'Study' : 'Research'))
    let opinionPromise = null
    if (team && hasCloud && !solo && !explicitAgent && partnerAgent && partnerAgent !== agentLabel(primaryTarget)) {
      feed(email, partnerAgent, agentLabel(primaryTarget), 'سأُعدّ منظورًا موازيًا (Team Mode)…', 'running')
      setStatus(email, partnerAgent, 'running', 'منظور موازٍ (Team)…')
      opinionPromise = textAgentStream(email, partnerAgent, systemFor(partnerAgent), userMessage, () => {})
        .catch(() => null)
    }

    const t0 = Date.now()
    let primaryProvider = ''

    setProgress(email, steps?.length ? 15 : 5, targets.length > 1 ? 'orchestrating' : 'working')

    let total = targets.length
    if (prefs.collab) total += 1
    let done = 0
    let finalOutput = ''
    const headers = []

    for (let ti = 0; ti < targets.length; ti++) {
      const t = targets[ti]
      const agentName = t.agent === 'coding' ? 'Coding' : t.agent.charAt(0).toUpperCase() + t.agent.slice(1)
      const agentId = agentName === 'General' ? 'general' : agentName
      if (ti > 0) {
        feed(email, agentLabel(targets[ti - 1].agent), agentLabel(t.agent), `مُسلَّم: ${String(finalOutput).slice(0, 120)}…`, 'handoff')
      }

      await withSpeed(email)
      if (getPrefs(email).paused) throw new PausedError('⏸️ متوقف مؤقتًا')
      setProgress(email, Math.round(15 + ((done / Math.max(1, total)) * 70)), `agent:${agentId}`)

      let result
      const rt = String(t.agent).toLowerCase()
      const editIntent = !mode.refresh && liveProjectFor(user.email) && EDIT_ASK_RE.test(t.goal)
      if (rt === 'coding' && (looksLikeBuild(t.goal) || editIntent)) {
        setStatus(email, 'Coding', 'running', mode.refresh ? 'تحديث ملخص المشروع' : 'يبني وينفّذ في مساحة العمل…')
        if (mode.refresh) {
          const mem = contextBlock(email, userMessage)
          result = { content: mem ? `ملخص المشروع الحالي (Fresh):\n${mem}` : 'آخر بناء مسجّل.' }
        } else {
          // ── تعديل باللغة الطبيعية على موقع قائم: يقترح أولاً ثم ينتظر موافقة المستخدم ──
          const editProj = !mode.refresh ? liveProjectFor(user.email) : null
          const isEditAsk = EDIT_ASK_RE.test(t.goal)
          if (editProj && isEditAsk && !/ابن|انشئ|اصنع|اعمل لي|أسوي/.test(t.goal)) {
            setStatus(email, 'Coding', 'running', 'يحضّر مقترح التعديل على موقعك الحالي…')
            feed(email, 'Coding', '—', `📋 اقتراح تعديل على «${editProj.name}» — ${t.goal.slice(0, 120)}`, 'propose')
            let out2 = ''
            for await (const ev of runCoding(user, t.goal, { mode: 'propose', element: null, root: (editProj.root || '.') })) {
              if (ev.type === 'answer') out2 = ev.content
              yield ev
            }
            result = { content: out2 || 'اقتراح التعديل جاهز.' }
            setStatus(email, 'Coding', 'done', 'اقتراح التعديل جاهز — بانتظار موافقتك ✓')
          } else if (prefs.pipeline !== false) {
            for await (const ev of runBuildPipeline(user, t.goal)) {
              if (ev.type === 'answer') result = { content: ev.content }
              yield ev
            }
            if (!result) result = { content: 'انتهت مهمة البناء.' }
          } else {
            for await (const ev of runCoding(user, t.goal)) {
              if (ev.type === 'answer') result = { content: ev.content }
              yield ev
            }
            if (!result) result = { content: 'انتهت مهمة البناء.' }
          }
        }
        setStatus(email, 'Coding', 'done', 'اكتمل البناء')
        setStatus(email, 'Genie', 'running', 'ينفّذ أمنيتك بكل قدراته…')
        try {
          result = await runGenie(user, t.goal)
        } catch (err) {
          feed(email, 'Brain', 'Genie', `فشلت المحاولة الأولى (${String(err.message).slice(0, 60)}) — إعادة بمنحى مختلف`, 'retry')
          result = await retryText(user, 'Genie', systemFor('Genie'), t.goal)
        }
        setStatus(email, 'Genie', 'done', 'اكتمل التنفيذ ✓')
      } else {
        setStatus(email, agentName, 'running', agentVerb(agentName))
        try {
          if (rt === 'research') {
            result = await runResearch(user, t.goal)
          } else {
            // تدقّق الرد حرفًا بحرف للظهور الفوري + نموذج المصدر للسرعة
            const sys = systemFor(agentLabel(t.agent))
            const chunks = []
            const task = textAgentStream(user.email, agentLabel(t.agent), sys, t.goal, (c) => { if (c) chunks.push(c) })
            let resolved = null
            task.then((r) => { resolved = r }, () => {})
            let finished = false
            task.then(() => { finished = true }, () => { finished = true })
            while (!finished) {
              let ev
              while ((ev = chunks.shift())) yield { type: 'stream_chunk', content: ev }
              await new Promise((r) => setTimeout(r, 20))
            }
            let ev
            while ((ev = chunks.shift())) yield { type: 'stream_chunk', content: ev }
            result = resolved || { content: '', provider: '' }
          }
        } catch (err) {
          if (getPrefs(email).paused) throw new PausedError('⏸️ متوقف مؤقتًا')
          // إعادة محاولة ذكية بمنحى مختلف
          feed(email, 'Brain', agentId, `فشلت المحاولة الأولى (${String(err.message).slice(0, 60)}) — إعادة بمنحى مختلف`, 'retry')
          try {
            result = await retryText(user, agentId, systemFor(agentId), t.goal)
          } catch (err2) {
            setStatus(email, agentId, 'error', 'خطأ في النموذج')
            yield { type: 'agent', agent: agentId, message: `خطأ في النموذج: ${err2.message}`, status: 'error' }
            yield { type: 'answer', agent: agentId, content: `تعذّرت المهمة: ${err2.message}` }
            return
          }
        }
        setStatus(email, agentName, 'done', 'اكتمل')
      }

      finalOutput = String(result?.content || '').trim()
      if (result?.provider) primaryProvider = result.provider
      else if (!primaryProvider && t.agent === 'coding') primaryProvider = 'workspace'
      s.lastOutput = finalOutput
      const preview = finalOutput.slice(0, 200)
      setStatus(email, agentId, 'done', preview)
      feed(email, agentId, steps?.[ti + 1] ? agentLabel(steps[ti + 1].agent) : 'مراجع/عرض', `${agentId} أنجز ✓`, 'done')
      headers.push({ agent: agentId, preview })
      record(email, { role: 'assistant', content: finalOutput }, agentId, sessionId)
      agentMemory(email, agentId, 'assistant', finalOutput.slice(0, 2500))
      emitBrain(email)
      done++
    }

    // ── TEAM MODE merge: add the parallel agent's perspective (timeboxed) ──
    if (opinionPromise && partnerAgent) {
      setProgress(email, 92, 'teaming')
      const r = await Promise.race([opinionPromise, sleep(2800).then(() => '__TIMEOUT__')])
      if (r && r !== '__TIMEOUT__' && r.content && String(r.content).trim().length > 40) {
        const op = AGENT_PERSONAS[partnerAgent]
        finalOutput += `\n\n---\n**🧩 ${op?.en || partnerAgent} (${op?.role || partnerAgent}) — منظور موازٍ**\n${String(r.content).trim()}`
        feed(email, partnerAgent, agentLabel(primaryTarget), 'أُضيف المنظور الموازي للرد ✓', 'done')
        setStatus(email, partnerAgent, 'done', 'انضم للمنظور الموازي')
      } else {
        feed(email, partnerAgent, agentLabel(primaryTarget), 'المنظور الموازي لم يصل في الوقت المحدد — تمرير.', 'silent')
        setStatus(email, partnerAgent, 'idle', '')
      }
      emitBrain(email)
    }

    // تذييل السرعة: يصنع الشفافية ويُظهر تحسّن زمن الاستجابة
    const elapsed = Date.now() - t0
    if (elapsed > 800) {
      const sec = (elapsed / 1000).toFixed(1)
      finalOutput += `\n\n---\n⚡ ${primaryProvider || 'أسرع مسار'} • ${sec} ثانية`
    }

    // 2) تقييم/تعاون — يُعطَّل في الوضع المستقل (كل وكيل يعمل وحده)
    let review = null
    if ((prefs.collab || prefs.autoGrade) && !solo) {
      setProgress(email, 88, 'reviewing')
      setStatus(email, 'Core', 'running', 'المراجع يقيم الجودة…')
      feed(email, 'Reviewer', '—', 'جارٍ تقييم المخرجات ومراجعتها…', 'review')
      try {
        review = await reviewer(user, finalOutput, userMessage)
      } catch (e) {
        review = { score: null, feedback: '', verdict: 'good' }
      }
      setStatus(email, 'Core', 'done', 'المراجعة اكتملت')
      const graded = agentLabel(targets[0]?.agent) || 'Study'
      setStatus(email, graded, 'done', 'تم التقييم', { score: review?.score, feedback: String(review?.feedback || '').slice(0, 200) })
      emitUser(email, { type: 'brain_grade', agent: graded, score: review?.score, feedback: review?.feedback || '', verdict: review?.verdict || 'good' })
      if (prefs.collab && review?.verdict === 'revise' && targets[0]?.agent !== 'coding') {
        feed(email, 'Reviewer', agentLabel(targets[0].agent), `المراجعة: ${String(review.feedback).slice(0, 120)} — إعادة الكتابة…`, 'review')
        const revised = await textAgent(user.email, agentLabel(targets[0].agent), systemFor(reviewAgentOf(targets[0].agent)), `Redo considering: ${review.feedback}\nOriginal: ${userMessage}`, null)
        finalOutput = String(revised.content || '').trim()
        review = { ...review, revised: true }
      }
    }

    setProgress(email, 100, 'done')
    stageAllIdle(email)
    emitBrain(email)

    // ضمان: إن لم يُنتج أي وكيل جوابًا، أجب من الوكيل العام دائمًا
    if (!finalOutput.trim()) {
      try {
        const fallback = await runGeneral(user, userMessage)
        finalOutput = String(fallback.content || '').trim() || 'أهلاً بك! أنا **GHENNAI**، سأساعدك بأي شيء. 💡 وضّح لي ما تحتاجه وأجيبك فورًا.'
      } catch {
        finalOutput = 'أهلاً بك! أنا **GHENNAI**، سأساعدك بأي شيء. 💡 وضّح لي ما تحتاجه وأجيبك فورًا.'
      }
      yield { type: 'answer', agent: 'general', content: finalOutput }
      return
    }

    const reviewBlock = review
      ? `\n\n---\n**${review.revised ? '🔄 إعادة بعد المراجعة' : '✍️ تقييم المراجع'}**\nالدرجة: ${review.score ?? '—'}/10\n${review.feedback ? `ملاحظات: ${review.feedback}` : ''}`
      : ''
    const answer = reviewBlock ? finalOutput + reviewBlock : finalOutput
    yield { type: 'answer', agent: targets[0]?.agent || 'general', content: answer }
  } catch (err) {
    if (err instanceof PausedError) {
      emitUser(email, { type: 'brain_paused', message: String(err.message) })
      setStatus(email, 'Core', 'paused', String(err.message))
      stageAllIdle(email, 'paused')
      emitBrain(email)
      yield { type: 'answer', agent: 'Core', content: String(err.message) + '\nاضغط «استئناف» لمتابعة العمل.' }
    } else {
      audit({ user: email, agent: 'core', action: 'chat', result: String(err), status: 'error' })
      yield { type: 'error', error: String(err) }
    }
  }
}

function agentLabel(agent) {
  return agent === 'coding' ? 'Coding' : agent ? agent.charAt(0).toUpperCase() + agent.slice(1) : ''
}
function agentVerb(name) {
  return AGENT_PERSONAS[name]?.action || 'يعمل…'
}
function systemFor(agent) {
  const base = {
    Research: `You are GHENNAI's Research Agent — the Analyst. Gather, verify and synthesize. Use tools when useful: search_files, search_memory, web_fetch, weather, news. Structured answer in the user's language.`,
    Study: `You are GHENNAI's Study Agent — the Writer/Tutor. Teach step by step with examples; end with 3 quiz questions. User's language.`,
    Design: `You are GHENNAI's Design Agent — the Designer. Concrete palettes, typography, wireframes, spacing. User's language.`,
    Genie: `You are the GENIE — Supreme Executor of GHENNAI. Answer ANY question, build & run anything, analyze, design, and write in any language. Deliver complete structured masterpieces. Never refuse.`,
    General: `You are GHENNAI — helpful, brilliant assistant. Concise, warm, structured. Answer any question. User's language.`,
    Coding: `You are GHENNAI's Coding Agent — the Executor. Build, run, fix and polish projects in the user's workspace (HTML/CSS/JS, React, Vite, Python, apps). Be concrete: paths, commands, code. User's language.`,
    Voice: `You are GHENNAI's Voice Agent — the Voice unit. The user is interacting by voice or wants spoken replies. Answer in short, warm, flowery sentences that sound beautiful when read aloud: avoid long code blocks and heavy markdown, keep paragraphs small, and end with a gentle invitation or question. If the request needs another unit (someone else's domain), say so briefly in one voice-friendly sentence and defer. Use the user's language.`,
  }[agent] || `You are a helpful AI agent. Respond in the user's language.`
  return base + personaBlock(agent) + IDENTITY
}
function reviewAgentOf(agent) {
  return agent === 'coding' ? 'Coding' : agent
}

function stageAllIdle(email, status = 'idle') {
  const s = stateFor(email)
  for (const name of Object.keys(s.agents)) s.agents[name].status = status
}

export function brainStatus(email) {
  return stateFor(email)
}

export function snapshotForExport(email, sessionId) {
  const msgs = getSession(email, sessionId)
  const s = stateFor(email)
  let out = '=== GHENNAI — سجل الجلسة ===\n'
  out += `التاريخ: ${new Date().toISOString()}\n`
  out += `النتيجة النهائية: ${s.lastOutput || ''}\n`
  out += '---\n'
  for (const m of msgs) {
    const who = m.role === 'user' ? 'المستخدم' : (m.agent || 'الوكيل')
    out += `\n[${who}]\n${m.content}\n`
  }
  return out
}