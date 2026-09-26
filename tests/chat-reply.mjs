/** اختبار رد الدردشة الحقيقي: سؤال بسيط → يجب أن يصل answer غير فارغ */
import fs from 'node:fs'

const TOKEN = fs.readFileSync('/tmp/ghn_token.txt', 'utf8').trim()
const message = process.argv[2] || 'مرحبا، رد بكلمة واحدة فقط: تمام'
const agent = process.argv[3] || 'Core'

const res = await fetch('http://localhost:3001/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ message, agent }),
})
if (!res.ok || !res.body) {
  console.error(`FAIL chat HTTP ${res.status}`)
  process.exit(1)
}
const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
let ans = ''
let evs = 0
let sseErr = null
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
      if (e.type === 'error' && !sseErr) sseErr = String(e.error || '')
    } catch { /* noop */ }
  }
  if (Date.now() - t0 > 100000) break
  if (evs > 300) break
}
console.log(`events=${evs} elapsed=${Math.round((Date.now() - t0) / 1000)}s`)
if (sseErr) console.log(`SSE ERROR: ${sseErr.slice(0, 200)}`)
console.log(`ANSWER: ${ans.slice(0, 300) || '(EMPTY!)'}`)
if (!ans.trim()) {
  console.error('FAIL: empty answer — chat does not reply')
  process.exit(1)
}
console.log('PASS: chat replies')
