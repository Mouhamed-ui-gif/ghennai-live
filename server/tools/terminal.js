import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { safeResolve, WORKSPACE_DIR } from '../lib/paths.js'

const DANGEROUS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f?|[a-zA-Z]*f[a-zA-Z]*r?)\s+[-/]/,
  /\bmkfs\b/, /:\s*rm\s+-rf\s*\/\s*$/,
  /\bdd\s+if=/,
  /\bshutdown\b/, /\breboot\b/, /\bpoweroff\b/,
  />\s*\/dev\/sd/,
  /\bchown\b.*\s+(\/|\/home\/?)\s*$/,
  /(\/proc\/|sysctl\s+-w).*?/,
]

function looksDangerous(command) {
  return DANGEROUS.some((re) => re.test(command))
}

function pickShell() {
  if (process.platform === 'win32') return { cmd: 'cmd.exe', args: ['/c'] }
  return { cmd: '/bin/bash', args: ['-lc'] }
}

const DEFAULT_WORKSPACE = WORKSPACE_DIR

/**
 * تنفيذ أمر داخل مساحة عمل المستخدم فقط.
 * options.workspace: جذر مساحة العمل (اختياري، يُحتسب تلقائيًا)
 * options.cwd: مسار نسبي/مطلق داخل مساحة العمل
 * options.onData: (kind, chunk) => void — بث مباشر خلال التنفيذ (kind: 'out'|'err')
 */
function run(command, { cwd = null, workspace = null, timeoutMs = 120000, env = {}, onData = null } = {}) {
  return new Promise((resolve) => {
    const dangerous = looksDangerous(command)
    let base = workspace && workspace.startsWith(path.sep) ? workspace : path.resolve(DEFAULT_WORKSPACE, workspace || '.')
    let finalCwd = base
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })

    if (cwd) {
      try {
        let target
        if (path.isAbsolute(cwd)) {
          target = cwd.startsWith(base + path.sep) ? cwd.replace(base + path.sep, '') : cwd.replace(base, '').replace(/^[/\\]/, '')
        } else {
          target = cwd
        }
        const resolved = safeResolve(base, target || '.')
        if (fs.existsSync(resolved)) {
          finalCwd = resolved
        } else if (fs.existsSync(resolved + '.') || target === '.') {
          finalCwd = resolved
        }
      } catch {
        finalCwd = base
      }
    }

    const shell = pickShell()

    let output = ''
    let stderr = ''
    let timedOut = false

    const stream = (kind, chunk) => {
      if (!chunk) return
      try {
        output = kind === 'err' ? output : output + chunk
        stderr = kind === 'err' ? stderr + chunk : stderr
      } catch { /* noop */ }
      if (onData) onData(kind, chunk)
    }

    const child = spawn(shell.cmd, [...shell.args, command], {
      cwd: finalCwd || undefined,
      env: { ...process.env, ...env },
      shell: false,
    })

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch { /* noop */ }
    }, timeoutMs)

    if (onData) onData('cmd', `${command}\n`)
    child.stdout.on('data', (d) => stream('out', d.toString()))
    child.stderr.on('data', (d) => stream('err', d.toString()))
    child.on('error', (err) => { resolve({ ok: false, output, stderr: String(err), code: -1 }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0 && !timedOut, output, stderr, code, timedOut, dangerous, cwd: finalCwd })
    })
  })
}

export { run, looksDangerous }
export default run