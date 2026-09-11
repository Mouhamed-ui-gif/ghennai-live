import { useEffect, useMemo, useRef, useState } from 'react'

/** يحوّل المسارات المطلقة للعامة لتفعل مع قاعدة النشر (GitHub Pages) عبر import.meta.env.BASE_URL */
function baseUrl(p: string): string {
  if (!p || !p.startsWith('/')) return p
  const base = import.meta.env.BASE_URL || '/'
  return base === '/' ? p : `${base.replace(/\/$/, '')}${p}`
}

interface StreamBgProps {
  images: string[]
  opacity?: number
  cycleMs?: number
  className?: string
  children?: React.ReactNode
}

/**
 * خلفية صور فوتوغرافية حقيقية (عوالم الوكلاء والغلاف) — طبقات متراكبة تتبدّل
 * بانتقال ناعم (crossfade) مع تحميل مسبق للصورة التالية لسرعة الظهور.
 */
export function StreamBg({ images, opacity = 0.5, cycleMs = 9000, className = '', children }: StreamBgProps) {
  const list = useMemo(() => images.filter(Boolean).map(baseUrl), [images.join('|')])
  const [i, setI] = useState(0)
  const preloaded = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!cycleMs || list.length < 2) return
    const iv = setInterval(() => setI((x) => (x + 1) % list.length), cycleMs)
    return () => clearInterval(iv)
  }, [cycleMs, list.length])

  useEffect(() => {
    list.forEach((src) => {
      if (preloaded.current.has(src)) return
      preloaded.current.add(src)
      const img = new Image()
      img.decoding = 'async'
      img.src = src
    })
  }, [list.length])

  if (!list.length) return <div className={`absolute inset-0 overflow-hidden ${className}`}>{children}</div>

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {list.map((src, k) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out"
          style={{
            opacity: k === i ? opacity : 0,
          }}
        />
      ))}
      {children}
    </div>
  )
}