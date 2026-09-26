/**
 * ProviderManager — سجل المزودين + التوجيه حسب القدرات (القسم 17).
 * القرار مبني على capabilities + فحص صحة حي، وليس أسماء مكتوبة يدويًا في الواجهة.
 */
import { OllamaProvider } from './ollamaProvider.js'
import { OpenCodeAdapter } from './opencodeAdapter.js'
import { CodexAdapter } from './codexAdapter.js'
import { ClaudeAdapter } from './claudeAdapter.js'
import { CrushAdapter } from './crushAdapter.js'

const adapters = new Map()
let detectCache = null
let detectCacheAt = 0
const DETECT_TTL_MS = 30000

export function register(adapter) {
  if (!adapter || !adapter.name) throw new Error('adapter with name required')
  adapters.set(adapter.name, adapter)
  detectCache = null
  return adapter
}

export function get(name) {
  return adapters.get(name) || null
}

export function list() {
  return [...adapters.values()]
}

export function clearAll() {
  adapters.clear()
  detectCache = null
}

/** كشف التوفر لجميع المزودين (نتيجة حقيقية، مخزنة 30 ثانية فقط). */
export async function detectAll({ force = false } = {}) {
  const now = Date.now()
  if (!force && detectCache && now - detectCacheAt < DETECT_TTL_MS) return detectCache
  const out = []
  for (const a of adapters.values()) {
    try {
      const d = await a.detect()
      out.push({ name: a.name, kind: a.kind, capabilities: a.capabilities, ...d })
    } catch (e) {
      out.push({ name: a.name, kind: a.kind, capabilities: a.capabilities, available: false, reason: String(e?.message || e) })
    }
  }
  detectCache = out
  detectCacheAt = now
  return out
}

/** فحص صحة حي لجميع المزودين (لا كاش — يُستدعى عند الطلب). */
export async function healthAll() {
  const out = []
  for (const a of adapters.values()) {
    try {
      out.push(await a.healthCheck())
    } catch (e) {
      out.push({ name: a.name, kind: a.kind, healthy: false, error: String(e?.message || e), capabilities: a.capabilities, checkedAt: new Date().toISOString() })
    }
  }
  return out
}

/**
 * التوجيه حسب القدرة: أول مزوّد سليم يحمل القدرة المطلوبة.
 * prefer: اسم مزوّد مفضل اختياري (يُستخدم فقط إن كان سليمًا ويحمل القدرة).
 */
export async function route({ capability, prefer = null }) {
  if (!capability) throw new Error('capability required')
  const candidates = [...adapters.values()].filter((a) => a.capable(capability))
  if (!candidates.length) return { ok: false, error: `no provider with capability: ${capability}` }
  const ordered = prefer
    ? [...candidates.filter((a) => a.name === prefer), ...candidates.filter((a) => a.name !== prefer)]
    : candidates
  for (const a of ordered) {
    try {
      const h = await a.healthCheck()
      if (h.healthy) return { ok: true, provider: a, health: h }
    } catch { /* جرّب التالي — الفشل هنا حقيقي ويُتجاوز للمزوّد التالي */ }
  }
  return { ok: false, error: `no healthy provider with capability: ${capability}` }
}

export function status() {
  return list().map((a) => ({ name: a.name, kind: a.kind, capabilities: a.capabilities }))
}

// التسجيل الافتراضي — إضافة GenericCLI/API/MCP لاحقًا بنفس الدالة دون تعديل النظام.
register(new OllamaProvider())
register(new OpenCodeAdapter())
register(new CodexAdapter())
register(new ClaudeAdapter())
register(new CrushAdapter())
