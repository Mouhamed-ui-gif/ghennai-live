/**
 * CrushAdapter — تكامل حقيقي مع Crush CLI (v0.89.0، مُتحقق).
 * - الكشف: which crush + crush --version.
 * - التنفيذ: `crush run -m gemini/gemini-3.6-flash <prompt>` داخل workspace المستخدم.
 * - المصادقة: crush لا يملك إعدادًا محليًا هنا، لكنه يقبل GEMINI_API_KEY من البيئة
 *   (مُتحقق فعليًا: ردّ AUTH_OK). المفتاح يُمرَّر للعملية الفرعية فقط عبر envExtra
 *   ولا يُطبع أو يُسجَّل أبدًا. إن غاب المفتاح من بيئة الخادم أُعلن ذلك بصدق.
 */
import { ProviderAdapter } from './base.js'
import { detectBinary } from './detect.js'
import { runCli } from './cliRunner.js'
import { randomUUID } from 'node:crypto'

const CRUSH_MODEL = process.env.CRUSH_MODEL || 'gemini/gemini-3.6-flash'

export class CrushAdapter extends ProviderAdapter {
  constructor() {
    super({ name: 'crush', kind: 'cli-agent', capabilities: ['coding', 'execute', 'stream'] })
  }

  async detect() {
    return detectBinary('crush', ['--version'])
  }

  async authentication() {
    if (process.env.GEMINI_API_KEY) {
      return { configured: true, detail: `env GEMINI_API_KEY present; model ${CRUSH_MODEL}` }
    }
    return { configured: false, detail: 'no GEMINI_API_KEY in server env and no crush provider configured (crush asks interactive setup)' }
  }

  _wire(runId, externalSignal) {
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort()
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort()
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }
    this._track(runId, async () => controller.abort())
    return { controller, done: () => {
      this._untrack(runId)
      if (externalSignal) { try { externalSignal.removeEventListener('abort', onExternalAbort) } catch { /* noop */ } }
    } }
  }

  _env() {
    // المفتاح فقط — لا أسماء، لا قيم في السجلات
    const extra = {}
    if (process.env.GEMINI_API_KEY) extra.GEMINI_API_KEY = process.env.GEMINI_API_KEY
    return extra
  }

  async execute({ prompt, cwd = '.', email, timeoutMs = 600000, signal = null }) {
    if (!prompt) throw new Error('prompt required')
    if (!email) throw new Error('email required (workspace jail)')
    const d = await this.detect()
    if (!d.available) return { ok: false, error: `crush unavailable: ${d.reason}` }
    const auth = await this.authentication()
    if (!auth.configured) return { ok: false, error: `crush not configured: ${auth.detail}` }
    const runId = randomUUID().slice(0, 8)
    const { controller, done } = this._wire(runId, signal)
    try {
      const r = await runCli({
        bin: d.path || 'crush',
        email,
        cwd,
        args: ['run', '-m', CRUSH_MODEL, prompt],
        timeoutMs,
        signal: controller.signal,
        envExtra: this._env(),
      })
      return { ok: r.ok, runId, exitCode: r.exitCode, output: r.stdout, stderr: r.stderr, timedOut: r.timedOut, cancelled: !!r.cancelled }
    } finally {
      done()
    }
  }

  async stream({ prompt, cwd = '.', email, timeoutMs = 600000, signal = null }, onData) {
    if (!prompt) throw new Error('prompt required')
    if (!email) throw new Error('email required (workspace jail)')
    const d = await this.detect()
    if (!d.available) return { ok: false, error: `crush unavailable: ${d.reason}` }
    const auth = await this.authentication()
    if (!auth.configured) return { ok: false, error: `crush not configured: ${auth.detail}` }
    const runId = randomUUID().slice(0, 8)
    const { controller, done } = this._wire(runId, signal)
    try {
      const r = await runCli({
        bin: d.path || 'crush',
        email,
        cwd,
        args: ['run', '-m', CRUSH_MODEL, prompt],
        timeoutMs,
        signal: controller.signal,
        envExtra: this._env(),
        onData: (kind, chunk) => { if (onData) onData(kind, chunk) },
      })
      return { ok: r.ok, runId, exitCode: r.exitCode, output: r.stdout, stderr: r.stderr, timedOut: r.timedOut, cancelled: !!r.cancelled }
    } finally {
      done()
    }
  }
}
