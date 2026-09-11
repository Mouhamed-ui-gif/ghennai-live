import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Mic, MicOff, Paperclip, ImagePlus, Volume2, VolumeX, Copy, Check, Bot, ChevronDown, SquarePen, RotateCw, Trash2, Pencil, Check as CheckIcon, X, UsersRound, Focus, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useApp } from '../../store/app'
import { useChat } from '../../hooks/useChat'
import { useI18n } from '../../i18n'
import { AGENT_MAP } from '../../config/agents'
import { AgentSelector } from './AgentSelector'
import { Markdown } from '../common/Markdown'
import { resizeImage } from './image'
import { startSpeech, startServerSpeech, speakText, stopSpeaking, voiceFor, shouldUseServerStt, initVoiceStt } from './voice'
import { brain } from '../../api/client'
import { initLive, onLive, onLiveStatus } from '../../api/live'

export function ChatPanel() {
  const { t, lang } = useI18n()
  const msgs = useApp((s) => s.msgs)
  const busy = useApp((s) => s.busy)
  const agent = useApp((s) => s.agent)
  const prefs = useApp((s) => s.prefs)
  const { send, analyzeImage, uploadFile, regenerate, editAndSend } = useChat()

  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [micErr, setMicErr] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const speechRef = useRef<ReturnType<typeof startSpeech> | null>(null)
  const stickRef = useRef(true)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [thumbs, setThumbs] = useState<Record<string, 'up' | 'down' | undefined>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ghn_thumbs') || '{}') as Record<string, 'up' | 'down' | undefined>
    } catch {
      return {}
    }
  })

  const rate = (id: string, v: 'up' | 'down') => {
    const next = { ...thumbs, [id]: thumbs[id] === v ? undefined : v }
    setThumbs(next)
    try {
      localStorage.setItem('ghn_thumbs', JSON.stringify(next))
    } catch { /* noop */ }
  }

  const ts = (t?: number) => (t ? new Date(t).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' }) : '')

  useEffect(() => {
    if (stickRef.current || msgs.some((m) => m.streaming)) {
      endRef.current?.scrollIntoView({ behavior: stickRef.current ? 'auto' : 'smooth' })
    }
  }, [msgs])

  useEffect(() => {
    if (busy) stickRef.current = true
  }, [busy])

  useEffect(() => {
    brain.prefs().then((p) => useApp.getState().setPrefs(p as never)).catch(() => undefined)
    initVoiceStt()
  }, [])

  const focusTick = useApp((s) => s.focusTick)
  useEffect(() => {
    if (focusTick) taRef.current?.focus()
  }, [focusTick])

  useEffect(() => {
    useApp.getState().persistMsgs()
  }, [msgs])

  const toggleTeam = (v: boolean) => {
    useApp.getState().setPrefs({ team: v } as never)
    brain.setPref('team', v).then((p) => useApp.getState().setPrefs(p as never)).catch(() => undefined)
    useApp.getState().pushToast({ kind: v ? 'success' : 'info', title: v ? 'وضع الفريق ⚡' : 'وضع مفرد', message: v ? 'كل وكيل سيراجع من زاويته وينضم لمنظور موازٍ.' : 'الرد الفردي النقي.' })
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    setAtBottom(near)
    if (near) stickRef.current = true
  }

  const toLatest = () => {
    stickRef.current = true
    setAtBottom(true)
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const sendImage = useCallback(
    async (file: File) => {
      setBusyHint(true)
      try {
        const dataUrl = await resizeImage(file, 1024, 0.85)
        const intent = input.trim()
        await analyzeImage(dataUrl, intent || undefined)
      } catch (err) {
        useApp.getState().addAssistantMsg('⚠️ تعذر قراءة الصورة: ' + String((err as Error).message))
      }
      setBusyHint(false)
    },
    [analyzeImage, input]
  )

  const setBusyHint = (b: boolean) => useApp.getState().setBusy(b)

  const submit = async () => {
    const m = input.trim()
    if (!m || busy) return
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    await send(m, agent)
  }

  const resumeText = useApp((s) => s.resumeText)
  useEffect(() => {
    if (!resumeText) return
    useApp.getState().clearResume()
    const text = resumeText
    if (taRef.current) taRef.current.style.height = 'auto'
    void send(text, useApp.getState().agent)
  }, [resumeText])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  // ── وضع المحادثة الصوتية: استمع → أرسل → اقرأ الرد → استمع … (لوكيل «الصوتي») ──
  const [voiceLoop, setVoiceLoop] = useState<boolean>(() => localStorage.getItem('gh_voice_loop') === '1')
  const lastVoiceMsg = useRef('')
  const autoSubmitRef = useRef(false)

  const beginListening = useCallback(
    (autoSubmit: boolean) => {
      if (busy || listening) return
      autoSubmitRef.current = autoSubmit

      const handler = (st: 'listening' | 'done' | 'error', detail?: string) => {
        if (st === 'error') {
          setListening(false)
          setMicErr(detail || t('voice.unsupported'))
          autoSubmitRef.current = false
        } else if (st === 'listening') {
          setListening(true)
        } else if (st === 'done') {
          setListening(false)
          if (detail && autoSubmitRef.current) {
            autoSubmitRef.current = false
            setInput('')
            void send(detail, 'Voice')
          } else if (detail) {
            setInput(detail)
          }
          autoSubmitRef.current = false
        }
      }

      if (shouldUseServerStt()) {
        const s = startServerSpeech(lang, handler)
        speechRef.current = s
      } else {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then((stream) => { stream.getTracks().forEach((tr) => tr.stop()) })
          .then(() => {
            const s = startSpeech(lang, handler)
            speechRef.current = s
          })
          .catch(() => {
            setMicErr(t('voice.permission'))
            useApp.getState().pushToast({ kind: 'error', message: t('voice.permission') })
            setListening(false)
          })
      }
    },
    [busy, lang, listening, send, t]
  )

  useEffect(() => {
    if (!voiceLoop || (agent !== 'Voice' && agent !== 'Genie')) return
    if (busy) return
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'assistant' || last.streaming) return
    if (lastVoiceMsg.current === last.id) return
    lastVoiceMsg.current = last.id
    const content = last.content
    stopSpeaking()
    const iv = setTimeout(() => {
      speakText(content, lang, () => setTimeout(() => beginListening(true), 350), voiceFor(agent))
    }, 450)
    return () => clearTimeout(iv)
  }, [msgs, busy, agent, lang, voiceLoop, beginListening])

  const toggleMic = async () => {
    setMicErr(null)
    if (listening) {
      speechRef.current?.stop()
      setListening(false)
      return
    }
    if (voiceLoop) {
      beginListening(true)
      return
    }

    if (shouldUseServerStt()) {
      const s = startServerSpeech(lang, (st, detail) => {
        if (st === 'error') { setMicErr(detail || t('voice.unsupported')); setListening(false) }
        else if (st === 'done' && detail) { setInput(detail); setListening(false) }
        else if (st === 'done') { setListening(false) }
        else if (st === 'listening') { setListening(true) }
      })
      speechRef.current = s
      setListening(true)
      return
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
        s.getTracks().forEach((t2) => t2.stop())
      })
    } catch {
      setMicErr(t('voice.permission'))
      useApp.getState().pushToast({ kind: 'error', message: t('voice.permission') })
      setListening(false)
      return
    }
    const s = startSpeech(
      lang,
      (st, detail) => {
        if (st === 'error') {
          setMicErr(detail || t('voice.unsupported'))
          setListening(false)
        } else if (st === 'done' && detail) {
          setInput(detail)
          setListening(false)
        } else if (st === 'done') {
          setListening(false)
        } else if (st === 'listening') {
          setListening(true)
        }
      }
    )
    if (!s) {
      setMicErr(t('voice.unsupported'))
      return
    }
    speechRef.current = s
    setListening(true)
  }

  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── قناة المحادثة اللحظية (WebSocket): خطّ البناء يملأ الطرفية حيًّا ──
  const [liveOn, setLiveOn] = useState(false)
  useEffect(() => {
    initLive()
    const offS = onLiveStatus((s) => setLiveOn(s === 'on'))
    const offE = onLive((e) => {
      if (e.type !== 'brain_feed') return
      const f = e as unknown as { from?: string; to?: string; message?: string; kind?: string }
      const team = /^(Architect|Coder|Designer|Teacher|Genie)$/i.test(f.from || '') || /^(Architect|Coder|Designer|Teacher|Genie)$/i.test(f.to || '')
      if (team && f.message) {
        useApp.getState().pushTerm({ kind: 'out', text: `🧠 ${f.from || '؟'}${f.to ? ` ← ${f.to}` : ''}: ${String(f.message).replace(/\n/g, ' ').slice(0, 200)}\n` })
      }
    })
    return () => { offS(); offE() }
  }, [])
  const speak = (id: string, text: string, reqAgent?: string) => {
    if (speakingId === id) {
      stopSpeaking()
      setSpeakingId(null)
      return
    }
    speakText(text, lang, () => setSpeakingId(null), voiceFor(reqAgent || agent))
    setSpeakingId(id)
  }

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1400)
    }).catch(() => undefined)
  }

  const removePair = (targetId: string, role: 'user' | 'assistant') => {
    const { msgs: current } = useApp.getState()
    const idx = current.findIndex((m) => m.id === targetId)
    if (idx === -1) return
    let drop = new Set([targetId])
    if (role === 'assistant') {
      const prevUser = [...current.slice(0, idx)].reverse().find((m) => m.role === 'user')
      if (prevUser) drop.add(prevUser.id)
    } else {
      const next = current[idx + 1]
      if (next && next.role === 'assistant') drop.add(next.id)
    }
    useApp.getState().setMsgs(current.filter((m) => !drop.has(m.id)))
  }

  const startEdit = (id: string, content: string) => {
    setEditingId(id)
    setEditText(content)
  }

  const saveEdit = (index: number) => {
    if (!editText.trim()) return
    void editAndSend(index, editText, agent)
    setEditingId(null)
    setEditText('')
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    if (f.type.startsWith('image/')) void sendImage(f)
    else void uploadFile(f)
  }

  const a = AGENT_MAP[agent]

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-transparent">
      <div className="border-b border-white/10 bg-night-900/30 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 px-4 pt-2">
          <button
            onClick={() => toggleTeam(!!!prefs.team)}
            aria-pressed={!!prefs.team}
            data-team={prefs.team ? 'on' : 'off'}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
              prefs.team ? 'text-cyan-300 ring-1 ring-cyan-400/30 bg-cyan-400/10' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={lang === 'ar' ? 'الثقب الأسود: وضع الفريق — كل وكيل يضيف منظوره' : 'Team Mode — every agent adds its perspective'}
          >
            <UsersRound size={14} />
            {lang === 'ar' ? 'وضع الفريق' : 'Team'}
            <span className={`flex h-4 w-7 items-center rounded-full p-0.5 transition ${prefs.team ? 'bg-cyan-400' : 'bg-white/15'}`}>
              <span className={`h-3 w-3 rounded-full bg-white shadow transition-transform ${prefs.team ? 'translate-x-3 rtl:-translate-x-3' : ''}`} />
            </span>
          </button>
