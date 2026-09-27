/**
 * محرك التصميم — Ghennai Website Builder Design Engine.
 *
 * الفكرة: بدل "موقع عام" واحد، يختار المحرك اتجاهًا بصريًا حسب الصناعة،
 * ثم يؤلف نظام تصميم أصليًا (لوحة + خطوط + هيرو + أقسام + زخارف + حركة)
 * من مبادئ مُستخلصة — لا ينسخ أي تصميم أو علامة أو نص من أي مرجع.
 *
 * مبادئ مُستخلصة (اتجاهات عامة، لا أصول):
 *  P1 تحريري فاخر: طباعة ضخمة، فراغ سخي، تسلسل قوي، قسم بطل سينمائي
 *  P2 منتج داكن: أجواء داكنة، تركيز على المنتج، عمق طبقي، تباين مضبوط
 *  P3 مستقبلي: توهج نيون مضبوط، خلفية غامرة، بطاقات bento، إضاءة وعمق
 *  P4 وكالة مبدعة: تشكيل مرح منضبط، بطل قوي، بطاقات عصرية، CTA واضح
 *  P5 ستارت-أب نظيف: بنية نظيفة، تنقل حديث، أقسام متوازنة، لون متزن
 */

const hashStr = (s) => {
  let h = 2166136261
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h)
}

