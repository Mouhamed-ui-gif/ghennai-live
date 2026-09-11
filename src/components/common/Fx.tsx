import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

export function TiltCard({ children, className = '', max = 10 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setStyle({
      transform: `rotateX(${-py * max}deg) rotateY(${px * max}deg) translateZ(10px)`,
    })
  }
  const onLeave = () => setStyle({ transform: 'rotateX(0) rotateY(0)' })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const glow = el.querySelector<HTMLElement>('.tilt-glow')
    if (glow) return
    const g = document.createElement('div')
    g.className = 'tilt-glow pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300'
    g.style.background = 'radial-gradient(600px circle at 50% 0%, rgba(6,182,212,.08), transparent 40%)'
    el.appendChild(g)
    el.addEventListener('mouseenter', () => (g.style.opacity = '1'))
    el.addEventListener('mouseleave', () => (g.style.opacity = '0'))
  }, [])

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={className} style={{ transformStyle: 'preserve-3d', ...style, perspective: 900 }}>
      {children}
    </div>
  )
}

export function TypingText({ texts, className = '', speed = 55, bold = true }: { texts: string[]; className?: string; speed?: number; bold?: boolean }) {
  const [i, setI] = useState(0)
  const [len, setLen] = useState(0)
  const [phase, setPhase] = useState<'type' | 'hold' | 'erase'>('type')

  useEffect(() => {
    const t = texts[i] || ''
    if (phase === 'type') {
      if (len < t.length) {
        const id = setTimeout(() => setLen((l) => l + 1), speed)
        return () => clearTimeout(id)
      }
      setPhase('hold')
      return
    }
    if (phase === 'hold') {
      const id = setTimeout(() => setPhase('erase'), 1400)
      return () => clearTimeout(id)
    }
    if (len > 0) {
      const id = setTimeout(() => setLen((l) => l - 1), 28)
      return () => clearTimeout(id)
    }
    setPhase('type')
    setI((x) => (x + 1) % texts.length)
  }, [phase, len, i, texts, speed])

  const full = texts[i] || ''
  const shown = bold ? '<mark style="all:unset;mso">' : ''
  return (
    <span className={className} dir="auto">
      {full.slice(0, len)}
      <span className="inline-block w-[3px] animate-blink bg-cyan-300 align-middle" style={{ height: '1em' }} />
    </span>
  )
}