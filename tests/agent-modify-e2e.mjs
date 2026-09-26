/**
 * اختبار الوكيل الحقيقي: طلب تعديل عبر /api/chat (LLM حقيقي + أدوات حقيقية).
 * يتحقق أن الملف تغيّر فعلًا على القرص — لا يكتفي بنص الرد.
 */
import fs from 'node:fs'

const API = 'http://localhost:3001'
const TOKEN = fs.readFileSync('/tmp/ghn_token.txt', 'utf8').trim()
const ROOT = 'sites/git-test'
const WS = '/home/mouh/ghennai-agent/server/workspace/probe@ghennai.test'
const FILE = `${WS}/${ROOT}/index.html`

const before = fs.readFileSync(FILE, 'utf8')
console.log(`before: ${before.length} chars`)

// عنوان فريد يثبت أن الوكيل عدّل فعلًا
const marker = `تعديل الوكيل ${Date.now().toString(36)}`
const message = `في المشروع ${ROOT}: عدّل ملف index.html — أضف سطرًا جديدًا في نهاية <body> يحتوي النص «${marker}» داخل وسم <p>. اعمل داخل مجلد المشروع فقط ثم تحقق بقراءة الملف.`

async function chatOnce(body, timeoutMs = 7 * 60 * 1000) {
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) throw new Error(`chat HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const seen = { events: 0, writes: 0, answer: '', proposal: null, codingDone: null }
  const t0 = Date.now()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      try {
        const e = JSON.parse(t.slice(5).trim())
        seen.events++
        if (e.type === 'code_token' && /write/i.test(String(e.action || ''))) seen.writes++
        if (e.type === 'workspace_changed') seen.writes++
        if (e.type === 'answer') seen.answer = String(e.content || '')
        if (e.type === 'edit_proposal') seen.proposal = e
        if (e.type === 'coding_done') seen.codingDone = e
        if (e.type === 'coding_start') console.log('CODING STARTED:', String(e.project || ''), String(e.root || ''))
        if (e.type === 'error') console.error('SSE error:', String(e.error || '').slice(0, 200))
      } catch { /* noop */ }
    }
    if (Date.now() - t0 > timeoutMs) { console.error('TIMEOUT waiting for agent'); break }
  }
  seen.elapsed = Math.round((Date.now() - t0) / 1000)
  return seen
}

// الخطوة 1: طلب التعديل → يجب أن يقترح (propose) لا أن يدّعي التنفيذ
console.log('--- step 1: propose ---')
const s1 = await chatOnce({ message, agent: 'Coding' })
console.log(`events=${s1.events} writes=${s1.writes} elapsed=${s1.elapsed}s`)
if (!s1.proposal) {
  console.error('FAIL  expected edit_proposal, agent may have faked success')
  fs.writeFileSync('/tmp/agent-answer.txt', s1.answer)
  process.exit(1)
}
console.log('PASS  agent proposed (did not fake execution):', String(s1.proposal.summary || '').slice(0, 120))

// الخطوة 2: الموافقة → التنفيذ الحقيقي (نفس ما يفعله زر «نعم، نفّذ التعديل»)
console.log('--- step 2: approve & apply ---')
const s2 = await chatOnce({
  message: s1.proposal.request || message,
  agent: 'Coding',
  edit: { element: s1.proposal.element ?? null, root: s1.proposal.root ?? ROOT, propose: false },
})
console.log(`events=${s2.events} writes=${s2.writes} elapsed=${s2.elapsed}s`)
fs.writeFileSync('/tmp/agent-answer.txt', s2.answer)

const after = fs.readFileSync(FILE, 'utf8')
console.log(`after: ${after.length} chars`)
if (after.includes(marker)) {
  console.log('PASS  agent modified the real file with the requested marker')
} else {
  console.error('FAIL  marker not found in file — agent did not apply the edit')
  process.exit(1)
}
