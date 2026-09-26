/**
 * OpenCodeAdapter — تكامل حقيقي مع OpenCode CLI (القسم 15).
 * - الكشف: which opencode + opencode --version (حقيقي، يُعاد عند كل فحص).
 * - التنفيذ: `opencode run <prompt>` داخل workspace المستخدم (spawn حقيقي).
 * - المصادقة: فحص ملف الإعداد العام أو مفاتيح المزودات في البيئة — وتُعلن
 *   النتيجة كما هي (configured true/false) دون ادعاء اتصال.
 */
import { ProviderAdapter } from './base.js'
import { detectBinary } from './detect.js'
import { runCli } from './cliRunner.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function authProbe() {
  const home = os.homedir()
  const candidates = [
    path.join(home, '.config', 'opencode', 'opencode.json'),
    path.join(home, '.config', 'opencode', 'opencode.jsonc'),
    path.join(process.cwd(), 'opencode.json'),
    path.join(process.cwd(), 'opencode.jsonc'),
  ]
  const found = candidates.find((p) => { try { return fs.existsSync(p) } catch { return false } })
  const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY']
  const envHit = envKeys.filter((k) => process.env[k])
  return { configFile: found || null, envKeys: envHit }
}

export class OpenCodeAdapter extends ProviderAdapter {
  constructor() {
    super({ name: 'opencode', kind: 'cli-agent', capabilities: ['coding', 'execute', 'stream'] })
  }

  async detect() {
    return detectBinary('opencode', ['--version'])
  }

  async authentication() {
    const { configFile, envKeys } = authProbe()
    if (configFile || envKeys.length) {
      return { configured: true, detail: `config: ${configFile || 'none'}, env keys: ${envKeys.join(',') || 'none'}` }
    }
    return { configured: false, detail: 'no opencode config file and no provider API keys in env' }
  }

  async execute({ prompt, cwd = '.', email, timeoutMs = 600000, signal = null }) {
    if (!prompt) throw new Error('prompt required')
    if (!email) throw new Error('email required (workspace jail)')
    const d = await this.detect()
    if (!d.available) return { ok: false, error: `opencode unavailable: ${d.reason}` }
    const runId = randomUUID().slice(0, 8)
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', onExternalAbort, { once: true })
    }
    this._track(runId, async () => controller.abort())
    try {
      const r = await runCli({
        bin: d.path || 'opencode',
        email,
        cwd,
        args: ['run', prompt],
        timeoutMs,
        signal: controller.signal,
      })
      return { ok: r.ok, runId, exitCode: r.exitCode, output: r.stdout, stderr: r.stderr, timedOut: r.timedOut, cancelled: !!r.cancelled }
    } finally {
      this._untrack(runId)
      if (signal) {
        try { signal.removeEventListener('abort', onExternalAbort) } catch { /* noop */ }
      }
    }
  }

  async stream({ prompt, cwd = '.', email, timeoutMs = 600000, signal = null }, onData) {
    if (!prompt) throw new Error('prompt required')
    if (!email) throw new Error('email required (workspace jail)')
    const d = await this.detect()
    if (!d.available) return { ok: false, error: `opencode unavailable: ${d.reason}` }
    const runId = randomUUID().slice(0, 8)
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', onExternalAbort, { once: true })
    }
    this._track(runId, async () => controller.abort())
    try {
      const r = await runCli({
        bin: d.path || 'opencode',
        email,
        cwd,
        args: ['run', prompt],
        timeoutMs,
        signal: controller.signal,
        onData: (kind, chunk) => { if (onData) onData(kind, chunk) },
      })
      return { ok: r.ok, runId, exitCode: r.exitCode, output: r.stdout, stderr: r.stderr, timedOut: r.timedOut, cancelled: !!r.cancelled }
    } finally {
      this._untrack(runId)
      if (signal) {
        try { signal.removeEventListener('abort', onExternalAbort) } catch { /* noop */ }
      }
    }
  }
}
