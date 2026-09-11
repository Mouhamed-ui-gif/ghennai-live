import { chromium } from 'playwright-core'
const EXE = '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4500)
  const cta = page.getByRole('button').filter({ hasText: /ابدأ|جرّب|تسجيل/ }).first()
  await cta.click().catch(() => page.evaluate(() => document.querySelectorAll('button')[document.querySelectorAll('button').length - 3]?.click()))
  await page.waitForTimeout(1000)
  await page.locator('input[type=email]').fill('final@test.com')
  await page.locator('input[type=password]').first().fill('secret123')
  await page.locator('form button[type=submit]').click()
  await page.waitForURL('**/app', { timeout: 20000 })
  await page.waitForSelector('.world-bg', { timeout: 15000 })
  await page.locator('[data-nav=brain]').click()
  await page.waitForTimeout(1000)
  const ok = {}
  ok.title = (await page.getByText('خريطة العقول').count()) > 0
  ok.cards = (await page.locator('.brain-card').count()) === 7
  ok.progress = (await page.locator('.brain-bar').count()) === 1
  ok.feed = (await page.getByText('التواصل الداخلي').count()) > 0
  await page.screenshot({ path: '/tmp/smoke-brain.png' })
  console.log('SMOKE', JSON.stringify(ok), 'errors:', errors.length ? errors : 'none')
  await browser.close()
})().catch((e) => { console.error('CRASH', e.message); process.exit(1) })
