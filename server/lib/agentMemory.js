import { Memory } from './db.js'

const WINDOW = 8

/** الذاكرة المؤقتة لكل وكيل خلال الجلسة (نافذة سياق دوّارة) */
export function agentMemory(email, agent, role, content) {
  try {
    const key = 'ctx'
    const prev = Memory.search({ scope: `agent_ctx`, user_email: email, limit: 200 }).filter((r) => r.key === `ctx:${agent}`)
    let msgs = []
    if (prev.length) {
      try { msgs = Array.isArray(prev[0].value) ? prev[0].value : [prev[0].value] } catch { msgs = [] }
    }
    msgs.push({ role, content: String(content).slice(0, 2000), ts: Date.now() })
    if (msgs.length > WINDOW) msgs = msgs.slice(-WINDOW)
    Memory.put({ scope: 'agent_ctx', user_email: email, key: `ctx:${agent}`, value: msgs })
  } catch { /* noop */ }
}

export function agentMemoryBlock(email, agent) {
  try {
    const prev = Memory.search({ scope: 'agent_ctx', user_email: email, limit: 50 }).filter((r) => r.key === `ctx:${agent}`)
    if (!prev.length) return ''
    const msgs = Array.isArray(prev[0].value) ? prev[0].value : [prev[0].value]
    if (!msgs.length) return ''
    const block = msgs
      .slice(-4)
      .map((m) => `[${m.role === 'user' ? 'المستخدم' : agent}]: ${String(m.content).slice(0, 400)}`)
      .join('\n')
    return block ? `\n\n[Session memory for the "${agent}" agent — recent conversation within this session]:\n${block}` : ''
  } catch {
    return ''
  }
}

/** آخر طلب للمستخدم (لإعادة التشغيل الدوري) */
export function rememberLastRequest(email, message, agent) {
  try {
    Memory.put({ scope: 'last_request', user_email: email, key: 'last', value: { message, agent, ts: Date.now() } })
  } catch { /* noop */ }
}

export function lastRequest(email) {
  try {
    const prev = Memory.search({ scope: 'last_request', user_email: email, limit: 1 })
    return prev.length ? prev[0].value : null
  } catch {
    return null
  }
}