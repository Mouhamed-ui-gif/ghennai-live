import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { userWorkspace, safeResolve } from './paths.js'
import { emitUser } from './events.js'

/**
 * مدير العمليات الحقيقية — dev servers ومعاينات npm.
 * كل عملية: spawn حقيقي داخل workspace المستخدم + سجل محفوظ + فحص جاهزية HTTP.
 * لا شيء وهمي: إن لم يستجب المنفذ خلال المهلة تُقتل العملية ويُرجع خطأ صريح.
 */

const procs = new Map() // id -> record
const byUser = new Map() // email -> Set<id>
let seq = 0
const MAX_PER_USER = 5
const LOG_CAP = 2000

function freePort(preferred = null) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(freePort(null)))
    srv.listen(preferred || 0, '127.0.0.1', () => {
      const p = srv.address()?.port
      srv.close(() => resolve(p))
    })
  })
}

async function waitReady(port, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((res) => {
      const s = net.createConnection({ host: '127.0.0.1', port, timeout: 2000 }, () => { s.end(); res(true) })
      s.on('timeout', () => { s.destroy(); res(false) })
      s.on('error', () => res(false))
    })
    if (ok) {
      // تأكد أنه HTTP فعلًا (وليس منفذًا صامتًا)
      const httpOk = await new Promise((res) => {
        import('node:http').then(({ default: http }) => {
          const r = http.get({ host: '127.0.0.1', port, path: '/', timeout: 4000 }, (resp) => {
            resp.resume()
            res(resp.statusCode < 500)
          })
          r.on('timeout', () => { r.destroy(); res(false) })
          r.on('error', () => res(false))
        }).catch(() => res(false))
      })
      if (httpOk) return true
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function pushLog(rec, kind, chunk) {
  const lines = String(chunk || '').split('\n')
  for (const ln of lines) {
    if (!ln) continue
    rec.logs.push({ kind, text: ln.slice(0, 2000), ts: Date.now() })
  }
  while (rec.logs.length > LOG_CAP) rec.logs.splice(0, rec.logs.length - LOG_CAP)
}

function track(email, rec) {
  if (!byUser.has(email)) byUser.set(email, new Set())
  const set = byUser.get(email)
  set.add(rec.id)
  while (set.size > MAX_PER_USER) {
    const oldest = [...set].map((id) => procs.get(id)).filter(Boolean).sort((a, b) => a.startedAt - b.startedAt)[0]
    if (!oldest) break
    stop(email, oldest.id, 'استبدال بالأحدث (الحد الأقصى 5)')
  }
}

/**
 * تشغيل عملية حقيقية.
 * - command: مثل "npm run dev" (يُفحص ضد قائمة terminal البيضاء + الخطورة)
 * - cwd: مسار نسبي داخل workspace المستخدم
 * - port: مفضل (اختياري) — يُحقن كـ PORT في البيئة
 */
export async function start({ email, cwd = '.', command, port = null, timeoutMs = 45000 }) {
  const ws = userWorkspace(email)
  let dir
  try {
    dir = safeResolve(ws, String(cwd || '.'))
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  if (!fs.existsSync(dir)) return { ok: false, error: `المجلد غير موجود: ${cwd}` }

  const { commandAllowed, looksDangerous } = await import('../tools/terminal.js')
  const denied = commandAllowed(command)
  if (!denied.ok || looksDangerous(command)) {
    return { ok: false, error: `الأمر مرفوض: ${denied.reason || 'خطير'}` }
  }

  const usePort = port || await freePort(5173)
  const id = `pv-${Date.now().toString(36)}-${(++seq).toString(36)}`
  const rec = {
    id, email, cwd: path.relative(ws, dir) || '.', command, port: usePort,
    status: 'starting', startedAt: Date.now(), logs: [], pid: null, child: null,
  }
  procs.set(id, rec)
  track(email, rec)

  emitUser(email, { type: 'preview_log', id, kind: 'cmd', text: `$ ${command}  (port ${usePort})\n` })
  const child = spawn('/bin/bash', ['-lc', command], {
    cwd: dir,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG, TERM: 'dumb', PORT: String(usePort), NPM_CONFIG_YES: 'true' },
    shell: false,
  })
  rec.child = child
  rec.pid = child.pid
  child.stdout.on('data', (d) => {
    pushLog(rec, 'out', d.toString())
    emitUser(email, { type: 'preview_log', id, kind: 'out', text: d.toString().slice(0, 4000) })
  })
  child.stderr.on('data', (d) => {
    pushLog(rec, 'err', d.toString())
    emitUser(email, { type: 'preview_log', id, kind: 'err', text: d.toString().slice(0, 4000) })
  })
  child.on('error', (err) => {
    pushLog(rec, 'err', String(err))
    if (rec.status === 'starting') rec.status = 'failed'
    emitUser(email, { type: 'preview_stopped', id, reason: String(err?.message || err).slice(0, 200) })
  })
  child.on('close', (code) => {
    if (rec.status !== 'stopped') {
      rec.status = code === 0 ? 'exited' : 'crashed'
      rec.exitCode = code
      emitUser(email, { type: 'preview_stopped', id, reason: `توقفت العملية (exit ${code})`, code })
    }
  })

  const ready = await waitReady(usePort, timeoutMs)
  if (!ready) {
    try { child.kill('SIGKILL') } catch { /* noop */ }
    rec.status = 'failed'
    const tail = rec.logs.slice(-8).map((l) => l.text).join('\n').slice(0, 1500)
    return { ok: false, error: `العملية لم تستجب على المنفذ ${usePort} خلال المهلة`, id, logs: tail }
  }
  rec.status = 'running'
  emitUser(email, { type: 'preview_started', id, port: usePort, command, cwd: rec.cwd })
  return { ok: true, id, port: usePort, cwd: rec.cwd, command }
}

export function stop(email, id, reason = 'أوقف المستخدم المعاينة') {
  const rec = procs.get(id)
  if (!rec || rec.email !== email) return { ok: false, error: 'العملية غير موجودة' }
  try { rec.child?.kill('SIGKILL') } catch { /* noop */ }
  rec.status = 'stopped'
  byUser.get(email)?.delete(id)
  emitUser(email, { type: 'preview_stopped', id, reason })
  return { ok: true, id }
}

export function list(email) {
  return [...(byUser.get(email) || [])].map((id) => procs.get(id)).filter(Boolean).map((r) => ({
    id: r.id, command: r.command, cwd: r.cwd, port: r.port, status: r.status, startedAt: r.startedAt, pid: r.pid || null,
  }))
}

export function logs(email, id, tail = 200) {
  const rec = procs.get(id)
  if (!rec || rec.email !== email) return { ok: false, error: 'العملية غير موجودة' }
  return { ok: true, id, status: rec.status, logs: rec.logs.slice(-Math.max(1, Math.min(500, tail))) }
}

export function get(email, id) {
  const rec = procs.get(id)
  if (!rec || rec.email !== email) return null
  return rec
}
