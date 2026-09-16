# Ghennai — وكيلك الذكي الأول 🧠

**Ghennai AI** هي منصة ويب مفتوحة المصدر تعمل 100% على جهازك: توجّه طلباتك إلى 5 وكلاء ذكاء اصطناعي (Core, Coding, Research, Study, Design)، تبني المواقع أمام عينيك في «المسرح البرمجي»، تحلل الصور محليًا، تسمع صوتك، وتنشر مشاريعك على GitHub بضغطة زر.

> English version below. 🇬🇧

---

## ✨ المميزات

| الميزة | الوصف |
|---|---|
| 🧠 **Ghennai Core** | موجّه الطلبات: يفهم نيتك ويختار الوكيل المناسب |
| ⚙️ **Coding Agent** | يكتب الأكواد، يشغّل الأوامر، يبني، ويصحح — باستخدام أدوات حقيقية |
| 🌍 **Research Agent** | بحث موجه عبر الإنترنت/المحليّ |
| 📚 **Study Agent** | شرح وتلخيص ومفاهيم |
| 🎨 **Design Agent** | خطط التصميم والألوان والسيناريوهات |
| 🎭 **المسرح البرمجي (Code Theater)** | Terminal حقيقي بخط زمني مباشر + محرر Monaco + معاينة حية في المتصفح |
| ⚡ **الرابط الفوري (Instant Link)** | بمجرد اكتمال البناء يصبح موقعك على `/live/<code>` من خادمنا — يُشارك فورًا دون GitHub أو توكن |
| 🎨 **ستوديو البناء (Build Studio)** | معالج موجّه من 3 خطوات: نوع الموقع ← التفاصيل ← التصميم — يبني المواصفة ويرسلها في ثانية |
| 💎 **جودة تصميم أعلى** | مخطط المعمار يُمرَّر للمبرمج (ألوان/خطوات) + جولة «اللمسة الأخيرة» ترفع الشكل العام إلى إطلالة مميزة |
| ⌨️ **كتابة حية مثالية** | الكود يُكتب على الشاشة داخل Monaco حقيقي مع تتبع التبويبات ومتابعة تلقائية للأسطر |
| 👁️ **Smart Vision** | رفع صورة/واجهة → تحليل محلي عبر `moondream` → بناء موقع منها |
| 🎙️ **الوكيل الصوتي** | تسجيل صوتي (Web Speech API) + قراءة الردود (TTS) |
| 🚀 **نشر بضغطة زر** | سؤال «هل تريد النشر؟» → git + GitHub → رابط مباشر |
| 🧠 **العقل المشترك (Shared Mind)** | يتذكر مشاريعك وأخطاءك وتفضيلاتك في SQLite |
| 📦 **PWA** | تثبيت على الجوال/الحاسوب، يعمل أوفلاين |
| 🐳 **Docker** | تشغيل المنصة كاملة بأمر واحد |

## 🧱 التقنية

- **الواجهة:** React 18 + TypeScript + TailwindCSS + Framer Motion + Zustand + Monaco + xterm.js
- **الخادم:** Node.js + Express + SQLite (better-sqlite3)
- **الذكاء:** Ollama — `qwen2.5:3b` (نص) + `moondream` (رؤية)
- **الريال-تايم:** Server-Sent Events (SSE) لقنوات الوكيل والنشر
- **الترخيص:** MIT

## 🚀 التشغيل

### الروابط الفورية (شارك موقعك فورًا)

عندما يُكمل «Coding Agent» بناء موقعك، يُسجَّل تلقائيًا في سجل المشاركة ويظهر برابط فوري:

```
https://<خادمك>/live/<رمز-مكوّن-من-8-أحرف>/
```

- **بدون توكن، بدون GitHub** — الرابط يعمل من خادمنا مباشرة، ويبقى حيًا ما دام الخادم قائمًا.
- كلما كان الخادم خلف تونل `cloudflared` (انظر `scripts/`) يُحدَّث الرابط تلقائيًا برابط التونل.
- `?pick=1` عند الطرف تُحقن أداة اختيار العناصر للمرحلة القادمة (تعديل حرفي).

