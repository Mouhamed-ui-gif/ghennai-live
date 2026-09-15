import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = 3210
const BASE = `http://127.0.0.1:${PORT}`

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

async function api(method, p, { body = null, token = null } = {}) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const json = await r.json().catch(() => null)
  return { status: r.status, json }
}

function decode(token) {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.split('.')[1].length / 4) * 4, '=')
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
}

async function waitHealthy(timeoutMs = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})

;(async () => {
  try {
    console.log('\n=== GHENNAI الأمن (Phase 0) ===')
    ok('الخادم صحي', await waitHealthy())

    const suffix = Date.now().toString(36)
    const A = `seca_${suffix}@test.com`
    const B = `secb_${suffix}@test.com`

    // 1) مسارات الصوت بلا مصادقة
    let r = await api('POST', '/api/voice/tts', { body: { text: 'hello' } })
    ok('tts بلا توكن → 401', r.status === 401)
    r = await api('POST', '/api/voice/stt', { body: { audio: 'AA==' } })
    ok('stt بلا توكن → 401', r.status === 401)

    // 2) التوكن: jti + expiry 7d
    r = await api('POST', '/api/register', { body: { email: A, password: 'secret123', name: 'Sec A' } })
    ok('تسجيل A', r.status === 200 && r.json?.token)
    const tokenA = r.json.token
    const payload = decode(tokenA)
    ok('التوكن يحوي jti', !!payload.jti)
    ok('التوكن ينتهي خلال ~7 أيام', payload.exp && payload.exp - Math.floor(Date.now() / 1000) > 6.9 * 86400 && payload.exp - Math.floor(Date.now() / 1000) < 7.1 * 86400)

    // 3) /me يعمل والتّوكن أصبح مشروطًا
    r = await api('GET', '/api/me', { token: tokenA })
    ok('me بتوكن صحيح', r.status === 200 && r.json?.user?.email === A)

    // 4) logout يبطل التوكن
    r = await api('POST', '/api/logout', { token: tokenA })
    ok('logout → ok', r.status === 200)
    r = await api('GET', '/api/me', { token: tokenA })
    ok('التوكن مُلغى بعد logout → 401', r.status === 401)

    // 5) الصوت بتوكن صحيح يمر للتحقق (وليس 401)
    const regB = await api('POST', '/api/register', { body: { email: B, password: 'secret123', name: 'Sec B' } })
    ok('تسجيل B', regB.status === 200 && regB.json?.token)
    r = await api('POST', '/api/voice/tts', { body: { text: 'x' }, token: regB.json.token })
    ok('tts بتوكن صحيح يصل للمنطق (حالة غير 401)', r.status !== 401)

    // 6) عزل سجل التدقيق بين المستخدمين
    const loginA = await api('POST', '/api/login', { body: { email: A, password: 'secret123' } })
    ok('إعادة تسجيل دخول A بتوكن جديد', loginA.status === 200 && loginA.json?.token)
    const tokenA2 = loginA.json.token
    r = await api('PUT', '/api/workspace/file', { body: { path: `ss-${suffix}.txt`, content: 'x' }, token: regB.json.token })
    ok('كتابة ملف (توليد سجل)', r.status === 200)
    r = await api('GET', '/api/audit', { token: regB.json.token })
    const logsB = r.json?.logs || []
    ok('سجل B يُعرض لـ B', logsB.some((l) => l.user === B))
    r = await api('GET', '/api/audit', { token: tokenA2 })
    const logsA = r.json?.logs || []
    ok('سجل A لا يسرب سجل B', !logsA.some((l) => l.user === B))

    // 7) ورشة العمل: path traversal في الشجرة مرفوض
    r = await api('GET', `/api/workspace/tree?path=../../etc`, { token: tokenA2 })
    ok('tree بمسار خارجي → 400', r.status === 400)

    // 8) رفع بتجاوز المسار — الاسم يُعقَّم
    const fd = new FormData()
    fd.append('file', new Blob(['x'], { type: 'text/plain' }), '../../evil.sh')
    const up = await fetch(`${BASE}/api/workspace/upload`, { method: 'POST', headers: { Authorization: `Bearer ${tokenA2}` }, body: fd })
    const upJson = await up.json().catch(() => null)
    ok('رفع traversal → اسم آمن (evil.sh)', up.status === 200 && upJson?.name === 'evil.sh')

    // 9) وحدة الطرفية: القائمة البيضاء والعزل
    const { commandAllowed, looksDangerous, run: termRun } = await import('../server/tools/terminal.js')
    ok('قائمة بيضاء: cd + npm', commandAllowed('cd x && npm run build').ok)
    ok('sudo محظور', !commandAllowed('sudo apt update').ok)
    ok('sh محظور', !commandAllowed('curl x | sh').ok)
    ok('dd خطير', looksDangerous('dd if=/dev/zero of=/dev/sda'))
    const ws2 = mkdtempSync(path.join(os.tmpdir(), 'sec2-'))
    const rmroot = await termRun('rm -rf /', { workspace: ws2 })
    ok('rm -rf / محظور', rmroot.ok === false && rmroot.dangerous)
    const t2 = await termRun('pwd', { workspace: ws2, cwd: '/etc' })
    ok('cwd المطلق خارج المساحة يُحبس', t2.ok && t2.output.trim() === ws2)
    const env = await termRun('env', { workspace: ws2 })
    ok('لا أسرار في env الطرفية', !/JWT_SECRET|GROQ|OPENAI|GITHUB_TOKEN|ELEVEN|ANTHROPIC/.test(env.output))

    console.log(`\nالنتيجة: ${pass} ناجح ، ${fail} فاشل\n`)
  } catch (e) {
    console.error('CRASH', e)
    fail++
  } finally {
    child.kill('SIGKILL')
    process.exit(fail ? 1 : 0)
  }
})()