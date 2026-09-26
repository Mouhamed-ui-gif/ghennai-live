/**
 * كشف حقيقي عن ثنائيات CLI — بدون shell (execFile فقط + مهلة).
 * يُستخدم لجميع مزودات CLI (opencode, codex, ...).
 */
import { execFile } from 'node:child_process'

function runFile(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error, stdout: String(stdout || ''), stderr: String(stderr || '') })
      } else {
        resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') })
      }
    })
  })
}

/** هل الثنائية موجودة في PATH؟ يُرجع المسار الحقيقي أو السبب. */
export async function whichBinary(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const r = await runFile(probe, [bin], 5000)
  if (!r.ok) return { found: false, error: `${bin} not found in PATH` }
  const p = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean)[0] || null
  if (!p) return { found: false, error: `${bin} not found in PATH` }
  return { found: true, path: p }
}

/** إصدار الثنائية الحقيقي عبر `--version`. */
export async function binaryVersion(binOrPath, versionArgs = ['--version'], timeoutMs = 8000) {
  const r = await runFile(binOrPath, versionArgs, timeoutMs)
  const text = `${r.stdout}\n${r.stderr}`.trim()
  const firstLine = text.split('\n').map((s) => s.trim()).filter(Boolean)[0] || ''
  if (!r.ok && !firstLine) {
    return { ok: false, error: text.slice(0, 300) || 'version probe failed' }
  }
  return { ok: true, version: firstLine.slice(0, 120) }
}

/** كشف كامل: وجود + إصدار. */
export async function detectBinary(bin, versionArgs = ['--version']) {
  const w = await whichBinary(bin)
  if (!w.found) return { available: false, reason: w.error }
  const v = await binaryVersion(w.path, versionArgs)
  if (!v.ok) return { available: true, path: w.path, version: null, versionError: v.error }
  return { available: true, path: w.path, version: v.version }
}
