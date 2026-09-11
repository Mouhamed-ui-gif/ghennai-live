import { getToken } from '../../api/client'

export interface SpeechResult {
  text: () => string
  stop: () => void
}

export function startSpeech(lang: string, onState?: (s: 'listening' | 'done' | 'error', detail?: string) => void): SpeechResult | null {
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined
  if (!Ctor) {
    onState?.('error', 'غير مدعوم في هذا المتصفح')
    return null
  }
  const rec = new Ctor()
  rec.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
  rec.interimResults = false
  rec.maxAlternatives = 1
  let result = ''
  rec.onstart = () => onState?.('listening')
  rec.onresult = (ev) => {
    const transcript = ev.results?.[0]?.[0]?.transcript
    if (transcript) result = transcript
    onState?.('done', result)
  }
  rec.onerror = (ev) => {
    onState?.('error', String((ev as { error?: string }).error || 'error'))
    try { rec.stop?.() } catch { /* noop */ }
  }
  rec.onend = () => {
    if (!result) onState?.('done', '')
  }
  try {
    rec.start?.()
  } catch {
    onState?.('error', 'فشل بدء الاستماع')
  }
  return {
    text: () => result,
    stop: () => {
      try { rec.stop?.() } catch { /* noop */ }
    },
  }
}

export type VoiceOpts = { pitch?: number; rate?: number }

/** نبرة مميزة لكل وكيل — تجعل كل وكيل «صوتًا» مختلفًا عن إخوته */
const AGENT_VOICES: Record<string, Required<VoiceOpts>> = {
  Core: { pitch: 0.84, rate: 0.98 },
  Coding: { pitch: 1.06, rate: 1.08 },
  Research: { pitch: 1.0, rate: 1.02 },
  Study: { pitch: 0.94, rate: 0.96 },
  Design: { pitch: 1.12, rate: 1.05 },
  Genie: { pitch: 1.26, rate: 0.9 },
  Voice: { pitch: 1.18, rate: 0.92 },
  General: { pitch: 1.0, rate: 1.02 },
  default: { pitch: 1.0, rate: 1.02 },
}

export function voiceFor(agentId?: string): Required<VoiceOpts> {
  return (agentId && AGENT_VOICES[agentId]) || AGENT_VOICES.default
}

