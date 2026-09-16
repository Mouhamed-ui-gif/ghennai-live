import { useEffect, useMemo, useState } from 'react'
import { X, ArrowRight, ArrowLeft, LayoutTemplate, Sparkles, Palette, Check } from 'lucide-react'
import { useApp } from '../../store/app'
import { useChat } from '../../hooks/useChat'

interface SiteType { id: string; label: string; labelAr: string; icon: string; descAr: string }
const SITE_TYPES: SiteType[] = [
  { id: 'portfolio', label: 'Portfolio', labelAr: 'محفظة أعمال', icon: '🧑‍🎨', descAr: 'عرض أعمالي ومهاراتي بأسلوب احترافي' },
  { id: 'landing', label: 'Landing', labelAr: 'صفحة هبوط', icon: '🚀', descAr: 'عرض منتج أو خدمة بziel واضح' },
  { id: 'ecommerce', label: 'Shop', labelAr: 'متجر بسيط', icon: '🛍️', descAr: 'عرض منتجات مع صور وأسعار' },
  { id: 'blog', label: 'Blog', labelAr: 'مدونة', icon: '✍️', descAr: 'مقالات ومحتوى منظم' },
  { id: 'restaurant', label: 'Place', labelAr: 'مطعم / مقهى', icon: '🍽️', descAr: 'قائمة وعرض وocation' },
  { id: 'game', label: 'Interactive', labelAr: 'تجربة تفاعلية', icon: '🎮', descAr: 'لعبة أو تجربة ويب تفاعلية' },
  { id: 'club', label: 'Community', labelAr: 'نادي / فريق', icon: '👥', descAr: 'عرض فريق أو جمعية' },
  { id: 'custom', label: 'Free', labelAr: 'حر (اكتب بنفسك)', icon: '✏️', descAr: 'اصنف موقعك بالطريقة التي تحبها' },
]

interface StyleDir { id: string; labelAr: string; icon: string; accent: string; accentAr: string }
const STYLES: StyleDir[] = [
  { id: 'luxury', labelAr: 'فخم متوهج', icon: '✨', accent: 'linear-gradient(135deg,#f59e0b,#7c3aed)', accentAr: 'ذهبي/بنفسجي' },
  { id: 'minimal', labelAr: 'بسيط نظيف', icon: '🌿', accent: 'linear-gradient(135deg,#e5e7eb,#3b82f6)', accentAr: 'أبيض/أزرق' },
  { id: 'warm', labelAr: 'دافئ عضوي', icon: '☀️', accent: 'linear-gradient(135deg,#f97316,#10b981)', accentAr: 'برتقالي/أخضر' },
  { id: 'tech', labelAr: 'تقني داكن', icon: '💻', accent: 'linear-gradient(135deg,#06b6d4,#8b5cf6)', accentAr: 'سماوي/بنفسجي' },
  { id: 'playful', labelAr: 'مرح نابض', icon: '🎉', accent: 'linear-gradient(135deg,#f43f5e,#facc15)', accentAr: 'وردي/أصفر' },
]

const COLOR_PRESETS = [
  { hex: '#0f766e', name: 'زمردي' },
  { hex: '#7c3aed', name: 'نفسي' },
  { hex: '#0284c7', name: 'سماوي' },
  { hex: '#ea580c', name: 'برتقالي' },
  { hex: '#be123c', name: 'قرمزي' },
  { hex: '#0f172a', name: 'كحلي' },
  { hex: '#f59e0b', name: 'ذهبي' },
]
const PAGE_OPTIONS = ['رئيسية', 'من نحن', 'الخدمات', 'أعمالنا', 'المدونة', 'تواصل معنا', 'الأسعار', 'الفريق']

