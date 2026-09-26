import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Check, X, Terminal, FolderCog } from 'lucide-react'
import { useApp } from '../../store/app'
import { approvals } from '../../api/client'

/**
 * بطاقات الموافقة الحقيقية — تظهر عندما يطلب الـAgent تنفيذ أمر حساس.
 * [موافقة] تُحرر حلقة الـAgent فعليًا عبر POST /api/approvals/:id/decision.
 */
export function ApprovalDialog() {
  const pending = useApp((s) => s.pendingApprovals)
  const agentMode = useApp((s) => s.agentMode)
  const [busyId, setBusyId] = useState<number | null>(null)

  // احتياط: استطلاع المعلّق كل 5 ثوانٍ تحسبًا لفوات حدث SSE
  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const d = (await approvals.pending()) as { pending?: unknown[] }
        if (!alive || !Array.isArray(d.pending)) return
        const st = useApp.getState()
        st.setApprovals(
          d.pending.map((r) => {
            const row = r as Record<string, unknown>
            const params = (row.params as Record<string, unknown>) || {}
            return {
              id: Number(row.id),
              tool: String(row.tool || 'terminal'),
              command: (params.command as string) ?? null,
              cwd: (params.cwd as string) ?? null,
              path: (params.path as string) ?? null,
              reason: String(row.reason || ''),
              kind: (params.kind as string) ?? null,
            }
          })
        )
      } catch { /* offline — تجاهل */ }
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    approvals
      .mode()
      .then((d) => {
        const m = (d as { mode?: string }).mode
        if (m === 'safe' || m === 'assisted' || m === 'autonomous') useApp.getState().setAgentMode(m)
      })
      .catch(() => undefined)
  }, [])

  const decide = async (id: number, decision: 'approved' | 'rejected') => {
    setBusyId(id)
    try {
      await approvals.decide(id, decision)
      useApp.getState().removeApproval(id)
      useApp.getState().pushActivity({
        agent: 'User',
        message: decision === 'approved' ? `✅ وافق المستخدم على العملية #${id}` : `❌ رفض المستخدم العملية #${id}`,
        status: decision === 'approved' ? 'success' : 'info',
      })
    } catch (err) {
      useApp.getState().pushToast({ kind: 'error', title: 'تعذّر إرسال القرار', message: String((err as Error).message).slice(0, 120) })
    } finally {
      setBusyId(null)
    }
  }

  const setMode = async (mode: 'safe' | 'assisted' | 'autonomous') => {
    try {
      await approvals.setMode(mode)
      useApp.getState().setAgentMode(mode)
    } catch { /* noop */ }
  }

  if (!pending.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-2 px-3" dir="auto">
      {pending.map((a) => (
        <div
          key={a.id}
          className="glass-strong pointer-events-auto w-full max-w-xl rounded-2xl border border-amber-400/30 bg-night-900/95 p-3 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
              {a.tool === 'terminal' ? <Terminal size={15} /> : <FolderCog size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-white">يطلب الـAgent موافقتك ⏸️</p>
              {a.reason && <p className="truncate text-[11px] text-slate-400">{a.reason}{a.kind ? ` · ${a.kind}` : ''}</p>}
            </div>
          </div>
          {(a.command || a.path) && (
            <pre className="mb-2 max-h-28 overflow-auto rounded-xl bg-black/60 p-2.5 font-mono text-[12px] leading-relaxed text-emerald-200" dir="ltr">
              {a.command ? `$ ${a.command}` : a.path}
              {a.cwd && a.cwd !== '.' && `\n# cwd: ${a.cwd}`}
            </pre>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void decide(a.id, 'approved')}
              disabled={busyId === a.id}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/90 px-3 py-2 text-[13px] font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Check size={15} /> موافقة
            </button>
            <button
              onClick={() => void decide(a.id, 'rejected')}
              disabled={busyId === a.id}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-bold text-slate-200 transition hover:bg-rose-500/30 hover:text-white disabled:opacity-50"
            >
              <X size={15} /> رفض
            </button>
          </div>
        </div>
      ))}
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-night-900/90 px-2 py-1 text-[11px] text-slate-300 backdrop-blur-xl">
        {agentMode === 'autonomous' ? <ShieldCheck size={12} className="text-emerald-300" /> : <ShieldAlert size={12} className="text-amber-300" />}
        <span className="me-1">وضع الـAgent:</span>
        {(['safe', 'assisted', 'autonomous'] as const).map((m) => (
          <button
            key={m}
            onClick={() => void setMode(m)}
            className={`rounded-full px-2 py-0.5 font-bold transition ${agentMode === m ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400 hover:text-white'}`}
          >
            {m === 'safe' ? 'آمن' : m === 'assisted' ? 'مساعَد' : 'مستقل'}
          </button>
        ))}
      </div>
    </div>
  )
}
