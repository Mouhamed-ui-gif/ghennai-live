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
 * طبقة الدلالة: تستخرج الجمهور والهدف والمزاج من الطلب (فوق keyword الصناعة).
 * الـpresets تبقى fallback — التحليل الدلالي هو الحكم.
 */
const AUDIENCES = [
  { id: 'youth', keys: ['شباب', 'شبابيه', 'عصري للشباب', 'young', 'youth', 'teens', 'طلاب', 'students'] },
  { id: 'families', keys: ['عائلات', 'عائلي', 'family', 'families'] },
  { id: 'business', keys: ['شركات', 'اعمال', 'أعمال', 'b2b', 'business', 'corporate', 'مؤسسات'] },
  { id: 'premium', keys: ['فاخر', 'راقي', 'نخبة', 'vip', 'luxury', 'premium', 'elite'] },
  { id: 'local', keys: ['حي', 'مدينة', 'محلي', 'local', 'قريب'] },
]
const GOALS = [
  { id: 'sell', keys: ['بيع', 'متجر', 'شراء', 'اطلب', 'sell', 'shop', 'buy', 'order', 'store', 'whatsapp'] },
  { id: 'book', keys: ['حجز', 'احجز', 'موعد', 'book', 'booking', 'appointment', 'reservation', 'reserve'] },
  { id: 'leads', keys: ['تواصل', 'استشارة', 'اتصل', 'contact', 'leads', 'quote', 'عرض سعر'] },
  { id: 'inform', keys: ['تعريفي', 'من نحن', 'معلومات', 'about', 'info', 'portfolio', 'اعمالنا', 'أعمالنا'] },
  { id: 'teach', keys: ['تعليم', 'دورة', 'كورس', 'learn', 'course', 'academy', 'تدريب'] },
]
const MOODS = [
  { id: 'luxury', keys: ['فاخر', 'راقي', 'ذهبي', 'اسود وذهبي', 'أسود وذهبي', 'luxury', 'premium', 'elegant', 'gold'] },
  { id: 'playful', keys: ['مرح', 'ملون', 'مبهج', 'playful', 'fun', 'colorful', 'حيوي'] },
  { id: 'calm', keys: ['هادئ', 'مطمئن', 'بسيط', 'calm', 'minimal', 'clean', 'نظيف'] },
  { id: 'bold', keys: ['جريء', 'صاخب', 'قوي', 'bold', 'dark', 'داكن', 'نيون', 'neon', 'futuristic', 'مستقبلي'] },
  { id: 'trust', keys: ['موثوق', 'طبي', 'رسمي', 'trust', 'professional', 'رصين'] },
]

function scoreKeys(request, list) {
  const m = ' ' + normAr(request) + ' '
  let best = null
  let bestHits = 0
  for (const item of list) {
    let hits = 0
    for (const k of item.keys) { if (m.includes(normAr(k))) hits += normAr(k).length > 4 ? 2 : 1 }
    if (hits > bestHits) { bestHits = hits; best = item.id }
  }
  return bestHits > 0 ? best : null
}

/** مستويات الحركة والمؤثرات المسموحة لكل صناعة — نهاية "EPIC MODE لكل شيء" */
const MOTION_PROFILE = {
  restaurant: { level: 'balanced', allow: ['reveal', 'hover', 'counters', 'slider', 'marquee', 'preloader'], forbid: ['neonGlow', 'customCursor'] },
  store: { level: 'balanced', allow: ['reveal', 'hover', 'slider', 'countdown', 'marquee'], forbid: ['neonGlow', 'customCursor', 'tilt3d'] },
  agency: { level: 'rich', allow: ['reveal', 'hover', 'marquee', 'tilt3d', 'magnetic', 'preloader', 'counters', 'slider', 'accordion'], forbid: [] },
  saas: { level: 'rich', allow: ['reveal', 'hover', 'parallax', 'counters', 'accordion', 'glowPulse', 'preloader'], forbid: ['neonGlow', 'customCursor'] },
  clinic: { level: 'restrained', allow: ['reveal', 'hover', 'counters', 'slider'], forbid: ['neonGlow', 'tilt3d', 'marquee', 'customCursor', 'glass', 'parallax'] },
  realestate: { level: 'balanced', allow: ['reveal', 'hover', 'parallax', 'counters', 'slider'], forbid: ['neonGlow', 'marquee', 'customCursor'] },
  education: { level: 'balanced', allow: ['reveal', 'hover', 'counters', 'progress', 'accordion'], forbid: ['neonGlow', 'customCursor'] },
  fitness: { level: 'rich', allow: ['reveal', 'hover', 'marquee', 'counters', 'glowPulse'], forbid: ['customCursor'] },
  travel: { level: 'balanced', allow: ['reveal', 'hover', 'parallax', 'slider'], forbid: ['neonGlow', 'marquee', 'customCursor'] },
  law: { level: 'restrained', allow: ['reveal', 'hover', 'counters'], forbid: ['neonGlow', 'tilt3d', 'marquee', 'customCursor', 'glass', 'parallax', 'preloader'] },
  generic: { level: 'balanced', allow: ['reveal', 'hover', 'counters', 'accordion'], forbid: ['neonGlow', 'customCursor'] },
}

