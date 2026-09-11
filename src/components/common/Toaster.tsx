import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useApp, type Toast } from '../../store/app'

const ICONS = {
  success: <CheckCircle2 size={17} className="shrink-0 text-emerald-400" />,
  error: <XCircle size={17} className="shrink-0 text-rose-400" />,
  info: <Info size={17} className="shrink-0 text-cyan-400" />,
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
      {ICONS[toast.kind]}
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-[13px] font-bold text-white">{toast.title}</p>}
        {toast.message && <p className="text-[12px] leading-relaxed text-slate-300">{toast.message}</p>}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Close notification"
        className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useApp((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}