let serverTts = false
export function initVoiceTts(): Promise<boolean> {
  return fetch('/api/voice-available', { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
    .then((r) => r.json().then((d) => (serverTts = !!d?.tts)).catch(() => false))
    .catch(() => false)
}
export const isServerTts = () => serverTts

let serverStt = false
export function initVoiceStt(): Promise<boolean> {
  const probe = () =>
    fetch('/api/stt-available', { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
      .then((r) => r.json().then((d) => (serverStt = !!d?.stt)).catch(() => false))
      .catch(() => false)
  return probe().then((ok) => {
    if (ok) return true
    // whisper يُشغَّل بالخلفية عند بدء الخادم — أعد المحاولة حتى الجهوز
    return new Promise((resolve) => {
      let tries = 0
      const iv = setInterval(async () => {
        tries++
        const on = await probe()
        if (on || tries >= 12) {
          clearInterval(iv)
          resolve(on)
        }
      }, 3000)
    })
  })
}
export const isServerStt = () => serverStt

/** هل يملك المتصفح التعرف الصوتي المدمج (Chrome/Edge فقط)؟ */
export function hasBrowserSpeech(): boolean {
  const w = window as unknown as Record<string, unknown>
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

/** استخدم مسار الخادم عندما يكون جاهزًا، أو عندما لا يملك المتصفح بديلًا أصلًا */
export function shouldUseServerStt(): boolean {
  return isServerStt() || !hasBrowserSpeech()
}

/**
 * تسجيل صوت من الميكروفون → إرسال للخادم → تعرف على الكلام (يعمل على كل المتصفحات)
 * يستخدم MediaRecorder بدل Web Speech API، مع كشف الصمت ليوقف التسجيل تلقائيًا
 */
export function startServerSpeech(lang: string, onState?: (s: 'listening' | 'done' | 'error', detail?: string) => void): SpeechResult | null {
  if (!navigator.mediaDevices?.getUserMedia) {
    onState?.('error', 'الميكروفون غير متاح')
    return null
  }

  let recorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []
  let stream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let raf: number | null = null
  let stopped = false
  let hearSpeech = false
  let silentMs = 0
  let lastMs = Date.now()
  const SILENCE_LIMIT = 1300

  const cleanup = () => {
    stopped = true
    if (raf != null) cancelAnimationFrame(raf)
    raf = null
    try { audioCtx?.close() } catch { /* noop */ }
    audioCtx = null
    try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    try { recorder?.stop() } catch { /* noop */ }
    chunks = []
  }

  const finish = () => {
    if (!stopped) {
      chunks = []
      cleanup()
    }
  }

  const sendAudio = async (blob: Blob) => {
    try {
      const buf = await blob.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const b64 = btoa(binary)
      const token = getToken()
      const resp = await fetch('/api/voice/stt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audio: b64, lang }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        if (!hasBrowserSpeech()) onState?.('error')
        else onState?.('error', 'فشل التعرف على الصوت — أعد المحاولة')
        return
      }
      onState?.('done', data.text || '')
    } catch {
      if (!hasBrowserSpeech()) onState?.('error')
      else onState?.('error', 'فشل التعرف على الصوت — أعد المحاولة')
    }
  }

  const stopRecording = () => {
    if (recorder?.state === 'recording') {
      onState?.('done')
      recorder.stop()
    } else {
      cleanup()
    }
  }

  const watchLevel = () => {
    if (stopped || !analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const x = (data[i] - 128) / 128
      sum += x * x
    }
    const rms = Math.sqrt(sum / data.length)
    const now = Date.now()
    const dt = now - lastMs
    lastMs = now
    if (rms > 0.035) {
      hearSpeech = true
      silentMs = 0
    } else if (hearSpeech) {
      silentMs += dt
      if (silentMs > SILENCE_LIMIT) {
        if (recorder?.state === 'recording') recorder.stop()
        return
      }
    }
    if (!stopped) raf = requestAnimationFrame(watchLevel)
  }

  navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
    stream = s
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/ogg'

    try {
      audioCtx = new AudioContext()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      audioCtx.createMediaStreamSource(s).connect(analyser)
    } catch { /* VAD اختياري */ }

    recorder = new MediaRecorder(s, { mimeType })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      cleanup()
      if (chunks.length) sendAudio(new Blob(chunks, { type: mimeType }))
      else onState?.('error', 'لم يتم التقاط صوت')
    }
    recorder.start()
    onState?.('listening')
    raf = requestAnimationFrame(watchLevel)

    setTimeout(() => {
      if (recorder?.state === 'recording') recorder.stop()
    }, 30000)
  }).catch(() => {
    finish()
    onState?.('error', 'الميكروفون غير متاح')
  })

  return {
    text: () => '',
    stop: stopRecording,
  }
}

/** نطق ردّ الوكيل بالصوت (TTS) مع دعم العربية ونبرة لكل وكيل */
export function speakText(text: string, lang: string, onEnd?: () => void, voice?: VoiceOpts): void {
  const clean = String(text || '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*|__|\*|`|~~/g, '')
    .replace(/[😀-\uFFFF][‍🏽‍♂️️♀️\uFE0F]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 2000)
  if (!clean) return
  if (serverTts) playServerTts(clean, onEnd)
  else speakLocal(clean, lang, onEnd, voice)
}

function playServerTts(clean: string, onEnd?: () => void) {
  const token = getToken()
  fetch('/api/voice/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text: clean }),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('TTS failed')
      const buf = await r.arrayBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); onEnd?.() }
      audio.onerror = () => { URL.revokeObjectURL(url); speakLocal(clean, 'ar', onEnd) }
      audio.play().catch(() => { URL.revokeObjectURL(url); speakLocal(clean, 'ar', onEnd) })
    })
    .catch(() => speakLocal(clean, 'ar', onEnd))
}

function speakLocal(clean: string, lang: string, onEnd?: () => void, voice?: VoiceOpts): void {
  const w = window as unknown as Record<string, unknown>
  const synth = w.speechSynthesis as SpeechSynthesis | undefined
  if (!synth) return
  synth.cancel()
  const utter = new SpeechSynthesisUtterance(clean)
  utter.lang = lang === 'ar' ? 'ar-SA' : lang === 'en' ? 'en-US' : lang && lang.length === 5 && lang.includes('-') ? lang : 'ar-SA'
  utter.rate = voice?.rate ?? 1.02
  utter.pitch = voice?.pitch ?? 1
  const match = synth.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang === 'ar' ? 'ar' : 'en'))
  const pick = match[match.length - 1] || match[0] || undefined
  if (pick) utter.voice = pick
  if (onEnd) {
    utter.onend = onEnd
    utter.onerror = onEnd
  }
  synth.speak(utter)
}

export function stopSpeaking(): void {
  const w = window as unknown as Record<string, unknown>
  const synth = w.speechSynthesis as SpeechSynthesis | undefined
  try {
    synth?.cancel()
  } catch { /* noop */ }
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onstart?: (() => void) | null
  onresult?: ((ev: { results?: { 0: { 0: { transcript?: string } } } }) => void) | null
  onerror?: ((ev: { error?: string }) => void) | null
  onend?: (() => void) | null
  start?: () => void
  stop?: () => void
}