### ستوديو البناء (Build Studio)

- فتح عبر زر **«+ بناء موقع»** أعلى الدردشة أو بطاقة الشاشة الافتتاحية.
- 3 خطوات: **نوع الموقع** (متجر/شركة/مطعم/…)، **التفاصيل** (الاسم/الوصف/الجمهور/الصفحات)، **التصميم** (5 أنماط بصرية + 7 لوحات ألوان + اللغة).
- يضغط «ابدأ البناء» فتفتح المسرح ويبدأ الوكيل فورًا مع الرابط الفوري بعد الانتهاء.

### جودة التصميم المضبوطة

- خطة المعمار (الألوان/الخطوات/الحزمة) تُمرَّر للمبرمج صراحةً عبر `DESIGN SPEC`.
- جولة **«اللمسة الأخيرة»**: فحص إرشادي للشكل (سمك المحتوى، الحركات، التدرجات، البطاقات الزجاجية، الاستجابة، الخطوط، الأيقونة) ثم صقل تلقائي مُقيَّد بجولتين.
- حارس كتابة يرفض الصفحات المقطوعة ويستعيد آخر نسخة سليمة (مقاومة انقطاع المزوّد).

### الكتّابة الحية

- الكود يُكتب داخل **Monaco حقيقي** مع تلوين وأرقام أسطر ولفّ تلقائي، وتبويب الملف يُفعَّل تلقائيًا أثناء الكتابة.
- سكرول ذكي يتبع آخر سطر، ومعدل بث إنساني ناعم.

### الطريقة 1 — مباشر (تطوير)

```bash
# متطلبات: Node ≥ 20، Ollama مثبت
ollama pull qwen2.5:3b
ollama pull moondream

npm install
npm run dev        # خادم: http://localhost:3001 · واجهة: http://localhost:5173
```

### الطريقة 2 — Docker

```bash
docker compose up -d --build
# افتح http://localhost:3001
```

### النشر على GitHub

- تلقائيًا عبر `gh` CLI المصدّق، أو أضف `GITHUB_TOKEN` في الإعدادات داخل التطبيق.

## 📁 البنية

```
server/
  agents/      → وكلاء الذكاء (coding, core…)
  routes/      → auth, chat, workspace, vision, deploy
  lib/         → events (SSE), memory (Shared Mind), ollama, warmup
  tools/       → terminal, filesystem, registry
  system/      → أدلة النظام والملفات
src/
  pages/       → Landing, Dashboard
  components/  → arena (Code Theater), dashboard, auth
  store/       → Zustand state
  api/         → HTTP client + SSE events
public/        → PWA (sw.js, manifest)
```

## 🔐 الأمان

- كلمات المرور تُشفّر بـ bcrypt، التوكنات JWT.
- حدّ معدّل الطلبات (rate limiting) على كل المسارات.
- مساحة العمل معزولة لكل مستخدم — لا يتجاوز الوكيل حدودها.
- النشر يتطلب مصادقة ويرفع إلى حساب المستخدم على GitHub فقط.

## 📄 الترخيص

MIT — استخدمه وعدّله وشاركه بحرية.

---

# Ghennai — Your First Smart Agent 🇬🇧

Open-source website AI platform that runs fully on your machine. Five agents (Core, Coding, Research, Study, Design), a live **Code Theater** (xterm terminal + Monaco + live preview), local vision, voice input/output, one-click GitHub publishing, Shared Mind memory, PWA, and Docker.

## Quick start

```bash
ollama pull qwen2.5:3b
ollama pull moondream
npm install
npm run dev          # server: http://localhost:3001 · web: http://localhost:5173
```

Or with Docker:

```bash
docker compose up -d --build
```

## Stack
React 18 + TypeScript + Tailwind + Framer Motion + Zustand · Node + Express + SQLite · Ollama (qwen2.5:3b text, moondream vision) · SSE · MIT License.