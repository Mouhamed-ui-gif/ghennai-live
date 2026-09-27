# تقرير التدقيق الداخلي — Website Builder (من الكود الفعلي)

## 1. build flow الحالي
`POST /api/chat` → `brainRequest` (توجيه `route()` المتزامن) → إما `runBuildPipeline` (مخطط معمار ← `runCoding` ← ملاحظة مصمم ← شرح معلم ← مراجعة جني) أو `runCoding` مباشرة.
`runCoding`: `seedTemplates` ← `coding_start` + `ensureShare` (رابط `/live` فوري) ← حقن DESIGN SPEC + DESIGN SYSTEM ← حلقة أدوات (10 turns) ← `validateUserSite` ← صقل (`fixRounds` مشترك + `polishRounds` مستقل) ← `verifySiteBuilt` ← `live_link` + الجواب. مسار النفاد ينشر أيضًا. أحداث SSE حية + heartbeat كل 20s.

## 2. tool flow
`toolManager` (مهام `server/agent/`) + `executeToolCalls` في codingAgent ← سجل `tools/` (filesystem/terminal/...) ← `approvalGate` للخطير. حارس `vacuousWrite` يرفض الكتابات الصورية.

## 3. model flow
`modelRouter.PROVIDERS` (بلا metadata قدرات) ← سباق سحابي بالأولوية ثم ollama محلي. **الحالة الآن:** Groq يضرب 429 باستمرار؛ المحلي qwen صغير يكتب أحيانًا `"…"` (يُرفض الآن).

## 4. preview flow
`POST /api/preview/start`: static ← رابط share؛ npm ← تثبيت + `processes.start` (فحص جاهزية HTTP حقيقي) + بروكسي `/api/preview/p/:id`. الجاهزية = TCP+HTTP<500 فقط (بلا فحص محتوى).

## 5. validation flow
`siteDoctor.validateSite` (ملفات/مراجع/صياغة JS/توازن CSS) + `designQualityCheck` (12 قاعدة) + `genericTemplateFlags` + `verifySiteBuilt`. كلها regex/heuristic — لا متصفح، لا تنفيذ JS.

## 6. design flow
`designEngine.composeDesignSystem` (كشف صناعة keyword ← لوحة دوّارة ← أقسام ← promptBlock) يُحقن دائمًا؛ مواصفة المعالج اختيارية؛ polish loop يصلح.

## 7. failure flow
صادق: `verifySiteBuilt` يرفض الإعلان الكاذب؛ رسائل FAILED صريحة؛ approvals للخطر؛ snapshots موجودة لكن **غير مربوطة بحلقة الإصلاح**.

## 8. retry flow
`fixRounds=2` (تحقق) + `polishRounds=2` (جمال) + 10 turns. بلا مشخّص (القائمة الخام تُرسل للنموذج).

## 9. publish flow
`ensureShare` + `/live/:code` + مسارات deploy + GitHub + Render جاهز.

## الفجوات المؤكدة (مقابل المواصفة)
1. EPIC MODE مفروض على الكل (3D+glass+marquee دائمًا) — لا تكيّف (عيادة تحصل neon!).
2. لا Blueprint ولا acceptance criteria ولا functional QA.
3. لا design system موسع (radius/shadows/spacing/buttons/cards).
4. لا component library ولا complexity detector (الكل index.html واحد).
5. لا capability metadata ولا فصل أدوار النماذج.
6. لا state machine متتبعة ولا مراحل بناء حقيقية للواجهة.
7. لا Browser QA ولا Visual QA تكيفي ولا Diagnoser.
8. Preview لا يفحص المحتوى/المسار الصحيح.
9. Rollback غير مربوط؛ Snapshots يتيمة.
10. كشف الصناعة keyword فقط؛ صور عشوائية تجتاز regex؛ لا a11y.
