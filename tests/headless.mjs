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

  // 1. Landing
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(6000)
  log('landing hero text', await page.locator('h1').first().isVisible().catch(() => false))
  log('landing cube-scene', (await page.locator('.cube-scene').count()) > 0)
  const vids = await page.locator('video').count()
  log('no heavy video elements (images only)', vids === 0, `videos=${vids}`)
  const imgSrcs = await page.locator('.universe-video img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''))
  log('universe real images (internet)', imgSrcs.some((s) => s.startsWith('http')), `srcs=${imgSrcs.slice(0, 2).join(',')}`)
  const ring = await page.locator('.universe-bg').count()
  log('universe full-page bg', ring > 0)
  const hole = await page.locator('.black-hole').count()
  log('black hole element', hole > 0)
  const vh = await page.locator('.universe-bg img').first().boundingBox()
  const winH = await page.evaluate(() => window.innerHeight)
  log('universe image covers full page (top->bottom)', !!vh && vh.height >= winH - 2 && vh.y <= 2, `h=${vh?.height?.toFixed(0)} win=${winH} y=${vh?.y?.toFixed(0)}`)
  await page.screenshot({ path: '/tmp/landing.png', fullPage: false })

  // 2. Signup button must open the signup form (name + confirm fields)
  const signupBtn = page.getByRole('button').filter({ hasText: /إنشاء حساب/ }).first()
  await signupBtn.click().catch(() => {})
  await page.waitForTimeout(900)
  const signupFields = await page.locator('input[type=email]').count().then((n) => n > 0)
  const signupShowsName = (await page.locator('input[placeholder]').count()) >= 4
  log('signup opens create-account form', signupFields && signupShowsName)
  await page.mouse.click(160, 640)
  await page.waitForTimeout(500)

  // 3. Open auth modal & login
  await page.locator('button').first().waitFor({ state: 'visible', timeout: 10000 })
  const cta = page.getByRole('button').filter({ hasText: /ابدأ|جرّب|تسجيل/ }).first()
  await cta.click().catch(async () => { await page.evaluate(() => document.querySelectorAll('button')[document.querySelectorAll('button').length - 3]?.click()) })
  await page.waitForTimeout(1200)
  const modal = await page.locator('input[type=email]').count()
  log('auth modal', modal > 0)
  const googleSection = await page.getByText('تسجيل الدخول عبر Google').count()
    .then((n) => n > 0)
    .catch(() => true)
  log('google hidden (no client id)', !googleSection)

  await page.locator('input[type=email]').fill('final@test.com')
  await page.locator('input[type=password]').first().fill('secret123')
  await page.locator('form button[type=submit]').click()
  await page.waitForURL('**/app', { timeout: 20000 })

  // 3. Dashboard world
  await page.waitForSelector('.world-bg', { timeout: 15000 })
  const wstyle = await page.locator('.world-bg').evaluate((el) => el.getAttribute('style'))
  log('dashboard world-bg core', wstyle.includes('rgba(34,211,238,.35)'))
  const worldImgs = await page.locator('.world-video img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''))
  log('core world image (internet)', worldImgs.some((s) => s.startsWith('http')), `srcs=${worldImgs.join(',')}`)
  const selBtn = await page.locator('[data-agent-selector]').count()
  log('agents bar -> compact selector', selBtn > 0)
  await page.locator('[data-agent-selector]').click()
  await page.waitForTimeout(400)
  const pillCount = await page.locator('[data-agent]').count()
  log('agent selector 7 options', pillCount === 7, `options=${pillCount}`)
  const handle = await page.locator('[data-separator]').count()
  log('split layout (resize handle)', handle > 0, `handles=${handle}`)
  await page.mouse.click(12, 12)
  await page.waitForTimeout(300)
  const liveTxt = await page.locator('[data-live]').innerText().catch(() => '')
  log('live socket channel on', liveTxt.includes('حي') || liveTxt.includes('Live'), `live=${liveTxt}`)
  log('chat empty greeting (ChatGPT style, no cube)', (await page.locator('[data-empty-greeting]').count()) > 0 && (await page.locator('.cube-scene').count()) === 0)
  log('core tagline shown', await page.getByText('موجّه كل شيء — عقلك المشترك').count().then((n) => n > 0))
  await page.screenshot({ path: '/tmp/dashboard-core.png' })

  // 4. Switch to Coding agent (via the new AgentSelector dropdown)
  await page.locator('[data-agent-selector]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-agent=Coding]').click()
  await page.waitForTimeout(1200)
  const wstyle2 = await page.locator('.world-bg').evaluate((el) => el.getAttribute('style'))
  log('world switched to coding', wstyle2.includes('rgba(167,139,250,.4)'))
  const worldImgs2 = await page.locator('.world-video img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''))
  log('coding world image (internet)', worldImgs2.some((s) => s.startsWith('http')), `srcs=${worldImgs2.join(',')}`)
  log('coding tagline shown', await page.getByText('عالم الكود والبناء').count().then((n) => n > 0))
  await page.screenshot({ path: '/tmp/dashboard-coding.png' })

  // 5. Voice agent (الوكيل السابع)
  await page.locator('[data-agent-selector]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-agent=Voice]').click()
  await page.waitForTimeout(1200)
  const wstyle3 = await page.locator('.world-bg').evaluate((el) => el.getAttribute('style'))
  log('world switched to voice', wstyle3.includes('rgba(56,189,248,.42)'))
  const worldImgs3 = await page.locator('.world-video img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''))
  log('voice world image (internet)', worldImgs3.some((s) => s.startsWith('http')), `srcs=${worldImgs3.join(',')}`)
  log('voice tagline shown', await page.getByText('عالم الصوت — تحدّث وأنفّذ').count().then((n) => n > 0))
  await page.screenshot({ path: '/tmp/dashboard-voice.png' })

  // 5b. Zen mode + collapsible sidebar + shortcuts
  await page.locator('[data-zen]').click()
  await page.waitForTimeout(400)
  log('zen hides sidebar', (await page.locator('[data-sidebar]').count()) === 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  log('Esc exits zen', (await page.locator('[data-sidebar]').count()) > 0)
  await page.locator('[data-collapse]').click()
  await page.waitForTimeout(400)
  const sideW = await page.locator('[data-sidebar]').boundingBox().catch(() => null)
  log('sidebar collapsible', !!sideW && sideW.width < 200, `w=${sideW?.width?.toFixed(0)}`)
  await page.locator('[data-collapse]').click()
  await page.waitForTimeout(300)

  // 6. Mic permission error UX
  await page.locator('[data-mic]').click()
  await page.waitForTimeout(1800)
  const bodyTxt = await page.locator('body').innerText()
  const micErrShown = bodyTxt.includes('الميكروفون')
  log('mic permission error shown', micErrShown)

  // 6. Sidebar settings + deploy status
  await page.locator('[data-nav=settings]').click()
  await page.waitForSelector('body:has-text("gh ✓ متصل")', { timeout: 8000 }).catch(() => {})
  const settings = await page.locator('body').innerText()
  log('deploy gh connected', settings.includes('gh ✓ متصل'))
  log('deploy no-token state', settings.includes('بلا توكن'))

  await page.screenshot({ path: '/tmp/settings.png' })

  console.log('\nCONSOLE ERRORS:', errors.length ? errors : 'none')
  await browser.close()
})().catch((e) => { console.error('TEST CRASH:', e.message); process.exit(1) })