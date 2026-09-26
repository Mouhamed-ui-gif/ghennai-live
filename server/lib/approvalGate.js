import { Approval, Log } from './db.js'
import { emitUser } from './events.js'
import { getPrefs } from './brainPrefs.js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import nodePath from 'node:path'
import { safeResolve } from './paths.js'

/**
 * بوابة الموافقة الحقيقية لأوامر الـAgent.
 * - الأوامر الآمنة (قراءة/استكشاف) تُنفذ مباشرة.
 * - الأوامر الحساسة (تثبيت/بناء/تشغيل/حذف/git كتابة) تتطلب موافقة المستخدم
 *   حسب وضعه: safe / assisted (افتراضي) / autonomous.
 * - عند طلب الموافقة يُنشأ صف في جدول approvals + حدث SSE فوري،
 *   وتنتظر الحلقة قرار المستخدم (approve/deny) بدل التنفيذ الأعمى.
 */

/** أوامر قراءة/استكشاف آمنة تُنفذ تلقائيًا دائمًا */
const SAFE_BASE = new Set([
  'ls', 'la', 'll', 'cat', 'tac', 'pwd', 'echo', 'printf', 'true', 'false', 'test',
  'grep', 'egrep', 'fgrep', 'rg', 'find', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr',
  'file', 'du', 'df', 'stat', 'which', 'whereis', 'basename', 'dirname', 'realpath',
  'sha256sum', 'md5sum', 'cksum', 'od', 'xxd', 'hexdump',
  'sleep', 'date', 'env', 'time', 'command', 'type', 'seq',
])

/** أنماط git للقراءة فقط (آمنة) */
const GIT_SAFE_ARGS = /^\s*(status|diff|log|show|ls-files|branch(\s+(-a|--all))?|remote(\s+-v)?|rev-parse|stash\s+list)\b/

/** أنماط npm للقراءة فقط (آمنة) */
const NPM_SAFE_ARGS = /^\s*(--version|-v|ls|list|list\s|outdated|audit|view|ping|whoami|config\s+get)\b/

/** أنماط node للقراءة فقط */
const NODE_SAFE_ARGS = /^\s*(--version|-v|--help)\b/

