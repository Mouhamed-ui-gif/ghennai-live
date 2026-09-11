import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Brain,
  Code2,
  Globe,
  BookOpen,
  Palette,
  Rocket,
  Eye,
  Mic,
  MemoryStick,
  Languages,
  Menu,
  X,
  Apple,
  Monitor,
  Smartphone,
  TerminalSquare,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { AGENTS } from '../config/agents'
import { useEditable, pickEditable, type EditableContent } from '../siteContent'
import { AuthModal } from '../components/auth/AuthModal'
import { Logo } from '../components/common/Logo'
import { ParticlesBg } from '../components/common/ParticlesBg'
import { UniverseBg } from '../components/common/UniverseBg'
import { TiltCard, TypingText } from '../components/common/Fx'

function Nav() {
  const { t, lang, toggle } = useI18n()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState<null | 'login' | 'signup'>(null)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const links = [
    ['#features', t('nav.features')],
    ['#agents', t('nav.agents')],
    ['#how', t('nav.how')],
    ['#download', t('nav.download')],
  ]

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? 'glass-strong shadow-lg' : 'bg-transparent'
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="shrink-0">
            <Logo size={34} />
          </a>

          <div className="hidden items-center gap-6 md:flex">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-slate-300 transition hover:text-cyan-300">
                {label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button onClick={toggle} className="chip hover:bg-white/10" title="عربي / English">
              <Languages size={13} />
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
            <button onClick={() => setOpen('login')} className="btn-ghost !px-4 !py-2 text-sm">
              {t('nav.login')}
            </button>
            <button onClick={() => setOpen('signup')} className="btn-primary !px-4 !py-2 text-sm">
              {t('nav.signup')}
            </button>
          </div>

          <button className="text-slate-200 md:hidden" onClick={() => setMenu((m) => !m)}>
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>
        {menu && (
          <div className="glass-strong flex flex-col gap-2 border-t border-white/5 px-6 py-4 md:hidden">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="py-1.5 text-slate-200" onClick={() => setMenu(false)}>
                {label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <button className="btn-ghost flex-1 !py-2 text-sm" onClick={() => setOpen('login')}>
                {t('nav.login')}
              </button>
              <button className="btn-primary flex-1 !py-2 text-sm" onClick={() => setOpen('signup')}>
                {t('nav.signup')}
              </button>
            </div>
          </div>
        )}
      </header>
      <AuthModal open={!!open} initial={open ?? 'login'} onClose={() => setOpen(null)} />
    </>
  )
}

function Hero() {
  const { t, lang } = useI18n()
  const ed = useEditable()
  const [auth, setAuth] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const yText = useTransform(scrollYProgress, [0, 1], [0, 120])
  const yVisual = useTransform(scrollYProgress, [0, 1], [0, -80])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const hero = ed?.landing?.hero
  const sub = pickEditable(lang, hero?.subAr, hero?.subEn, t('hero.sub'))
  const stats = hero?.stats?.length
    ? hero.stats
    : [
        { value: '7', labelAr: t('hero.stats.agents'), labelEn: t('hero.stats.agents') },
        { value: '3', labelAr: t('hero.stats.models'), labelEn: t('hero.stats.models') },
        { value: '0$', labelAr: t('hero.stats.free'), labelEn: t('hero.stats.free') },
      ]
  return (
    <section id="top" ref={ref} className="relative flex min-h-screen items-center overflow-hidden pt-20">
      <ParticlesBg density={120} />
      <motion.div style={{ y: yText, opacity }} className="relative z-10 mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className="text-center lg:text-start">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="chip mb-6 !border-cyan-400/30 !bg-cyan-400/10 !text-cyan-300"
          >
            {pickEditable(lang, hero?.badgeAr, hero?.badgeEn, t('hero.badge'))}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl"
          >
            <span className="grad-text block pb-2">
              <TypingText texts={[pickEditable(lang, ed?.app?.taglineAr, ed?.app?.taglineEn, t('app.tagline'))]} speed={60} />
            </span>
            <span className="mt-3 block text-2xl text-slate-300 sm:text-3xl" dir="auto">
              {sub}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0"
          >
            {pickEditable(lang, ed?.app?.descAr, ed?.app?.descEn, t('app.desc'))}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start"
          >
            <button onClick={() => setAuth(true)} className="btn-primary animate-glow-pulse !px-9 !py-4 text-lg">
              <Rocket size={20} />
              {pickEditable(lang, hero?.ctaAr, hero?.ctaEn, t('hero.cta'))}
            </button>
            <a href="#download" className="btn-ghost !px-8 !py-4 text-lg">
              <TerminalSquare size={20} />
              {pickEditable(lang, hero?.cta2Ar, hero?.cta2En, t('hero.cta2'))}
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 lg:justify-start"
          >
            {stats.map((s) => (
              <div key={String(s.labelAr) + s.labelEn} className="flex items-baseline gap-2">
                <span className="grad-text text-2xl font-extrabold">{s.value}</span>
                <span className="text-sm text-slate-400">{pickEditable(lang, s.labelAr, s.labelEn)}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          style={{ y: yVisual }}
          className="relative hidden lg:block"
        >
          <div className="cube-scene absolute -end-10 top-8 opacity-80">
            <div className="cube">
              <span className="cube-face cube-face-front" />
              <span className="cube-face cube-face-back" />
              <span className="cube-face cube-face-right" />
              <span className="cube-face cube-face-left" />
              <span className="cube-face cube-face-top" />
              <span className="cube-face cube-face-bottom" />
            </div>
          </div>
          <div className="glass-strong animate-float shine relative overflow-hidden rounded-3xl p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ms-2">{ed?.site?.name || 'Ghennai'} — Code Theater</span>
            </div>
            <div className="mb-3 rounded-2xl bg-night-950/80 p-3 text-sm">
              <span className="text-slate-500">$</span> <span className="text-cyan-300">mkdir coffee-site && cd coffee-site</span>
              <div className="mt-1 text-slate-400">
                <span className="text-cyan-400">✓</span> Scafold project 0.4s
              </div>
              <div className="mt-1">
                <span className="text-slate-500">$</span> <span className="text-cyan-300">npm create vite@latest</span>
              </div>
              <div className="mt-1 text-emerald-400">✓ Installed 142 packages</div>
              <div className="mt-1">
                <span className="text-slate-500">$</span> <span className="text-cyan-300">ghennai publish</span>
                <span className="ms-2 text-violet-300">→ https://github.com/you/coffee-site</span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Live Preview</p>
                <div className="mt-2 h-24 rounded-lg bg-gradient-to-br from-cyan-500/30 to-violet-500/30" />
              </div>
              <div className="flex-1 rounded-xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">editor.tsx</p>
                <div className="mt-2 space-y-1.5">
                  <div className="h-1.5 w-4/5 rounded bg-violet-400/50" />
                  <div className="h-1.5 w-3/5 rounded bg-cyan-400/50" />
                  <div className="h-1.5 w-full rounded bg-white/20" />
                  <div className="h-1.5 w-2/3 rounded bg-white/20" />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -start-8 -top-6 animate-float rounded-2xl glass p-3 text-sm shadow-xl [animation-delay:1.2s]">
            <span className="text-rose-400">🎤</span> يقول المستخدم: «ابنِ لي موقع عن القهوة»
          </div>
          <div className="absolute -bottom-6 -end-4 animate-float rounded-2xl glass p-3 text-sm shadow-xl [animation-delay:2.1s]">
            <span className="text-emerald-400">🚀</span> نشرت الموقع → {t('arena.visit')}
          </div>
        </motion.div>
      </motion.div>
      <AuthModal open={auth} initial="signup" onClose={() => setAuth(false)} />
    </section>
  )
}

const FEATURES = [
  { icon: Code2, k: 'f.coding', kd: 'f.coding.d', color: 'text-violet-400' },
  { icon: Eye, k: 'f.vision', kd: 'f.vision.d', color: 'text-cyan-400' },
  { icon: Mic, k: 'f.voice', kd: 'f.voice.d', color: 'text-emerald-400' },
  { icon: Rocket, k: 'f.publish', kd: 'f.publish.d', color: 'text-rose-400' },
  { icon: MemoryStick, k: 'f.memory', kd: 'f.memory.d', color: 'text-amber-400' },
]

function Features() {
  const { t, lang } = useI18n()
  const ed = useEditable()
  const fe = ed?.landing?.features
  const cards = fe?.cards?.length
    ? (FEATURES as { icon: typeof Code2; k: string; kd: string; color: string }[]).map((f, i) => ({
        ...f,
        title: pickEditable(lang, fe.cards![i]?.titleAr, fe.cards![i]?.titleEn, '' ),
        desc: pickEditable(lang, fe.cards![i]?.descAr, fe.cards![i]?.descEn, ''),
      }))
    : null
  const titleFor = (i: number, fallbackTitle: string, fallbackDesc: string): { title: string; desc: string } =>
    cards ? { title: cards[i].title, desc: cards[i].desc } : { title: t(fallbackTitle as never), desc: t(fallbackDesc as never) }
  return (
    <section id="features" className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6">
      <ParticlesBg density={40} />
      <div className="text-center">
        <span className="chip mb-5">{pickEditable(lang, fe?.eyebrowAr, fe?.eyebrowEn, t('features.eyebrow'))}</span>
        <h2 className="text-3xl font-extrabold sm:text-5xl">
          <span className="grad-text">{pickEditable(lang, fe?.titleAr, fe?.titleEn, t('features.title'))}</span>
        </h2>
        <p className="mt-4 text-lg text-slate-400">{pickEditable(lang, fe?.subAr, fe?.subEn, t('features.sub'))}</p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => {
          const { title, desc } = titleFor(i, f.k, f.kd)
          return (
            <motion.div
              key={f.k}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: i * 0.08 }}
            >
              <TiltCard className="card-tilt h-full">
                <f.icon size={30} className={f.color} />
                <h3 className="mt-4 text-xl font-bold text-white">{title}</h3>
                <p className="mt-2 leading-relaxed text-slate-400">{desc}</p>
              </TiltCard>
            </motion.div>
          )
        })}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <div className="card-tilt flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-cyan-500/20 to-violet-500/20 !border-white/20">
            <Brain size={34} className="text-cyan-300" />
            <p className="text-center font-semibold text-white">{pickEditable(lang, ed?.app?.taglineAr, ed?.app?.taglineEn, t('app.tagline'))}</p>
            <a href="#download" className="btn-primary !px-6 !py-2.5 text-sm">
              {pickEditable(lang, ed?.landing?.hero?.ctaAr, ed?.landing?.hero?.ctaEn, t('hero.cta'))}
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function AgentsShowcase() {
  const { t, lang } = useI18n()
  const ed = useEditable()
  const [auth, setAuth] = useState(false)
  const as = ed?.landing?.agentsShow
  const show = AGENTS.map((a) => {
    const o = ed?.agents?.[a.id]
    return {
      ...a,
      mottoAr: o?.mottoAr ?? a.mottoAr,
      mottoEn: o?.mottoEn ?? a.mottoEn,
      skillsAr: o?.skillsAr?.length ? o.skillsAr : a.skillsAr,
      skillsEn: o?.skillsEn?.length ? o.skillsEn : a.skillsEn,
      world: { ...a.world, taglineAr: o?.taglineAr ?? a.world.taglineAr, taglineEn: o?.taglineEn ?? a.world.taglineEn },
    }
  })
  return (
    <section id="agents" className="relative py-28">
      <ParticlesBg density={45} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center">
          <span className="chip mb-5 !border-violet-400/30 !bg-violet-400/10 !text-violet-300">{pickEditable(lang, as?.eyebrowAr, as?.eyebrowEn, t('agents.show.eyebrow'))}</span>
          <h2 className="text-3xl font-extrabold sm:text-5xl">
            <span className="grad-text">{pickEditable(lang, as?.titleAr, as?.titleEn, t('agents.show.title'))}</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">{pickEditable(lang, as?.subAr, as?.subEn, t('agents.show.sub'))}</p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {show.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-70px' }}
              transition={{ delay: (i % 4) * 0.08 }}
              className="group relative min-h-[240px] overflow-hidden rounded-3xl border border-white/10 bg-night-900/70 transition hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_18px_50px_-18px_rgba(0,0,0,.95)]"
            >
              <img
                src={a.world.images[0]}
                alt={a.id}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-35 transition duration-500 group-hover:scale-105 group-hover:opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-night-950 via-night-950/70 to-transparent" />
              <div className="relative flex h-full flex-col p-5">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                    style={{ background: `${a.color}22`, boxShadow: `0 0 26px ${a.color}55` }}
                  >
                    {a.world.symbol}
                  </span>
                  <div>
                    <p className="text-lg font-bold text-white">{lang === 'ar' ? a.mottoAr : a.mottoEn}</p>
                    <p className="text-xs capitalize" style={{ color: a.color }}>{a.id}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300" dir="auto">
                  {lang === 'ar' ? a.world.taglineAr : a.world.taglineEn}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(lang === 'ar' ? a.skillsAr : a.skillsEn).slice(0, 3).map((s) => (
                    <span key={s} className="chip !py-1 text-[10.5px]">{s}</span>
                  ))}
                </div>
                <span
                  className="pointer-events-none absolute -bottom-10 -end-10 h-28 w-28 rounded-full opacity-25 blur-2xl transition group-hover:opacity-50"
                  style={{ background: a.color }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <button onClick={() => setAuth(true)} className="btn-primary animate-glow-pulse !px-9 !py-4 text-lg">
            <Brain size={20} />
            {pickEditable(lang, as?.ctaAr, as?.ctaEn, t('agents.show.cta'))}
          </button>
        </div>
      </div>
      <AuthModal open={auth} initial="signup" onClose={() => setAuth(false)} />
    </section>
  )
}

const STEPS = [
  { icon: Mic, k: 'how.1', kd: 'how.1.d' },
  { icon: Brain, k: 'how.2', kd: 'how.2.d' },
  { icon: TerminalSquare, k: 'how.3', kd: 'how.3.d' },
  { icon: Rocket, k: 'how.4', kd: 'how.4.d' },
]

function HowItWorks() {
  const { t, lang } = useI18n()
  const ed = useEditable()
  const hw = ed?.landing?.how
  const steps = STEPS.map((s, i) => ({
    ...s,
    title: pickEditable(lang, hw?.steps?.[i]?.titleAr, hw?.steps?.[i]?.titleEn, t(s.k as never)),
    desc: pickEditable(lang, hw?.steps?.[i]?.descAr, hw?.steps?.[i]?.descEn, t(s.kd as never)),
  }))
  return (
    <section id="how" className="relative py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold sm:text-5xl">
          <span className="mb-5 block">
            <span className="chip">{pickEditable(lang, hw?.eyebrowAr, hw?.eyebrowEn, t('how.eyebrow'))}</span>
          </span>
          <span className="grad-text">{pickEditable(lang, hw?.titleAr, hw?.titleEn, t('how.title'))}</span>
        </h2>
        <div className="relative mt-16">
          <div className="absolute bottom-0 top-0 start-[22px] w-px bg-gradient-to-b from-cyan-400/60 to-violet-500/60 sm:start-1/2" />
          {steps.map((s, i) => (
            <motion.div
              key={s.k}
              initial={{ opacity: 0, x: i % 2 ? 40 : -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5 }}
              className={`relative mb-12 flex items-start gap-6 ps-0 sm:w-1/2 ${
                i % 2 ? 'sm:ms-auto sm:ps-10' : 'sm:me-auto sm:flex-row-reverse sm:text-end sm:pe-10'
              }`}
            >
              <div className="absolute start-[10px] top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 shadow-[0_0_20px_rgba(6,182,212,.5)] sm:start-auto">
                <span className="text-xs font-bold text-white">{i + 1}</span>
              </div>
              <div className="glass ms-14 flex-1 rounded-2xl p-5 sm:ms-0">
                <s.icon size={22} className="mb-2 text-cyan-300" />
                <h3 className="text-lg font-bold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Download() {
  const { t, lang } = useI18n()
  const ed = useEditable()
  const dl = ed?.landing?.download
  const install = async () => {
    if ((navigator as unknown as { canShare?: unknown }).canShare) {
      try {
        await navigator.share({ title: 'Ghennai', text: pickEditable(lang, ed?.app?.descAr, ed?.app?.descEn, t('app.desc')), url: window.location.href })
        return
      } catch {
        /* noop */
      }
    }
    window.location.href = '#top'
    alert('Ghennai يعمل كتطبيق ويب ممتاز — افتحه من المتصفح أو أضِفه إلى الشاشة الرئيسية.')
  }
  const buttons = [
    { icon: Monitor, label: t('dl.windows'), onClick: install },
    { icon: Apple, label: t('dl.mac'), onClick: install },
    { icon: TerminalSquare, label: t('dl.linux'), onClick: install },
    { icon: Smartphone, label: t('dl.android'), onClick: install },
  ]
  return (
    <section id="download" className="relative py-28">
      <ParticlesBg density={35} />
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <span className="chip mb-5">{pickEditable(lang, dl?.eyebrowAr, dl?.eyebrowEn, t('download.eyebrow'))}</span>
        <h2 className="text-3xl font-extrabold sm:text-5xl">
          <span className="grad-text">{pickEditable(lang, dl?.titleAr, dl?.titleEn, t('download.title'))}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">{pickEditable(lang, dl?.subAr, dl?.subEn, t('download.sub'))}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {buttons.map((b, i) => (
            <motion.button
              key={b.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              onClick={b.onClick}
              className="btn-ghost hover:shadow-[0_0_24px_rgba(139,92,246,.35)]"
            >
              <b.icon size={18} />
              {b.label}
            </motion.button>
          ))}
        </div>
        <p className="mt-8 text-sm text-slate-500">
          <span className="chip">PWA</span>
          <span className="ms-2">{pickEditable(lang, ed?.landing?.footer?.opensourceAr, ed?.landing?.footer?.opensourceEn, t('footer.opensource'))}</span>
        </p>
      </div>
    </section>
  )
}

function Footer() {
  const { t, lang, toggle } = useI18n()
  const ed = useEditable()
  const ft = ed?.landing?.footer
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-4">
          <Logo size={30} textClass="text-lg font-bold text-white" />
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <a href="#" className="transition hover:text-cyan-300">{pickEditable(lang, ft?.privacyAr, ft?.privacyEn, t('footer.privacy'))}</a>
          <a href="#" className="transition hover:text-cyan-300">{pickEditable(lang, ft?.opensourceAr, ft?.opensourceEn, t('footer.opensource'))}</a>
          <button onClick={toggle} className="chip hover:bg-white/10">
            <Languages size={12} /> {lang === 'ar' ? 'English' : 'عربي'}
          </button>
        </div>
        <p className="text-sm text-slate-500">
          © 2026 {ed?.site?.name || 'Ghennai'} · {pickEditable(lang, ft?.rightsAr, ft?.rightsEn, t('footer.rights'))} <span className="text-slate-300">★</span>
        </p>
      </div>
    </footer>
  )
}

export function Landing() {
  const { t } = useI18n()
  void t
  return (
    <div className="relative min-h-screen">
      <UniverseBg />
      <Nav />
      <Hero />
      <Features />
      <AgentsShowcase />
      <HowItWorks />
      <Download />
      <Footer />
    </div>
  )
}