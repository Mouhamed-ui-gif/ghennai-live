/**
 * ClaudeAdapter — تكامل حقيقي مع Claude Code CLI.
 * - الكشف: which claude + claude --version (حقيقي، مُتحقق: 2.1.278).
 * - التنفيذ: `claude -p <prompt>` (وضع print غير التفاعلي) داخل workspace المستخدم.
 * - الأذونات: --dangerously-skip-permissions مقصود هنا لأن التنفيذ مسجون أصلًا
 *   داخل workspace المستخدم (نفس مستوى الثقة مثل opencode/codex)، ومساحة العمل
 *   مُتجاهَلة في git ومحمية بـ safeResolve. لا يُستخدم خارج هذا السجن أبدًا.
 * - المصادقة: probe حقيقي (محادثة مصغرة) عند فحص الصحة؛ الكشف وحده لا يدّعيها.
 */
import { ProviderAdapter } from './base.js'
import { detectBinary } from './detect.js'
import { runCli } from './cliRunner.js'
import { randomUUID } from 'node:crypto'

export class ClaudeAdapter extends ProviderAdapter {
  constructor() {
    super({ name: 'claude', kind: 'cli-agent', capabilities: ['coding', 'execute', 'stream'] })
  }

  async detect() {
    return detectBinary('claude', ['--version'])
  }

  async authentication() {
    // فحص رخيص وحقيقي: ملف الإعداد بعد إكمال الـ onboarding
    try {
      const { default: fs } = await import('node:fs')
      const { default: os } = await import('node:os')
      const { default: path } = await import('node:path')
      const cfg = path.join(os.homedir(), '.claude.json')
      if (!fs.existsSync(cfg)) return { configured: false, detail: 'no ~/.claude.json' }
      const j = JSON.parse(fs.readFileSync(cfg, 'utf8'))
      if (j.hasCompletedOnboarding || j.lastOnboardingVersion) {
        return { configured: true, detail: 'onboarded; auth via subscription/env at runtime' }
      }
      return { configured: false, detail: 'onboarding not completed' }
    } catch (e) {
      return { configured: false, detail: String(e?.message || e).slice(0, 150) }
    }
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

  async execute({ prompt, cwd = '.', email, timeoutMs = 600000, signal = null }) {
    if (!prompt) throw new Error('prompt required')
    if (!email) throw new Error('email required (workspace jail)')
    const d = await this.detect()
    if (!d.available) return { ok: false, error: `claude unavailable: ${d.reason}` }
    const runId = randomUUID().slice(0, 8)
    const { controller, done } = this._wire(runId, signal)
    try {
      const r = await runCli({
        bin: d.path || 'claude',
        email,
        cwd,
        args: ['-p', prompt, '--dangerously-skip-permissions'],
        timeoutMs,
        signal: controller.signal,
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
    if (!d.available) return { ok: false, error: `claude unavailable: ${d.reason}` }
    const runId = randomUUID().slice(0, 8)
    const { controller, done } = this._wire(runId, signal)
    try {
      const r = await runCli({
        bin: d.path || 'claude',
        email,
        cwd,
        args: ['-p', prompt, '--dangerously-skip-permissions'],
        timeoutMs,
        signal: controller.signal,
        onData: (kind, chunk) => { if (onData) onData(kind, chunk) },
      })
      return { ok: r.ok, runId, exitCode: r.exitCode, output: r.stdout, stderr: r.stderr, timedOut: r.timedOut, cancelled: !!r.cancelled }
    } finally {
      done()
    }
  }
}
