import express from 'express'
import '../lib/env.js'
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const router = express.Router()

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || ''
const VOICE = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
const GOOGLE_STT_KEY = process.env.GOOGLE_STT_API_KEY || ''
const WHISPER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:8082'
const THIRD = join(dirname(fileURLToPath(import.meta.url)), '..', 'third')

export const ttsAvailable = () => !!ELEVEN_KEY

let whisperOk = false
let whisperCheckedAt = 0
async function checkWhisper() {
  if (Date.now() - whisperCheckedAt < 5000) return whisperOk
  try {
    const r = await fetch(`${WHISPER_URL}/health`, { signal: AbortSignal.timeout(3000) })
    whisperOk = r.ok
  } catch {
    whisperOk = false
  }
  whisperCheckedAt = Date.now()
  return whisperOk
}
export const whispering = () => whisperOk
export const isSttAvailable = async () => (GOOGLE_STT_KEY ? true : await checkWhisper())
/** متوافق أبي مع الواجهة الحالية */
export const sttAvailable = () => !!GOOGLE_STT_KEY || whisperOk

/** جوجل TTS مجانية (بدون مفتاح) — صوت عربي موثوق كاحتياط */
async function googleTts(text, lang) {
  const tl = lang === 'en' ? 'en' : 'ar'
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(text.slice(0, 200))}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`google tts ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** ElevenLabs — إن لم يكن الخطة المجانية يحجبها ننتقل لجوجل تلقائيًا */
async function elevenTts(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVEN_KEY },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.7, style: 0.4, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`elevenlabs ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

router.post('/tts', express.json(), async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 2000)
  const lang = String(req.body?.lang || 'ar').slice(0, 8)
  if (!text) return res.status(400).json({ error: 'text required' })
  try {
    let buf = null
    if (ELEVEN_KEY) {
      try { buf = await elevenTts(text) } catch { buf = null }
    }
    if (!buf) buf = await googleTts(text, lang)
    if (!buf || !buf.length) throw new Error('no audio')
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.send(buf)
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 160) })
  }
})

router.post('/stt', express.json({ limit: '10mb' }), async (req, res) => {
  const audioB64 = String(req.body?.audio || '')
  const lang = String(req.body?.lang || 'ar').slice(0, 8)
  if (!audioB64) return res.status(400).json({ error: 'audio required' })

  // 1) Google STT (السريع) إن كان المفتاح موجودًا
  if (GOOGLE_STT_KEY) {
    try {
      const langCode = lang === 'en' ? 'en-US' : 'ar-SA'
      const resp = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_STT_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              encoding: 'WEBM_OPUS',
              sampleRateHertz: 48000,
              languageCode: langCode,
              alternativeLanguageCodes: lang === 'ar' ? ['en-US'] : ['ar-SA'],
              enableAutomaticPunctuation: true,
            },
            audio: { content: audioB64 },
          }),
          signal: AbortSignal.timeout(30000),
        }
      )
      const data = await resp.json()
      const tr = data?.results?.[0]?.alternatives?.[0]?.transcript || ''
      if (tr) return res.json({ text: tr, engine: 'google' })
    } catch { /* ننتقل لمحرك whisper المحلي */ }
  }

  // 2) Whisper المحلي — يعمل على كل المتصفحات بلا حسابات ولا إنترنت
  const ok = await checkWhisper()
  if (!ok) {
    const launched = await ensureWhisperServer()
    if (!launched && !whisperOk) return res.status(500).json({ error: 'تعذر تشغيل محرك التعرف على الصوت' })
  }
  try {
    const wav = Buffer.from(audioB64, 'base64')
    const file = join(tmpdir(), `ghn-voice-${Date.now()}`)
    await fsp.writeFile(file + '.webm', wav)
    try {
      await ffmpegToWav(file + '.webm', file + '.wav')
    } catch (convErr) {
      // إن فشل التحويل جرّب الملف كما هو (webm)
      await fsp.rename(file + '.webm', file + '.wav').catch(() => undefined)
    }
    const body = new FormData()
    body.append('file', new Blob([await fsp.readFile(file + '.wav')], { type: 'audio/wav' }), 'voice.wav')
    if (lang === 'ar' || lang === 'en' || lang.startsWith('ar') || lang.startsWith('en')) body.append('language', lang.startsWith('en') ? 'en' : 'ar')
    body.append('response_format', 'json')
    const r = await fetch(`${WHISPER_URL}/inference`, { method: 'POST', body, signal: AbortSignal.timeout(120000) })
    const d = await r.json()
    await fsp.rm(file + '.webm', { force: true }).catch(() => undefined)
    await fsp.rm(file + '.wav', { force: true }).catch(() => undefined)
    const text = String(d?.text || '').replace(/\n/g, ' ').trim()
    res.json({ text, engine: text ? 'whisper' : 'empty' })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 160) })
  }
})

function ffmpegToWav(src, dst) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ar', '16000', '-ac', '1', dst], (err) => (err ? reject(err) : resolve()))
  })
}

/** يضمن تشغيل خادم whisper.cpp المحلي — يستدعى عند أول طلب إن لم يكن يعمل */
let bootPromise = null
export function ensureWhisperServer() {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    if (await checkWhisper()) return true
    try {
      const { spawn } = await import('node:child_process')
      const bin = join(THIRD, 'whisper.cpp', 'build', 'bin', 'whisper-server')
      const model = join(THIRD, 'models', 'ggml-small.bin')
      const { existsSync } = await import('node:fs')
      if (!existsSync(bin) || !existsSync(model)) return false
      const child = spawn(bin, ['-m', model, '-l', 'auto', '-nt', '--beam-size', '1', '--best-of', '1', '--host', '127.0.0.1', '--port', '8082'], { detached: true, stdio: 'ignore', cwd: THIRD })
      child.on('error', () => { whisperOk = false })
      child.unref()
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        if (await checkWhisper()) { whisperOk = true; return true }
      }
    } catch { /* noop */ }
    whisperOk = false
    return false
  })()
  return bootPromise
}

export default router