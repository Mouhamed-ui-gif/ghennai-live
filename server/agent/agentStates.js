/**
 * الحالات الرسمية للـAgent — القسم 13 من المواصفة.
 * أي انتقال غير مذكور في TRANSITIONS مرفوض صراحةً (لا حالات وهمية).
 */
export const AGENT_STATES = Object.freeze([
  'IDLE',
  'THINKING',
  'PLANNING',
  'READING',
  'SEARCHING',
  'EDITING',
  'EXECUTING',
  'WAITING_APPROVAL',
  'TESTING',
  'VERIFYING',
  'ERROR',
  'RETRYING',
  'COMPLETED',
  'CANCELLED',
])

const TERMINAL = new Set(['COMPLETED', 'CANCELLED'])

const TRANSITIONS = Object.freeze({
  IDLE: ['THINKING', 'PLANNING'],
  THINKING: ['PLANNING', 'READING', 'SEARCHING', 'EXECUTING', 'ERROR', 'CANCELLED', 'COMPLETED'],
  PLANNING: ['READING', 'SEARCHING', 'EDITING', 'EXECUTING', 'WAITING_APPROVAL', 'ERROR', 'CANCELLED', 'COMPLETED'],
  READING: ['SEARCHING', 'PLANNING', 'EDITING', 'EXECUTING', 'ERROR', 'CANCELLED'],
  SEARCHING: ['READING', 'PLANNING', 'EDITING', 'EXECUTING', 'ERROR', 'CANCELLED'],
  EDITING: ['EXECUTING', 'TESTING', 'VERIFYING', 'READING', 'WAITING_APPROVAL', 'ERROR', 'CANCELLED'],
  EXECUTING: ['TESTING', 'VERIFYING', 'EDITING', 'READING', 'WAITING_APPROVAL', 'ERROR', 'CANCELLED'],
  WAITING_APPROVAL: ['EXECUTING', 'EDITING', 'CANCELLED', 'ERROR'],
  TESTING: ['VERIFYING', 'EDITING', 'EXECUTING', 'ERROR', 'CANCELLED'],
  VERIFYING: ['COMPLETED', 'EDITING', 'EXECUTING', 'ERROR', 'CANCELLED'],
  ERROR: ['RETRYING', 'EDITING', 'EXECUTING', 'CANCELLED', 'IDLE'],
  RETRYING: ['READING', 'EDITING', 'EXECUTING', 'TESTING', 'ERROR', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['IDLE'],
})

export function isValidState(s) {
  return AGENT_STATES.includes(s)
}

export function isTerminalState(s) {
  return TERMINAL.has(s)
}

export function isValidTransition(from, to) {
  if (!isValidState(from) || !isValidState(to)) return false
  return (TRANSITIONS[from] || []).includes(to)
}

export function assertTransition(from, to) {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid agent transition: ${from} -> ${to}`)
  }
}
