/**
 * اختبارات Website Builder (§38): حقائق لا ادعاءات — بلا حاجة لنماذج.
 * 1) blueprint متجر الساعات الفاخر (§39 شكل الطلب) 2) عيادة بلا neon (§40)
 * 3) تعقيد 4) قدرات المزودين 5) بوابة القالب 6) حارس الكتابة 7) المشخّص
 * 8) فحص متصفح على موقعين حقيقيين 9) قبول + بوابة نهائية 10) آلة الحالة
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let failed = 0
const pass = (n, d = '') => console.log(`PASS  ${n}${d ? ' — ' + d : ''}`)
const fail = (n, e) => { failed++; console.error(`FAIL  ${n}: ${e}`) }
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`) }

// 1+2. المحرك التكيفي
try {
  const de = await import('../server/agents/designEngine.js')
  const watch = de.composeDesignSystem('ابن لي متجرًا إلكترونيًا فاخرًا للساعات الجلدية أسود وذهبي مع أزرار واتساب')
  eq(watch.industry, 'store', 'watch industry')
  if (!watch.blueprint.features.includes('whatsapp-order')) throw new Error('whatsapp-order missing')
  if (!watch.blueprint.acceptanceCriteria.length) throw new Error('no criteria')
  const clinic = de.composeDesignSystem('ابن موقعا لعيادة طبية')
  for (const ban of ['neonGlow', 'tilt3d', 'marquee', 'customCursor', 'glass']) {
    if (!clinic.motionProfile.forbid.includes(ban)) throw new Error(`clinic allows ${ban}`)
  }
  eq(clinic.motionProfile.level, 'restrained', 'clinic motion')
  pass('adaptive engine: watch-store + clinic (§39/§40 شكل)', `${watch.industry}/${watch.blueprint.complexity}`)
} catch (e) { fail('adaptive engine', e.message) }

// 3. التعقيد
try {
  const { detectComplexity } = await import('../server/agents/designEngine.js')
  eq(detectComplexity('صفحة تعريفية بسيطة'), 'SIMPLE', 'simple')
  eq(detectComplexity('متجر بعدة صفحات ومنتجات'), 'MEDIUM', 'medium')
  eq(detectComplexity('تطبيق بلوحة تحكم وتسجيل دخول'), 'APPLICATION', 'app')
  pass('complexity detector (§7)')
} catch (e) { fail('complexity', e.message) }

// 4. القدرات
try {
  const mr = await import('../server/lib/modelRouter.js')
  const coding = mr.orderByRole('coding').map(([n]) => n)
  const chat = mr.orderByRole('chat').map(([n]) => n)
  if (!coding.length || !chat.length) throw new Error('empty ordering (no keys?)')
  const vision = mr.orderByRole('vision').map(([n]) => n)
  for (const v of vision) {
    if (!mr.providerCaps(v)?.vision) throw new Error(`non-vision in vision role: ${v}`)
  }
  pass('capability router (§9)', `coding:${coding[0]} chat:${chat[0]} vision:${vision.join(',')}`)
} catch (e) { fail('capability router', e.message) }

// 5. بوابة القالب
try {
  const { genericTemplateFlags } = await import('../server/agents/designEngine.js')
  const bad = genericTemplateFlags('<html><body><h1>x</h1><div>a</div><div>b</div><div>c</div><footer>f</footer></body></html>', 'body{background:#fff}')
  if (!bad.some((f) => f.code === 'generic-template')) throw new Error('generic not caught')
  const good = genericTemplateFlags('<section></section>'.repeat(7) + '<img src="x">', '.a{background:linear-gradient(red,blue)}.b{animation:z} ')
  if (good.some((f) => f.code === 'generic-template')) throw new Error('rich wrongly flagged')
  pass('generic gate (§30 بوابة)')
} catch (e) { fail('generic gate', e.message) }

// 6. حارس الكتابة
try {
  const { default: fsys } = await import('../server/tools/filesystem.js')
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'))
  for (const [p, c] of [['a.html', '…'], ['a.html', ''], ['s.css', 'a{}']]) {
    const r = await fsys.writeFile({ workspace: ws, path: p, content: c })
    if (r.ok) throw new Error(`vacuous allowed: ${p}=${c}`)
  }
  const okR = await fsys.writeFile({ workspace: ws, path: 'ok.html', content: '<html>' + 'x'.repeat(600) + '</html>' })
  if (!okR.ok) throw new Error('real content refused')
  fs.rmSync(ws, { recursive: true, force: true })
  pass('vacuous-write guard')
} catch (e) { fail('vacuous guard', e.message) }

// 7. المشخّص
try {
  const { diagnose } = await import('../server/lib/diagnoser.js')
  const ds = diagnose('t@t.t', '.', [
    { ok: false, label: 'المرجع «style.css» يعمل', file: 'index.html' },
    { ok: false, label: 'قالب عام مرفوض', file: 'index.html' },
  ], [])
  if (!ds.length || ds[0].severity !== 'critical') throw new Error('missing critical first: ' + JSON.stringify(ds[0]))
  if (!ds[0].rootCause || !ds[0].fix) throw new Error('no rootCause/fix')
  pass('diagnoser (§16)', `${ds.length} issues, first=${ds[0].severity}`)
} catch (e) { fail('diagnoser', e.message) }

// 8. فحص متصفح حقيقي على موقعين (§12)
const mkSite = (base, kind) => {
  fs.mkdirSync(base, { recursive: true })
  if (kind === 'good') {
    fs.writeFileSync(path.join(base, 'menu.html'), '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>القائمة</title></head><body><h1>القائمة</h1></body></html>')
    fs.writeFileSync(path.join(base, 'index.html'), `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مقهى النخبة</title><style>body{background:linear-gradient(#120b08,#1e130e);color:#f5e9d7}.card{transition:all .3s}@keyframes drift{to{transform:translateY(4px)}}</style></head><body><header><nav><a href="/">الرئيسية</a><a href="/menu">القائمة</a></nav></header><main><h1>مقهى النخبة</h1><section><h2>أطباقنا</h2><div class="card dish"><img src="https://images.unsplash.com/photo-x" alt="طبق"><p>قهوة مختصة بـ 25 ر.س</p></div><div class="card dish"><img src="https://images.unsplash.com/photo-y" alt="حلويات"><p>كيك بـ 30 ر.س</p></div><div class="card dish"><img src="https://images.unsplash.com/photo-z" alt="عصير"><p>عصير بـ 20 ر.س</p></div></section><section><h2>آراء</h2><div class="testimonial"><p>ممتاز</p></div><div class="testimonial"><p>رائع</p></div></section><section><h2>تواصل</h2><form><input name="n"><button>احجز طاولة</button></form></section></main><footer>حقوق</footer><script>document.addEventListener('DOMContentLoaded',()=>{console.log('ok')});</script></body></html>`)
  } else {
    fs.writeFileSync(path.join(base, 'index.html'), `<!DOCTYPE html><html><head><title>t</title><style>body{background:#fff}</style></head><body><h1>Welcome to our website</h1><p>Amazing Service Test Product</p><div>a</div><div>b</div><div>c</div><a href="/nope.html">dead</a><div style="width:900px">wide</div><footer>f</footer><script>throw new Error('boom-qa-test')</script></body></html>`)
  }
}
try {
  const { qaStaticDir, evaluateAcceptance, finalGate } = await import('../server/lib/browserQA.js')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bqa-'))
  const good = path.join(tmp, 'good'), bad = path.join(tmp, 'bad')
  mkSite(good, 'good'); mkSite(bad, 'bad')
  const g = await qaStaticDir(good)
  const b = await qaStaticDir(bad)
  if (!g.shots.desktop || !g.shots.mobile) throw new Error('good site missing shots')
  if (b.ok) throw new Error('broken site passed browser QA')
  const bCrit = b.checks.filter((c) => !c.ok && c.severity === 'critical')
  if (!bCrit.length) throw new Error('no critical caught on broken site')
  const hasConsole = b.checks.some((c) => c.id === 'tech:console' && !c.ok)
  const hasResp = b.checks.some((c) => c.id === 'resp:360' && !c.ok)
  const hasDead = b.checks.some((c) => c.id === 'tech:links' && !c.ok)
  if (!hasConsole || !hasResp || !hasDead) throw new Error(`missing catches console=${hasConsole} resp360=${hasResp} dead=${hasDead}`)
  pass('browser QA real (§12)', `good ok=${g.ok}, bad critical=${bCrit.length}`)
  // 9. قبول + بوابة (§20/§37)
  const { composeBlueprint } = await import('../server/agents/designEngine.js')
  const bp = composeBlueprint('ابن موقعا لمقهى: قائمة مشروبات وحجز طاولة')
  const crit = evaluateAcceptance(bp, g)
  if (!crit.length || !crit.every((c) => ['PASS', 'FAIL'].includes(c.status))) throw new Error('criteria not evaluated')
  const gate = finalGate({ siteChecks: b.checks, criteria: evaluateAcceptance(bp, b), visualFlags: [], dir: bad })
  if (gate.verdict !== 'FAILED') throw new Error('broken site gate=' + gate.verdict)
  const gateG = finalGate({ siteChecks: g.checks, criteria: crit, visualFlags: [], dir: good })
  if (gateG.verdict === 'FAILED') throw new Error('good site failed gate: ' + JSON.stringify(gateG.gates))
  pass('acceptance + final gate (§20/§37)', `good=${gateG.verdict} bad=${gate.verdict}`)
  fs.rmSync(tmp, { recursive: true, force: true })
} catch (e) { fail('browser QA/gates', String(e.message || e).slice(0, 300)) }

// 10. آلة الحالة (§11)
try {
  const bs = await import('../server/lib/buildStates.js')
  const email = 'qa@t.t'
  bs.beginBuild(email, 'sites/x', { industry: 'store' })
  for (const s of ['PLANNING', 'DESIGNING', 'BUILDING', 'TESTING', 'COMPLETED']) bs.transitionBuild(email, 'sites/x', s)
  const sum = bs.summarizeBuild(email, 'sites/x')
  if (sum.state !== 'COMPLETED') throw new Error('not completed')
  if (sum.stages.length !== 10 || !sum.stages.every((s) => s.status === 'done')) throw new Error('stages wrong')
  if (!sum.durations || sum.toolCalls !== 0) throw new Error('summary shape')
  pass('build state machine (§11)', '10 stages tracked')
} catch (e) { fail('state machine', e.message) }

console.log(failed ? `\n${failed} FAILURES` : '\nALL BUILDER CASES PASSED')
process.exit(failed ? 1 : 0)
