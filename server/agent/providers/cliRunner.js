/**
 * مشغّل CLI حقيقي مشترك لمزودات الـCLI (opencode, codex, ...).
 * - spawn مباشر بدون shell، داخل مجلد مسجون في workspace المستخدم.
 * - مهلة + قتل حقيقي عند الإلغاء/المهلة. لا نجاح مُدّعى: رمز الخروج
 *   غير الصفري يُرجع stderr الحقيقي.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { userWorkspace, safeResolve } from '../../lib/paths.js'

const MINIMAL_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR']

function minimalEnv(extra = {}) {
  const out = {}
  for (const k of MINIMAL_ENV_KEYS) {
    if (process.env[k] !== undefined) out[k] = process.env[k]
  }
  return { ...out, ...extra }
}

function jailDir(email, cwd) {
  const ws = userWorkspace(email)
  const dir = safeResolve(ws, String(cwd || '.'))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * تشغيل أمر CLI حقيقي مع بثّ.
 * options: { email, cwd, args (بدون shell), timeoutMs, signal, onData(kind, chunk) }
 * يُرجع { ok, exitCode, stdout, stderr, timedOut, cancelled }.
 */
export function runCli({ bin, email, cwd = '.', args = [], timeoutMs = 600000, signal = null, onData = null, envExtra = {} }) {
  return new Promise((resolve) => {
    let dir
    try {
      dir = jailDir(email, cwd)
    } catch (e) {
      return resolve({ ok: false, exitCode: -1, stdout: '', stderr: `workspace jail: ${e.message}`, timedOut: false, cancelled: false })
    }
    if (signal?.aborted) {
      return resolve({ ok: false, exitCode: -2, stdout: '', stderr: 'cancelled before spawn', timedOut: false, cancelled: true })
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const finish = (val) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) {
        try { signal.removeEventListener('abort', onAbort) } catch { /* noop */ }
      }
      resolve(val)
    }

    let child
    try {
      child = spawn(bin, args, { cwd: dir, env: minimalEnv(envExtra), shell: false })
    } catch (e) {
      return resolve({ ok: false, exitCode: -1, stdout: '', stderr: String(e?.message || e), timedOut: false, cancelled: false })
    }

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch { /* noop */ }
    }, timeoutMs)

    const onAbort = () => {
      try { child.kill('SIGKILL') } catch { /* noop */ }
      finish({ ok: false, exitCode: -2, stdout, stderr: `${stderr}\ncancelled by user`, timedOut, cancelled: true })
    }
    if (signal) {
      try { signal.addEventListener('abort', onAbort, { once: true }) } catch { /* noop */ }
    }

    child.stdout.on('data', (d) => {
      const s = d.toString()
      stdout += s
      if (stdout.length > 500000) stdout = stdout.slice(-500000)
      if (onData) onData('out', s)
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      if (stderr.length > 200000) stderr = stderr.slice(-200000)
      if (onData) onData('err', s)
    })
    child.on('error', (err) => {
      finish({ ok: false, exitCode: -1, stdout, stderr: `${stderr}\nspawn error: ${err.message}`, timedOut, cancelled: false })
    })
    child.on('close', (code) => {
      finish({ ok: code === 0 && !timedOut, exitCode: code ?? -1, stdout, stderr, timedOut, cancelled: false })
    })
  })
}
