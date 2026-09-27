/** إثبات §39: متجر ساعات فاخر — يعبر Blueprint→Design→Build→Preview→QA→Verify */
import fs from 'node:fs'

const API = 'http://localhost:3001'
const email = `watchproof-${Date.now()}@ghennai.test`
const reg = await fetch(`${API}/api/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Test1234!x', name: 'WatchProof' }),
}).then((r) => r.json())
if (!reg.token) { console.error('FAIL register'); process.exit(1) }
const TOKEN = reg.token
fs.writeFileSync('/tmp/watchproof-email.txt', email)

const message = 'ابنِ لي متجرًا إلكترونيًا فاخرًا للساعات الجلدية. أريد تصميمًا أسود وذهبيًا راقيًا، Hero قويًا مع صورة منتج كبيرة، شبكة منتجات حقيقية المظهر، تفاصيل المنتج، مميزات، آراء العملاء، FAQ، CTA، Footer، تجربة ممتازة على الهاتف، وأزرار طلب عبر WhatsApp. لا أريد صفحة نصوص أو قالبًا عاديًا. أريد موقعًا يبدو كمنتج حقيقي.'

const res = await fetch(`${API}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ message, agent: 'Coding' }),
})
if (!res.ok || !res.body) { console.error(`FAIL chat HTTP ${res.status}`); process.exit(1) }

const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
const seen = { stages: [], qa: null, done: null, answer: '', design: null, errors: [] }
const t0 = Date.now()
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n')
  buf = lines.pop() || ''
  for (const l of lines) {
    const t = l.trim()
    if (t.startsWith(':')) continue
    if (!t.startsWith('data:')) continue
    try {
      const e = JSON.parse(t.slice(5).trim())
      if (e.type === 'build_stage') seen.stages.push(e.state)
      if (e.type === 'qa_report') seen.qa = e
      if (e.type === 'coding_done') seen.done = e
      if (e.type === 'answer') seen.answer = String(e.content || '')
      if (e.type === 'agent' && e.agent === 'Design') seen.design = String(e.message || '')
      if (e.type === 'error') seen.errors.push(String(e.error || '').slice(0, 120))
    } catch { /* noop */ }
  }
  if (seen.answer || Date.now() - t0 > 19 * 60 * 1000) break
}
console.log(`elapsed=${Math.round((Date.now() - t0) / 1000)}s`)
console.log('STAGES:', [...new Set(seen.stages)].join(' → ') || '(none)')
console.log('DESIGN:', (seen.design || '(none)').slice(0, 100))
console.log('QA:', seen.qa ? `ok=${seen.qa.ok} pass=${seen.qa.pass} fail=${seen.qa.fail} shots=${seen.qa.shots}` : '(none)')
console.log('DONE:', seen.done ? `built=${seen.done.built} url=${seen.done.url || 'none'}` : '(none)')
console.log('ERRORS:', seen.errors.join(' | ') || 'none')
fs.writeFileSync('/tmp/watchproof-answer.txt', seen.answer)
fs.writeFileSync('/tmp/watchproof-summary.json', JSON.stringify({ stages: seen.stages, qa: seen.qa, done: seen.done ? { built: seen.done.built, url: seen.done.url } : null }, null, 1))
