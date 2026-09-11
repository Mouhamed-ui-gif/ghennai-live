export type AgentId = 'Core' | 'Coding' | 'Research' | 'Study' | 'Design' | 'Genie' | 'Voice'

export interface AgentWorld {
  ambience: [string, string, string]
  glow: string
  symbol: string
  symbols: string[]
  particle: string[]
  grid: string
  images: string[]
  taglineAr: string
  taglineEn: string
}

export interface AgentDef {
  id: AgentId
  color: string
  ring: string
  grad: string
  fg: string
  icon: 'brain' | 'code' | 'globe' | 'book' | 'palette' | 'gem' | 'mic'
  world: AgentWorld
  mottoAr: string
  mottoEn: string
  skillsAr: string[]
  skillsEn: string[]
  partner: AgentId
}

export const AGENTS: AgentDef[] = [
  {
    id: 'Core',
    color: '#22d3ee',
    ring: 'ring-cyan-400',
    grad: 'from-cyan-500 to-sky-500',
    fg: 'text-cyan-400',
    icon: 'brain',
    mottoAr: 'أُنسّق كل شيء وأنفّذ',
    mottoEn: 'I orchestrate everything',
    skillsAr: ['توجيه المهام', 'التخطيط الذكي', 'ربط الوكلاء', 'المراجعة والتقييم', 'الردود العامة'],
    skillsEn: ['Task routing', 'Smart planning', 'Agent orchestration', 'Review & grading', 'General chat'],
    partner: 'Research',
    world: {
      ambience: ['rgba(8,51,68,.85)', 'rgba(34,211,238,.28)', 'rgba(2,6,23,.9)'],
      glow: 'rgba(34,211,238,.35)',
      symbol: '🧠',
      symbols: ['🧠', '⚡', '∞', '⌁'],
      particle: ['#22d3ee', '#38bdf8', '#a5f3fc'],
      grid: 'rgba(34,211,238,.28)',
      images: [
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=70',
      ],
      taglineAr: 'موجّه كل شيء — عقلك المشترك',
      taglineEn: 'The universal mind',
    },
  },
  {
    id: 'Coding',
    color: '#a78bfa',
    ring: 'ring-violet-400',
    grad: 'from-violet-500 to-purple-500',
    fg: 'text-violet-400',
    icon: 'code',
    mottoAr: 'أبني وينفّذ في مساحة عملك',
    mottoEn: 'I build & run in your workspace',
    skillsAr: ['بناء المواقع', 'HTML/CSS/JS', 'تطبيقات الويب', 'إصلاح الأخطاء', 'تحويل الصور لمواقع'],
    skillsEn: ['Website building', 'HTML/CSS/JS', 'Web apps', 'Debugging', 'Image → site'],
    partner: 'Design',
    world: {
      ambience: ['rgba(46,16,101,.9)', 'rgba(139,92,246,.3)', 'rgba(2,6,23,.92)'],
      glow: 'rgba(167,139,250,.4)',
      symbol: '⌨️',
      symbols: ['{ }', '</>', '⌘', 'λ', '✓'],
      particle: ['#a78bfa', '#c4b5fd', '#8b5cf6'],
      grid: 'rgba(139,92,246,.32)',
      images: [
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1600&q=70',
      ],
      taglineAr: 'عالم الكود والبناء',
      taglineEn: 'The code dimension',
    },
  },
  {
    id: 'Research',
    color: '#fbbf24',
    ring: 'ring-amber-400',
    grad: 'from-amber-500 to-orange-500',
    fg: 'text-amber-400',
    icon: 'globe',
    mottoAr: 'أبحث وأحقّق قبل أن أجيب',
    mottoEn: 'I verify before I answer',
    skillsAr: ['البحث على الويب', 'جلب صفحات', 'الأخبار والطقس', 'البحث في الذاكرة', 'ملخصات موثقة'],
    skillsEn: ['Web search', 'Page fetching', 'News & weather', 'Memory search', 'Cited summaries'],
    partner: 'Study',
    world: {
      ambience: ['rgba(120,53,15,.85)', 'rgba(251,191,36,.26)', 'rgba(2,6,23,.9)'],
      glow: 'rgba(251,191,36,.35)',
      symbol: '🌍',
      symbols: ['🌍', '🔍', '📡', '★'],
      particle: ['#fbbf24', '#fcd34d', '#f97316'],
      grid: 'rgba(251,191,36,.3)',
      images: [
        'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1547235001-d703406d3f17?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1600&q=70',
      ],
      taglineAr: 'عالم البحث والمعلومات',
      taglineEn: 'The discovery world',
    },
  },
  {
    id: 'Study',
    color: '#34d399',
    ring: 'ring-emerald-400',
    grad: 'from-emerald-500 to-teal-500',
    fg: 'text-emerald-400',
    icon: 'book',
    mottoAr: 'أشرح خطوة بخطوة حتى تفهم',
    mottoEn: 'I teach step by step',
    skillsAr: ['تلقين المفاهيم', 'أسئلة وامتحانات', 'خطط دراسة', 'أمثلة وتشبيهات', 'ملخصات'],
    skillsEn: ['Concept teaching', 'Quizzes & tests', 'Study plans', 'Examples & analogies', 'Summaries'],
    partner: 'Research',
    world: {
      ambience: ['rgba(6,78,59,.85)', 'rgba(52,211,153,.28)', 'rgba(2,6,23,.9)'],
    glow: 'rgba(52,211,153,.35)',
      symbol: '📚',
      symbols: ['📚', '📖', '✏️', '🧪'],
      particle: ['#34d399', '#6ee7b7', '#2dd4bf'],
      grid: 'rgba(52,211,153,.3)',
      images: [
        'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=70',
      ],
      taglineAr: 'عالم التعلم والفهم',
      taglineEn: 'The learning realm',
    },
  },
  {
    id: 'Design',
    color: '#fb7185',
    ring: 'ring-rose-400',
    grad: 'from-rose-500 to-pink-500',
    fg: 'text-rose-400',
    icon: 'palette',
    mottoAr: 'أحوّل كل فكرة إلى جمال',
    mottoEn: 'I turn ideas into beauty',
    skillsAr: ['لوحات ألوان', 'تخطيط الواجهات', 'كتابة الطباعة (Typography)', 'شعارات وهوية', 'أفكار إبداعية'],
    skillsEn: ['Color palettes', 'Wireframes', 'Typography', 'Logos & identity', 'Creative directions'],
    partner: 'Coding',
    world: {
      ambience: ['rgba(136,19,55,.85)', 'rgba(244,63,94,.3)', 'rgba(2,6,23,.92)'],
      glow: 'rgba(244,63,94,.38)',
      symbol: '🎨',
      symbols: ['🎨', '🖌️', '✦', '◐'],
      particle: ['#fb7185', '#f472b6', '#e879f9'],
      grid: 'rgba(244,63,94,.3)',
      images: [
        'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=70',
        'https://images.unsplash.com/photo-1502791451862-7bd8c1df43a7?auto=format&fit=crop&w=1600&q=70',
      ],
      taglineAr: 'عالم الجمال والتصميم',
      taglineEn: 'The artistic universe',
    },
  },
{
      id: 'Genie',
      color: '#f472b6',
      ring: 'ring-pink-400',
      grad: 'from-indigo-500 via-violet-500 to-pink-500',
      fg: 'text-pink-400',
      icon: 'gem',
      mottoAr: 'أحقّق كل أمنية، وأجيب كل سؤال',
      mottoEn: 'I fulfill every wish',
      skillsAr: ['أي سؤال في الكون', 'بناء وتنفيذ فوري', 'بحث وتحليل عميق', 'نظم ذكية وأتمتة', 'تصميم ونشر مواقع'],
      skillsEn: ['Any question', 'Instant build & run', 'Deep research', 'Smart systems & automation', 'Design & deploy'],
      partner: 'Core',
      world: {
        ambience: ['rgba(59,7,100,.92)', 'rgba(217,70,239,.34)', 'rgba(2,6,23,.95)'],
        glow: 'rgba(232,121,249,.45)',
        symbol: '🧞',
        symbols: ['🧞', '✨', '🪄', '➤', '∞', '🔮', '⚡', '★'],
        particle: ['#f472b6', '#c084fc', '#f0abfc', '#818cf8'],
        grid: 'rgba(196,181,253,.34)',
        images: [
          'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?auto=format&fit=crop&w=1600&q=70',
          'https://images.unsplash.com/photo-1475113548554-5a36f1f523d6?auto=format&fit=crop&w=1600&q=70',
          'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?auto=format&fit=crop&w=1600&q=70',
        ],
        taglineAr: 'عالم الجني — نفّذ ما تشاء',
        taglineEn: 'The genie realm',
      },
    },
    {
      id: 'Voice',
      color: '#38bdf8',
      ring: 'ring-sky-400',
      grad: 'from-sky-500 to-blue-500',
      fg: 'text-sky-400',
      icon: 'mic',
      mottoAr: 'أسمعك وأردّ عليك بصوتك',
      mottoEn: 'I listen, then speak to you',
      skillsAr: ['أوامر صوتية فورية', 'قراءة الردود بصوت', 'نبرة مميزة لكل وكيل', 'محادثة حية بالاستماع', 'عربي وإنجليزي'],
      skillsEn: ['Instant voice commands', 'Read replies aloud', 'Unique tone per agent', 'Live hands-free chat', 'Arabic & English'],
      partner: 'Core',
      world: {
        ambience: ['rgba(8,47,73,.9)', 'rgba(56,189,248,.32)', 'rgba(2,6,23,.94)'],
        glow: 'rgba(56,189,248,.42)',
        symbol: '🎙️',
        symbols: ['🎙️', '♪', '♫', '≈', '📣', '🔊'],
        particle: ['#38bdf8', '#7dd3fc', '#60a5fa', '#a5f3fc'],
        grid: 'rgba(56,189,248,.32)',
        images: [
          'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?auto=format&fit=crop&w=1600&q=70',
          'https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=1600&q=70',
          'https://images.unsplash.com/photo-1439405326854-014607f694d7?auto=format&fit=crop&w=1600&q=70',
        ],
        taglineAr: 'عالم الصوت — تحدّث وأنفّذ',
        taglineEn: 'The voice dimension',
      },
    },
  ]

export const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>
export const AGENT_KEYS = AGENTS.map((a) => a.id) as AgentId[]