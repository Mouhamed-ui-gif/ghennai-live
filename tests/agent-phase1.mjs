/**
 * اختبار تحقق Phase 1 — كل فحص ينفّذ شيئًا حقيقيًا:
 * كشف ثنائيات فعلية، أوامر حقيقية، ملفات حقيقية.
 * أي فشل → exit code 1. لا نجاحات مُدّعاة.
 */
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const results = []
function pass(name, detail = '') {
  results.push({ name, ok: true })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, err) {
  results.push({ name, ok: false })
  console.error(`FAIL  ${name}: ${err?.message || err}`)
  process.exitCode = 1
}
async function check(name, fn) {
  try {
    const detail = await fn()
    if (!process.exitCode) pass(name, detail || '')
  } catch (e) {
    fail(name, e)
  }
}

// 1. الحالات والانتقالات
await check('states: valid transition IDLE->THINKING', async () => {
  const { isValidTransition } = await import('../server/agent/agentStates.js')
  assert.strictEqual(isValidTransition('IDLE', 'THINKING'), true)
  return 'accepted'
})
await check('states: invalid transition IDLE->COMPLETED rejected', async () => {
  const { isValidTransition, assertTransition } = await import('../server/agent/agentStates.js')
  assert.strictEqual(isValidTransition('IDLE', 'COMPLETED'), false)
  assert.throws(() => assertTransition('IDLE', 'COMPLETED'), /Invalid agent transition/)
  return 'rejected as required'
})
await check('states: terminal COMPLETED has no outgoing', async () => {
  const { isValidTransition } = await import('../server/agent/agentStates.js')
  assert.strictEqual(isValidTransition('COMPLETED', 'IDLE'), false)
  return 'terminal enforced'
})

// 2. EventBus: الأنواع المجهولة تُرفض، الصحيحة تُبث
await check('eventBus: unknown type throws', async () => {
  const { emit } = await import('../server/agent/eventBus.js')
  assert.throws(() => emit('test@example.com', { type: 'fake.event' }), /Unknown event type/)
  return 'rejected'
})
await check('eventBus: task-scoped without taskId throws', async () => {
  const { emit } = await import('../server/agent/eventBus.js')
  assert.throws(() => emit('test@example.com', { type: 'command.started' }), /requires taskId/)
  return 'rejected'
})
await check('eventBus: valid emits carry ISO timestamp', async () => {
  const { emit } = await import('../server/agent/eventBus.js')
  const p = emit('test@example.com', { type: 'agent.message', message: 'hello-phase1' })
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(p.timestamp))
  return p.timestamp
})

// 3. TaskStore: دورة حياة كاملة
await check('taskStore: create/transition/steps/complete', async () => {
  const ts = await import('../server/agent/taskStore.js')
  const t = ts.createTask({ userEmail: 'phase1@test.local', goal: 'verify phase1', mode: 'PLAN' })
  assert.ok(t.id.startsWith('task-'))
  ts.transitionTask(t.id, 'PLANNING')
  ts.addStep(t.id, { kind: 'info', message: 'test step' })
  ts.recordCommand(t.id, 'echo hi', 0)
  ts.recordError(t.id, 'sample error')
  ts.recordRetry(t.id)
  // VERIFYING لا يقبل الانتقال المباشر من PLANNING — يجب أن يرمي
  assert.throws(() => ts.transitionTask(t.id, 'VERIFYING'), /Invalid agent transition/)
  ts.transitionTask(t.id, 'EXECUTING')
  ts.transitionTask(t.id, 'VERIFYING')
  ts.completeTask(t.id, { ok: true })
  const got = ts.getTask(t.id)
  assert.strictEqual(got.state, 'COMPLETED')
  assert.ok(got.endedAt)
  return `${t.id} steps=${got.steps.length}`
})

// 4. الكشف الحقيقي عن الثنائيات
await check('detect: opencode binary really exists', async () => {
  const { whichBinary, binaryVersion } = await import('../server/agent/providers/detect.js')
  const w = await whichBinary('opencode')
  assert.strictEqual(w.found, true, 'opencode must be installed (verified earlier)')
  const v = await binaryVersion(w.path)
  assert.ok(v.ok && v.version.length > 0)
  return `${w.path} @ ${v.version}`
})
await check('detect: codex binary really exists', async () => {
  const { whichBinary, binaryVersion } = await import('../server/agent/providers/detect.js')
  const w = await whichBinary('codex')
  assert.strictEqual(w.found, true, 'codex must be installed (verified earlier)')
  const v = await binaryVersion(w.path)
  assert.ok(v.ok && v.version.length > 0)
  return `${w.path} @ ${v.version}`
})
await check('detect: bogus binary honestly missing', async () => {
  const { whichBinary } = await import('../server/agent/providers/detect.js')
  const w = await whichBinary('definitely-not-a-real-binary-xyz-123')
  assert.strictEqual(w.found, false)
  return w.error
})

