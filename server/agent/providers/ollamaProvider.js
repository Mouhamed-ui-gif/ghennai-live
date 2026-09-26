/**
 * OllamaProvider — يغلّف modelRouter المحلي الحقيقي (generate/streamChat).
 * القدرات تُعلن بصدق: محادثة + بثّ. الإلغاء: تجاهل النتائج المتأخرة
 * (واجهة HTTP في modelRouter لا تقبل AbortSignal في هذه المرحلة — موثّق لا مخفي).
 */
import { ProviderAdapter } from './base.js'
import { generate, streamChat, ollamaIsAvailable, OLLAMA_URL } from '../../lib/modelRouter.js'
import { randomUUID } from 'node:crypto'

export class OllamaProvider extends ProviderAdapter {
  constructor() {
    super({ name: 'ollama', kind: 'local-model', capabilities: ['chat', 'stream'] })
    this._cancelled = new Set()
  }

  async detect() {
    try {
      const ok = await ollamaIsAvailable()
      if (!ok) return { available: false, reason: `Ollama not reachable at ${OLLAMA_URL}` }
      return { available: true, path: OLLAMA_URL, version: null }
    } catch (e) {
      return { available: false, reason: String(e?.message || e) }
    }
  }

  async healthCheck() {
    const d = await this.detect()
    return {
      name: this.name,
      kind: this.kind,
      healthy: !!d.available,
      version: d.version,
      path: d.path || null,
      error: d.available ? null : d.reason,
      capabilities: this.capabilities,
      checkedAt: new Date().toISOString(),
    }
  }

  async authentication() {
    // النماذج المحلية لا تحتاج مفاتيح — هذه حقيقة معلنة لا ادعاء.
    const d = await this.detect()
    return { configured: !!d.available, detail: d.available ? 'local model, no key required' : (d.reason || 'unreachable') }
  }

  async execute({ prompt, system = null, model = null }) {
    if (!prompt) throw new Error('prompt required')
    const runId = randomUUID().slice(0, 8)
    this._track(runId, async () => { this._cancelled.add(runId) })
    try {
      const out = await generate({ prompt, system, ...(model ? { model } : {}) })
      if (this._cancelled.has(runId)) return { ok: false, cancelled: true, runId }
      return { ok: true, runId, output: typeof out === 'string' ? out : JSON.stringify(out ?? '') }
    } catch (e) {
      return { ok: false, runId, error: String(e?.message || e) }
    } finally {
      this._untrack(runId)
      this._cancelled.delete(runId)
    }
  }

  async stream({ prompt, system = null }, onData) {
    if (!prompt) throw new Error('prompt required')
    const runId = randomUUID().slice(0, 8)
    let full = ''
    this._track(runId, async () => { this._cancelled.add(runId) })
    try {
      await streamChat(
        { prompt, system },
        (token) => {
          if (this._cancelled.has(runId)) return
          full += token
          if (onData) onData(token)
        },
        () => undefined
      )
      if (this._cancelled.has(runId)) return { ok: false, cancelled: true, runId }
      return { ok: true, runId, output: full }
    } catch (e) {
      return { ok: false, runId, error: String(e?.message || e) }
    } finally {
      this._untrack(runId)
      this._cancelled.delete(runId)
    }
  }
}
