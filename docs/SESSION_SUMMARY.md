# ملف الملخص الكامل — مشروع Ghennai Agent
**التاريخ:** 27 سبتمبر 2026 — **الفرع:** `main` — **المستودع:** `Mouhamed-ui-gif/ghennai-live`
**آخر 커밋:** `0dcc1c6` (مدفوع إلى `origin/main` ✓)

---

## 1. ما هو المشروع؟

**Ghennai Agent** — منصة ويب مفتوحة المصدر (MIT) تعمل كوكيل ذكي يبني المواقع:
- **الواجهة:** React 18 + TypeScript + TailwindCSS + Framer Motion + Zustand + Monaco + xterm.js
- **الخادم:** Node.js + Express + SQLite (better-sqlite3) + Server-Sent Events
- **الذكاء:** 7 وكلاء (Core المنسق، Coding المبرمج، Research الباحث، Study المعلم، Design المصمم، Genie، Voice) عبر Ollama محلي (`qwen2.5:3b` + `moondream`) والسحابة (Gemini/Groq/OpenRouter)
- **التشغيل:** `npm run dev` (خادم `localhost:3001` + واجهة `localhost:5173/ghennai-app/`) أو Docker أو Render

## 2. تاريخ المراحل السابقة (من سجل git — قبل هذه الجلسة)

| المرحلة | الكميت | المحتوى |
|---|---|---|
| Phase 0 | `04b16dc` | تحصين أمني |
| Phase 1 | `c9f7af7` | الرابط الفوري `/live/<code>` من الخادم + حارس التونل |
| Phase 2 | `8c87cc4` | ستوديو البناء الموجّه (3 خطوات) |
| Phase 3 | `9a80bda` | جودة التصميم (DESIGN SPEC + اللمسة الأخيرة) |
| Phase 4 | `862d270` | الكتابة الحية في Monaco + لقطة-استعادة |
| Phase 5 | `74d7fd8` | توثيق وتحقق نهائي |
| Agent Layer | (غير ملتزم سابقًا) | طبقة `server/agent/` (حالات/أحداث/مهام/صلاحيات/أدوات/مزودون) + مسارات `builder/preview/providers/approvals` + `StudioIDE` |

## 3. ما فُعل في هذه الجلسة (الكميت `0dcc1c6` — 70 ملفًا، +6349/−327)

### الشكاوى الست للمستخدم → الإصلاحات الست

**الشكوى 1: تحليل الصورة بطيء + إنجليزي + تُنسى**
- `server/routes/vision.js` (أُعيدت كتابته جزئيًا): السحابة (Gemini) أولًا والمحلي احتياطًا بدل العكس؛ البرومبت عربي صارم؛ `num_ctx: 4096`؛ ترجمة تلقائية للعربية عبر النموذج المحلي إذا تجاهل moondream تعليمة اللغة؛ **حفظ كل تحليل** في `Memory` (نطاق `vision`) وفي رسائل الجلسة.
- `server/agents/brain.js`: دالة `visionBlock()` جديدة تُحقن آخر تحليل صورة (30 دقيقة) في `textAgentStream` + `textAgent` + `runTooledAgent` — أي وكيل يُسأل بعد رفع الصورة يتذكرها.
- `src/hooks/useChat.ts`: نص الانتظار أصبح "ثوانٍ ويكون جاهزًا ⚡".
- **مُثبت:** صورة حقيقية → رد عربي مفصل عبر `gemini/gemini-3.6-flash` في ~20 ثانية، وStudy شرحها لاحقًا من الذاكرة دون إعادة رفع.

**الشكوى 2: محادثة واحدة مشتركة بين الوكلاء**
- `src/store/app.ts`: `agentMsgs: Record<agent, Msg[]>` + مفاتيح تخزين منفصلة `ghn_msgs_<agent>` + ترحيل تلقائي من المفتاح القديم؛ `setAgent` تحفظ محادثة السابق وتحمّل الجديدة مع رسالة انتقال 🔁 وتنبيه؛ `resetChat` تمسح وكيلها الحالي فقط؛ الذاكرة العميقة (مشاريع/تفضيلات) بقيت مشتركة عمدًا.

**الشكوى 3: البناء يتأخر + لا "حاضر سيدي"**
- `server/agents/brain.js`: حدث `ack` جديد يُبث في ~0ms قبل أي عمل ثقيل.
- `src/hooks/chatEvents.ts`: معالج `ack` — نشاط "🫡 حاضر سيدي" + نطق صوتي + فتح لوح الكود فورًا.
- `src/pages/Dashboard.tsx`: تحميل مسبق لـ CodingMode/StudioIDE/Monaco في وقت الخمول.
- **مُثبت:** `ack=0ms` والجواب الكامل في ~6 ثوانٍ.

