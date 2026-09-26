import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { safeResolve, WORKSPACE_DIR } from '../lib/paths.js'

const DANGEROUS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f?|[a-zA-Z]*f[a-zA-Z]*r?)\s+[-/]/,
  /\bmkfs\b/, /:\s*rm\s+-rf\s*\/\s*$/,
  /\bdd\s+if=/,
  /\bshutdown\b/, /\breboot\b/, /\bpoweroff\b/, /\bhalt\b/,
  />\s*\/dev\/sd/,
  /\bchown\b.*\s+(\/|\/home\/?)\s*$/,
  /(\/proc\/|sysctl\s+-w).*?/,
  /\bsudo\b/, /\bsu\b/, /\bpkexec\b/, /\bsystemctl\b/,
]

function looksDangerous(command) {
  return DANGEROUS.some((re) => re.test(command))
}

/** الأوامر المسموح بها داخل مساحة العمل (قائمة بيضاء) */
const ALLOWED = new Set([
  // ملفات ومجلدات
  'ls', 'la', 'll', 'cat', 'tac', 'cd', 'pwd', 'echo', 'printf', 'true', 'false', 'test', '[',
  'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm', 'ln',
  'grep', 'egrep', 'fgrep', 'rg', 'find', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr',
  'sed', 'awk', 'xargs', 'less', 'more',
  'file', 'du', 'df', 'stat', 'which', 'whereis', 'basename', 'dirname', 'realpath',
  'chmod', 'chown', 'chgrp',
  'sha256sum', 'md5sum', 'cksum', 'od', 'xxd', 'hexdump', 'base64',
  'split', 'join', 'paste', 'seq', 'yes', 'read',
  // نسخ وأرشفة
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'xz', 'unxz', 'bzip2', 'bunzip2', 'zstd', 'compress',
  // سكربتات وأدوات تطوير
  'git', 'gh', 'curl', 'wget',
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun',
  'python', 'python3', 'python2', 'pip', 'pip3',
  // وسائط وعموم
  'ffmpeg', 'ffprobe', 'convert', 'magick', 'identify', 'gm',
  'sleep', 'date', 'env', 'export', 'time', 'watch', 'command', 'type',
])

/** أوامر محظورة صراحةً حتى لو وردت كأمر رئيس */
const BLOCKED = new Set([
  'sudo', 'su', 'doas', 'pkexec', 'bash', 'sh', 'zsh', 'ksh', 'dash', 'fish', 'rc',
  'systemctl', 'service', 'mount', 'umount', 'modprobe', 'kmod', 'iptables', 'ufw',
  'ssh', 'scp', 'sftp', 'ssh-keygen', 'ssh-add', 'passwd', 'chroot', 'nsenter',
  'docker', 'podman', 'kill', 'pkill', 'killall', 'killall5', 'taskset', 'nohup',
  'init', 'telinit', 'halt', 'poweroff', 'reboot', 'shutdown',
])

/** متغيرات بيئة آمنة فقط (بلا مفاتيح/أسرار) */
const SAFE_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SHELL', 'TMPDIR', 'TEMP', 'TMP', 'PWD', 'SHLVL']

function buildEnv(extra = {}) {
  const out = {}
  for (const k of SAFE_ENV_KEYS) {
    if (process.env[k] !== undefined) out[k] = process.env[k]
  }
  for (const [k, v] of Object.entries(extra || {})) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/** يقسّم الأمر إلى أجزاء (&& ، || ، ; ، | ، سطور) ويصفّي الأجزاء الفارغة */
function segmentsOf(command) {
  return String(command).split(/\n|;[^[]|&&|\|\||\||\(|\)/).filter((s) => s.trim())
}

/** تقييم قائمة الأوامر البيضاء + المحظورة */
function commandAllowed(command) {
  for (let seg of segmentsOf(command)) {
    seg = seg.trim()
    if (!seg) continue
    let m
    while ((m = seg.match(/^([A-Za-z_][A-Za-z0-9_]*=)\S*/))) seg = seg.slice(m[0].length).trim()
    if (/^time\s/.test(seg)) seg = seg.replace(/^time\s+/, '').trim()
    const base = seg.split(/\s+/)[0] || ''
    const name = base.replace(/^["']|["']$/g, '').split('/').pop()
    if (!name) return { ok: false, reason: 'أمر فارغ' }
    if (BLOCKED.has(name)) return { ok: false, reason: `الأمر محظور: ${name}` }
    if (!ALLOWED.has(name)) return { ok: false, reason: `الأمر غير مسموح: ${name}` }
  }
  return { ok: true }
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
function run(command, { cwd = null, workspace = null, timeoutMs = 120000, env = {}, onData = null, signal = null } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      return resolve({ ok: false, output: '', stderr: '⏹️ أُوقف قبل التنفيذ\n', code: -2, timedOut: false, stopped: true, cwd: null })
    }
    const dangerous = looksDangerous(command)
    const denied = commandAllowed(command)
    let base = workspace && workspace.startsWith(path.sep) ? workspace : path.resolve(DEFAULT_WORKSPACE, workspace || '.')
    base = path.resolve(base)
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })

    let finalCwd = base
    if (cwd) {
      const target = String(cwd).trim()
      if (path.isAbsolute(target)) {
        if (target === base || target.startsWith(base + path.sep)) finalCwd = target
        else finalCwd = base
      } else {
        try {
          finalCwd = safeResolve(base, target)
        } catch {
          finalCwd = base
        }
      }
      if (!fs.existsSync(finalCwd)) finalCwd = base
    }

    if (dangerous || !denied.ok) {
      const reason = dangerous ? 'للأمر شكلٌ خطير (أمر مضار مستبعد)' : (denied.reason || 'غير مسموح')
      if (onData) onData('err', `⛔ ${reason}\n`)
      return resolve({ ok: false, output: '', stderr: `⛔ ${reason}\n`, code: -1, timedOut: false, dangerous, allowed: denied.ok !== false ? denied : denied, denied: !denied.ok, cwd: finalCwd })
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
      env: buildEnv(env),
      shell: false,
    })

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch { /* noop */ }
    }, timeoutMs)

    if (onData) onData('cmd', `${command}\n`)
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
    const onAbort = () => {
      try { child.kill('SIGKILL') } catch { /* noop */ }
      stream('err', '⏹️ أُوقف التنفيذ من المستخدم\n')
      finish({ ok: false, output, stderr, code: -2, timedOut, stopped: true, dangerous, allowed: true, cwd: finalCwd })
    }
    if (signal) {
      try { signal.addEventListener('abort', onAbort, { once: true }) } catch { /* noop */ }
    }
    child.stdout.on('data', (d) => stream('out', d.toString()))
    child.stderr.on('data', (d) => stream('err', d.toString()))
    child.on('error', (err) => { finish({ ok: false, output, stderr: String(err), code: -1 }) })
    child.on('close', (code) => {
      finish({ ok: code === 0 && !timedOut, output, stderr, code, timedOut, dangerous, allowed: true, cwd: finalCwd })
    })
  })
}

export { run, looksDangerous, commandAllowed }
export default run