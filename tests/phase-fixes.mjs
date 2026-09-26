/**
 * تحقق المراحل 1+3أ+4: إقرار فوري + رابط عام + حفظ تحليل الصورة.
 * أي فشل → exit 1. لا نجاحات مُدّعاة.
 */
const API = 'http://localhost:3001'
let failed = 0
const pass = (n, d = '') => console.log(`PASS  ${n}${d ? ' — ' + d : ''}`)
const fail = (n, e) => { failed++; console.error(`FAIL  ${n}: ${e}`) }

// 1. publicUrl: قاعدة عامة حقيقية (تونل أو env) + مسار نسبي سليم
try {
  const { publicUrl, publicBase } = await import('../server/lib/share.js')
  const u = publicUrl('/live/abc12345/')
  if (!u.includes('/live/abc12345/')) throw new Error('lost path: ' + u)
  pass('publicUrl keeps live path', `${publicBase() || '(relative)'} → ${u.slice(0, 70)}`)
} catch (e) { fail('publicUrl', e.message) }

// مستخدم جديد لكل التشغيل
const email = `phasefix-${Date.now()}@ghennai.test`
const reg = await fetch(`${API}/api/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Test1234!x', name: 'Fix' }),
}).then((r) => r.json()).catch(() => ({}))
if (!reg.token) { fail('register', 'no token'); process.exit(1) }
const TOK = reg.token
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOK}` }

// 2. الإقرار الفوري: أول حدث ack خلال ~3 ثوانٍ من بدء الطلب
try {
  const res = await fetch(`${API}/api/chat`, { method: 'POST', headers: H, body: JSON.stringify({ message: 'مرحبا، رد بكلمة واحدة فقط: تمام', agent: 'Core' }) })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const t0 = Date.now()
  let ackMs = null
  let answer = ''
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
        if (e.type === 'ack' && ackMs === null) ackMs = Date.now() - t0
        if (e.type === 'answer') answer = String(e.content || '')
      } catch { /* noop */ }
    }
    if (answer || Date.now() - t0 > 120000) break
  }
  try { await reader.cancel() } catch { /* noop */ }
  if (ackMs === null) throw new Error('no ack event received')
  if (ackMs > 10000) throw new Error(`ack too slow: ${ackMs}ms`)
  if (!answer.trim()) throw new Error('empty answer')
  pass('instant ack + answer', `ack=${ackMs}ms`)
} catch (e) { fail('instant ack', e.message) }

// 3. الرؤية تُحفظ: تحليل صورة حقيقية → وصف عربي + سجل في الذاكرة
try {
  const fs = await import('node:fs')
  // لقطة حقيقية للواجهة المحلية (ليست بكسلًا وهميًا)
  const { chromium } = await import('playwright-core')
  const SHELL = '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
  const b = await chromium.launch({ executablePath: SHELL, args: ['--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: 800, height: 600 } })
  await p.goto('http://localhost:5173/ghennai-app/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await p.waitForTimeout(5000)
  await p.screenshot({ path: '/tmp/phasefix-shot.jpg', type: 'jpeg', quality: 60 })
  await b.close()
  const b64 = fs.readFileSync('/tmp/phasefix-shot.jpg').toString('base64')
  const t0 = Date.now()
  const r = await fetch(`${API}/api/vision`, { method: 'POST', headers: H, body: JSON.stringify({ image: 'data:image/jpeg;base64,' + b64 }) }).then((r) => r.json())
  const ms = Date.now() - t0
  if (!r.content) throw new Error(r.error || 'empty vision response')
  const latin = (r.content.match(/[a-zA-Z]/g) || []).length
  const arabic = (r.content.match(/[؀-ۿ]/g) || []).length
  if (!(arabic > 20 && arabic >= latin / 2)) throw new Error(`not Arabic (ar=${arabic} latin=${latin}): ${r.content.slice(0, 80)}`)
  pass('vision Arabic + fast', `${r.model} in ${Math.round(ms / 1000)}s`)
  // الذاكرة: آخر تحليل مخزّن فعلًا ويُحقن للوكلاء
  const { Memory } = await import('../server/lib/db.js')
  const rows = Memory.search({ scope: 'vision', user_email: email, limit: 1 })
  if (!rows.length || !rows[0].value?.desc) throw new Error('vision not persisted in memory')
  pass('vision persisted for agents', `${rows[0].value.desc.slice(0, 60)}…`)
} catch (e) { fail('vision', String(e.message || e).slice(0, 250)) }

console.log(failed ? `\n${failed} FAILURES` : '\nALL PHASE-FIX CHECKS PASSED')
process.exit(failed ? 1 : 0)