**الشكوى 4 (التركيز الخاص): لوح الكود الحي يسار المحادثة**
- ملف جديد `src/components/dashboard/CodeRail.tsx` (148 سطرًا): لوح LTR بتبويبات ملفات + **مُسرّع قراءة** (6 أحرف/40ms ≈ سرعة بشرية + زر تسريع ×5) + تلوين خفيف + عدّاد أحرف + شارة مكتمل.
- `src/store/app.ts`: `railOpen/railSession/railDone/resetLive` + `codeToken` يعمل مستقلًا عن غطاء ملء الشاشة (لا يمسح الملفات الحية عند الانتهاء).
- `src/pages/Dashboard.tsx`: لوح ثالث قابل لتغيير الحجم في أقصى اليسار (RTL) يظهر أثناء جلسة البناء.
- `src/components/dashboard/ChatPanel.tsx`: زر "الكود الحي" لإعادة الفتح + **إصلاح عطل خطافات** (نقل `useApp` من JSX الشرطي لمستوى المكون — كان يكسر الدردشة).
- **مُثبت:** لقطة حية أثناء بناء حقيقي تُظهر `index.html` يُكتب.

**الشكوى 5: رابط الموقع لا يظهر في المحادثة**
- `server/lib/share.js`: `publicBase()` (PUBLIC_URL ← `server/data/tunnel.json` ← نسبي) + `publicUrl()`.
- `server/agents/codingAgent.js`: الجواب النهائي يتضمن `[افتح موقعك المباشر](url)` + الرابط نصًا؛ ومسار نفاد الخطوات (الذي كان يبني بصمت!) أصبح يضمن المشروع + يبث `live_link` + يعلن الرابط.
- `src/hooks/chatEvents.ts`: حدث `live_link` يضيف رسالة رابط في المحادثة نفسها.
- `src/components/common/Markdown.tsx`: تحويل الروابط العارية (`https://…` و`/live/…`) لأزرار نقر + `src/styles/main.css`: زر أخضر بارز `.live-link`.

**الشكوى 6: الموقع المبني "خطوط فقط"**
- `server/agents/codingAgent.js`: ميزانية صقل مستقلة `polishRounds` (2) لا تأكلها إصلاحات التحقق + عتبة التفعيل من علامتين إلى **علامة واحدة**.

### إصلاحات إضافية في الجلسة
- `tests/studio-e2e.mjs` + `tests/studio-mobile.mjs`: `networkidle` → `domcontentloaded` (اتصال SSE الدائم كان يمنع `networkidle` أبدًا).
- اختبار جديد `tests/phase-fixes.mjs` (91 سطرًا): `publicUrl` + الإقرار الفوري + رؤية عربية حقيقية + بقاء التحليل في الذاكرة.

## 4. نتائج التحقق (كلها خضراء)

| الفحص | النتيجة |
|---|---|
| `tsc --noEmit` | سليم ✓ |
| `eslint` | 0 أخطاء (26 تحذيرًا قديمًا) ✓ |
| `tests/agent-phase1.mjs` | 19/19 ✓ |
| `tests/phase-fixes.mjs` (جديد) | كل الفحوصات ناجحة ✓ |
| `tests/studio-e2e.mjs` | 12/12 بلا أخطاء كونسول ✓ |
| `tests/studio-mobile.mjs` | ناجح + كل التبويبات ✓ |
| `tests/smoke.mjs` | ناجح ✓ |
| `npm run build` | ناجح (~60 ثانية) ✓ |

## 5. النشر والروابط

- **محلي:** الواجهة http://localhost:5173/ghennai-app/ — الخادم http://localhost:3001
- **تونل (يعمل الآن):** https://feedback-charter-acknowledged-neo.trycloudflare.com (مُتحقق: 200 + `{"ok":true}` — يعمل من أي جهاز طالما الحاسوب شغال)
- **النشر الدائم (معلّق):** الكود مدفوع لـ GitHub (`495e71e..0dcc1c6`) و`render.yaml` + `Dockerfile` جاهزان؛ أعطي المستخدم رابط `render.com/deploy?repo=…` + `JWT_SECRET` مولّد. **المطلوب منه:** إتمام Deploy في لوحة Render (ظهر له Not Found أولًا لعدم تسجيل الدخول — أُعطي الترتيب الصحيح). الرابط الدائم المتوقع: `https://ghennai.onrender.com`
- `server/data/tunnel.json` يُحدَّث برابط التونل الحي (يُستخدم في `publicUrl` لروابط المواقع المبنية).

## 6. التشغيل والصيانة

```bash
npm run dev          # تطوير: خادم 3001 + واجهة 5173
npm run build        # بناء الإنتاج (dist/)
node tests/phase-fixes.mjs   # تحقق الإصلاحات الجديدة
node tests/studio-e2e.mjs    # تحقق الواجهة الكامل
PORT=3001 node server/index.js > /tmp/ghn-server.log 2>&1 &
npx vite --port 5173 &       # خادم الواجهة
cloudflared tunnel --url http://localhost:3001  # رابط عمومي مؤقت
```

## 7. ما لم يُفعل / يحتاج المستخدم

1. إتمام **Deploy على Render** (ينتظر نقرة المستخدم في اللوحة).
2. مفتاح `GEMINI_API_KEY` للإنتاج يُوضع في متغيرات بيئة Render (موجود محليًا في `server/.env` ولا يُلتزم أبدًا).
3. ملاحظة الخطة المجانية في Render: سبات بعد 15 دقيقة خمول + استيقاظ ~50 ثانية.
4. ملف `.crush/crush.db` (90KB) التُقط في الكميت بالخطأ — يُفضَّل إضافته لـ `.gitignore` وإزالته لاحقًا (غير عاجل).
