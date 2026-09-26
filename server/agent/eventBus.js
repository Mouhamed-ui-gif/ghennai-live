/**
 * EventBus موحّد — القسم 27 من المواصفة.
 * كل حدث يحمل envelope صارم: { type, taskId, timestamp, ...data }.
 * النقل يتم عبر قناة SSE الحقيقية (lib/events.js) — لا أحداث وهمية.
 */
import { emitUser } from '../lib/events.js'
import { isValidState } from './agentStates.js'

export const EVENT_TYPES = Object.freeze([
  'agent.message',
  'agent.state',
  'agent.thought',
  'tool.started',
  'tool.output',
  'file.created',
  'file.modified',
  'file.deleted',
  'command.started',
  'command.output',
  'command.finished',
  'approval.required',
  'approval.resolved',
  'error',
  'retry',
  'test.started',
  'test.finished',
  'plan.proposed',
  'plan.approved',
  'task.started',
  'task.completed',
  'task.cancelled',
])

const TASK_SCOPED = new Set([
  'agent.state',
  'tool.started',
  'tool.output',
  'file.created',
  'file.modified',
  'file.deleted',
  'command.started',
  'command.output',
  'command.finished',
  'approval.required',
  'approval.resolved',
  'error',
  'retry',
  'test.started',
  'test.finished',
  'plan.proposed',
  'plan.approved',
  'task.completed',
  'task.cancelled',
])

export function isValidEventType(t) {
  return EVENT_TYPES.includes(t)
}

/**
 * إصدار حدث مهيكل. يرمي خطأً عند نوع غير معروف أو غياب taskId لحدث
 * مرتبط بمهمة — حتى لا تُبث أحداث مجهولة للواجهة أبدًا.
 */
export function emit(email, event) {
  if (!event || typeof event !== 'object') throw new Error('event must be an object')
  if (!isValidEventType(event.type)) throw new Error(`Unknown event type: ${event.type}`)
  if (TASK_SCOPED.has(event.type) && !event.taskId) {
    throw new Error(`Event ${event.type} requires taskId`)
  }
  const payload = { ...event, timestamp: new Date().toISOString() }
  emitUser(email, payload)
  return payload
}

export function emitState(email, taskId, state, detail = null) {
  if (!isValidState(state)) throw new Error(`Unknown agent state: ${state}`)
  return emit(email, { type: 'agent.state', taskId, state, detail })
}

export function emitMessage(email, { taskId = null, agent = 'Ghennai', message, status = 'info' }) {
  return emit(email, { type: 'agent.message', taskId, agent, message, status })
}
