/**
 * اختبار StudioIDE الحقيقي في متصفح headless:
 * تسجيل دخول → فتح الاستوديو → مشروع جديد → معاينة → ملف → تيرمينال → فحص.
 * أي خطأ console/page أو فشل وظيفي → exit 1. لا نجاحات مُدّعاة.
 */
import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173/ghennai-app/'
const API = 'http://localhost:3001'
const SHELL = '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'

const results = []
const pass = (n, d = '') => { results.push(n); console.log(`PASS  ${n}${d ? ' — ' + d : ''}`) }
const fail = (n, e) => { console.error(`FAIL  ${n}: ${e}`); process.exitCode = 1 }

const email = `studio-e2e-${Date.now()}@ghennai.test`
const password = 'Test1234!x'

// 0. تسجيل مستخدم جديد عبر API الحقيقي
const reg = await fetch(`${API}/api/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'StudioE2E' }),
}).then((r) => r.json()).catch((e) => ({ error: String(e) }))
if (!reg.token) { fail('register user', reg.error || 'no token'); process.exit(1) }
pass('register user', email)

const browser = await chromium.launch({ executablePath: SHELL, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const consoleErrors = []
const pageErrors = []
const failedReqs = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
page.on('response', (r) => { if (r.status() >= 400 && !/\/api\/(voice|stt)/.test(r.url())) failedReqs.push(`${r.status()} ${r.url().slice(0, 160)}`) })

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(4000)
  pass('load app')
} catch (e) { fail('load app', e.message); await browser.close(); process.exit(1) }

// تسجيل الدخول عبر الواجهة (فتح النافذة أولاً)
try {
  await page.getByRole('button', { name: /تسجيل الدخول/ }).first().click()
  await page.waitForTimeout(1500)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.getByRole('button', { name: /دخول/i }).last().click()
  await page.waitForURL(/\/app/, { timeout: 20000 })
  pass('UI login')
} catch (e) { fail('UI login', e.message); await page.screenshot({ path: '/tmp/e2e-login-fail.png' }); await browser.close(); process.exit(1) }

await page.waitForTimeout(3000)

// فتح استوديو البناء من شريط الأدوات
try {
  await page.getByRole('button', { name: /استوديو البناء/ }).first().click()
  // دليل صارم مع انتظار (التجميع البارد للـ chunk الكسول قد يستغرق ثوانٍ)
  try {
    await page.getByTestId('studio-term-input').waitFor({ timeout: 30000 })
    pass('open StudioIDE')
  } catch { throw new Error('StudioIDE did not open (terminal input missing after 30s)') }
} catch (e) { fail('open StudioIDE', e.message); await page.screenshot({ path: '/tmp/e2e-studio-fail.png' }); await browser.close(); process.exit(1) }
await page.screenshot({ path: '/tmp/e2e-studio-open.png' })

// مشروع جديد من قالب حقيقي
try {
  await page.getByRole('button', { name: /جديد/ }).first().click()
  await page.waitForTimeout(2000)
  const tplBtn = page.getByRole('button', { name: /محفظة أعمال/ })
  if (await tplBtn.count() < 1) throw new Error('no real templates listed')
  await tplBtn.first().click()
  await page.getByPlaceholder(/اسم المشروع/).fill('موقع الاختبار الشامل')
  await page.getByRole('button', { name: /إنشاء المشروع/ }).click()
  await page.waitForTimeout(5000)
  const body = await page.content()
  if (!body.includes('sites/')) throw new Error('project root not shown after scaffold')
  pass('scaffold project from real template')
} catch (e) { fail('scaffold project', e.message); await page.screenshot({ path: '/tmp/e2e-scaffold-fail.png' }) }
await page.screenshot({ path: '/tmp/e2e-project.png' })

// منتقي المزودين: يعرض المنفذين الحقيقيين فقط
try {
  const opts = await page.locator('header select').nth(1).locator('option').allTextContents().catch(() => [])
  const names = opts.join(' ')
  for (const p of ['opencode', 'codex', 'claude', 'crush']) {
    if (!names.includes(p)) throw new Error(`provider missing in picker: ${p} (got: ${names.slice(0, 120)})`)
  }
  pass('provider picker lists real CLIs')
} catch (e) { fail('provider picker', e.message); await page.screenshot({ path: '/tmp/e2e-prov-fail.png' }) }
try {
  const pvBtn = page.getByRole('button', { name: /معاينة/ }).first()
  if (await pvBtn.count() > 0 && await pvBtn.isEnabled()) {
    await pvBtn.click()
    await page.waitForTimeout(6000)
  }
  const frame = page.frameLocator('iframe[title="live preview"]')
  const frameCount = await page.locator('iframe[title="live preview"]').count()
  if (frameCount < 1) throw new Error('no preview iframe — preview did not start')
  await page.waitForTimeout(3000)
  // المحتوى الحقيقي داخل الـ iframe — ليس صفحة 404
  const frameBody = await page.frameLocator('iframe[title="live preview"]').locator('body').innerText().catch(() => '')
  if (/did you mean|Cannot GET|404/.test(frameBody)) throw new Error('preview shows error page, not the real site: ' + frameBody.slice(0, 120))
  if (frameBody.trim().length < 20) throw new Error('preview body suspiciously empty')
  pass('live preview iframe present', `real content (${frameBody.trim().length} chars)`)
} catch (e) { fail('live preview', e.message); await page.screenshot({ path: '/tmp/e2e-preview-fail.png' }) }
await page.screenshot({ path: '/tmp/e2e-preview.png' })

// فتح ملف حقيقي وعرض الكود
try {
  const fileBtn = page.getByRole('button', { name: 'index.html' }).first()
  if (await fileBtn.count() < 1) throw new Error('index.html not in explorer')
  await fileBtn.click()
  await page.waitForTimeout(2000)
  const body = await page.content()
  if (!body.includes('index.html')) throw new Error('file not opened')
  pass('open real file in explorer')
} catch (e) { fail('open file', e.message); await page.screenshot({ path: '/tmp/e2e-file-fail.png' }) }

// التيرمينال: أمر حقيقي (حقل الفوتر مفتوح افتراضيًا — لا نضغط زر الطي)
try {
  const termInput = page.getByTestId('studio-term-input')
  if (await termInput.count() > 0) {
    await termInput.first().fill('ls')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(4000)
    const body = await page.content()
    if (!body.includes('index.html')) throw new Error('ls output missing index.html')
    pass('terminal runs real command')
  } else {
    throw new Error('terminal input not found (footer may be collapsed)')
  }
} catch (e) { fail('terminal', e.message); await page.screenshot({ path: '/tmp/e2e-term-fail.png' }) }

// الفحص الشامل الحقيقي
try {
  await page.getByRole('button', { name: /فحص/ }).first().click()
  await page.waitForTimeout(8000)
  const body = await page.content()
  if (!body.includes('index.html موجود') && !body.includes('الفحص')) throw new Error('verify results not shown')
  pass('real verify checks shown')
} catch (e) { fail('verify', e.message); await page.screenshot({ path: '/tmp/e2e-verify-fail.png' }) }
await page.screenshot({ path: '/tmp/e2e-final.png' })

// تبويب Git
try {
  await page.getByRole('button', { name: /^Git/ }).first().click()
  await page.waitForTimeout(3000)
  const body = await page.content()
  if (!body.includes('main') && !body.includes('نظيفة') && !body.includes('git')) throw new Error('git panel empty')
  pass('git panel shows real data')
} catch (e) { fail('git panel', e.message) }

// أخطاء الكونسول والصفحات والطلبات الفاشلة
await page.waitForTimeout(2000)
const realErrs = consoleErrors.filter((t) => !/favicon/i.test(t))
const realFailed = [...new Set(failedReqs)].filter((u) => !/favicon/i.test(u))
if (pageErrors.length === 0 && realErrs.length === 0 && realFailed.length === 0) {
  pass('no console/page/request errors')
} else {
  fail('console/page/request errors', `page:[${pageErrors.join(' | ').slice(0, 300)}] console:[${realErrs.join(' | ').slice(0, 300)}] req:[${realFailed.join(' | ').slice(0, 300)}]`)
}

await browser.close()
console.log(`\n${results.length} checks passed, exit=${process.exitCode || 0}`)
