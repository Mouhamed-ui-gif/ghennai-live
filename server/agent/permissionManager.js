/**
 * PermissionManager — قرارات ALLOW/ASK/DENY لكل أداة (القسم 10).
 * يوحّد approvalGate (تصنيف الأوامر) + system/permissions (الأوضاع).
 * - terminal: آمن → ALLOW، حساس → ASK، خطير/مرفوض → DENY.
 * - filesystem: حذف → ASK، كتابة خارج workspace → DENY، الباقي → ALLOW.
 * - الوضع safe: كل terminal → ASK. الوضع autonomous: الحساس → ALLOW (يبقى DENY للخطير).
 */
import { classifyCommand, classifyFsAction, agentModeFor } from '../lib/approvalGate.js'
import { commandAllowed, looksDangerous } from '../tools/terminal.js'
import { safeResolve, userWorkspace } from '../lib/paths.js'

export const DECISIONS = Object.freeze(['allow', 'ask', 'deny'])

export function check({ email, tool, params = {}, mode = null }) {
  if (!email) throw new Error('email required')
  const effectiveMode = mode || agentModeFor(email)

  if (tool === 'terminal') {
    const command = String(params.command || '')
    if (!command.trim()) return { decision: 'deny', reason: 'empty command' }
    // الرفض الصريح أولًا: القائمة السوداء + الأنماط الخطيرة (نفس ما سيرفضه التنفيذ).
    try {
      if (looksDangerous(command)) return { decision: 'deny', reason: 'dangerous command pattern' }
      const allowed = commandAllowed(command)
      if (!allowed.ok) return { decision: 'deny', reason: allowed.reason || 'command not allowed' }
    } catch (e) {
      return { decision: 'deny', reason: `command check error: ${e.message}` }
    }
    let cls
    try {
      cls = classifyCommand(command)
    } catch (e) {
      return { decision: 'deny', reason: `classifier error: ${e.message}` }
    }
    if (cls.level !== 'safe') {
      if (/للأمر شكلٌ خطير|مضار/.test(cls.reason || '')) return { decision: 'deny', reason: cls.reason }
      if (effectiveMode === 'autonomous') return { decision: 'allow', reason: `autonomous auto-allow: ${cls.reason || 'sensitive'}`, level: 'sensitive', auto: true }
      return { decision: 'ask', reason: cls.reason || 'sensitive command', level: 'sensitive', kind: cls.kind || null }
    }
    if (effectiveMode === 'safe') return { decision: 'ask', reason: 'safe mode: all terminal commands need approval', level: 'safe' }
    return { decision: 'allow', reason: 'safe command', level: 'safe' }
  }

  if (tool === 'filesystem') {
    const action = String(params.action || '')
    const rel = String(params.path || '')
    // تحقق السجن أولًا — خارج workspace = رفض فوري.
    try {
      safeResolve(userWorkspace(email), rel || '.')
    } catch (e) {
      return { decision: 'deny', reason: `path escapes workspace: ${e.message}` }
    }
    const cls = classifyFsAction(action)
    if (cls.level !== 'safe') {
      if (effectiveMode === 'autonomous') return { decision: 'allow', reason: `autonomous auto-allow: ${cls.reason}`, level: 'sensitive', auto: true }
      return { decision: 'ask', reason: cls.reason || 'sensitive file op', level: 'sensitive', kind: cls.kind || null }
    }
    return { decision: 'allow', reason: 'safe file op', level: 'safe' }
  }

  if (tool === 'web_fetch') {
    return { decision: 'allow', reason: 'read-only web fetch', level: 'safe' }
  }

  return { decision: 'deny', reason: `unknown tool: ${tool}` }
}
