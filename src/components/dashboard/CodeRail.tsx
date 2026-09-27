import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Code2, Zap, CheckCircle2 } from 'lucide-react'
import { useApp } from '../../store/app'

/** تلوين خفيف للكود (بدون مكتبات ثقيلة): تعليقات/نصوص/كلمات/وسوم/أرقام */
function highlight(code: string, file: string): string {
  const lang = file.split('.').pop()?.toLowerCase() || ''
  let s = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  // تعليقات أولًا (قبل إدخال أي وسوم)
  s = s.replace(/(&lt;!--[\s\S]*?--&gt;|\/\*[\s\S]*?\*\/)/g, '<span class="tok-com">$1</span>')
  // وسوم HTML
  if (['html', 'htm'].includes(lang)) {
    s = s.replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, '$1<span class="tok-tag">$2</span>')
  }
  // النصوص (بصيغها المهرّبة فقط — لا تمس الوسوم المدخلة لأنها بلا &quot;)
  s = s.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="tok-str">$1</span>')
  // الخصائص: اسم=<span نص>قيمة</span> — نعيد تغليفها دون كسر
  s = s.replace(/([a-zA-Z-]+)=<span class="tok-str">(&quot;.*?&quot;)<\/span>/g, '<span class="tok-attr">$1</span>=<span class="tok-str">$2</span>')
  if (!['html', 'htm'].includes(lang)) {
    s = s.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|default|new|class|async|await|try|catch|typeof|document|window)\b/g, '<span class="tok-kw">$1</span>')
    s = s.replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|ms|s)?)\b/g, '<span class="tok-num">$1</span>')
  }
  return s
}

/**
 * لوح الكود الحي: يسار المحادثة (LTR)، يعرض الكود وهو يُكتب حرفًا بحرف
 * بسرعة قراءة بشرية عبر مُسرّع (pacer) — مثل مشاهدة المبرمج يعمل أمامك.
 */
export function CodeRail() {
  const liveFiles = useApp((s) => s.liveFiles)
  const shot = useApp((s) => s.codingShot)
  const codeFiles = useApp((s) => s.codeFiles)
  const activeCodeFile = useApp((s) => s.activeCodeFile)
  const codeFileContent = useApp((s) => s.codeFileContent)
  const busy = useApp((s) => s.busy)
  const railDone = useApp((s) => s.railDone)
  const buildStages = useApp((s) => s.buildStages)
  const setRailOpen = useApp((s) => s.setRailOpen)

  const [shown, setShown] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<string | null>(null)
  const [fast, setFast] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const streamingFile = shot?.typed?.file || null
  const streaming = busy && Object.keys(liveFiles).length > 0

  // المُسرّع: يلحق بالنص القادم من الشبكة بسرعة قراءة (6 أحرف/40ms ≈ 150 حرف/ثا)
  useEffect(() => {
    const step = fast ? 30 : 6
    const id = setInterval(() => {
      setShown((prev) => {
        let changed = false
        const next: Record<string, string> = { ...prev }
        for (const [f, full] of Object.entries(liveFiles)) {
          const cur = next[f] ?? ''
          if (cur.length < full.length) {
            next[f] = full.slice(0, cur.length + step)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 40)
    return () => clearInterval(id)
  }, [liveFiles, fast])

  const files = useMemo(() => {
    const set = new Set<string>()
    for (const f of codeFiles) set.add(f.path)
    for (const f of Object.keys(liveFiles)) set.add(f)
    for (const f of Object.keys(shown)) set.add(f)
    return [...set]
  }, [codeFiles, liveFiles, shown])

  useEffect(() => {
    const target = streamingFile || (files.length ? files[files.length - 1] : activeCodeFile)
    if (target && target !== tab) setTab(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingFile, files.join('|')])

  const current = tab || files[files.length - 1] || activeCodeFile
  const fullLen = current ? (liveFiles[current]?.length ?? shown[current]?.length ?? 0) : 0
  const shownText = current ? (shown[current] ?? (streaming ? '' : (current === activeCodeFile ? (codeFileContent ?? '') : ''))) : ''
  const done = railDone || !!shot?.done

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [shownText])

  const short = (f: string) => f.split('/').pop() || f

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#05080f]" dir="ltr" data-testid="code-rail">
      <style>{`.tok-com{color:#64748b;font-style:italic}.tok-str{color:#86efac}.tok-kw{color:#c4b5fd}.tok-tag{color:#f472b6}.tok-attr{color:#7dd3fc}.tok-num{color:#fbbf24}`}</style>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
        <Code2 size={14} className="shrink-0 text-cyan-300" />
        <span className="text-[11px] font-bold text-slate-300">
          {streaming ? <span className="text-cyan-300">● يُكتب الآن…</span> : done ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={12} /> مكتمل</span> : 'الكود الحي'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setFast((v) => !v)}
            title={fast ? 'سرعة عادية' : 'تسريع ×5'}
            className={`rounded-md p-1.5 ${fast ? 'bg-amber-500/25 text-amber-200' : 'text-slate-500 hover:bg-white/10 hover:text-white'}`}
          >
            <Zap size={13} />
          </button>
          <button onClick={() => setRailOpen(false)} title="إخفاء اللوح" className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>
      {/* مراحل البناء الحقيقية (§34): نقاط مشتقة من آلة الحالة — لا نسب وهمية */}
      {buildStages.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 px-2 py-1" dir="rtl" data-testid="build-stages">
          {buildStages.map((s) => (
            <span
              key={s.id}
              title={s.label}
              className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                s.status === 'done' ? 'bg-emerald-500/15 text-emerald-300'
                : s.status === 'active' ? 'bg-cyan-500/15 text-cyan-200'
                : s.status === 'failed' ? 'bg-red-500/15 text-red-300'
                : 'text-slate-600'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.status === 'done' ? 'bg-emerald-400' : s.status === 'active' ? 'animate-pulse bg-cyan-400' : s.status === 'failed' ? 'bg-red-400' : 'bg-slate-700'}`} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {files.length > 0 && (        <div className="flex items-center gap-1 overflow-x-auto border-b border-white/5 px-1.5 py-1">
          {files.map((f) => (
            <button
              key={f}
              onClick={() => setTab(f)}
              title={f}
              className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] ${current === f ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-500 hover:text-slate-200'}`}
            >
              {short(f)}
              {streamingFile === f && streaming && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />}
            </button>
          ))}
        </div>
      )}
      <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto p-2.5 font-mono text-[12px] leading-relaxed">
        {!current ? (
          <p className="p-4 text-center text-slate-600" dir="rtl">بانتظار بدء البناء…</p>
        ) : (
          <>
            <pre className="text-slate-200" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <code dangerouslySetInnerHTML={{ __html: highlight(shownText || '…', current) }} />
              {streaming && current === (streamingFile || current) && <span className="caret-blink" style={{ color: '#22d3ee' }} />}
            </pre>
            {fullLen > 0 && (
              <p className="mt-1 text-right font-sans text-[10px] text-slate-600" dir="rtl">
                {shownText.length} / {fullLen} حرف
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