const normAr = (s) => String(s || '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[ً-ٰٟـ]/g, '').toLowerCase()

/** الصناعات: كلمات مفتاحية (عربي+إنجليزي) → اتجاه بصري كامل */
const INDUSTRIES = {
  restaurant: {
    keys: ['مطعم', 'مقهي', 'مقهى', 'كافيه', 'اكل', 'أكل', 'طبخ', 'حلويات', 'مخبز', 'بيتزا', 'برجر', 'شاورما', 'restaurant', 'cafe', 'coffee', 'food', 'bakery', 'pizza', 'burger'],
    direction: 'دفء شهي داكن — أجواء مطعم راقٍ بإضاءة خافتة',
    principles: ['P2', 'P1'],
    palettes: [
      { bg: '#120b08', surface: '#1e130e', brand: '#e8a33d', brand2: '#8f3b1f', text: '#f5e9d7', muted: '#b8a88f' },
      { bg: '#0d1512', surface: '#14201b', brand: '#d4a24e', brand2: '#3f6b4f', text: '#f2ecdd', muted: '#a9b5a4' },
    ],
    fonts: ['Aref Ruqaa', 'Tajawal'],
    hero: 'صورة طبق بطول الشاشة يمينًا + عنوان ضخم يسارًا + شارة "توصيل سريع" + زرّا (القائمة/احجز طاولة)',
    sections: ['شريط متحرك (أطباق مميزة)', 'الأطباق الأكثر طلبًا (بطاقات صور)', 'قصتنا (صورة + نص)', 'آراء الزبائن (سلايدر)', 'احجز طاولتك (نموذج)', 'الموقع وساعات العمل', 'تذييل غني'],
    motifs: 'زخرفة عربية خفيفة كخلفية، بطاقات بزوايا دائرية كبيرة، أسعار بخط عريض',
    imagery: ['طبق رئيسي فاخر', 'أجواء المطعم الداخلية', 'الشيف أثناء العمل', 'حلويات/مشروبات'],
    motion: 'دافئة بطيئة: ظهور متدرج، توهج ذهبي نابض على CTA، عدادات (طبق/زبون/سنة)',
  },
  store: {
    keys: ['متجر', 'تسوق', 'منتجات', 'بيع', 'ملابس', 'عطور', 'الكتروني', 'shop', 'store', 'ecommerce', 'e-commerce', 'fashion', 'perfume', 'products', 'mall'],
    direction: 'تسوق راقٍ — شبكة منتجات بمساحات تنفس وصور كبيرة',
    principles: ['P1', 'P5'],
    palettes: [
      { bg: '#faf7f2', surface: '#ffffff', brand: '#1c1c1e', brand2: '#b07d4f', text: '#1c1c1e', muted: '#7a746a', light: true },
      { bg: '#0e0e11', surface: '#17171c', brand: '#e8e6e1', brand2: '#7c5cff', text: '#f2f0eb', muted: '#9a97a3' },
    ],
    fonts: ['Cairo', 'Tajawal'],
    hero: 'منتج بطل كبير وسطيًا + عنوان تحريري ضخم + شريط فئات + CTA تسوق الآن',
    sections: ['شريط عروض متحرك', 'تسوق حسب الفئة', 'وصل حديثًا (شبكة منتجات)', 'الأكثر مبيعًا', 'عرض ترويجي (صورة خلفية + عد تنازلي)', 'آراء المشترين', 'النشرة البريدية', 'تذييل تجاري'],
    motifs: 'شارات خصم دائرية، بطاقات منتج بظل ناعم وزر سريع، تقييم نجوم',
    imagery: ['المنتج البطل', 'لقطات منتجات متعددة', 'تغليف/تفاصيل', 'عميل يستخدم المنتج'],
    motion: 'رشيقة تجارية: hover يرفع البطاقة ويُظهر زر الإضافة، سلايدر منتجات، عدّاد عرض',
  },
  agency: {
    keys: ['وكالة', 'استوديو', 'ابداع', 'إبداع', 'تصميم', 'تسويق', 'دعاية', 'اعلان', 'agency', 'studio', 'creative', 'marketing', 'branding', 'portfolio'],
    direction: 'وكالة جريئة — تشكيل مرح منضبط وألوان واثقة',
    principles: ['P4', 'P3'],
    palettes: [
      { bg: '#0b0b10', surface: '#14141c', brand: '#ff5c39', brand2: '#4d7cff', text: '#f4f2ec', muted: '#a3a0b5' },
      { bg: '#101014', surface: '#181822', brand: '#c6f24e', brand2: '#7c5cff', text: '#f5f4ec', muted: '#a8a89e' },
    ],
    fonts: ['Rubik', 'Cairo'],
    hero: 'عنوان ضخم متعدد الأسطر بحركة + أشكال عائمة + شريط عملاء + CTA مزدوج',
    sections: ['شريط عملاء متحرك', 'خدماتنا (بطاقات bento)', 'أعمال مختارة (معرض صور)', 'منهجيتنا (خطوات)', 'أرقام (عدادات)', 'آراء العملاء', 'CTA ضخم + نموذج تواصل', 'تذييل'],
    motifs: 'فواصل مائلة، بطاقات bento متفاوتة الأحجام، شارة دوّارة، مؤشر مخصص',
    imagery: ['فريق يعمل', 'مشاريع منجزة', 'مساحة الاستوديو', 'لقطات أعمال'],
    motion: 'جريئة مرحة: حركات دخول متتابعة، marquee، tilt ثلاثي الأبعاد، مغناطيسية أزرار',
  },
  saas: {
    keys: ['ستارت', 'startup', 'saas', 'تطبيق', 'منصة', 'برمج', 'تقنية', 'ذكاء', 'ai', 'app', 'platform', 'software', 'dashboard', 'لوحة تحكم'],
    direction: 'تقنية مستقبلية — لوحة تحكم مضيئة وسط قسم البطل',
    principles: ['P3', 'P5'],
    palettes: [
      { bg: '#060913', surface: '#0c1322', brand: '#22d3ee', brand2: '#7c5cff', text: '#eef4ff', muted: '#93a0b8' },
      { bg: '#0a0f1e', surface: '#111a30', brand: '#34d399', brand2: '#38bdf8', text: '#f0fdf6', muted: '#8fa3bf' },
    ],
    fonts: ['Tajawal', 'Inter'],
    hero: 'عنوان مركزي + وصف + CTA مزدوج + لقطة لوحة تحكم عائمة بتوهج + شريط تقنيات',
    sections: ['شريط شعارات متحرك', 'المميزات (شبكة أيقونات)', 'لقطة المنتج (bento)', 'كيف يعمل (3 خطوات)', 'إحصاءات (عدادات)', 'الأسعار (3 خطط)', 'الأسئلة الشائعة (أكورديون)', 'CTA نهائي + تذييل'],
    motifs: 'شبكة نقاط/خطوط خلفية، بطاقات زجاجية متوهجة، شارة نسخة جديدة',
    imagery: ['واجهة لوحة التحكم', 'فريق تقني', 'رسوم بيانية', 'أجهزة تعرض المنتج'],
    motion: 'تقنية ناعمة: توهج نابض، parallax طبقي، reveal متدرج، عدادات، أكورديون سلس',
  },
  clinic: {
    keys: ['عيادة', 'مستشفى', 'طبيب', 'اسنان', 'صحة', 'علاج', 'clinic', 'hospital', 'doctor', 'dental', 'health', 'medical', 'pharmacy', 'صيدلية'],
    direction: 'طمأنينة طبية — نظيف، فاتح، ومساحات تنفس واسعة',
    principles: ['P5', 'P1'],
    palettes: [
      { bg: '#f4fafb', surface: '#ffffff', brand: '#0e7c86', brand2: '#36b5a8', text: '#123038', muted: '#5f7a80', light: true },
      { bg: '#f7f9fd', surface: '#ffffff', brand: '#2563eb', brand2: '#38bdf8', text: '#16233a', muted: '#64748b', light: true },
    ],
    fonts: ['Tajawal', 'Cairo'],
    hero: 'طبيب/عيادة بصورة دافئة + عنوان مطمئن + زر حجز موعد بارز + شريط ثقة (سنوات خبرة/مرضى)',
    sections: ['شريط خدمات سريع', 'تخصصاتنا (بطاقات)', 'لماذا نحن (صورة + مزايا)', 'الفريق الطبي', 'آراء المرضى', 'احجز موعدك (نموذج)', 'الأسئلة الشائعة', 'تواصل + تذييل'],
    motifs: 'أيقونات طبية ناعمة، بطاقات بيضاء بظل خفيف، شارة طوارئ',
    imagery: ['الطبيب مع مريض', 'أجهزة حديثة', 'استقبال العيادة', 'فريق التمريض'],
    motion: 'هادئة مطمئنة: ظهور ناعم، عدادات ثقة، سلايدر آراء بطيء',
  },
  realestate: {
    keys: ['عقار', 'عقارات', 'فيلا', 'شقة', 'سكن', 'real estate', 'realestate', 'villa', 'apartment', 'property', 'housing'],
    direction: 'فخامة عقارية — صور واسعة وطباعة تحريرية راقية',
    principles: ['P1', 'P2'],
    palettes: [
      { bg: '#0f0e0c', surface: '#1a1815', brand: '#c9a15a', brand2: '#5a6b5d', text: '#f3ede0', muted: '#a89e88' },
      { bg: '#faf8f3', surface: '#ffffff', brand: '#1f2a37', brand2: '#b08d4f', text: '#1f2a37', muted: '#7c8494', light: true },
    ],
    fonts: ['Aref Ruqaa', 'Tajawal'],
    hero: 'صورة عقار بملء الشاشة + عنوان تحريري + شريط بحث (نوع/مدينة/سعر) + إحصاءات',
    sections: ['بحث العقارات', 'عقارات مميزة (بطاقات صور)', 'الأحياء (شبكة صور)', 'لماذا نحن', 'حاسبة تمويل مبسطة', 'آراء العملاء', 'تواصل + تذييل'],
    motifs: 'إطارات ذهبية رفيعة، بطاقات عقار بصور كبيرة وشارات سعر',
    imagery: ['فيلا خارجية', 'تصميم داخلي', 'إطلالة جوية للحي', 'تفاصيل فاخرة'],
    motion: 'راقية بطيئة: parallax صور، reveal فاخر، عدادات أسعار',
  },
  education: {
    keys: ['مدرسة', 'تعليم', 'دورة', 'كورس', 'تدريب', 'جامعة', 'اكاديمية', 'school', 'course', 'academy', 'learn', 'training', 'تعلم'],
    direction: 'تعلّم مبهج منضبط — ألوان واثقة وبطاقات دروس واضحة',
    principles: ['P4', 'P5'],
    palettes: [
      { bg: '#0e1420', surface: '#162033', brand: '#f5b83d', brand2: '#4d7cff', text: '#f6f3ea', muted: '#a7adbd' },
      { bg: '#fbf8f1', surface: '#ffffff', brand: '#e2572b', brand2: '#1f6feb', text: '#23201a', muted: '#7a7264', light: true },
    ],
    fonts: ['Cairo', 'Tajawal'],
    hero: 'طالب يتعلم بصورة + عنوان محفز + إحصاءات (طالب/دورة) + CTA ابدأ مجانًا',
    sections: ['شريط إحصاءات', 'الدورات (بطاقات بمستوى ومدة)', 'مسارات التعلم', 'لماذا نحن', 'آراء الخريجين', 'الأسعار/الباقات', 'الأسئلة الشائعة', 'CTA + تذييل'],
    motifs: 'شارات مستوى ملونة، بطاقات دورة بتقدم مرئي، أيقونات مرحة',
    imagery: ['طلاب يتعلمون', 'فصل دراسي', 'شهادات/نجاح', 'معلم يشرح'],
    motion: 'محفزة مرحة: تقدم متحرك، عدادات، reveal متتابع، hover نابض',
  },
  fitness: {
    keys: ['نادي', 'رياضة', 'لياقة', 'جيم', 'gym', 'fitness', 'sport', 'ملاكمة', 'كمال اجسام'],
    direction: 'طاقة صاخبة — داكن + لون ناري واحد وطباعة ضخمة مائلة',
    principles: ['P2', 'P4'],
    palettes: [
      { bg: '#0c0c0e', surface: '#151518', brand: '#ff3d2e', brand2: '#ffb02e', text: '#f5f3ee', muted: '#a09ca8' },
      { bg: '#0a0f0d', surface: '#121815', brand: '#b8f53d', brand2: '#22d3ee', text: '#f2f7ec', muted: '#93a08e' },
    ],
    fonts: ['Cairo', 'Rubik'],
    hero: 'رياضي بصورة درامية + عنوان ضخم مائل + CTA اشترك الآن + شريط (24/7 • مدربون)',
    sections: ['شريط متحرك صاخب', 'البرامج (بطاقات صور)', 'المدربون', 'الباقات والأسعار', 'تحولات/آراء', 'احجز حصة تجريبية', 'تذييل'],
    motifs: 'خطوط مائلة، عناوين ضخمة بخط عريض، شارات نارية',
    imagery: ['تدريب قاسٍ', 'معدات النادي', 'مدرب', 'أجواء النادي'],
    motion: 'صاخبة سريعة: marquee سريع، reveal حاد، عدادات، hover متوهج',
  },
  travel: {
    keys: ['سفر', 'سياحة', 'فندق', 'رحلات', 'طيران', 'travel', 'hotel', 'tourism', 'flights', 'رحلة'],
    direction: 'شوق الاستكشاف — صور وجهات بملء الشاشة وطباعة حالمة',
    principles: ['P1', 'P3'],
    palettes: [
      { bg: '#08131c', surface: '#0f2233', brand: '#3ec6e8', brand2: '#f5b83d', text: '#f2f7fa', muted: '#93a9bb' },
      { bg: '#fdf9f2', surface: '#ffffff', brand: '#0e7c86', brand2: '#e8a33d', text: '#20313a', muted: '#71808a', light: true },
    ],
    fonts: ['Aref Ruqaa', 'Tajawal'],
    hero: 'وجهة بملء الشاشة + عنوان حالم + شريط بحث رحلات (وجهة/تاريخ/مسافرون)',
    sections: ['بحث الرحلات', 'وجهات رائجة (بطاقات صور)', 'عروض مميزة', 'لماذا تحجز معنا', 'آراء المسافرين', 'النشرة + تذييل'],
    motifs: 'بطاقات وجهات بصور غامرة، شارات أسعار، خريطة زخرفية',
    imagery: ['وجهة سياحية', 'فندق/منتجع', 'طائرة/مطار', 'مسافرون سعداء'],
    motion: 'حالمة انسيابية: parallax صور، reveal ناعم، سلايدر وجهات',
  },
  law: {
    keys: ['محامي', 'محاماة', 'قانون', 'مكتب', 'استشارات قانونية', 'law', 'lawyer', 'legal', 'attorney'],
    direction: 'هيبة قانونية — كحلي عميق + ذهبي + طباعة رصينة',
    principles: ['P1', 'P5'],
    palettes: [
      { bg: '#0d1526', surface: '#141f38', brand: '#c9a15a', brand2: '#4d7cff', text: '#f2eee2', muted: '#9aa3bd' },
    ],
    fonts: ['Aref Ruqaa', 'Tajawal'],
    hero: 'عنوان رصين + مجالات الممارسة + CTA استشارة + شريط (سنوات/قضايا)',
    sections: ['مجالات الممارسة (بطاقات)', 'لماذا نحن', 'الفريق', 'نتائج/أرقام', 'آراء العملاء', 'احجز استشارة', 'تذييل'],
    motifs: 'أعمدة/ميزان زخرفي، إطارات رفيعة، بطاقات رصينة',
    imagery: ['مكتب محاماة', 'قاعة محكمة', 'مستندات/توقيع', 'فريق العمل'],
    motion: 'رصينة بطيئة: ظهور متدرج، عدادات هيبة',
  },
}

const GENERIC = {
  keys: [],
  direction: 'حديث متوازن — يتشكل حسب جوهر الطلب',
  principles: ['P5', 'P1'],
  palettes: [
    { bg: '#0b0f16', surface: '#121a28', brand: '#22d3ee', brand2: '#7c5cff', text: '#eef2f8', muted: '#93a0b8' },
    { bg: '#faf9f6', surface: '#ffffff', brand: '#1f6feb', brand2: '#e8a33d', text: '#1d2430', muted: '#6b7686', light: true },
  ],
  fonts: ['Tajawal', 'Cairo'],
  hero: 'عنوان واضح + وصف + CTA مزدوج + عنصر بصري (صورة/لوحة)',
  sections: ['المميزات', 'من نحن', 'الخدمات/الأعمال', 'آراء', 'تواصل', 'تذييل'],
  motifs: 'بطاقات نظيفة، توهج خفيف، تباين مضبوط',
  imagery: ['صورة تعبر عن الموضوع', 'فريق/مكان العمل', 'تفاصيل'],
  motion: 'ناعمة متوازنة: reveal، hover، عداد واحد على الأقل',
}

/** كشف الصناعة من الطلب (عربي+إنجليزي) */
export function detectIndustry(request) {
  const m = ' ' + normAr(request) + ' '
  let best = null
  let bestHits = 0
  for (const [id, ind] of Object.entries(INDUSTRIES)) {
    let hits = 0
    for (const k of ind.keys) {
      const nk = normAr(k)
      if (nk && m.includes(nk)) hits += nk.length > 4 ? 2 : 1
    }
    if (hits > bestHits) { bestHits = hits; best = id }
  }
  return bestHits > 0 ? best : 'generic'
}

/**
 * يؤلف نظام تصميم أصليًا: يختار لوحة (بتدوير حسب الطلب حتى لا تتشابه المواقع)
 * ويبني كتلة مواصفات للمبرمج + قاعدة الجودة.
 */
export function composeDesignSystem(request) {
  const industry = detectIndustry(request)
  const ind = industry === 'generic' ? GENERIC : INDUSTRIES[industry]
  const palette = ind.palettes[hashStr(request) % ind.palettes.length]
  const dark = !palette.light
  return {
    industry,
    direction: ind.direction,
    palette,
    dark,
    fonts: ind.fonts,
    principles: ind.principles,
    hero: ind.hero,
    sections: ind.sections,
    motifs: ind.motifs,
    imagery: ind.imagery,
    motion: ind.motion,
    promptBlock: `
DESIGN SYSTEM — نظام تصميم أصلي مولّد لهذا المشروع (التزم به بدقة، ولا تنسخ أي موقع آخر):
- الصناعة: ${industry} — الاتجاه: ${ind.direction}
- اللوحة (استعمل هذه القيم حرفيًا): خلفية ${palette.bg} • سطح ${palette.surface} • أساسي ${palette.brand} • ثانوي ${palette.brand2} • نص ${palette.text} • خافت ${palette.muted}
- الخطوط: ${ind.fonts.join(' + ')} من Google Fonts (عرض + متن).
- الهيرو: ${ind.hero}
- الأقسام بالترتيب: ${ind.sections.join(' ← ')}.
- الزخارف: ${ind.motifs}
- الصور (Unsplash موضوعية + fallback متدرج): ${ind.imagery.join('، ')}.
- الحركة: ${ind.motion}
- الأصلية: صمم هوية لا تشبه أي قالب — توقيع واحد لا يُنسى (فاصل مميز/شارة دوارة/بطاقة متوهجة/مؤشر مخصص).
- الممنوع: خلفية بيضاء فارغة + عنوان وفقرة وثلاث بطاقات وتذييل — هذا مرفوض ويُعاد بناؤه.`.trim(),
  }
}

/**
 * كشف "القالب العام" المرفوض: خلفية فاتحة مسطحة + محتوى هزيل + أقسام قليلة.
 * يُستعمل داخل designQualityCheck كبوابة صارمة.
 */
export function genericTemplateFlags(html, css) {
  const flags = []
  const h = String(html || '')
  const c = String(css || '')
  const sections = (h.match(/<section[\s>]/gi) || []).length
  const hasGradient = /(linear-gradient|radial-gradient|conic-gradient)/i.test(c)
  const hasPhoto = /(images\.unsplash\.com|picsum\.photos|i\.pravatar\.cc|<img[\s>])/i.test(h)
  const hasMotion = /(@keyframes|animation\s*:|transition\s*:|hover\b)/i.test(c)
  const flatWhite = /background\s*:\s*(#fff(fff)?|white)\b/i.test(c) || (/body\s*\{[^}]*\}/i.test(c) && !hasGradient && !/background/i.test(c))
  if (sections <= 3 && !hasPhoto && !hasGradient) {
    flags.push({ label: 'قالب عام مرفوض: أقسام قليلة بلا صور ولا تدرجات — أعد البناء بهوية كاملة (هيرو غامر + صور + تدرجات + 6 أقسام على الأقل)', code: 'generic-template' })
  } else {
    if (flatWhite && !hasGradient && !hasPhoto) flags.push({ label: 'خلفية مسطحة فارغة — ابنِ خلفية طبقية (تدرج/صورة/زخرفة)', code: 'flat-bg' })
    if (sections <= 3 && (hasPhoto || hasGradient)) flags.push({ label: 'بنية ناقصة: وسّع إلى 6 أقسام على الأقل حسب مخطط الصناعة', code: 'thin-structure' })
    if (!hasMotion && h.length > 3000) flags.push({ label: 'صفحة ساكنة تمامًا — أضف حركة (reveal/hover/عدادات)', code: 'static-page' })
  }
  return flags
}
