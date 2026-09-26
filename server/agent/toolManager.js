/**
 * ToolManager — تنفيذ الأدوات عبر البوابة الحقيقية (الأقسام 3+9+10).
 * التدفق: task موجودة → قرار ALLOW/ASK/DENY → (ASK: gateTool الحقيقي
 * ينتظر قرار المستخدم) → تنفيذ حقيقي → أحداث eventBus حقيقية → تسجيل
 * في TaskStore + audit. لا تنفيذ وهمي في أي مسار.
 */
import fs from 'node:fs'
import tools from '../tools/registry.js'
import { gateTool } from '../lib/approvalGate.js'
import { audit } from '../lib/auditLog.js'
import { userWorkspace } from '../lib/paths.js'
import { getTask, recordFile, recordCommand } from './taskStore.js'
import { check as permCheck } from './permissionManager.js'
import { emit } from './eventBus.js'
import { transitionTask } from './taskStore.js'

const KNOWN_TOOLS = new Set(['terminal', 'filesystem', 'web_fetch'])

function workspaceFor(email, params) {
  if (params.workspace && String(params.workspace).startsWith('/')) return String(params.workspace)
  return userWorkspace(email)
}

export async function runTool({ email, taskId, tool, params = {}, mode = null, source = 'agent', signal = null }) {
  const task = getTask(taskId)
  if (!task) throw new Error(`task not found: ${taskId}`)
  if (!KNOWN_TOOLS.has(tool)) {
    emit(email, { type: 'error', taskId, message: `unknown tool: ${tool}` })
    return { ok: false, error: `unknown tool: ${tool}` }
  }

  const perm = permCheck({ email, tool, params, mode })
  if (perm.decision === 'deny') {
    emit(email, { type: 'error', taskId, message: `⛔ مرفوض: ${perm.reason}`, data: { tool, reason: perm.reason } })
    audit({ user: email, agent: 'orchestrator', action: `tool:${tool}`, result: perm.reason, status: 'denied' })
    return { ok: false, denied: true, reason: perm.reason }
  }

  const workspace = workspaceFor(email, params)

  if (perm.decision === 'ask' && source === 'agent') {
    try {
      transitionTask(taskId, 'WAITING_APPROVAL', `${tool}: ${perm.reason}`)
    } catch { /* الحالة قد لا تسمح — الموافقة تُطلب على أي حال */ }
    emit(email, {
      type: 'approval.required',
      taskId,
      tool,
      command: tool === 'terminal' ? String(params.command || '').slice(0, 300) : undefined,
      path: tool === 'filesystem' ? String(params.path || '') : undefined,
      reason: perm.reason,
    })
    const gate = await gateTool({
      email,
      tool,
      command: tool === 'terminal' ? params.command : null,
      cwd: params.cwd || null,
      path: tool === 'filesystem' ? params.path : null,
      action: tool === 'filesystem' ? params.action : null,
      taskId,
      signal,
      source,
      workspace,
    })
    emit(email, {
      type: 'approval.resolved',
      taskId,
      tool,
      decision: gate.approved ? 'approved' : 'rejected',
      reason: gate.reason || null,
    })
    if (!gate.approved) {
      try { transitionTask(taskId, 'CANCELLED', gate.reason || 'approval rejected') } catch { /* noop */ }
      return { ok: false, denied: true, reason: gate.reason || 'approval rejected' }
    }
    try { transitionTask(taskId, 'EXECUTING', `${tool} approved`) } catch { /* noop */ }
  }

  // ── التنفيذ الحقيقي ──
  if (tool === 'terminal') {
    const command = String(params.command || '')
    emit(email, { type: 'command.started', taskId, command: command.slice(0, 300), cwd: params.cwd || '.' })
    const out = await tools.terminal.run({
      command,
      cwd: params.cwd || null,
      workspace,
      signal,
      onData: (kind, chunk) => {
        emit(email, { type: 'command.output', taskId, kind, text: String(chunk).slice(0, 4000) })
      },
    })
    recordCommand(taskId, command, out.code)
    emit(email, { type: 'command.finished', taskId, command: command.slice(0, 300), code: out.code, ok: out.ok })
    audit({ user: email, agent: 'orchestrator', action: `terminal:${command.slice(0, 120)}`, result: `exit ${out.code}`, status: out.ok ? 'ok' : 'error' })
    return out
  }

  if (tool === 'filesystem') {
    const action = String(params.action || '')
    const rel = String(params.path || '')
    emit(email, { type: 'tool.started', taskId, tool: 'filesystem', action, path: rel })
    let existed = false
    try { existed = fs.existsSync(`${workspace}/${rel}`) } catch { /* noop */ }
    const out = await tools.filesystem.run({ action, path: rel, content: params.content, workspace })
    if (out && out.ok) {
      if (action === 'writeFile') {
        recordFile(taskId, rel, existed ? 'modified' : 'created')
        emit(email, { type: existed ? 'file.modified' : 'file.created', taskId, path: rel })
      } else if (action === 'appendFile' || action === 'replaceInFile') {
        recordFile(taskId, rel, 'modified')
        emit(email, { type: 'file.modified', taskId, path: rel })
      } else if (action === 'deleteFile') {
        recordFile(taskId, rel, 'deleted')
        emit(email, { type: 'file.deleted', taskId, path: rel })
      }
    } else {
      emit(email, { type: 'error', taskId, message: String(out?.error || 'filesystem failed'), data: { tool, action, path: rel } })
    }
    audit({ user: email, agent: 'orchestrator', action: `fs:${action}:${rel}`, result: out?.ok ? 'ok' : String(out?.error), status: out?.ok ? 'ok' : 'error' })
    return out
  }

  // web_fetch — قراءة فقط.
  emit(email, { type: 'tool.started', taskId, tool: 'web_fetch', url: params.url })
  const out = await tools.web_fetch.run({ url: params.url })
  emit(email, { type: 'tool.output', taskId, tool: 'web_fetch', ok: out?.ok, status: out?.status })
  return out
}
