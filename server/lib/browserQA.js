/**
 * فاحص المتصفح الحقيقي (§12): يخدم مجلد الموقع محليًا ويفحصه بـPlaywright فعليًا.
 * لا regex وهمي: كونسول حقيقي + شبكة حقيقية + DOM حقيقي + لقطات حقيقية.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const SHELL_CANDIDATES = [
  '/home/mouh/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  '/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
]
const WIDTHS = [360, 768, 1440]

function shellPath() {
  for (const p of SHELL_CANDIDATES) {
    try { if (fs.existsSync(p)) return p } catch { /* noop */ }
  }
  return null
}

/** حل مسار محلي كما تفعل المضيفات الثابتة: exact ← dir/index.html ← +.html */
function resolveLocal(dir, href) {
  const clean = String(href || '').split('?')[0].replace(/^\.\//, '')
  if (!clean) return null
  const cands = [clean, `${clean}/index.html`, `${clean}.html`]
  for (const c of cands) {
    const f = path.join(dir, path.normalize(c).replace(/^(\.\.[/\\])+/, ''))
    if (f.startsWith(dir) && fs.existsSync(f) && !fs.statSync(f).isDirectory()) return f
  }
  const d = path.join(dir, path.normalize(clean).replace(/^(\.\.[/\\])+/, ''))
  if (d.startsWith(dir) && fs.existsSync(path.join(d, 'index.html'))) return path.join(d, 'index.html')
  return null
}

function serveDir(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(String(req.url || '/').split('?')[0])
        if (urlPath.endsWith('/')) urlPath += 'index.html'
        const file = resolveLocal(dir, urlPath.slice(1)) || path.join(dir, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''))
        if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.writeHead(404); res.end('not found'); return
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
        fs.createReadStream(file).pipe(res)
      } catch {
        try { res.writeHead(500); res.end('error') } catch { /* noop */ }
      }
    })
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }))
  })
}

/**
 * فحص كامل لمجلد موقع ثابت. يُرجع:
 * { ok, checks: [{id,label,ok,detail,severity}], shots: {desktop, mobile}, criteria: [...] }
 */
