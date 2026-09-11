import { chromium } from 'playwright-core'
const EXE = '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)))
  await page.goto('https://mouhamed-ui-gif.github.io/ghennai-app/', { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForTimeout(8000)
  const txt = (await page.locator('body').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 300)
  console.log('TEXT:', txt)
  console.log('H1s:', await page.locator('h1').count())
  console.log('root children:', await page.locator('#root > *').count())
  console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none')
  await browser.close()
})().catch((e) => { console.error('CRASH', e.message); process.exit(1) })