<span data-live className={`chip !py-1 me-1 text-[10px] ${liveOn ? '!border-emerald-400/40 !text-emerald-300' : '!border-slate-500/40 !text-slate-500'}`} title="قناة المحادثة اللحظية (WebSocket)">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${liveOn ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
          {liveOn ? (lang === 'ar' ? 'حي' : 'Live') : '…'}
        </span>
        <button
          onClick={() => useApp.getState().resetChat()}
            aria-label={t('chat.new')}
            title={`${t('chat.new')} (⌘N)`}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <SquarePen size={14} />
            {t('chat.new')}
          </button>
        <button
          data-zen
          onClick={() => useApp.getState().setZen(!useApp.getState().zen)}
          aria-pressed={useApp((s) => s.zen)}
          title={lang === 'ar' ? 'وضع التركيز — يخفي كل ما عدا الدردشة (Esc للخروج)' : 'Zen mode — hide everything but chat (Esc to exit)'}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs transition ${
            useApp((s) => s.zen) ? 'text-amber-300 ring-1 ring-amber-400/30 bg-amber-400/10' : 'text-slate-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Focus size={14} />
          {lang === 'ar' ? 'زين' : 'Zen'}
        </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {drag && (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-cyan-500/10 backdrop-blur-sm">
            <div className="glass-strong rounded-3xl px-10 py-8 text-center">
              <ImagePlus size={40} className="mx-auto text-cyan-400" />
              <p className="mt-3 font-bold text-white">{t('vision.drop')}</p>
            </div>
          </div>
        )}

        <div className={`relative mx-auto max-w-3xl ${msgs.length ? '' : 'flex min-h-full flex-col'}`}>
          {!msgs.length && (
            <>
              <div data-empty-greeting className="flex flex-1 flex-col items-center justify-center pt-4 text-center">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-2xl"
                  style={{ color: a.color, boxShadow: `0 0 34px ${a.world.glow}` }}
                >
                  {a.world.symbol}
                </span>
                <h2 className="mt-3 text-xl font-bold" style={{ color: a.color }} dir="auto">
                  {t(('agent.' + agent) as never)}
                </h2>
                <p className="mt-1 max-w-md text-sm text-slate-300">{lang === 'ar' ? a.world.taglineAr : a.world.taglineEn}</p>
              </div>

              <div className="mb-2 flex flex-wrap justify-center gap-2">
                {['ابنِ لي موقعًا عن القهوة ☕', 'حلّل هذه الصورة 🖼️', 'عدّل الموقع الذي بنيته أمس', 'اشرح لي مفهوم الذكاء الاصطناعي'].map((p) => (
                  <button key={p} onClick={() => { setInput(p); void send(p, agent) }} className="chip !py-2 text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white">
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}

          {msgs.map((m, i) => {
            const isUser = m.role === 'user'
            const color = m.agent ? (AGENT_MAP[m.agent as keyof typeof AGENT_MAP]?.color ?? '#94a3b8') : '#94a3b8'
            const lastUserText = (() => {
              const um = [...msgs].slice(0, i).reverse().find((x) => x.role === 'user')
              return um ? um.content : ''
            })()
            return (
              <div key={m.id} className={`group msg-in mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] sm:max-w-[80%] ${isUser ? 'text-start' : 'text-start'}`}>
                  {!isUser && (
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                      {m.agent || 'Ghennai'}
                      <span className={`flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100`}>
                        <button onClick={() => speak(m.id, m.content, m.agent)} aria-label="نطق الرد" className={`rounded p-1 transition ${speakingId === m.id ? 'text-cyan-300' : 'text-slate-500 hover:text-white'}`}>
                          {speakingId === m.id ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                        <button onClick={() => copy(m.id, m.content)} aria-label="نسخ" className="rounded p-1 text-slate-500 transition hover:text-white">
                          {copiedId === m.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                        <button onClick={() => regenerate(lastUserText, m.agent)} aria-label="إعادة توليد" className="rounded p-1 text-slate-500 transition hover:text-white" title="إعادة توليد">
                          <RotateCw size={12} />
                        </button>
                        <button onClick={() => removePair(m.id, 'assistant')} aria-label="حذف" className="rounded p-1 text-slate-500 transition hover:text-rose-400" title="حذف">
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </p>
                  )}
                  <div
                    className={`relative rounded-3xl px-4 py-3 text-[14px] transition-shadow ${
                      isUser
                        ? 'rounded-ee-lg bg-gradient-to-l from-cyan-500/90 to-violet-500/90 text-white shadow-[0_6px_30px_rgba(6,182,212,.3)]'
                        : 'rounded-es-lg glass-strong text-slate-100'
                    } ${m.streaming ? 'ring-1 ring-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,.12)]' : ''}`}
                  >
                    {isUser ? (
                      editingId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(i) }
                              if (e.key === 'Escape') { setEditingId(null); setEditText('') }
                            }}
                            className="input-lg !rounded-2xl !border-white/25 !bg-black/30 text-white"
                            rows={2}
                          />
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => saveEdit(i)} className="flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/30">
                              <CheckIcon size={12} /> {t('chat.send')}
                            </button>
                            <button onClick={() => { setEditingId(null); setEditText('') }} className="rounded-lg px-2 py-1 text-[11px] text-white/80 hover:bg-white/10">
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                          <span className={`absolute -bottom-3 end-2 flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 opacity-0 backdrop-blur transition group-hover:opacity-100`}>
                            <span className="px-0.5 text-[10px] text-slate-400">{ts(m.ts)}</span>
                            <button onClick={() => startEdit(m.id, m.content)} aria-label="تعديل" className="rounded p-1 text-slate-300 hover:text-cyan-300" title="تعديل وإعادة إرسال">
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => copy(m.id, m.content)} aria-label="نسخ" className="rounded p-1 text-slate-300 hover:text-white">
                              {copiedId === m.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            </button>
                            <button onClick={() => removePair(m.id, 'user')} aria-label="حذف" className="rounded p-1 text-slate-300 hover:text-rose-400">
                              <Trash2 size={11} />
                            </button>
                          </span>
                        </>
                      )
                    ) : (
                      <>
                        <Markdown text={m.content} />
                        {m.streaming && <span className="caret-blink" style={{ color }} aria-hidden="true" />}
                        {!m.streaming && (
                          <div className="mt-2 flex items-center gap-1 border-t border-white/5 pt-1.5">
                            <span className="text-[10px] text-slate-500">{ts(m.ts)}</span>
                            <span className="flex-1" />
                            <button
                              data-thumbs-up
                              onClick={() => rate(m.id, 'up')}
                              aria-label="مفيد"
                              title="مفيد / غير مفيد"
                              className={`rounded p-1 transition ${thumbs[m.id] === 'up' ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-500 hover:text-white'}`}
                            >
                              <ThumbsUp size={12} />
                            </button>
                            <button
                              data-thumbs-down
                              onClick={() => rate(m.id, 'down')}
                              aria-label="غير مفيد"
                              title="مفيد / غير مفيد"
                              className={`rounded p-1 transition ${thumbs[m.id] === 'down' ? 'bg-rose-400/15 text-rose-300' : 'text-slate-500 hover:text-white'}`}
                            >
                              <ThumbsDown size={12} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {busy && !msgs.some((m) => m.streaming) && (
            <div className="msg-in mb-4 flex justify-start">
              <div className="glass-strong flex items-center gap-2 rounded-3xl rounded-es-lg px-4 py-3 text-sm text-slate-200">
                <Bot size={15} style={{ color: a.color }} />
                <span className="flex gap-1.5" aria-label={t('arena.running')}>
                  {[0, 1, 2].map((j) => (
                    <span key={j} className="typing-dot" style={{ color: a.color, animationDelay: `${j * 0.16}s` }} />
                  ))}
                </span>
                <span className="text-[11px] text-slate-400">{t('arena.running')}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {!atBottom && msgs.length > 0 && (
          <button onClick={toLatest} className="scr-latest" aria-label="العودة لآخر رسالة">
            <ChevronDown size={15} className="text-cyan-400" />
            {t('chat.scrollToLatest')}
          </button>
        )}
      </div>

      <div className="border-t border-white/10 bg-night-900/40 p-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = !voiceLoop
                setVoiceLoop(next)
                localStorage.setItem('gh_voice_loop', next ? '1' : '0')
                if (!next) {
                  speechRef.current?.stop()
                  stopSpeaking()
                  setListening(false)
                }
              }}
              data-voice-loop
              aria-pressed={voiceLoop}
              title={lang === 'ar' ? 'محادثة صوتية حية: استمع → أرسل → اقرأ الرد (الوكيل الصوتي)' : 'Live voice conversation: listen → send → read reply (Voice agent)'}
              className={`relative rounded-xl p-2.5 transition ${voiceLoop ? 'text-white ring-1 ring-sky-400/50 bg-sky-400/15' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            >
              <Volume2 size={17} className={voiceLoop ? 'animate-pulse' : ''} />
            </button>
            <button onClick={() => fileRef.current?.click()} aria-label="رفع ملف" className="rounded-xl p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white" title="رفع ملف">
              <Paperclip size={18} />
            </button>
            <button onClick={() => imgRef.current?.click()} aria-label={t('arena.files')} className="rounded-xl p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white" title={t('arena.files')}>
              <ImagePlus size={18} />
            </button>
            <button
              onClick={toggleMic}
              data-mic
              aria-label={t('voice.speak')}
              className={`relative rounded-xl p-2.5 transition ${listening ? 'text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
              title={t('voice.speak')}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-xl" style={{ background: a.world.glow }} />}
              {listening ? <MicOff size={18} className="relative animate-pulse" /> : <Mic size={18} className="relative" />}
            </button>
          </div>

          <div className="flex-1">
            {micErr && <p className="mb-1 text-[11px] text-rose-300">{micErr}</p>}
            <textarea
              ref={taRef}
              value={input}
              disabled={busy}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
              }}
              onKeyDown={onKey}
              rows={1}
              className="input-lg max-h-[140px] resize-none !rounded-3xl !border-white/20 py-3"
              placeholder={listening ? `🎙️ ${t('voice.speak')}` : t('chat.placeholder')}
              dir="auto"
            />
          </div>

          <AgentSelector />

          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="btn-primary shine !rounded-3xl !px-4 !py-3 disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${a.color}, ${a.world.glow})` }}
            aria-label={t('chat.send')}
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400">
          GHENNAI · صُنع بواسطة <b className="text-white/70">محمد غناي</b> · Ollama محلي · بياناتك على جهازك · <span style={{ color: a.color }}>{agent}</span>
        </p>
      </div>

      <input ref={fileRef} type="file" multiple={false} hidden onChange={(e) => e.target.files?.[0] && void uploadFile(e.target.files[0])} />
      <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void sendImage(e.target.files[0])} />
    </div>
  )
}