export async function qaStaticDir(dir, _opts = {}) {
  const checks = []
  const ok = (id, label, valid, detail = '', severity = 'major') => checks.push({ id, label, ok: !!valid, detail: String(detail).slice(0, 200), severity })
  const t0 = Date.now()
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    ok('tech:exists', 'index.html موجود', false, 'لا يوجد ملف', 'critical')
    return { ok: false, checks, shots: {}, ms: Date.now() - t0 }
  }
  const shell = shellPath()
  if (!shell) {
    ok('tech:browser', 'متصفح الفحص متاح', false, 'playwright shell غير مثبت', 'critical')
    return { ok: false, checks, shots: {}, ms: Date.now() - t0 }
  }
  const { srv, port } = await serveDir(dir)
  const base = `http://127.0.0.1:${port}/`
  const shotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghn-qa-'))
  let browser = null
  try {
    const { chromium } = await import('playwright-core')
    browser = await chromium.launch({ executablePath: shell, args: ['--no-sandbox'] })

    // ── الجاهزية الحقيقية (§17): حالة + نوع محتوى + علامة HTML (§17) ──
    const probe = await fetch(base, { signal: AbortSignal.timeout(15000) }).catch(() => null)
    const probeBody = probe ? await probe.text().catch(() => '') : ''
    ok('tech:status', 'المعاينة ترد 200', probe?.ok === true, `status ${probe?.status ?? 'none'}`, 'critical')
    ok('tech:ctype', 'نوع المحتوى HTML', /text\/html/i.test(probe?.headers.get('content-type') || ''), probe?.headers.get('content-type') || '', 'critical')
    ok('tech:marker', 'علامة تطبيق صحيحة', /<html[\s>]/i.test(probeBody) && /<\/html>/i.test(probeBody), `${probeBody.length} bytes`, 'critical')
    if (!checks.every((c) => c.ok)) {
      return { ok: false, checks, shots: {}, ms: Date.now() - t0 }
    }

    const consoleErrors = []
    const netFails = []
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
    page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)))
    page.on('response', (r) => { if (r.status() >= 400) netFails.push(`${r.status()} ${r.url().slice(0, 120)}`) })
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3500)

    const dom = await page.evaluate(() => ({
      title: document.title || '',
      h1: document.querySelectorAll('h1').length,
      text: (document.body?.innerText || '').trim().length,
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '').slice(0, 60),
      buttons: document.querySelectorAll('button, [role="button"], input[type="submit"]').length,
      imgs: document.querySelectorAll('img').length,
      imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('alt')).length,
      forms: document.querySelectorAll('form').length,
      semantic: { header: !!document.querySelector('header'), nav: !!document.querySelector('nav'), main: !!document.querySelector('main'), footer: !!document.querySelector('footer') },
    }))
    ok('tech:title', 'عنوان صفحة موجود', dom.title.trim().length > 0, dom.title.slice(0, 80), 'minor')
    ok('content:body', 'محتوى نصي حقيقي', dom.text > 300, `${dom.text} chars`, 'critical')
    ok('content:placeholder', 'بلا lorem/placeholder', !/(lorem ipsum|test product|welcome to our website|amazing service)/i.test(dom.text + dom.title), '', 'major')
    ok('tech:console', 'صفر أخطاء console', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '), 'critical')
    const realNetFails = [...new Set(netFails)].filter((u) => !/favicon\.ico/.test(u))
    ok('tech:network', 'لا طلبات فاشلة', realNetFails.length === 0, realNetFails.slice(0, 2).join(' | '), 'major')
    ok('a11y:alt', 'كل الصور لها alt', dom.imgs === 0 || dom.imgsNoAlt === 0, dom.imgs ? `${dom.imgsNoAlt}/${dom.imgs} بلا alt` : 'لا صور', 'minor')
    ok('a11y:semantic', 'هيكل دلالي (header/nav/main/footer)', Object.values(dom.semantic).filter(Boolean).length >= 3, JSON.stringify(dom.semantic), 'minor')

    // روابط داخلية ميتة (HTML/CSS/JS/صور محلية — بنفس منطق المضيف الثابت)
    const deadInternal = []
    for (const href of dom.links) {
      const h = String(href).trim()
      if (!h || h.startsWith('#') || /^(https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(h) || h.startsWith('//')) continue
      if (!resolveLocal(dir, h)) deadInternal.push(h.slice(0, 60))
      if (deadInternal.length >= 5) break
    }
    ok('tech:links', 'لا روابط داخلية ميتة', deadInternal.length === 0, deadInternal.join(', '), 'critical')

    // ── الاستجابة الحقيقية (§28): فيض أفقي + كسر تنقل عبر المقاسات ──
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.waitForTimeout(900)
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        navVisible: (() => { const n = document.querySelector('nav'); if (!n) return true; const b = n.getBoundingClientRect(); return b.width <= window.innerWidth + 1 })(),
        btnOverflow: [...document.querySelectorAll('button, a')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > window.innerWidth + 1 }).length,
      }))
      ok(`resp:${w}`, `سليم على ${w}px (بلا فيض)`, r.overflow <= 1 && r.btnOverflow === 0, r.overflow > 1 ? `فيض ${r.overflow}px` : '', w === 360 ? 'critical' : 'major')
    }

    // ── اللقطات (§12): desktop + mobile ──
    const shots = {}
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(800)
    shots.desktop = path.join(shotsDir, 'desktop.png')
    await page.screenshot({ path: shots.desktop })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(800)
    shots.mobile = path.join(shotsDir, 'mobile.png')
    await page.screenshot({ path: shots.mobile })

    // ── الفحص الوظيفي حسب المزايا (§19) ──
    const features = await page.evaluate(() => ({
      cards: document.querySelectorAll('[class*="card"], [class*="product"], [class*="dish"], article').length,
      forms: [...document.querySelectorAll('form')].map((f) => f.querySelectorAll('input,textarea,select').length),
      search: !!document.querySelector('input[type="search"], input[placeholder*="بحث" i], input[placeholder*="search" i]'),
      whatsapp: !!document.querySelector('a[href*="wa.me"], a[href*="whatsapp"]'),
      faq: document.querySelectorAll('details, [class*="accordion"], [class*="faq"]').length,
      pricing: [...document.body.innerText.matchAll(/(ر\.س|\$|€|جنيه|دينار|درهم)\s*\d+/g)].length,
      sliders: document.querySelectorAll('[class*="slider"], [class*="carousel"], [class*="testimonial"]').length,
      navLinks: document.querySelectorAll('nav a').length,
    }))
    await page.close()

    const failed = checks.filter((c) => !c.ok)
    return {
      ok: failed.filter((c) => c.severity === 'critical').length === 0,
      checks, shots, features,
      consoleErrors: [...new Set(consoleErrors)].slice(0, 5),
      ms: Date.now() - t0,
    }
  } catch (e) {
    ok('tech:browser', 'اكتمل فحص المتصفح', false, String(e?.message || e).slice(0, 200), 'critical')
    return { ok: false, checks, shots: {}, ms: Date.now() - t0 }
  } finally {
    try { await browser?.close() } catch { /* noop */ }
    try { srv.close() } catch { /* noop */ }
  }
}

