/**
 * CodexAdapter — تكامل حقيقي مع OpenAI Codex CLI (القسم 16).
 * نفس عقد OpenCodeAdapter: كشف حقيقي + تنفيذ `codex exec` داخل الـworkspace
 * + مصادقة معلنة بصدق. لا افتراض بوجود Codex — كل شيء يُفحص حيًّا.
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
    path.join(home, '.codex', 'config.toml'),
    path.join(home, '.codex', 'auth.json'),
  ]
  const found = candidates.find((p) => { try { return fs.existsSync(p) } catch { return false } })
  const envHit = ['OPENAI_API_KEY', 'CODEX_API_KEY'].filter((k) => process.env[k])
  return { configFile: found || null, envKeys: envHit }
}

export class CodexAdapter extends ProviderAdapter {
  constructor() {
    super({ name: 'codex', kind: 'cli-agent', capabilities: ['coding', 'execute', 'stream'] })
  }

  async detect() {
    return detectBinary('codex', ['--version'])
  }

  async authentication() {
    const { configFile, envKeys } = authProbe()
    if (configFile || envKeys.length) {
      return { configured: true, detail: `config: ${configFile || 'none'}, env keys: ${envKeys.join(',') || 'none'}` }
    }
    return { configured: false, detail: 'no codex auth file (~/.codex/) and no OPENAI_API_KEY/CODEX_API_KEY in env' }
  }

  async execute({ prompt, cwd = '.', email, timeoutMs = 600000, signal = null }) {
    if (!prompt) throw new Error('prompt required')
    if (!email) throw new Error('email required (workspace jail)')
    const d = await this.detect()
    if (!d.available) return { ok: false, error: `codex unavailable: ${d.reason}` }
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
        bin: d.path || 'codex',
        email,
        cwd,
        args: ['exec', prompt],
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
    if (!d.available) return { ok: false, error: `codex unavailable: ${d.reason}` }
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
        bin: d.path || 'codex',
        email,
        cwd,
        args: ['exec', prompt],
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
