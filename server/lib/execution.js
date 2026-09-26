import { emitUser } from './events.js'

/**
 * سجل التنفيذ الحي — يربط كل مستخدم بوحدة تحكم الإيقاف الحالية.
 * زر Stop في الواجهة يُجهض التنفيذ الحقيقي (حلقة الـAgent + العملية الفرعية).
 */
const runs = new Map() // email -> { controller, label, startedAt }

export function registerRun(email, label = 'agent') {
  try { runs.get(email)?.controller?.abort('superseded') } catch { /* single-flight: الأحدث يلغي الأقدم */ }
  const controller = new AbortController()
  runs.set(email, { controller, label, startedAt: Date.now() })
  emitUser(email, { type: 'agent_state', state: 'EXECUTING', label })
  return controller
}

export function completeRun(email, state = 'IDLE') {
  runs.delete(email)
  emitUser(email, { type: 'agent_state', state })
}

export function stopRun(email, reason = 'أوقف المستخدم التنفيذ') {
  const run = runs.get(email)
  if (!run) return { ok: false, error: 'لا يوجد تنفيذ نشط' }
  try { run.controller.abort('user-stop') } catch { /* noop */ }
  runs.delete(email)
  emitUser(email, { type: 'agent_state', state: 'STOPPED', reason })
  emitUser(email, { type: 'agent', agent: 'Core', message: `⏹️ ${reason}`, status: 'stopped' })
  return { ok: true, stopped: run.label }
}

export function isRunning(email) {
  return runs.has(email)
}

export function runSignal(email) {
  return runs.get(email)?.controller?.signal || null
}

/** ربط وحدة تحكم خارجية (مثل AbortController لمسار الشات) بسجل التنفيذ */
export function attachRun(email, controller, label = 'agent') {
  try { runs.get(email)?.controller?.abort('superseded') } catch { /* single-flight */ }
  runs.set(email, { controller, label, startedAt: Date.now() })
  emitUser(email, { type: 'agent_state', state: 'EXECUTING', label })
}

export function detachRun(email, state = 'IDLE') {
  if (!runs.has(email)) return
  runs.delete(email)
  emitUser(email, { type: 'agent_state', state })
}