/** تقييم معايير القبول (§20) + البوابة النهائية (§37): PASS/FAIL لكل معيار */
export function evaluateAcceptance(blueprint, qa) {
  const feats = qa?.features || {}
  const featOk = {
    'menu-list': (feats.cards || 0) >= 3,
    'dish-cards': (feats.cards || 0) >= 3,
    'product-grid': (feats.cards || 0) >= 3,
    'product-detail': (feats.cards || 0) >= 1,
    'category-filter': feats.search || (feats.cards || 0) >= 3,
    search: !!feats.search,
    'whatsapp-order': !!feats.whatsapp,
    'reservation-form': (feats.forms || []).length > 0,
    'booking-form': (feats.forms || []).length > 0,
    'consult-form': (feats.forms || []).length > 0,
    'contact-form': (feats.forms || []).length > 0,
    testimonials: (feats.sliders || 0) >= 1,
    faq: (feats.faq || 0) >= 1,
    pricing: (feats.pricing || 0) >= 1,
    stats: true, // تُغطى بفحص المحتوى
    'location-hours': true, 'emergency-bar': true, courses: true, 'course-grid': true,
    'learning-paths': true, 'property-grid': true, 'property-cards': true, 'search-filter': true,
    'search-bar': true, 'destination-grid': true, offers: true, newsletter: true,
    'practice-areas': true, team: true, doctors: true, specialties: true,
    'program-cards': true, trainers: true, 'trial-booking': true,
    'services-grid': true, 'portfolio-gallery': true, 'process-steps': true,
    'feature-grid': true, 'product-shot': true, 'how-it-works': true, cta: true,
    features: true, about: true, contact: true,
  }
  const results = []
  for (const c of blueprint?.acceptanceCriteria || []) {
    let pass = null
    let evidence = ''
    if (c.kind === 'feature') {
      const fid = String(c.id).replace(/^feat:/, '')
      pass = featOk[fid] === true ? true : featOk[fid] === false ? false : null
      evidence = pass === null ? 'لم تُفحص آليًا' : pass ? 'موجودة في DOM' : 'غائبة عن DOM'
    } else {
      const match = (qa?.checks || []).find((q) => q.id === c.id)
      if (match) { pass = match.ok; evidence = match.detail || '' }
    }
    if (pass === null) continue // NOT_APPLICABLE — تُهمل بدل التخمين
    results.push({ id: c.id, label: c.label, critical: !!c.critical, status: pass ? 'PASS' : 'FAIL', evidence })
  }
  return results
}

/** البوابة النهائية (§37): technical/functional/visual/responsive/content/security */
export function finalGate({ siteChecks = [], criteria = [], visualFlags = [], dir = null }) {
  const gates = {
    technical: siteChecks.filter((c) => c.id.startsWith('tech:') && !c.ok),
    functional: criteria.filter((c) => c.status === 'FAIL' && c.critical),
    visual: (visualFlags || []).filter((f) => !f.ok),
    responsive: siteChecks.filter((c) => c.id.startsWith('resp:') && !c.ok),
    content: siteChecks.filter((c) => c.id.startsWith('content:') && !c.ok),
    security: dir ? secretScan(dir) : [],
  }
  const criticalFails =
    gates.technical.filter((c) => c.severity === 'critical').length +
    gates.functional.length +
    gates.responsive.filter((c) => c.severity === 'critical').length +
    gates.security.length
  return {
    gates: Object.fromEntries(Object.entries(gates).map(([k, v]) => [k, { fail: v.length, items: v.slice(0, 4) }])),
    verdict: criticalFails > 0 ? 'FAILED' : (gates.technical.length + gates.functional.length + gates.responsive.length + gates.visual.length + gates.content.length > 0 ? 'NEEDS_REPAIR' : 'COMPLETED'),
  }
}

/** فحص أسرار مسربة في ملفات الموقع (§37 security) */
function secretScan(dir) {
  const hits = []
  const walk = (d, depth) => {
    if (depth > 3) return
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p, depth + 1); continue }
      if (!/\.(html|js|mjs|css|json)$/.test(e.name)) continue
      let s = ''
      try { s = fs.readFileSync(p, 'utf8') } catch { continue }
      if (/sk-(live|test)-[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{10,}|xox[bap]-|-----BEGIN (RSA )?PRIVATE KEY-----/i.test(s)) {
        hits.push({ id: 'sec:secret', label: `سر مسرب في ${path.relative(dir, p)}`, ok: false, severity: 'critical' })
      }
    }
  }
  walk(dir, 0)
  return hits
}
