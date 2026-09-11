import { chromium } from 'playwright-core'

const EXE = '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
const BASE = 'http://localhost:3001'

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  const log = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' | ' + extra : ''}`)

  const login = async () => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(5000)
    const cta = page.getByRole('button').filter({ hasText: /ابدأ|جرّب|تسجيل/ }).first()
    await cta.click().catch(async () => { await page.evaluate(() => document.querySelectorAll('button')[document.querySelectorAll('button').length - 3]?.click()) })
    await page.waitForTimeout(1200)
    await page.locator('input[type=email]').fill('final@test.com')
    await page.locator('input[type=password]').first().fill('secret123')
    await page.locator('form button[type=submit]').click()
    await page.waitForURL('**/app', { timeout: 20000 })
    await page.waitForSelector('.world-bg', { timeout: 15000 })
  }

  await login()

  // ---- Brain panel ----
  await page.locator('[data-nav=brain]').click()
  await page.waitForTimeout(800)
  log('brain title', (await page.getByText('خريطة العقول').count()) > 0)
  const cards = await page.locator('.brain-card').count()
  log('agent cards 7', cards === 7, `cards=${cards}`)
  log('progress bar', (await page.locator('.brain-bar').count()) === 1)
  await page.locator('button[title*="النموذج"]').first().click()
  await page.waitForTimeout(500)
  const modelOpts = await page.locator('select option').count()
  log('model options loaded', modelOpts >= 2, `options=${modelOpts}`)
  await page.locator('button[title*="النموذج"]').first().click()
  await page.waitForTimeout(300)

  // collab: تأكد أن المفتاح نشط قبل المحادثة (لتظهر المراجعة)
  const isOn = () => page.locator('.brain-sw').first().getAttribute('class').then((c) => !!(c && c.includes('on')))
  const before = await isOn()
  await page.locator('.brain-sw').first().click()
  await page.waitForTimeout(700)
  const after = await isOn()
  log('collab toggle works', before !== after, `on=${before} -> ${after}`)
  if (!(await isOn())) {
    await page.locator('.brain-sw').first().click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: '/tmp/brain-panel.png' })

  // ---- Sessions panel ----
  await page.locator('[data-nav=sessions]').click()
  await page.waitForTimeout(1200)
  log('sessions title', (await page.getByText('المحادثات').first().count()) > 0)
  const sessionRows = await page.locator('button', { hasText: 'جلسة جديدة' }).count()
  log('session row shown', sessionRows > 0)
  const transcriptHasAi = await page.locator('body').innerText().then((t) => t.includes('النتيجة النهائية') || t.includes('الجلسة الحالية'))
  log('transcript viewer', transcriptHasAi)
  await page.screenshot({ path: '/tmp/sessions-panel.png' })

  // ---- Full chat pipeline via ChatPanel ----
  // الوضع المستقل (solo) هو الافتراضي الآن؛ لفحص خط المراجعة نفعّله هنا فقط
  await page.evaluate(async () => {
    const tok = localStorage.getItem('ghennai_token')
    const set = (k, v) => fetch('/api/brain/prefs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: k, value: v }),
    })
    await set('solo', false)
    await set('collab', true)
    await set('autoGrade', true)
  })
  await page.locator('[data-nav=chat]').click()
  await page.waitForTimeout(1200)
  await page.locator('[data-agent-selector]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-agent=Study]').click()
  await page.waitForTimeout(600)
  const ta = page.locator('textarea.input-lg').first()
  await ta.fill('عرّف الذكاء الاصطناعي بإيجاز.')
  await ta.press('Enter')
  log('chat sent (busy start)', true)

  const started = Date.now()
  const assStart = await page.locator('.glass-strong').count().catch(() => 0)
  let achieved = false
  let bodyTxt = ''
  for (;;) {
    await page.waitForTimeout(4000)
    bodyTxt = await page.locator('body').innerText().catch(() => '')
    const sealed = bodyTxt.includes('حدث خطأ')
    const newBubble = (await page.locator('.glass-strong').count().catch(() => 0)) > assStart
    const reviewSeen = bodyTxt.includes('الدرجة:')
    if (newBubble || reviewSeen || sealed) {
      achieved = newBubble || reviewSeen
      log(`final answer received (bubble)`, achieved, `elapsed=${Math.round((Date.now() - started) / 1000)}s`)
      break
    }
    if (Date.now() - started > 420000) { log('final answer received', false, 'timeout 420s'); break }
  }
  await page.waitForTimeout(3000)
  bodyTxt = await page.locator('body').innerText().catch(() => '')
  log('collab review present', bodyTxt.includes('الدرجة:') || bodyTxt.includes('تقييم المراجع'))
  const st = await page.evaluate(async () => {
    const res = await fetch('/api/brain/state', { headers: { Authorization: `Bearer ${localStorage.getItem('ghennai_token')}` } })
    return res.json()
  })
  const study = st.agents?.Study
  log('board Study score', study && study.score != null, `score=${study?.score} status=${study?.status}`)
  await page.screenshot({ path: '/tmp/brain-final.png' })

  console.log('\nCONSOLE ERRORS:', errors.length ? errors : 'none')
  await browser.close()
})().catch((e) => { console.error('TEST CRASH:', e.message); process.exit(1) })