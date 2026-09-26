/** اختبار الموبايل: layout يعمل + تنقل tabs + لا أخطاء */
import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173/ghennai-app/'
const API = 'http://localhost:3001'
const SHELL = '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'

const email = `studio-mob-${Date.now()}@ghennai.test`
const password = 'Test1234!x'
const reg = await fetch(`${API}/api/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'Mob' }),
}).then((r) => r.json())
if (!reg.token) { console.error('FAIL register'); process.exit(1) }
console.log('PASS  register')

const browser = await chromium.launch({ executablePath: SHELL, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true })
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/\/api\/(voice|stt)/.test(r.url())) errs.push(`${r.status()} ${r.url().slice(0, 120)}`) })

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(4000)
const loginTrigger = page.getByRole('button', { name: /تسجيل الدخول/ }).first()
if (await loginTrigger.count() > 0) await loginTrigger.click()
else await page.getByRole('button', { name: /ابدأ مجانًا/ }).first().click()
await page.waitForTimeout(1200)
// المستخدم مسجل مسبقًا عبر API — بدّل إلى وضع الدخول إن كانت النافذة في وضع التسجيل
const switchBtn = page.getByRole('button', { name: /لديك حساب|تسجيل الدخول|دخول/i }).last()
if ((await page.locator('input[type="password"]').count()) > 1) {
  const toLogin = page.getByText(/لديك حساب|سجّل الدخول/i).first()
  if (await toLogin.count() > 0) await toLogin.click()
  await page.waitForTimeout(800)
}
await page.locator('input[type="email"]').fill(email)
await page.locator('input[type="password"]').first().fill(password)
await page.getByRole('button', { name: /دخول|تسجيل الدخول/i }).last().click()
await page.waitForURL(/\/app/, { timeout: 20000 })
console.log('PASS  mobile login')

await page.getByRole('button', { name: /ابدأ الآن/ }).first().click()
await page.waitForTimeout(2000)
if (await page.getByText('ما نوع موقعك؟').count() < 1) { console.error('FAIL  wizard did not open on mobile'); await browser.close(); process.exit(1) }
console.log('PASS  wizard opens on mobile')
// إكمال المعالج: نوع + اسم + بدء البناء → يفتح StudioIDE
await page.getByRole('button', { name: /محفظة أعمال/ }).first().click()
await page.getByRole('button', { name: /التالي/ }).first().click()
await page.waitForTimeout(800)
await page.locator('input').first().fill('موقع الموبايل')
await page.getByRole('button', { name: /التالي/ }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /ابدأ البناء/ }).first().click()
await page.waitForTimeout(4000)
if (await page.getByText('استوديو البناء').count() < 1) { console.error('FAIL  studio did not open'); await page.screenshot({ path: '/tmp/e2e-mobile-fail.png' }); await browser.close(); process.exit(1) }
console.log('PASS  studio opens on mobile (via wizard)')
await page.screenshot({ path: '/tmp/e2e-mobile-studio.png' })
// طباعة كل أزرار الصفحة للتشخيص
const names = await page.getByRole('button').all().then(async (bs) => {
  const out = []
  for (const b of bs.slice(0, 60)) { try { out.push(JSON.stringify((await b.textContent() || '').trim().slice(0, 24))) } catch {} }
  return out
})
console.log('BUTTONS:', names.join(' | ').slice(0, 600))

// شريط التنقل السفلي داخل الاستوديو حصرًا (scoped — لا أزرار الشريط الجانبي تحته)
const nav = page.getByTestId('studio-mobile-nav')
for (const tab of ['الملفات', 'العرض', 'الوكيل', 'التيرمينال']) {
  const b = nav.getByRole('button', { name: tab, exact: true })
  if (await b.count() < 1) { console.error(`FAIL  mobile tab missing: ${tab}`); process.exitCode = 1; continue }
  await b.click({ timeout: 10000 })
  await page.waitForTimeout(800)
  console.log(`PASS  mobile tab: ${tab}`)
}
await page.screenshot({ path: '/tmp/e2e-mobile.png' })
if (errs.length) { console.error('FAIL  errors:', errs.slice(0, 3).join(' | ')); process.exitCode = 1 }
else console.log('PASS  no mobile errors')
await browser.close()