const MOTION_WORDS = {
  restrained: 'مقيّدة هادئة: ظهور متدرج ناعم + hover خفيف + عداد ثقة واحد — بلا بهرجة',
  balanced: 'متوازنة: reveal متدرج + hover + عنصران حيّان فقط مما يخدم الهدف',
  rich: 'غنية سلسة: reveal متتابع + parallax/tilt + marquee + عدادات — كلها GPU (transform/opacity)',
}

/** صفحات ومزايا كل صناعة (للبـlueprint والفحص الوظيفي) */
const INDUSTRY_BLUEPRINT = {
  restaurant: { pages: ['/', '/menu', '/reserve', '/about', '/contact'], features: ['menu-list', 'dish-cards', 'reservation-form', 'location-hours', 'testimonials', 'contact'], goal: 'reserve' },
  store: { pages: ['/', '/shop', '/product', '/about', '/contact'], features: ['product-grid', 'product-detail', 'category-filter', 'search', 'whatsapp-order', 'testimonials', 'faq'], goal: 'sell' },
  agency: { pages: ['/', '/work', '/services', '/about', '/contact'], features: ['services-grid', 'portfolio-gallery', 'process-steps', 'stats', 'testimonials', 'contact-form'], goal: 'leads' },
  saas: { pages: ['/', '/features', '/pricing', '/about', '/contact'], features: ['feature-grid', 'product-shot', 'how-it-works', 'stats', 'pricing', 'faq', 'cta'], goal: 'leads' },
  clinic: { pages: ['/', '/services', '/doctors', '/booking', '/contact'], features: ['specialties', 'doctors', 'booking-form', 'testimonials', 'faq', 'emergency-bar'], goal: 'book' },
  realestate: { pages: ['/', '/listings', '/neighborhoods', '/about', '/contact'], features: ['property-grid', 'property-cards', 'search-filter', 'stats', 'testimonials', 'contact-form'], goal: 'leads' },
  education: { pages: ['/', '/courses', '/paths', '/about', '/contact'], features: ['course-grid', 'learning-paths', 'stats', 'testimonials', 'pricing', 'faq'], goal: 'teach' },
  fitness: { pages: ['/', '/programs', '/trainers', '/pricing', '/contact'], features: ['program-cards', 'trainers', 'pricing', 'testimonials', 'trial-booking'], goal: 'book' },
  travel: { pages: ['/', '/destinations', '/offers', '/about', '/contact'], features: ['destination-grid', 'offers', 'search-bar', 'testimonials', 'newsletter'], goal: 'book' },
  law: { pages: ['/', '/practice', '/team', '/about', '/contact'], features: ['practice-areas', 'team', 'stats', 'testimonials', 'consult-form'], goal: 'leads' },
  generic: { pages: ['/', '/about', '/contact'], features: ['features', 'about', 'testimonials', 'contact-form'], goal: 'inform' },
}

/** كاشف التعقيد: SIMPLE/MEDIUM/COMPLEX/APPLICATION */
export function detectComplexity(request) {
  const m = normAr(' ' + request + ' ')
  const appKeys = ['لوحة تحكم', 'dashboard', 'تطبيق', 'app', 'حسابات', 'auth', 'تسجيل دخول', 'login', 'سلة', 'cart', 'دفع', 'payment', 'api', 'قاعدة بيانات', 'database', 'react', 'vue']
  const multiKeys = ['صفحات', 'متعدد الصفحات', 'pages', 'multi-page', 'اقسام كثيرة', 'متجر', 'shop', 'store', 'ecommerce', 'دورات', 'courses', 'عقارات', 'listings']
  const hasApp = appKeys.some((k) => m.includes(normAr(k)))
  const hasMulti = multiKeys.some((k) => m.includes(normAr(k)))
  if (hasApp) return 'APPLICATION'
  if (hasMulti) return 'MEDIUM'
  return 'SIMPLE'
}

