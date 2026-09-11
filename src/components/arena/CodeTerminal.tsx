import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useApp } from '../../store/app'
import { workspace } from '../../api/client'
import { Copy, ClipboardPaste, Eraser, TerminalSquare, GripHorizontal, ChevronDown, Maximize2 } from 'lucide-react'

type LineKind = 'cmd' | 'out' | 'err'

interface PendingLine {
  kind: LineKind
  text: string
}

const PROMPT = '\u001b[38;5;117mu@ghn:~$\u001b[0m '

function sanitize(chunk: string) {
  return chunk.replace(/[^\x20-\x7e\xc0-\xff\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff\n\r\t\u0000-\u0018\u001a-\u001f]/g, '')
}

interface CodeTerminalProps {
  header?: string
  cmdPrefix?: string
  termH?: number
  maxTerm?: boolean
  onMax?: () => void
  onClose?: () => void
  onDragStart?: (e: React.PointerEvent<HTMLDivElement>) => void
}

export function CodeTerminal({ header = 'agent:~$', cmdPrefix = '❯ ', termH, maxTerm, onMax, onClose, onDragStart }: CodeTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const queueRef = useRef<PendingLine[]>([])
  const typingRef = useRef(false)
  const flushedRef = useRef(0)
  const inputRef = useRef('')
  const promptShownRef = useRef(false)

  const lines = useApp((s) => s.termLines)
  const busy = useApp((s) => s.busy)

  const showPrompt = () => {
    const term = termRef.current
    if (!term) return
    if (promptShownRef.current) return
    promptShownRef.current = true
    term.write('\r\n' + PROMPT)
  }

  const pump = () => {
    const term = termRef.current
    if (!term) return
    if (typingRef.current) return
    const item = queueRef.current.shift()
    if (!item) {
      if (!useApp.getState().busy) showPrompt()
      return
    }
    if (item.kind === 'cmd') {
      typingRef.current = true
      promptShownRef.current = false
      term.write(`\r\n${cmdPrefix}`)
      let i = 0
      const t = setInterval(() => {
        term.write(item.text[i] || '')
        i++
        if (i >= item.text.length) {
          clearInterval(t)
          term.write('\r\n')
          typingRef.current = false
          pump()
        }
      }, 14)
    } else {
      const color = item.kind === 'err' ? '\x1b[31m' : item.kind === 'out' ? '\x1b[32m' : ''
      term.write(`\r\n${color}${item.text.replace(/\r?\n$/, '')}\x1b[0m`)
      pump()
    }
  }

  const flush = () => {
    const pending = useApp.getState().termLines
    for (let i = flushedRef.current; i < pending.length; i++) {
      const line = pending[i]
      if (line.kind === 'cmd') {
        queueRef.current.push({ kind: 'cmd', text: line.text.replace(/\n/g, ' ') })
      } else {
        queueRef.current.push({ kind: line.kind, text: line.text })
      }
    }
    flushedRef.current = pending.length
    pump()
  }

  useEffect(() => {
    if (busy) {
      promptShownRef.current = false
      return
    }
    const t = setTimeout(showPrompt, 160)
    return () => clearTimeout(t)
  }, [busy])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      convertEol: true,
      fontSize: 13.5,
      fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
      cursorBlink: true,
      theme: {
        background: '#080b16',
        foreground: '#d6e2f0',
        cursor: '#06b6d4',
        cyan: '#06b6d4',
        green: '#34d399',
        red: '#fb7185',
        brightBlack: '#64748b',
      },
      scrollback: 2000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    termRef.current = term
    fitRef.current = fit
    term.write(`\x1b[38;5;245m$SHELL — ${header}\x1b[0m\r\n`)
    term.write('\x1b[38;5;245mاكتب أمرك مباشرة (مثل: ls)\x1b[0m\r\n')

    term.onData((d) => {
      if (useApp.getState().busy) return
      if (d === '\r') {
        const cmd = inputRef.current.trim()
        const t = termRef.current
        if (!t) return
        inputRef.current = ''
        promptShownRef.current = false
        term.write('\r\n')
        if (!cmd) {
          showPrompt()
          return
        }
        const cwd = useApp.getState().projectName && useApp.getState().projectName !== 'project' ? useApp.getState().projectName : '.'
        workspace
          .run(cwd, cmd)
          .catch((e) => term.write(`\r\n\x1b[31m${String((e as Error).message || e)}\x1b[0m`))
          .finally(() => setTimeout(showPrompt, 500))
      } else if (d === '\x7f' || d === '\x08') {
        if (inputRef.current.length) {
          inputRef.current = inputRef.current.slice(0, -1)
          term.write('\b \b')
        }
      } else if (d === '\x03') {
        inputRef.current = ''
        term.write('^C\r\n')
        promptShownRef.current = false
        showPrompt()
      } else if (d.length === 1 && d.charCodeAt(0) >= 32) {
        const c = sanitize(d)
        if (c) {
          inputRef.current += c
          term.write(c)
        }
      }
    })

    flush()

    const onResize = () => {
      try {
        fit.fit()
      } catch { /* noop */ }
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(host)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines])

  const copyOut = async () => {
    const term = termRef.current
    if (!term) return
    const sel = term.getSelection()
    if (sel) {
      await navigator.clipboard.writeText(sel).catch(() => undefined)
      return
    }
    const rows: string[] = []
    const buf = term.buffer.active
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y)
      if (line) rows.push(line.translateToString())
    }
    await navigator.clipboard.writeText(rows.join('\n')).catch(() => undefined)
    useApp.getState().pushToast({ kind: 'info', message: '✓ نُسخت مخرجات الطرفية' })
  }

  const pasteIn = async () => {
    if (useApp.getState().busy) return
    try {
      const text = await navigator.clipboard.readText()
      if (text) termRef.current?.paste(text)
    } catch { /* clipboard unavailable */ }
  }

  const clearOut = () => {
    const term = termRef.current
    if (!term) return
    inputRef.current = ''
    term.reset()
    term.write(`\x1b[38;5;245m$SHELL — ${header}\x1b[0m\r\n`)
    promptShownRef.current = false
    showPrompt()
  }

  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.closest('button')) return
    onDragStart?.(e)
  }

  return (
    <div data-term-inner className="flex h-full w-full flex-col overflow-hidden bg-[#080b16]">
      <div
        onPointerDown={onBarDown}
        className="flex h-7 shrink-0 cursor-row-resize select-none items-center border-b border-white/10 bg-night-900/80 px-2"
      >
        <GripHorizontal size={12} className="me-1 text-slate-500" />
        <span className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
          <TerminalSquare size={11} className={busy ? 'animate-pulse' : ''} />
          TERMINAL
          <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'animate-pulse bg-emerald-400' : 'bg-emerald-400/60'}`} />
        </span>
        <span className="ms-2 font-mono text-[10px] text-slate-500">{header}</span>
        <span className="flex-1" />
        <span className="me-2 hidden font-mono text-[10px] text-slate-600 sm:block">{termH ?? 0}px</span>
        <button
          onClick={copyOut}
          className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
          title="نسخ"
        >
          <Copy size={12} />
        </button>
        <button
          onClick={pasteIn}
          className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
          title="لصق"
        >
          <ClipboardPaste size={12} />
        </button>
        <button
          onClick={clearOut}
          className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
          title="مسح"
        >
          <Eraser size={12} />
        </button>
        <span className="mx-0.5 h-3 w-px bg-white/10" />
        <button
          onClick={() => onMax?.()}
          className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
          title="تكبير / تصغير"
        >
          <Maximize2 size={12} />
        </button>
        <button
          data-term-close
          onClick={() => onClose?.()}
          className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
          title="إخفاء"
        >
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0 p-2" />
      </div>
    </div>
  )
}