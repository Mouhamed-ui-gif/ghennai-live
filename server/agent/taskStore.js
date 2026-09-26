/**
 * TaskStore — سجل المهام والخط الزمني (الأقسام 24 + 33 من المواصفة).
 * كل مهمة: id, sessionId, userEmail, goal, mode (PLAN|BUILD), state,
 * provider, steps[] (timeline), filesChanged[], commands[], errors, retries.
 */
import { randomUUID } from 'node:crypto'
import { assertTransition, isTerminalState } from './agentStates.js'

const tasks = new Map() // id -> task
let seq = 0

export const TASK_MODES = Object.freeze(['PLAN', 'BUILD'])

function now() {
  return new Date().toISOString()
}

function newId() {
  seq += 1
  return `task-${Date.now().toString(36)}-${seq.toString(36)}-${randomUUID().slice(0, 6)}`
}

export function createTask({ userEmail, goal, mode = 'PLAN', sessionId = null, provider = null }) {
  if (!userEmail) throw new Error('userEmail required')
  if (!goal || !String(goal).trim()) throw new Error('goal required')
  if (!TASK_MODES.includes(mode)) throw new Error(`mode must be PLAN|BUILD, got ${mode}`)
  const id = newId()
  const task = {
    id,
    userEmail,
    goal: String(goal),
    mode,
    sessionId,
    provider,
    state: 'IDLE',
    steps: [{ ts: now(), kind: 'created', message: `Task created in ${mode} mode`, data: { mode } }],
    filesChanged: [],
    commands: [],
    errors: [],
    retries: 0,
    result: null,
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    endedAt: null,
  }
  tasks.set(id, task)
  return task
}

export function getTask(id) {
  return tasks.get(id) || null
}

export function listTasksByUser(email, limit = 50) {
  return [...tasks.values()]
    .filter((t) => t.userEmail === email)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
}

export function transitionTask(id, to, detail = null) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  assertTransition(t.state, to)
  const from = t.state
  t.state = to
  if (!t.startedAt && to !== 'IDLE') t.startedAt = now()
  if (isTerminalState(to)) t.endedAt = now()
  t.updatedAt = now()
  t.steps.push({ ts: now(), kind: 'state', message: `${from} -> ${to}`, data: { from, to, detail } })
  return t
}

export function addStep(id, { kind = 'info', message, data = null }) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  if (!message) throw new Error('step message required')
  t.steps.push({ ts: now(), kind, message: String(message), data })
  t.updatedAt = now()
  return t
}

export function recordFile(id, path, action) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  if (!['created', 'modified', 'deleted'].includes(action)) throw new Error(`bad file action: ${action}`)
  t.filesChanged.push({ path, action, ts: now() })
  t.updatedAt = now()
  return t
}

export function recordCommand(id, command, code) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  t.commands.push({ command: String(command).slice(0, 500), code, ts: now() })
  t.updatedAt = now()
  return t
}

export function recordError(id, error, file = null) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  t.errors.push({ error: String(error).slice(0, 2000), file, ts: now() })
  t.updatedAt = now()
  return t
}

export function recordRetry(id) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  t.retries += 1
  t.updatedAt = now()
  return t
}

export function completeTask(id, result = null) {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  assertTransition(t.state, 'COMPLETED')
  t.state = 'COMPLETED'
  t.result = result
  t.endedAt = now()
  t.updatedAt = now()
  t.steps.push({ ts: now(), kind: 'completed', message: 'Task completed', data: { result } })
  return t
}

export function cancelTask(id, reason = 'cancelled by user') {
  const t = tasks.get(id)
  if (!t) throw new Error(`task not found: ${id}`)
  assertTransition(t.state, 'CANCELLED')
  t.state = 'CANCELLED'
  t.endedAt = now()
  t.updatedAt = now()
  t.steps.push({ ts: now(), kind: 'cancelled', message: String(reason) })
  return t
}

export function taskSummary(t) {
  return {
    id: t.id,
    goal: t.goal,
    mode: t.mode,
    state: t.state,
    provider: t.provider,
    steps: t.steps.length,
    filesChanged: t.filesChanged.length,
    commands: t.commands.length,
    errors: t.errors.length,
    retries: t.retries,
    createdAt: t.createdAt,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
  }
}