function firstSegmentBase(command) {
  const seg = String(command).split(/\n|&&|\|\||;|\|/)[0]?.trim() || ''
  const cleaned = seg.replace(/^([A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)+/, '').replace(/^time\s+/, '').trim()
  const base = (cleaned.split(/\s+/)[0] || '').replace(/^["']|["']$/g, '').split('/').pop()
  const args = cleaned.slice(cleaned.split(/\s+/)[0]?.length || 0)
  return { base, args, seg }
}

/**
 * تصنيف أمر: 'safe' | 'sensitive'
 * القاعدة الآمنة: غير المعروف = حساس (secure by default).
 */
export function classifyCommand(command) {
  const { base, args } = firstSegmentBase(command)
  if (!base) return { level: 'sensitive', reason: 'أمر فارغ' }
  if (SAFE_BASE.has(base)) return { level: 'safe' }
  if (base === 'git') {
    if (GIT_SAFE_ARGS.test(args)) return { level: 'safe' }
    return { level: 'sensitive', reason: 'عملية git تُعدّل المستودع', kind: gitKind(args) }
  }
  if (base === 'npm' || base === 'npx' || base === 'yarn' || base === 'pnpm' || base === 'bun') {
    if (base === 'npm' && NPM_SAFE_ARGS.test(args)) return { level: 'safe' }
    const kind = /(install|add|remove|uninstall|run\s+(build|dev|start|preview|test|deploy)|exec|dlx|create|init)\b/.test(args) ? installKind(base, args) : 'package command'
    return { level: 'sensitive', reason: `أمر حزم/بناء: ${base}${args.trim() ? ` ${args.trim().split(/\s+/).slice(0, 3).join(' ')}` : ''}`, kind }
  }
  if (base === 'node') {
    if (NODE_SAFE_ARGS.test(args)) return { level: 'safe' }
    return { level: 'sensitive', reason: 'تشغيل سكربت node', kind: 'run script' }
  }
  if (base === 'python' || base === 'python3' || base === 'pip' || base === 'pip3') {
    if (/^\s*(--version|-V|--help)\b/.test(args)) return { level: 'safe' }
    return { level: 'sensitive', reason: 'تشغيل/تثبيت بايثون', kind: 'python' }
  }
  if (base === 'mkdir' || base === 'touch' || base === 'cp' || base === 'mv' || base === 'ln') {
    return { level: 'sensitive', reason: `تعديل ملفات: ${base}`, kind: 'filesystem write' }
  }
  if (base === 'rm' || base === 'rmdir') {
    return { level: 'sensitive', reason: 'حذف ملفات — عملية لا رجعة فيها', kind: 'delete' }
  }
  if (base === 'chmod' || base === 'chown' || base === 'chgrp') {
    return { level: 'sensitive', reason: 'تغيير صلاحيات', kind: 'permissions' }
  }
  if (base === 'tar' || base === 'zip' || base === 'unzip' || base === 'gzip' || base === 'gunzip') {
    return { level: 'sensitive', reason: `أرشفة: ${base}`, kind: 'archive' }
  }
  if (base === 'curl' || base === 'wget' || base === 'gh') {
    return { level: 'sensitive', reason: `شبكة/خارجي: ${base}`, kind: 'network' }
  }
  return { level: 'sensitive', reason: `أمر غير مصنّف كآمن: ${base}`, kind: 'unclassified' }
}

function gitKind(args) {
  if (/\bcommit\b/.test(args)) return 'git commit'
  if (/\bpush\b/.test(args)) return 'git push'
  if (/\b(add|checkout|merge|rebase|reset|stash|tag)\b/.test(args)) return 'git write'
  if (/\bclone\b/.test(args)) return 'git clone'
  return 'git'
}

function installKind(base, args) {
  if (/\binstall\b|\badd\b/.test(args)) return 'install dependencies'
  if (/\brun\s+build\b|\bbuild\b/.test(args)) return 'build'
  if (/\brun\s+dev\b|\bdev\b|\bstart\b|\bpreview\b/.test(args)) return 'start dev server'
  if (/\btest\b/.test(args)) return 'run tests'
  return 'package command'
}

/** عمليات filesystem التي تتطلب موافقة (الحذف فقط — الكتابة داخل workspace آمنة) */
export function classifyFsAction(action) {
  if (action === 'deleteFile') return { level: 'sensitive', reason: 'حذف ملف — عملية لا رجعة فيها', kind: 'delete' }
  return { level: 'safe' }
}

/** عمليات git الكاتبة (تحتاج حارس المستودع) */
const GIT_WRITE_ARGS = /\b(add|commit|push|merge|rebase|reset|restore|rm|mv|checkout|stash|tag|init|clone)\b/
/** init/clone يُنشئان المستودع (لا يوجد بعد) — كفاية أن الهدف داخل الـworkspace */
const GIT_CREATE_ARGS = /^\s*(init|clone)\b/

function allSegments(command) {
  return String(command)
    .split(/\n|;[^[]|&&|\|\||\||\(|\)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      let s = seg.replace(/^([A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)+/, '').replace(/^time\s+/, '').trim()
      const parts = s.split(/\s+/)
      const base = (parts[0] || '').replace(/^["']|["']$/g, '').split('/').pop()
      return { base, args: s.slice(parts[0]?.length || 0) }
    })
}

/** المستودع الفعلي الذي سيتأثر: git يصعد للأب تلقائيًا — نكشف ذلك قبل التنفيذ */
export function gitRepoInfo(workspace, cwd) {
  try {
    const dir = safeResolve(workspace, String(cwd || '.'))
    if (!fs.existsSync(dir)) return { toplevel: null, dir, missing: true }
    try {
      const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, timeout: 8000, encoding: 'utf8' }).trim()
      return { toplevel: nodePath.resolve(out), dir }
    } catch {
      return { toplevel: null, dir }
    }
  } catch (e) {
    return { toplevel: null, error: String(e.message || e) }
  }
}

export function agentModeFor(email) {
  try {
    const m = getPrefs(email)?.agentMode
    if (['safe', 'assisted', 'autonomous'].includes(m)) return m
  } catch { /* noop */ }
  return 'assisted'
}

const WAIT_POLL_MS = 1000
const WAIT_TIMEOUT_MS = 10 * 60 * 1000

/**
 * طلب موافقة وانتظار القرار.
 * يُعيد { approved:true } أو { approved:false, reason }.
 * signal: إشارة إيقاف خارجية (AbortSignal) — الإيقاف = رفض.
 */
export async function requestApproval({ email, tool, command = null, cwd = null, path = null, reason, kind = null, taskId = null, signal = null }) {
  const approvalId = Approval.create({
    task_id: taskId,
    user_email: email,
    tool,
    reason: reason || `يتطلب موافقة: ${tool}`,
    params: { command, cwd, path, kind },
  })
  emitUser(email, {
    type: 'approval_requested',
    id: approvalId,
    tool,
    command,
    cwd,
    path,
    reason: reason || '',
    kind,
  })
  try {
    Log.record({ channel: 'agent', task_id: taskId, user_email: email, agent: 'coding', tool, action: 'approval_requested', input_summary: String(command || path || '').slice(0, 200), status: 'waiting' })
  } catch { /* noop */ }

  const start = Date.now()
  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    if (signal?.aborted) {
      try { Approval.decide(approvalId, 'rejected') } catch { /* noop */ }
      emitUser(email, { type: 'approval_resolved', id: approvalId, decision: 'rejected', reason: 'أُوقف التنفيذ' })
      return { approved: false, reason: 'أُوقف التنفيذ (stop)', approvalId }
    }
    let row = null
    try { row = Approval.byId(approvalId) } catch { /* noop */ }
    if (row && row.status !== 'pending') {
      const ok = row.status === 'approved'
      emitUser(email, { type: 'approval_resolved', id: approvalId, decision: row.status })
      return ok
        ? { approved: true, approvalId }
        : { approved: false, reason: 'رفض المستخدم العملية', approvalId }
    }
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS))
  }
  try { Approval.decide(approvalId, 'rejected') } catch { /* noop */ }
  emitUser(email, { type: 'approval_resolved', id: approvalId, decision: 'rejected', reason: 'انتهت مهلة الانتظار (10 دقائق)' })
  return { approved: false, reason: 'انتهت مهلة انتظار الموافقة', approvalId }
}

/**
 * البوابة الرئيسية قبل تنفيذ أداة حساسة من الـAgent.
 * الأوامر المكتوبة يدويًا من المستخدم في الطرفية (source:'ui') تُتجاوز —
 * المستخدم نفسه هو من طلبها صراحةً.
 */
export async function gateTool({ email, tool, command = null, cwd = null, path = null, action = null, taskId = null, signal = null, source = 'agent', workspace = null }) {
  if (source === 'ui') return { approved: true, auto: true, source }
  const mode = agentModeFor(email)

  // ── حارس git: امنع الكتابة في مستودع خارج الـworkspace (الصعود للأب) ──
  // يفحص كل مقاطع الأمر (&&, ||, ;) — لا يكفي المقطع الأول. init/clone معفيان
  // (يُنشئان المستودع؛ كفاية أن المجلد الهدف داخل مساحة العمل — يضمنه safeResolve).
  let actualRepo = null
  if ((tool === 'terminal' || tool === 'git') && command && workspace) {
    const segs = allSegments(command)
    const gitWrites = segs.filter(
      (s) => s.base === 'git' && GIT_WRITE_ARGS.test(` ${s.args} `) && !GIT_CREATE_ARGS.test(s.args)
    )
    // وجود init/clone في الأمر يعني الكتابة اللاحقة تقع في المستودع الجديد داخل مساحة
    // العمل (مجلد التنفيذ مُثبّت داخلها) — لا رفض، وتبقى الموافقة على النص الصريح.
    const hasCreate = segs.some((s) => s.base === 'git' && GIT_CREATE_ARGS.test(s.args))
    // المجلد الفعلي: أول cd صريح داخل مساحة العمل، وإلا cwd
    let effectiveCwd = cwd || '.'
    const cdM = String(command).match(/(?:^|[;&|])\s*cd\s+([^\s;&|]+)/)
    if (cdM) {
      try {
        const cand = safeResolve(workspace, cdM[1])
        if (cand === nodePath.resolve(workspace) || cand.startsWith(nodePath.resolve(workspace) + nodePath.sep)) {
          effectiveCwd = nodePath.relative(nodePath.resolve(workspace), cand) || '.'
        }
      } catch { /* تجاهل — يُترك cwd */ }
    }
    if (gitWrites.length && !hasCreate) {
      const info = gitRepoInfo(workspace, effectiveCwd)
      if (info.toplevel) {
        const wsRoot = nodePath.resolve(workspace)
        if (info.toplevel !== wsRoot && !info.toplevel.startsWith(wsRoot + nodePath.sep)) {
        const reason = `مرفوض: الأمر سيؤثر على مستودع خارج مساحة عملك (${info.toplevel}) — الصعود التلقائي لمستودع الأب ممنوع`
        emitUser(email, { type: 'agent_event', agent: 'Coding', tool, message: `⛔ ${reason}`, status: 'error', data: { denied: true, outsideWorkspace: true } })
        return { approved: false, reason, outsideWorkspace: true }
      }
      actualRepo = nodePath.relative(wsRoot, info.toplevel) || '.'
      }
    }
  }

  let cls = { level: 'safe' }
  if (tool === 'terminal') cls = classifyCommand(command || '')
  else if (tool === 'filesystem') cls = classifyFsAction(action || '')
  else if (tool === 'deploy' || tool === 'git') cls = { level: 'sensitive', reason: `عملية ${tool} — تتطلب موافقة`, kind: tool }

  if (cls.level === 'safe') return { approved: true, auto: true, mode }
  const shownReason = actualRepo && actualRepo !== '.' ? `${cls.reason || ''} — المستودع المتأثر: ${actualRepo}` : (cls.reason || '')
  if (mode === 'autonomous') {
    emitUser(email, { type: 'agent', agent: 'Coding', message: `⚡ autonomous: تنفيذ تلقائي — ${String(command || path || tool).slice(0, 100)}`, status: 'running' })
    return { approved: true, auto: true, mode }
  }
  emitUser(email, { type: 'agent_state', state: 'WAITING_APPROVAL', tool, command: command ? String(command).slice(0, 200) : undefined })
  const res = await requestApproval({ email, tool, command, cwd, path, reason: shownReason, kind: actualRepo ? `repo: ${actualRepo}` : cls.kind, taskId, signal })
  if (res.approved) emitUser(email, { type: 'agent_state', state: 'EXECUTING', tool })
  return { ...res, mode }
}