// 5. PermissionManager: ALLOW/ASK/DENY حقيقية
await check('permissions: ls=allow, npm install=ask, sudo=deny', async () => {
  const pm = await import('../server/agent/permissionManager.js')
  const email = 'phase1@test.local'
  const a = pm.check({ email, tool: 'terminal', params: { command: 'ls' }, mode: 'assisted' })
  const b = pm.check({ email, tool: 'terminal', params: { command: 'npm install' }, mode: 'assisted' })
  const c = pm.check({ email, tool: 'terminal', params: { command: 'sudo rm -rf /' }, mode: 'assisted' })
  assert.strictEqual(a.decision, 'allow')
  assert.strictEqual(b.decision, 'ask')
  assert.strictEqual(c.decision, 'deny')
  return `allow/ask/deny ok`
})
await check('permissions: fs delete=ask, escape=deny, unknown=deny', async () => {
  const pm = await import('../server/agent/permissionManager.js')
  const email = 'phase1@test.local'
  const a = pm.check({ email, tool: 'filesystem', params: { action: 'deleteFile', path: 'x.txt' }, mode: 'assisted' })
  const b = pm.check({ email, tool: 'filesystem', params: { action: 'readFile', path: '../../etc/passwd' }, mode: 'assisted' })
  const c = pm.check({ email, tool: 'nope', params: {}, mode: 'assisted' })
  assert.strictEqual(a.decision, 'ask')
  assert.strictEqual(b.decision, 'deny')
  assert.strictEqual(c.decision, 'deny')
  return 'ok'
})

// 6. ToolManager: ملفات وأوامر حقيقية في مساحة مؤقتة
const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'ghennai-phase1-'))
await check('toolManager: real writeFile+readFile', async () => {
  const ts = await import('../server/agent/taskStore.js')
  const tm = await import('../server/agent/toolManager.js')
  const t = ts.createTask({ userEmail: 'phase1@test.local', goal: 'fs test', mode: 'BUILD' })
  ts.transitionTask(t.id, 'THINKING')
  ts.transitionTask(t.id, 'EXECUTING')
  const w = await tm.runTool({ email: 'phase1@test.local', taskId: t.id, tool: 'filesystem', params: { action: 'writeFile', path: 'hello.txt', content: 'phase1-real-content', workspace: tmpWs }, mode: 'assisted', source: 'ui' })
  assert.strictEqual(w.ok, true)
  const onDisk = fs.readFileSync(path.join(tmpWs, 'hello.txt'), 'utf8')
  assert.strictEqual(onDisk, 'phase1-real-content')
  const r = await tm.runTool({ email: 'phase1@test.local', taskId: t.id, tool: 'filesystem', params: { action: 'readFile', path: 'hello.txt', workspace: tmpWs }, mode: 'assisted', source: 'ui' })
  assert.strictEqual(r.content, 'phase1-real-content')
  const stored = ts.getTask(t.id)
  assert.ok(stored.filesChanged.some((f) => f.path === 'hello.txt' && f.action === 'created'))
  return 'disk content matches, task recorded'
})
await check('toolManager: real terminal echo', async () => {
  const ts = await import('../server/agent/taskStore.js')
  const tm = await import('../server/agent/toolManager.js')
  const t = ts.createTask({ userEmail: 'phase1@test.local', goal: 'exec test', mode: 'BUILD' })
  ts.transitionTask(t.id, 'THINKING')
  ts.transitionTask(t.id, 'EXECUTING')
  const r = await tm.runTool({ email: 'phase1@test.local', taskId: t.id, tool: 'terminal', params: { command: 'echo phase1-real-exec', workspace: tmpWs }, mode: 'assisted', source: 'ui' })
  assert.strictEqual(r.ok, true)
  assert.ok(r.output.includes('phase1-real-exec'), `unexpected output: ${r.output.slice(0, 100)}`)
  assert.strictEqual(r.code, 0)
  return `exit ${r.code}`
})
await check('toolManager: dangerous command really blocked', async () => {
  const ts = await import('../server/agent/taskStore.js')
  const tm = await import('../server/agent/toolManager.js')
  const t = ts.createTask({ userEmail: 'phase1@test.local', goal: 'deny test', mode: 'BUILD' })
  ts.transitionTask(t.id, 'THINKING')
  ts.transitionTask(t.id, 'EXECUTING')
  const r = await tm.runTool({ email: 'phase1@test.local', taskId: t.id, tool: 'terminal', params: { command: 'sudo rm -rf /', workspace: tmpWs }, mode: 'assisted', source: 'ui' })
  assert.strictEqual(r.ok, false)
  assert.ok(r.denied === true || /مرفوض|محظور|غير مسموح|not allowed|denied|⛔/i.test(`${r.reason || ''}${r.stderr || ''}`))
  return 'blocked without execution'
})
fs.rmSync(tmpWs, { recursive: true, force: true })

// 7. المزودون: كشف + توجيه حسب القدرة
await check('providers: detectAll sees opencode+codex available', async () => {
  const reg = await import('../server/agent/providers/registry.js')
  const all = await reg.detectAll({ force: true })
  const oc = all.find((p) => p.name === 'opencode')
  const cx = all.find((p) => p.name === 'codex')
  assert.ok(oc && oc.available, `opencode should be available: ${JSON.stringify(oc)}`)
  assert.ok(cx && cx.available, `codex should be available: ${JSON.stringify(cx)}`)
  return `opencode@${oc.version} codex@${cx.version}`
})
await check('providers: route(coding) picks healthy cli adapter', async () => {
  const reg = await import('../server/agent/providers/registry.js')
  const r = await reg.route({ capability: 'coding' })
  assert.strictEqual(r.ok, true)
  assert.ok(['opencode', 'codex'].includes(r.provider.name))
  return r.provider.name
})
await check('providers: route(unknown-cap) honestly fails', async () => {
  const reg = await import('../server/agent/providers/registry.js')
  const r = await reg.route({ capability: 'teleportation' })
  assert.strictEqual(r.ok, false)
  return r.error
})
await check('providers: ollama health is real (reachable here)', async () => {
  const { OllamaProvider } = await import('../server/agent/index.js')
  const h = await new OllamaProvider().healthCheck()
  assert.strictEqual(h.healthy, true, `ollama should be reachable: ${h.error}`)
  return 'healthy'
})

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
if (failed) process.exit(1)
