/** اختبار بناء موقع كامل حقيقي عبر الوكيل — مع قياس الزمن وإثبات الملفات */
import fs from 'node:fs'

const API = 'http://localhost:3001'
const email = `buildproof-${Date.now()}@ghennai.test`
const reg = await fetch(`${API}/api/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Test1234!x', name: 'BuildProof' }),
}).then((r) => r.json())
if (!reg.token) { console.error('FAIL register'); process.exit(1) }
const TOKEN = reg.token
const WS = `/home/mouh/ghennai-agent/server/workspace/${email}`

const message = 'ابنِ لي موقعًا صغيرًا لمقهى: صفحة index.html + style.css + app.js، عنوان ترحيبي وقائمة 3 مشروبات بأسعار. اعمل في مجلد مشروع جديد.'
console.log('sending build request...')

const res = await fetch(`${API}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ message, agent: 'Coding' }),
})
if (!res.ok || !res.body) { console.error(`FAIL chat HTTP ${res.status}`); process.exit(1) }

const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
let ans = ''
let evs = 0
let writes = 0
let sseErr = null
let codingDone = null
const t0 = Date.now()
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n')
  buf = lines.pop() || ''
  for (const l of lines) {
    const t = l.trim()
    if (!t.startsWith('data:')) continue
    try {
      const e = JSON.parse(t.slice(5).trim())
      evs++
      if (e.type === 'answer') ans = String(e.content || '')
      if (e.type === 'workspace_changed') writes++
      if (e.type === 'coding_done') codingDone = e
      if (e.type === 'error' && !sseErr) sseErr = String(e.error || '')
    } catch { /* noop */ }
  }
  if (Date.now() - t0 > 19 * 60 * 1000) { console.error('TIMEOUT 19m'); break }
}
const elapsed = Math.round((Date.now() - t0) / 1000)
console.log(`events=${evs} writes=${writes} elapsed=${elapsed}s codingDone=${JSON.stringify(codingDone)?.slice(0, 80)}`)
if (sseErr) console.log(`SSE ERROR: ${sseErr.slice(0, 300)}`)

// إثبات الملفات على القرص
let proof = []
try {
  const walk = (d, base = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const rel = base ? `${base}/${e.name}` : e.name
      if (e.isDirectory()) { if (base.split('/').length < 3) walk(`${d}/${e.name}`, rel) }
      else proof.push(rel)
    }
  }
  walk(WS)
} catch (e) { console.error('walk fail:', e.message) }
console.log(`FILES (${proof.length}):`, proof.slice(0, 12).join(', ') || '(none!)')
const idx = proof.find((f) => f.endsWith('index.html'))
if (idx) {
  const html = fs.readFileSync(`${WS}/${idx}`, 'utf8')
  console.log(`index.html: ${html.length} bytes, has </html>: ${/<\/html\s*>/i.test(html)}`)
}
fs.writeFileSync('/tmp/build-answer.txt', ans)
if (!idx || proof.length < 2) {
  console.error('FAIL: site was not built (no real files)')
  process.exit(1)
}
if (sseErr && /abort/i.test(sseErr)) {
  console.error('FAIL: aborted mid-build')
  process.exit(1)
}
console.log('PASS: real website built')
