import { useEffect, useRef } from 'react'

interface StarDustProps {
  color?: string
  density?: number
  className?: string
}

interface Pt {
  x: number
  y: number
  r: number
  sx: number
  sy: number
  phase: number
  speed: number
  tint: [number, number, number]
}

const TWO_PI = Math.PI * 2

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function StarDust({ color = '#22d3ee', density = 26, className = '' }: StarDustProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rgb = hexToRgb(color) || [34, 211, 238]
    const jitter = (n: number) => Math.max(0, Math.min(255, n + (Math.random() * 40 - 20)))

    let pts: Pt[] = []
    let w = 0
    let h = 0
    let raf = 0
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    let running = true

    const sprite = document.createElement('canvas')
    sprite.width = 64
    sprite.height = 64
    const sctx = sprite.getContext('2d')
    if (sctx) {
      const g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, `rgba(255,255,255,1)`)
      g.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`)
      g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`)
      sctx.fillStyle = g
      sctx.fillRect(0, 0, 64, 64)
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth || window.innerWidth
      h = canvas.clientHeight || window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(240, Math.max(24, Math.round(((w * h) / 9000) * density / 10)))
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.5,
        sx: 0.06 + Math.random() * 0.22,
        sy: 0.06 + Math.random() * 0.22,
        phase: Math.random() * TWO_PI,
        speed: 0.4 + Math.random() * 1.4,
        tint: [jitter(rgb[0]), jitter(rgb[1]), jitter(rgb[2])],
      }))
    }

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      mouse.tx = (e.clientX - r.left) / Math.max(1, r.width)
      mouse.ty = (e.clientY - r.top) / Math.max(1, r.height)
    }

    const draw = (t: number) => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(0,0,0,0)'
      mouse.x += (mouse.tx - mouse.x) * 0.06
      mouse.y += (mouse.ty - mouse.y) * 0.06
      const ox = (mouse.x - 0.5) * 34
      const oy = (mouse.y - 0.5) * 34
      const ts = t / 1000
      for (const p of pts) {
        p.x += p.sx + (mouse.x - 0.5) * 0.12
        p.y += p.sy + (mouse.y - 0.5) * 0.12
        if (p.x > w + 12) p.x = -12
        if (p.x < -12) p.x = w + 12
        if (p.y > h + 12) p.y = -12
        if (p.y < -12) p.y = h + 12
        const tw = 0.35 + 0.65 * ((Math.sin(ts * p.speed + p.phase) + 1) / 2)
        const s = p.r * 22 * tw
        ctx.globalAlpha = 0.25 + 0.6 * tw
        ctx.drawImage(sprite, p.x - s / 2 + ox, p.y - s / 2 + oy, s, s)
        ctx.fillStyle = `rgba(${p.tint[0]},${p.tint[1]},${p.tint[2]},${0.9 * tw})`
        ctx.beginPath()
        ctx.arc(p.x + ox, p.y + oy, Math.max(0.4, p.r * tw), 0, TWO_PI)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    resize()
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (ro) ro.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      ro?.disconnect()
    }
  }, [color, density])

  return <canvas ref={canvasRef} className={`stardust ${className}`} aria-hidden />
}