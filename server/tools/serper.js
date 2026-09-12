import '../lib/env.js'

const SERPER_KEY = process.env.SERPER_API_KEY || ''
const SERPER_ENDPOINT = 'https://google.serper.dev/search'

/** بحث ويب حقيقي عبر Serper (Google) — نتائج مرتّبة بعناوين وروابط ومقتطفات */
async function searchWeb({ query, k = 6, lang = 'ar' } = {}) {
  if (!SERPER_KEY) return { ok: false, error: 'بحث الويب غير مُفعّل — أضف SERPER_API_KEY في server/.env' }
  if (!query) return { ok: false, error: 'اكتب ما تبحث عنه' }
  try {
    const res = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_KEY },
      body: JSON.stringify({
        q: String(query),
        num: Math.max(1, Math.min(10, Number(k) || 6)),
        gl: lang === 'ar' ? 'sa' : 'us',
        hl: lang === 'ar' ? 'ar' : 'en',
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { ok: false, error: `بحث الويب فشل HTTP ${res.status}` }
    const d = await res.json()
    const results = (d.organic || []).slice(0, Math.max(1, Math.min(10, Number(k) || 6))).map((r) => ({
      title: r.title || '',
      link: r.link || '',
      snippet: r.snippet || '',
    }))
    return results.length ? { ok: true, results } : { ok: true, results: [], note: 'لا نتائج لهذا الاستعلام' }
  } catch (e) {
    return { ok: false, error: `بحث الويب غير متاح: ${String(e.message || e).slice(0, 80)}` }
  }
}

const serper = { searchWeb }

export default serper
export { searchWeb }