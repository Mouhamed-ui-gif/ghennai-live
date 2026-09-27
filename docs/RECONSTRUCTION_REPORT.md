# التقرير النهائي — إعادة هندسة Website Builder (§44)
**الكميت:** `faa1f40` (مدفوع ✓) — **التاريخ:** 27 سبتمبر 2026

## Architecture changes
1. **محرك تصميم تكيفي** (`server/agents/designEngine.js`): نهاية EPIC-MODE للكل. كل صناعة لها مستوى حركة (restrained/balanced/rich) وقائمة مؤثرات مسموحة/ممنوعة (العيادة: بلا neon/3D/marquee/glass). طبقة دلالية (جمهور/هدف/مزاج) فوق keyword، والـpresets أصبحت fallback.
2. **Blueprint** (`composeBlueprint`): صناعة/جمهور/هدف/مزاج/تعقيد/صفحات/مزايا + 12 معيار قبول — يُرسل للمبرمج بدل الطلب الخام.
3. **قدرات المزودين** (`modelRouter.js`): metadata (coding/tools/vision/quality/speed/context/cost/reliability) + `orderByRole` (coding/chat/vision/review/design) + فصل الأدوار في كل المناداة.
4. **آلة حالة** (`server/lib/buildStates.js`): 13 حالة + 10 مراحل حقيقية تُبث (`build_stage`) + ملخص (مدد/مزود/أدوات/ملفات/أخطاء/تحققات).
5. **المشخّص** (`server/lib/diagnoser.js`): سبب جذري + ملف + إصلاح موصى به + `guardedRepair`.
6. **فاحص المتصفح** (`server/lib/browserQA.js`): Playwright حقيقي (حالة/نوع/علامة، كونسول، شبكة، روابط ميتة بحل المضيف، فيض 360/768/1440، لقطتان، مزايا وظيفية) + `evaluateAcceptance` (PASS/FAIL) + `finalGate` (6 بوابات + فحص أسرار).
7. **بوابات**: رفض القالب العام، رفض الكتابة الصورية، rollback عند تدهور الإصلاح (لقطة v0)، إصلاح QA فقط للحرجة/القالب، نبض SSE.
8. **واجهة**: مراحل حقيقية في CodeRail + أحداث `build_stage`/`qa_report`.

## Files changed
`designEngine.js` (توسعة كبيرة) · `codingAgent.js` (حقن/حالات/بوابات/rollback) · `brain.js` (أدوار النماذج) · `modelRouter.js` (قدرات) · `chat.js` (نبض) · `filesystem.js` (حارس) · جديد: `buildStates.js` `diagnoser.js` `browserQA.js` · واجهة: `app.ts` `chatEvents.ts` `CodeRail.tsx` · اختبارات: `builder-cases.mjs` `build-watch-proof.mjs` · توثيق: `BUILD_AUDIT.md`.

## Build pipeline (الجديد)
طلب ← Blueprint+DesignSystem+Components ← `coding_start`+رابط ← أدوات (BUILDING/RUNNING) ← TESTING (تحقق+تشخيص+إصلاح+rollback) ← صقل تكيفي ← FINAL_VERIFY ← **بوابة المتصفح** (إصلاح موجّه واحد) ← COMPLETED (رابط) أو FAILED صريح.

## Visual QA
 heuristic-كمقدمة + بوابة قالب + فحص متصفح (كونسول/فيض/روابط/لقطات) + تكيّف بالمسموح/الممنوع حسب الصناعة + إصلاح موجّه بالمشكلة.

## Preview
 الجاهزية = TCP+HTTP<500 (موجود) + فحص محتوى/علامة/مسار في browserQA + حل مسارات المضيف (exact/index/+.html) + RUNNING عند أول index.html.

## Provider routing
 coding: groq120→openrouter→openai→moonshot→gemini→groq (جودة+أدوات أولًا)؛ chat: السرعة؛ vision: القادرون فقط؛ review/design: الجودة. محليًا ollama احتياط.

## Performance
 نبض يمنع موت البث؛ سياق ذكي موجود (تقليم 1200/14k)؛ إصلاح QA واحد فقط للحرجة؛ ترتيب الأدوار يقلل المحاولات الفاشلة.

## Reliability
 لا نجاح وهمي (4 مسارات FAILED صريحة)؛ rollback عند التدهور؛ حارس الكتابة (…"→مرفوض)؛ بوابة أسرار؛ حدود ميزانية صارمة (2+2+1).

## Tests (منفذة فعلًا)
- `check`/`lint`/`build`: سليمة ✓
- `agent-phase1`: 19/19 ✓ · `builder-cases`: 9/9 (متصفح حقيقي: موقع سليم NEEDS_REPAIR بثانويات، ومكسور FAILED بحرجة: كونسول+فيض360+روابط) ✓
- `studio-e2e`: 12/12 بلا أخطاء ✓ · `phase-fixes`: ناجح ✓
- فحصا صناعة: متجر ساعات (store/MEDIUM/sell/luxury + whatsapp) وعيادة (مقيّدة بلا neon) ✓

## Real website test
- 4 محاولات حيّة لمتجر الساعات: البنية تعمل (مراحل كاملة، نظام store، ملفات كُتبت جزئيًا: هيرو عربي "ساعات جلدية فاخرة" + 7 أقسام + صور + خطوط).
- **النتيجة الصادقة:** لم تكتمل أي محاولة — Groq يضرب 429 دفعات والنموذج الاحتياطي ضعيف (يكتب "…" أو CSS بلا HTML). الحارس منع ملفات وهمية، والوكيل أعلن FAILED صراحة في كل مرة (لا نجاح مُدّعى واحد).
- إثبات الجودة الحي معلّق على تعافي المزود (أو مفتاح Gemini الإنتاجي في Render).

## Remaining issues
1. استقرار المزودين (429) هو القيد الأكبر — يُحل بمفتاح إنتاجي/حدود أعلى.
2. `project.env` للمشاريع (§18) لم يُنفذ — بيئة processes/LANG+PORT فقط.
3. مراجعة بصرية بنموذج رؤية (scores) اختيارية — البوابات الحالية heuristic+متصفح.
4. `tests/build-site-proof.mjs` القديم: تأكيده ضعيف (يلتقط index قوالب) — يُستبدل بـ`build-watch-proof`.
5. `.crush/crush.db` التُقط في التاريخ — يُزال لاحقًا.