export function BuildStudio() {
  const close = useApp((s) => s.closeStudio)
  const projectName = useApp((s) => s.projectName)
  const openArena = useApp((s) => s.openArena)
  const { send } = useChat()

  const [step, setStep] = useState(0)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [desc, setDesc] = useState('')
  const [audience, setAudience] = useState('general')
  const [pages, setPages] = useState<string[]>(['رئيسية'])
  const [styleId, setStyleId] = useState<string | null>(null)
  const [colorHex, setColorHex] = useState<string | null>(null)
  const [lang, setLang] = useState<'ar' | 'en' | 'both'>('ar')
  const [customType, setCustomType] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const style = STYLES.find((s) => s.id === styleId)
  const type = SITE_TYPES.find((t) => t.id === typeId)

  useEffect(() => {
    if (typeId && !siteName) {
      const t = SITE_TYPES.find((x) => x.id === typeId)
      if (t && t.id !== 'custom') setSiteName(t.labelAr)
    }
  }, [typeId, siteName])

  const togglePage = (p: string) => {
    setPages((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  const brief = useMemo(() => {
    const typeNameFinal = typeId === 'custom' ? customType : (type?.labelAr || '')
    const pagesList = pages.join('، ') || 'رئيسية'
    const styleDesc = styleId
      ? `النمط البصري: ${style?.labelAr || styleId} — ${style?.accentAr || ''}`
      : 'النمط البصري: اختر ما يناسبك'
    const colorLine = colorHex ? `اللون المميز: ${colorHex}` : ''
    const langLine = lang === 'en' ? 'المحتوى بالإنجليزية' : lang === 'both' ? 'محتوى عربي وإنجليزي' : 'المحتوى بالعربية'

    return [
      `ابنِ لي موقعًا كاملًا (index.html + style.css + app.js) مكتملًا وجاهزًا للنشر — ${langLine}.`,
      '',
      `• نوع الموقع: ${typeNameFinal || 'غير محدد'}`,
      `• الاسم: «${siteName || projectName || 'الموقع الجديد'}»`,
      desc ? `• الهدف والوصف: ${desc}` : '',
      `• الجمهور: ${audience === 'general' ? 'عام' : audience}`,
      `• الصفحات: ${pagesList}`,
      styleDesc,
      colorLine,
      '',
      '• صمّم واجهة فريدة واحترافية بتصميم لا يقل عن مبهر — هوامش مريحة، تباين واضح، تأثيرات حركية ناعمة عند الظهور.',
      '• تخطيط متجاوب بالكامل (موبايل + تابلت + سطح مكتب)، متوافق مع جميع الشاشات.',
      '• استخدم محتوى واقعيًا عالي الجودة — نصوص مفصلة وليست placeholder، صورًا عبر inline SVG أو Data-URI.',
      '• اختر خطوطًا عربية احترافية من Google Fonts (مثلاً Cairo أو Tajawal أو IBM Plex Sans Arabic).',
    ].filter(Boolean).join('\n')
  }, [typeId, siteName, desc, audience, pages, styleId, colorHex, lang, customType, projectName, type, style])

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    openArena(siteName || projectName || 'الموقع الجديد')
    await send(brief, 'Coding')
    close()
  }

  const canNext = step === 0 ? !!typeId : step === 1 ? !!(siteName.trim() || desc.trim()) : true

  return (
    <div className="fixed inset-0 z-[105] flex flex-col bg-night-950 text-slate-200">
      {/* الشريط العلوي */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-night-900/90 px-4 py-3 backdrop-blur">
        <span className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-300">
          <LayoutTemplate size={13} /> ستوديو البناء
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${step > i ? 'bg-violet-500 text-white' : step === i ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-slate-600'}`}>
              {step > i ? <Check size={11} /> : i + 1}
            </span>
          ))}
          <span className="ms-1">{step === 0 ? 'نوع الموقع' : step === 1 ? 'التفاصيل' : 'التصميم والملخص'}</span>
        </div>
        <button onClick={close} className="ms-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"><X size={17} /></button>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          {/* الخطوة 0 — نوع الموقع */}
          {step === 0 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-white">ما نوع موقعك؟</h2>
              <p className="mb-5 text-sm text-slate-400">اختر الشكل العام لموقعك — سنرتّب لك كل شيء بعد ذلك.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {SITE_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setTypeId(t.id) }}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                      typeId === t.id
                        ? 'border-violet-400/60 bg-violet-500/15 shadow-[0_0_30px_rgba(124,58,237,.15)]'
                        : 'border-white/10 bg-white/3 hover:border-white/25 hover:bg-white/5'
                    }`}
                  >
                    <span className="text-3xl">{t.icon}</span>
                    <span className="font-semibold text-white">{t.labelAr}</span>
                    <span className="text-[11px] leading-snug text-slate-400">{t.descAr}</span>
                  </button>
                ))}
              </div>
              {typeId === 'custom' && (
                <div className="mt-4">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">صِف نوع موقعك</label>
                  <input value={customType} onChange={(e) => setCustomType(e.target.value)} className="input-lg !rounded-2xl !border-white/15" placeholder="مثال: صفحة عرض مشاريع تخرج" />
                </div>
              )}
            </div>
          )}

          {/* الخطوة 1 — التفاصيل */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">اسم الموقع</label>
                <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="input-lg !rounded-2xl !border-white/15" placeholder="اسم يظهر في الشريط العلوي" dir="auto" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">وصف الهدف والرسالة (اختياري لكنه يُحسّن النتيجة)</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="input-lg !rounded-2xl !border-white/15 resize-none" placeholder="مثال: صفحة تعرض مشاريعي كمصمم واجهات، بهدف جذب عملاء جدد" dir="auto" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">الجمهور المستهدف</label>
                <div className="flex flex-wrap gap-2">
                  {['general', 'business', 'youth', 'developers', 'kids'].map((a) => (
                    <button key={a} onClick={() => setAudience(a)} className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition ${audience === a ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      {a === 'general' ? 'عام' : a === 'business' ? 'أعمال' : a === 'youth' ? 'شباب' : a === 'developers' ? 'مطوّرون' : 'أطفال'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">الصفحات المطلوبة</label>
                <div className="flex flex-wrap gap-2">
                  {PAGE_OPTIONS.map((p) => (
                    <button key={p} onClick={() => togglePage(p)} className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition ${pages.includes(p) ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      {pages.includes(p) && <Check size={11} className="me-1 inline" />}{p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* الخطوة 2 — التصميم + ملخص */}
          {step === 2 && (
            <div className="space-y-6">
              {/* الهوية البصرية */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-white"><Palette size={14} /> الهوية البصرية</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {STYLES.map((s) => (
                    <button key={s.id} onClick={() => setStyleId(s.id)} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${styleId === s.id ? 'border-violet-400/60 bg-violet-500/15 shadow-[0_0_30px_rgba(124,58,237,.12)]' : 'border-white/10 bg-white/3 hover:bg-white/5'}`}>
                      <span className="text-2xl">{s.icon}</span>
                      <span className="text-[12px] font-semibold text-white">{s.labelAr}</span>
                      <span className="h-2 w-full rounded-full" style={{ background: s.accent }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* اللون المميز */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">اللون المميز</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button key={c.hex} onClick={() => setColorHex(c.hex)} className={`group flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-medium transition ${colorHex === c.hex ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
                      <span className="inline-block h-4 w-4 rounded-full" style={{ background: c.hex }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* اللغة */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">لغة المحتوى</label>
                <div className="flex gap-2">
                  {([['ar', 'عربي'], ['en', 'English'], ['both', 'الاثنان']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setLang(v)} className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition ${lang === v ? 'bg-violet-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>{l}</button>
                  ))}
                </div>
              </div>

              {/* ملخص */}
              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
                <h3 className="mb-2 text-sm font-bold text-white">ملخص المواصفة</h3>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-night-950/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300" dir="auto">
                  {brief}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* أزرار الأسفل */}
      <div className="flex items-center justify-between border-t border-white/10 bg-night-900/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
        >
          <ArrowRight size={14} /> السابق
        </button>
        {step < 2 ? (
          <button
            onClick={() => setStep((s) => Math.min(2, s + 1))}
            disabled={!canNext}
            className="flex items-center gap-1 rounded-xl bg-violet-500 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
          >
            التالي <ArrowLeft size={14} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 text-[12px] font-bold text-night-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <Sparkles size={15} /> ابدأ البناء 🚀
          </button>
        )}
      </div>
    </div>
  )
}