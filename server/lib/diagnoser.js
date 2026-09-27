/**
 * المشخّص (§16): عند فشل الموقع يحدد السبب الجذري بدقة بدل قائمة عشوائية.
 * المدخلات: نتائج التحقق + سجلات العمليات + حالة الملفات.
 * المخرجات: [{ severity, file, issue, rootCause, fix }] مرتبة بالأهمية.
 */
import { userWorkspace, safeResolve } from './paths.js'

const SEV_ORDER = { critical: 0, major: 1, minor: 2 }

export function diagnose(email, rootRel, validation = [], procLogs = []) {
  const out = []
  const push = (d) => {
    if (!out.some((x) => x.file === d.file && x.issue === d.issue)) out.push(d)
  }
  let dir = null
  try {
    dir = safeResolve(userWorkspace(email), rootRel || '.')
  } catch { /* noop */ }

  const byCode = {}
  for (const c of validation) {
    if (c.ok) continue
    const code = c.code || inferCode(c.label || '')
    byCode[code] = byCode[code] || []
    byCode[code].push(c)
  }

  // 1. ملفات مفقودة/مراجع ميتة → critical
  for (const c of [...(byCode.missing || []), ...(byCode.refs || [])]) {
    const m = String(c.label || '').match(/«([^»]+)»/)
    push({
      severity: 'critical', file: c.file || m?.[1] || 'index.html',
      issue: c.label || 'مرجع مفقود',
      rootCause: 'إشارة لملف لم يُكتب أو مسار خاطئ',
      fix: m?.[1] ? `أنشئ الملف «${m[1]}» بمحتوى حقيقي أو أزل الإشارة إليه من HTML` : 'أصلح المسار أو أنشئ الملف',
    })
  }
  // 2. صياغة JS/CSS → critical (يكسر التشغيل)
  for (const c of byCode.syntax || []) {
    push({
      severity: 'critical', file: c.file || 'app.js',
      issue: c.label || 'خطأ صياغة',
      rootCause: 'كود ناقص/مقصوص من المزود أو قوس غير مغلق',
      fix: `اقرأ الملف «${c.file}» وأصلح الصياغة ثم تحقق بـ node --check`,
    })
  }
  // 3. القالب العام → major (يعاد البناء/الصقل)
  for (const c of byCode.generic || []) {
    push({
      severity: 'major', file: c.file || 'index.html',
      issue: c.label || 'قالب عام',
      rootCause: 'النموذج تجاهل نظام التصميم وأنتج هيكلًا بدائيًا',
      fix: 'أعد قراءة DESIGN SYSTEM في السياق وطبّق: هيرو غامر + صور + تدرجات + 6 أقسام',
    })
  }
  // 4. صور/أصول ناقصة → major
  for (const c of byCode.assets || []) {
    push({
      severity: 'major', file: c.file || 'index.html',
      issue: c.label || 'أصل ناقص',
      rootCause: 'صورة خارجية ميتة أو مسار محلي خاطئ',
      fix: 'استبدل برابط Unsplash موضوعي صالح مع fallback متدرج',
    })
  }
  // 5. سجلات العمليات: crash/exit غير صفري → critical مع السبب
  for (const l of (procLogs || []).slice(-30)) {
    const t = String(l.text || '')
    const m = t.match(/(Error|FAILED|ENOENT|EADDRINUSE|Cannot find module [^\s]+|SyntaxError[^\n]{0,120})/i)
    if (m) {
      push({
        severity: 'critical', file: rootRel || '.',
        issue: `تعطل التشغيل: ${m[0].slice(0, 100)}`,
        rootCause: /ENOENT|Cannot find module/i.test(m[0]) ? 'اعتمادية/ملف مفقود' : /EADDRINUSE/i.test(m[0]) ? 'تعارض منافذ' : 'خطأ تنفيذي — راجع السجل الكامل',
        fix: /ENOENT|Cannot find module/i.test(m[0]) ? 'ثبّت الاعتمادية أو صحح المسار ثم أعد التشغيل' : 'أصلح السبب ثم أعد تشغيل المعاينة',
      })
      break
    }
  }
  // 6. فيض أفقي/استجابة → major (من فحص المتصفح لاحقًا، تُمرر كـ validation)
  for (const c of byCode.responsive || []) {
    const m = String(c.label || '').match(/(\d+)px/)
    push({
      severity: 'major', file: c.file || 'style.css',
      issue: c.label || 'مشكلة استجابة',
      rootCause: m ? `عنصر بعرض ثابت يتجاوز ${m[1]}px` : 'عرض ثابت أو نقص media queries',
      fix: 'افحص العنصر المتجاوز: استبدل العرض الثابت بـ max-width:100% واختبر 360px ثم أعد الاختبار',
    })
  }
  // الباقي → minor
  for (const [code, list] of Object.entries(byCode)) {
    if (['missing', 'refs', 'syntax', 'generic', 'assets', 'responsive'].includes(code)) continue
    for (const c of list.slice(0, 4)) {
      push({ severity: 'minor', file: c.file || 'index.html', issue: c.label || code, rootCause: 'فحص إرشادي', fix: 'عالج حسب التسمية ثم أعد الفحص' })
    }
  }
  void dir
  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).slice(0, 10)
}

function inferCode(label) {
  const l = String(label || '')
  if (/مرجع|مفقود|404|غير موجود/.test(l)) return 'missing'
  if (/صياغة|syntax|قوس/i.test(l)) return 'syntax'
  if (/قالب عام|generic|عارٍ|عاري|ناقصة|مختصرة/.test(l)) return 'generic'
  if (/صورة|أصل|asset|unsplash/i.test(l)) return 'assets'
  if (/استجابة|فيض|overflow|موبايل|360|media/i.test(l)) return 'responsive'
  return 'other'
}

/** لقطة قبل الإصلاح + استعادة عند التدهور (§22) */
export async function guardedRepair(email, root, version, repairFn, validateFn) {
  const { snapshotProject, restoreVersion } = await import('./projects.js')
  let snap = null
  try { snap = snapshotProject(email, root, version) } catch { /* اختياري */ }
  const before = safeCount(validateFn)
  await repairFn()
  const after = safeCount(validateFn)
  if (snap && after.fail > before.fail && before.fail <= after.fail) {
    try {
      restoreVersion(email, root, version)
      return { ok: false, rolledBack: true, before, after, reason: 'الإصلاح زاد الفشل — رُجع للنسخة الجيدة' }
    } catch { /* noop */ }
  }
  return { ok: after.fail === 0, rolledBack: false, before, after }
}

function safeCount(validateFn) {
  try {
    const list = validateFn() || []
    return { pass: list.filter((c) => c.ok).length, fail: list.filter((c) => !c.ok).length }
  } catch {
    return { pass: 0, fail: 99 }
  }
}
