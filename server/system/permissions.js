import { Approval, Log } from '../lib/db.js'
import { emitStep } from '../lib/events.js'

const MODES = ['assisted', 'autonomous', 'safe']

const DEFAULT_PERMISSIONS = {
  READ_FILE: 'allowed',
  WRITE_FILE: 'allowed',
  CREATE_DIR: 'allowed',
  LIST_DIR: 'allowed',
  READ_PROJECT: 'allowed',
  RUN_TERMINAL: 'allowed',
  BROWSER: 'allowed',
  GENERATE_IMAGE: 'allowed',
  DELETE_FILE: 'approval',
  DELETE_DIR: 'approval',
  SEND_MESSAGE: 'approval',
  PUBLISH_SOCIAL: 'approval',
  EXECUTE_SENSITIVE: 'approval',
  EXTERNAL_API: 'configurable',
}

// أوضاع: safe => كل شيء حساس بموافقة، autonomous => ضمن الصلاحيات، assisted => اقتراح بانتظار موافقة على الأهم
const MODE_OVERRIDES = {
  safe: { PUBLISH_SOCIAL: 'approval', SEND_MESSAGE: 'approval', DELETE_FILE: 'approval', DELETE_DIR: 'approval', EXECUTE_SENSITIVE: 'approval', RUN_TERMINAL: 'approval', EXTERNAL_API: 'approval' },
  assisted: {},
  autonomous: { PUBLISH_SOCIAL: 'allowed', DELETE_FILE: 'allowed', DELETE_DIR: 'allowed', SEND_MESSAGE: 'allowed', EXECUTE_SENSITIVE: 'allowed' },
}

function normalize(permission) {
  return String(permission || '').toUpperCase()
}

export function resolvePermission(permission, mode, userOverrides = {}) {
  permission = normalize(permission)
  const override = userOverrides[permission]
  if (override) return override
  const modeDefault = MODE_OVERRIDES[mode]?.[permission]
  if (modeDefault) return modeDefault
  return DEFAULT_PERMISSIONS[permission] || 'configurable'
}

function requiresApproval(permission, mode, userOverrides) {
  return resolvePermission(permission, mode, userOverrides) === 'approval'
}

/**
 * تحقق من صلاحية أداة/إجراء.
 * يعيد { allowed:boolean, needApproval:boolean }
 * إذا كانت تحتاج موافقة والموافقات معطّلة أو رُفضت => allowed=false
 */
export async function checkPermission({ user_email, permission, tool, params, reason, task_id = null, mode = 'assisted', userOverrides = {}, autoApprove = false }) {
  const perm = normalize(permission)
  const resolved = resolvePermission(perm, mode, userOverrides)

  if (resolved === 'allowed' || resolved === true) return { allowed: true, needApproval: false }

  if (resolved === 'approval') {
    if (autoApprove && mode === 'autonomous') return { allowed: true, needApproval: false }
    const existing = Approval.pendingByTask(task_id).find((a) => a.tool === tool && a.status === 'pending')
    if (existing) {
      if (existing.status === 'approved') return { allowed: true, needApproval: true }
      return { allowed: false, needApproval: true, approvalId: existing.id, reason: existing.reason }
    }
    const paramsJson = params ? JSON.stringify(params).slice(0, 400) : null
    const approvalId = Approval.create({ task_id, user_email, tool, reason: reason || `يتطلب موافقة: ${tool}`, params: { permission: perm, ...(params ? { params } : {}) } })
    emitStep({
      email: user_email,
      agent: 'Core',
      tool,
      message: `⏸️ يتطلب موافقتك: ${reason || `استخدام ${tool}`}`,
      status: 'waiting',
      data: { approvalId, permission: perm },
    })
    Log.record({ channel: 'agent', task_id, user_email, agent: 'core', tool, action: perm, result: 'approval_requested', status: 'waiting' })
    return { allowed: false, needApproval: true, approvalId, reason }
  }

  // configurable أو غير معروف => denied افتراضيًا
  return { allowed: false, needApproval: false, reason: `لا يوجد إذن لتشغيل: ${perm}` }
}

export function approve(approvalId, user_email, decision = 'approved') {
  const a = Approval.byId(approvalId)
  if (!a) return { ok: false, error: 'الموافقة غير موجودة' }
  if (a.user_email !== user_email) return { ok: false, error: 'لا تملك هذه الموافقة' }
  if (!['approved', 'rejected'].includes(decision)) return { ok: false, error: 'قرار غير صالح' }
  Approval.decide(approvalId, decision)
  emitStep({ email: user_email, agent: 'Core', tool: a.tool, message: decision === 'approved' ? '✅ تمت الموافقة — استئناف التنفيذ' : '❌ رُفضت العملية', status: decision })
  return { ok: true, approvalId, decision, tool: a.tool, task_id: a.task_id, params: a.params }
}

export { MODES }