/** مؤلف الـBlueprint: من طلب خام إلى مخطط منظم */
export function composeBlueprint(request) {
  const industry = detectIndustry(request)
  const bp = INDUSTRY_BLUEPRINT[industry] || INDUSTRY_BLUEPRINT.generic
  const audience = scoreKeys(request, AUDIENCES) || 'general'
  const goal = scoreKeys(request, GOALS) || bp.goal
  const mood = scoreKeys(request, MOODS) || null
  const complexity = detectComplexity(request)
  const ar = /[\u0600-\u06FF]/.test(String(request || ''))
  const features = [...bp.features]
  if (/whatsapp|واتس/.test(normAr(request)) && !features.includes('whatsapp-order')) features.push('whatsapp-order')
  if (/faq|الاسئلة|الأسئلة/.test(normAr(request)) && !features.includes('faq')) features.push('faq')
  const acceptanceCriteria = [
    ...features.map((f) => ({ id: `feat:${f}`, kind: 'feature', label: `الميزة تعمل: ${f}`, critical: ['product-grid', 'menu-list', 'booking-form', 'reservation-form', 'contact-form', 'pricing'].includes(f) })),
    { id: 'resp:mobile', kind: 'responsive', label: 'لا فيض أفقي على 360px', critical: true },
    { id: 'resp:desktop', kind: 'responsive', label: 'سليم على 1440px', critical: true },
    { id: 'tech:console', kind: 'technical', label: 'صفر أخطاء console', critical: true },
    { id: 'tech:links', kind: 'technical', label: 'لا روابط ميتة', critical: true },
    { id: 'content:real', kind: 'content', label: 'محتوى حقيقي بلا lorem/placeholder', critical: false },
  ]
  return {
    projectType: industry === 'store' ? 'ecommerce' : complexity === 'SIMPLE' ? 'landing' : 'multi-page',
    industry, audience, goal, mood, complexity,
    language: ar ? 'ar' : 'en', direction: ar ? 'rtl' : 'ltr',
    pages: complexity === 'SIMPLE' ? ['/'] : bp.pages,
    features, acceptanceCriteria,
    responsivePriority: 'mobile-first',
  }
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
  const bp = composeBlueprint(request)
  const prof = MOTION_PROFILE[industry] || MOTION_PROFILE.generic
  const forbidTxt = prof.allow.length
    ? `المسموح فقط: ${prof.allow.join('، ')} — الممنوع صراحةً لهذه الصناعة: ${prof.forbid.length ? prof.forbid.join('، ') : 'لا شيء محظور'} (سؤال التكيّف: هل يحتاج التصميم هذا المؤثر؟ إن لا، اتركه).`
    : ''
  return {
    industry,
    blueprint: bp,
    motionProfile: prof,
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
- الصناعة: ${industry} (جمهور: ${bp.audience} • هدف: ${bp.goal} • مزاج: ${bp.mood || 'تلقائي'} • تعقيد: ${bp.complexity} • ${bp.language === 'ar' ? 'عربي RTL' : 'إنجليزي LTR'})
- اللوحة (استعمل هذه القيم حرفيًا): خلفية ${palette.bg} • سطح ${palette.surface} • أساسي ${palette.brand} • ثانوي ${palette.brand2} • نص ${palette.text} • خافت ${palette.muted}
- الخطوط: ${ind.fonts.join(' + ')} من Google Fonts (عرض + متن).
- نظام التباعد والحواف: حاوية max-width 1200px • مسافة أقسام 72-96px • بطاقات radius 16-20px • ظلال ناعمة طبقية • أزرار radius كامل/12px بحالة hover واضحة • تنقل sticky زجاجي.
- الهيرو: ${ind.hero}
- الأقسام بالترتيب (${bp.pages.length > 1 ? 'صفحات: ' + bp.pages.join('، ') : 'صفحة واحدة'}): ${ind.sections.join(' ← ')}.
- الزخارف: ${ind.motifs}
- الصور (استراتيجية الأصول): أولوية لصور المستخدم إن وُجدت، ثم Unsplash موضوعية (${ind.imagery.join('، ')}) مع fallback متدرج لكل صورة — كل صورة تخدم قسمها، ممنوع صور زخرفية عشوائية.
- الحركة (${prof.level}): ${MOTION_WORDS[prof.level]}
${forbidTxt ? '- ' + forbidTxt : ''}
- المحتوى: حقيقي ومنطقي (أسماء/أسعار/أوصاف واقعية) — ممنوع lorem ipsum و"Test Product" و"Welcome to our website" إلا بطلب صريح.
- إتاحة الوصول: HTML دلالي + alt لكل صورة + تباين نص واضح + focus مرئي + احترام prefers-reduced-motion.
- الأصلية: هوية لا تشبه أي قالب — توقيع واحد لا يُنسى.
- الممنوع: خلفية فارغة + عنوان وفقرة وثلاث بطاقات وتذييل — مرفوض ويُعاد بناؤه.`.trim(),
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

/**
 * مكتبة المكونات (§6): بدائل قابلة للتجميع — ليست قالبًا واحدًا.
 * كل مكون: بنية + عناصر إلزامية + محاور تخصيص. تُحقن حسب مزايا الـBlueprint فقط.
 */
const COMPONENTS = {
  navbar: 'NAVBAR: شعار + روابط + CTA + جوال(هامبرغر يعمل) | خصص: زجاجي/صلب، شفاف فوق الهيرو',
  hero: 'HERO: شارة + عنوان ضخم + وصف + CTA مزدوج + عنصر بصري (صورة/لوحة) + صف ثقة | خصص: مركزي/منقسم/ملء-شاشة',
  feature_grid: 'FEATURE_GRID: 4-6 بطاقات (أيقونة SVG + عنوان + سطر) | خصص: شبكة/bento، hover يرفع',
  product_grid: 'PRODUCT_GRID: شبكة + بطاقة(صورة+اسم+سعر+زر) + شارة خصم | خصص: أعمدة 2-4 حسب الشاشة',
  menu_list: 'MENU_LIST: فئات + عناصر(اسم+وصف+سعر) + صور أطباق | خصص: تبويبات فئات',
  testimonials: 'TESTIMONIALS: ≥2 (صورة رمزية+اسم+نص+نجوم) | خصص: سلايدر تلقائي/شبكة',
  stats: 'STATS: 3-4 عدادات متحركة عند الظهور | خصص: شريط/شبكة',
  gallery: 'GALLERY: شبكة صور متفاوتة + lightbox بسيط | خصص: bento/سلايدر',
  pricing: 'PRICING: 3 خطط (وسطى مميزة) + أسعار + CTA | خصص: شهري/سنوي',
  faq: 'FAQ: ≥4 أسئلة أكورديون يعمل بـJS | خصص: منقسم/كامل',
  contact_form: 'CONTACT_FORM: اسم+تواصل+رسالة + تحقق + رسالة نجاح | خصص: بجانب معلومات',
  booking_form: 'BOOKING_FORM: اسم+هاتف+تاريخ/وقت + تأكيد | خصص: خطوة واحدة',
  consult_form: 'CONSULT_FORM: اسم+موضوع+وصف + تأكيد | خصص: منبثق/صفحة',
  reservation_form: 'RESERVATION_FORM: اسم+عدد+تاريخ/وقت + تأكيد | خصص: شريط سريع',
  search: 'SEARCH: حقل يرشّح العناصر حيًا بـJS | خصص: علوي/جانبي',
  category_filter: 'CATEGORY_FILTER: أزرار/قوائم ترشّح الشبكة حيًا | خصص: تبويبات/قائمة',
  whatsapp_order: 'WHATSAPP_ORDER: زر wa.me برقم + رسالة جاهزة باسم المنتج | خصص: عائم/داخل البطاقة',
  product_detail: 'PRODUCT_DETAIL: صورة كبيرة+اسم+سعر+وصف+خصائص+زر طلب | خصص: قسم/صفحة',
  cta: 'CTA: شريط ختامي (عنوان+زر) فوق صورة/تدرج | خصص: مدمج/منبثق',
  footer: 'FOOTER: أعمدة(روابط+تواصل+اجتماعي) + حقوق | خصص: غني/مدمج',
  auth: 'AUTH: نموذج دخول/تسجيل + تحقق + تخزين محلي | للتعقيد APPLICATION فقط',
  dashboard: 'DASHBOARD: شريط جانبي + بطاقات + جدول | للتعقيد APPLICATION فقط',
}

export function componentBlock(features = []) {
  const lines = []
  for (const f of features) {
    const key = String(f).toLowerCase().replace(/-/g, '_')
    if (COMPONENTS[key]) lines.push(`- ${COMPONENTS[key]}`)
  }
  if (!lines.length) return ''
  return `COMPONENTS — ابنِ كل ميزة بهذه المواصفات (قابلة للتخصيص حسب الهوية، لا تنسخ قالبًا جاهزًا):\n${lines.join('\n')}`
}
