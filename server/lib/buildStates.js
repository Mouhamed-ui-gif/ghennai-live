/**
 * آلة حالة البناء (§11): تتبع كل بناء موقع عبر حالات صريحة مع أدلة.
 * ANALYZING → PLANNING → DESIGNING → SCAFFOLDING → BUILDING → RUNNING →
 * TESTING → VISUAL_REVIEW → REPAIRING → FINAL_VERIFY → COMPLETED | FAILED | PAUSED
 * تُبث مراحل حقيقية للواجهة (build_stage) — لا نسب وهمية.
 */
import { emitUser } from './events.js'

const STATES = ['ANALYZING', 'PLANNING', 'DESIGNING', 'SCAFFOLDING', 'BUILDING', 'RUNNING', 'TESTING', 'VISUAL_REVIEW', 'REPAIRING', 'FINAL_VERIFY', 'COMPLETED', 'FAILED', 'PAUSED']
const TERMINAL = new Set(['COMPLETED', 'FAILED'])

/** المراحل العشر المعروضة للمستخدم — مشتقة من الحالات الحقيقية */
export const STAGE_LIST = [
  { id: 'understand', label: 'فهم الطلب', states: ['ANALYZING'] },
  { id: 'blueprint', label: 'إنشاء Blueprint', states: ['PLANNING'] },
  { id: 'identity', label: 'تصميم الهوية', states: ['DESIGNING'] },
  { id: 'files', label: 'إنشاء الملفات', states: ['SCAFFOLDING', 'BUILDING'] },
  { id: 'preview', label: 'تشغيل Preview', states: ['RUNNING'] },
  { id: 'test', label: 'اختبار الموقع', states: ['TESTING'] },
  { id: 'visual', label: 'مراجعة التصميم', states: ['VISUAL_REVIEW'] },
  { id: 'repair', label: 'إصلاح مشكلة', states: ['REPAIRING'] },
  { id: 'verify', label: 'التحقق النهائي', states: ['FINAL_VERIFY'] },
  { id: 'ready', label: 'الموقع جاهز', states: ['COMPLETED'] },
]

const builds = new Map() // `${email}::${root}` -> record
const keyOf = (email, root) => `${email}::${root || '.'}`

export function buildStateOf(stage) {
  return STATES.includes(stage) ? stage : null
}

export function beginBuild(email, root, blueprint = null) {
  const rec = {
    email, root: root || '.',
    state: 'ANALYZING',
    startedAt: Date.now(), finishedAt: null,
    durations: {}, lastAt: Date.now(),
    provider: null, model: null,
    toolCalls: 0, filesChanged: [], errors: [], retries: 0,
    validations: [], blueprint,
  }
  builds.set(keyOf(email, root), rec)
  emitStage(email, root, rec)
  return rec
}

export function transitionBuild(email, root, state, info = {}) {
  const k = keyOf(email, root)
  let rec = builds.get(k)
  if (!rec) rec = beginBuild(email, root)
  if (!buildStateOf(state)) return rec
  if (TERMINAL.has(rec.state)) return rec
  const now = Date.now()
  if (rec.state === state) {
    // نفس الحالة: حدّث المعلومات فقط دون إعادة بث
    if (info.provider) rec.provider = info.provider
    if (info.model) rec.model = info.model
    return rec
  }
  rec.durations[rec.state] = (rec.durations[rec.state] || 0) + (now - rec.lastAt)
  rec.lastAt = now
  rec.state = state
  if (info.provider) rec.provider = info.provider
  if (info.model) rec.model = info.model
  if (info.error) { rec.errors.push({ at: now, state, error: String(info.error).slice(0, 300) }) }
  if (info.retry) rec.retries += 1
  if (TERMINAL.has(state)) rec.finishedAt = now
  emitStage(email, root, rec)
  return rec
}

export function recordBuildTool(email, root, tool, file = null) {
  const rec = builds.get(keyOf(email, root))
  if (!rec) return
  rec.toolCalls += 1
  if (file && !rec.filesChanged.includes(file)) rec.filesChanged.push(file)
}

export function recordBuildValidation(email, root, name, results) {
  const rec = builds.get(keyOf(email, root))
  if (!rec) return
  const list = Array.isArray(results) ? results : []
  rec.validations.push({
    name, at: Date.now(),
    pass: list.filter((c) => c.ok).length, fail: list.filter((c) => !c.ok).length,
  })
}

export function getBuild(email, root) {
  return builds.get(keyOf(email, root)) || null
}

export function summarizeBuild(email, root) {
  const rec = builds.get(keyOf(email, root))
  if (!rec) return null
  return {
    state: rec.state, root: rec.root,
    durationMs: (rec.finishedAt || Date.now()) - rec.startedAt,
    durations: rec.durations,
    provider: rec.provider, model: rec.model,
    toolCalls: rec.toolCalls, filesChanged: rec.filesChanged,
    errors: rec.errors.slice(-5), retries: rec.retries,
    validations: rec.validations,
    stages: STAGE_LIST.map((s) => ({ id: s.id, label: s.label, status: stageStatus(rec.state, s) })),
  }
}

function stageStatus(current, stage) {
  if (current === 'FAILED') return stage.id === 'ready' ? 'failed' : (STAGE_LIST.findIndex((s) => s.states.includes(current)) >= STAGE_LIST.indexOf(stage) ? 'done' : 'idle')
  const curIdx = STAGE_LIST.findIndex((s) => s.states.includes(current))
  const myIdx = STAGE_LIST.indexOf(stage)
  if (current === 'COMPLETED') return 'done'
  if (myIdx < curIdx) return 'done'
  if (myIdx === curIdx) return 'active'
  return 'idle'
}

function emitStage(email, root, rec) {
  try {
    emitUser(email, {
      type: 'build_stage',
      root,
      state: rec.state,
      stages: STAGE_LIST.map((s) => ({ id: s.id, label: s.label, status: stageStatus(rec.state, s) })),
    })
  } catch { /* البث اختياري */ }
}
