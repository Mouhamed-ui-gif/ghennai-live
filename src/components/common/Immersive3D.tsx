import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  z: number
  r: number
  hue: number
  speed: number
  tw: number
}

/**
 * خلفية ثلاثية الأبعاد خفيفة (Canvas 2D مع إسقاط منظور):
 * - حقل نجوم بعمق حقيقي (z) يتحرك نحو المشاهد
 * - توهجات مدارية (orbs) بتدرجات
 * - تفاعل parallax مع الفأرة + دعم RTL
 * - بدون أي مكتبة خارجية، 60fps مع تقليل تلقائي للكثافة على الجوال
 */
export function Immersive3D({ density = 160, className = '' }: { density?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let parts: Particle[] = []
    const isMobile = window.matchMedia('(max-width: 768px)').matches
    const count = isMobile ? Math.floor(density * 0.45) : density
    const DPR = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      w = rect?.width || window.innerWidth
      h = rect?.height || window.innerHeight
      canvas.width = w * DPR
      canvas.height = h * DPR
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawn = (): Particle => ({
      x: (Math.random() - 0.5) * w * 1.6,
      y: (Math.random() - 0.5) * h * 1.6,
      z: Math.random() * 1 + 0.15,
      r: Math.random() * 1.8 + 0.4,
      hue: [190, 265, 330, 160][Math.floor(Math.random() * 4)],
      speed: Math.random() * 0.9 + 0.25,
      tw: Math.random() * Math.PI * 2,
    })
    parts = Array.from({ length: count }, spawn)

    const onMove = (e: PointerEvent) => {
      mouse.current.tx = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.current.ty = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const render = () => {
      mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.06
      mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.06
      const mx = mouse.current.x
      const my = mouse.current.y

      ctx.clearRect(0, 0, w, h)

      // توهجات خلفية ضخمة بعمق
      const orbs = [
        { x: w * 0.22 + mx * -26, y: h * 0.28 + my * -18, r: Math.min(w, h) * 0.32, c1: 'rgba(6,182,212,.20)', c2: 'transparent' },
        { x: w * 0.78 + mx * 30, y: h * 0.62 + my * 22, r: Math.min(w, h) * 0.36, c1: 'rgba(139,92,246,.22)', c2: 'transparent' },
        { x: w * 0.55 + mx * 14, y: h * 0.85 + my * -12, r: Math.min(w, h) * 0.24, c1: 'rgba(244,114,182,.12)', c2: 'transparent' },
      ]
      for (const o of orbs) {
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
        g.addColorStop(0, o.c1)
        g.addColorStop(1, o.c2)
        ctx.fillStyle = g
        ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2)
      }

      const cx = w / 2
      const cy = h / 2
      for (const p of parts) {
        p.tw += 0.04
        // حركة عمق: النجوم القريبة أسرع وأكبر
        p.z -= 0.0016 * p.speed
        if (p.z < 0.12) {
          Object.assign(p, spawn())
          p.z = 1.1
        }
        const scale = 1 / Math.max(p.z, 0.12)
        const px = cx + p.x * scale * 0.55 + mx * 34 * scale * 0.5
        const py = cy + p.y * scale * 0.55 + my * 26 * scale * 0.5
        if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue
        const alpha = Math.min(0.95, (1.25 - p.z) * (0.55 + Math.sin(p.tw) * 0.25 + 0.45))
        const size = p.r * scale
        ctx.beginPath()
        ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${alpha.toFixed(3)})`
        ctx.shadowColor = `hsla(${p.hue}, 90%, 65%, .9)`
        ctx.shadowBlur = 8 * scale
        ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        // خط سرعة للنجوم القريبة جدًا يعطي إحساس Warp ثلاثي الأبعاد
        if (scale > 1.6) {
          ctx.beginPath()
          ctx.strokeStyle = `hsla(${p.hue}, 90%, 70%, ${(alpha * 0.35).toFixed(3)})`
          ctx.lineWidth = size * 0.5
          ctx.moveTo(px, py)
          ctx.lineTo(px - mx * 6 * scale, py - 10 * scale)
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [density])

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* شبكة أرضية ثلاثية الأبعاد */}
      <div className="orb-grid" />
      {/* لمعة علوية */}
      <div className="orb-sheen" />
    </div>
  )
}
