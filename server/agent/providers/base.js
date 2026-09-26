/**
 * ProviderAdapter — الطبقة التجريدية (القسم 2 من المواصفة).
 * كل مزوّد (OpenCode, Codex, CLI عام, API, MCP, نموذج محلي) يرث من هذا
 * الأساس ويطبّق نفس الواجهة. لا نجاحات وهمية: الفشل يُرجع السبب الحقيقي.
 */
export class ProviderAdapter {
  constructor({ name, kind, capabilities = [] }) {
    if (!name) throw new Error('provider name required')
    this.name = name
    this.kind = kind || 'unknown'
    this.capabilities = [...capabilities]
    this._runs = new Map() // runId -> abort handle
  }

  capable(capability) {
    return this.capabilities.includes(capability)
  }

  /** كشف التوفر الحقيقي. الافتراضي: غير متاح (على كل مزوّد أن يثبت العكس). */
  async detect() {
    return { available: false, reason: 'detect() not implemented' }
  }

  /** فحص صحة حي (يُستدعى عند الطلب — لا حالة محفوظة كاذبة). */
  async healthCheck() {
    const d = await this.detect()
    return {
      name: this.name,
      kind: this.kind,
      healthy: !!d.available,
      version: d.version || null,
      path: d.path || null,
      error: d.available ? null : d.reason || d.error || 'unavailable',
      capabilities: this.capabilities,
      checkedAt: new Date().toISOString(),
    }
  }

  /** حالة المصادقة الحقيقية (ملف إعداد/متغير بيئة/أمر فحص) — لا تخمين. */
  async authentication() {
    return { configured: false, detail: 'authentication() not implemented' }
  }

  /** معلومات فحص للمستخدم/المهندس. */
  async inspect() {
    const [health, auth] = await Promise.all([this.healthCheck(), this.authentication()])
    return { ...health, auth }
  }

  /** تنفيذ مهمة. يجب أن يُرجع نتيجة حقيقية { ok, output, ... }. */
  async execute(_job) {
    throw new Error(`${this.name}.execute() not implemented`)
  }

  /** تنفيذ متدفق: onData(chunk) تُستدعى أثناء التنفيذ الحقيقي. */
  async stream(_job, _onData) {
    throw new Error(`${this.name}.stream() not implemented`)
  }

  /** إلغاء تنفيذ نشط — يقتل العملية الحقيقية. */
  async cancel(runId) {
    const handle = this._runs.get(runId)
    if (!handle) return { ok: false, error: `no active run: ${runId}` }
    try {
      await handle.abort()
      return { ok: true, runId }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  }

  _track(runId, abortFn) {
    this._runs.set(runId, { abort: abortFn })
  }

  _untrack(runId) {
    this._runs.delete(runId)
  }
}
