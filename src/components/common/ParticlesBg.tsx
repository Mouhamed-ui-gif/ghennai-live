import { useMemo } from 'react'
import Particles, { ParticlesProvider } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { Engine } from '@tsparticles/engine'

const initParticles = async (engine: Engine) => {
  await loadSlim(engine)
}

export function ParticlesBg({ density = 90 }: { density?: number }) {
  const options = useMemo(
    () => ({
      fullScreen: { enable: false },
      background: { color: { value: 'transparent' } },
      fpsLimit: 60,
      particles: {
        number: { value: density, density: { enable: true, width: 1400, height: 900 } },
        color: { value: ['#06b6d4', '#8b5cf6', '#f43f5e'] },
        shape: { type: 'circle' },
        opacity: { value: 0.35 },
        size: { value: { min: 1, max: 3 } },
        links: { enable: true, distance: 130, color: '#8b5cf6', opacity: 0.16, width: 1 },
        move: {
          enable: true,
          speed: 1.2,
          direction: 'none',
          random: true,
          straight: false,
          outModes: { default: 'out' },
        },
      },
      interactivity: {
        events: { onHover: { enable: true, mode: 'grab' }, resize: { enable: true } },
        modes: { grab: { distance: 180, links: { opacity: 0.4 } } },
      },
      detectRetina: true,
    }),
    [density]
  )

  return (
    <ParticlesProvider init={initParticles}>
      <Particles id="tsp" className="pointer-events-none absolute inset-0 -z-10" options={options as never} />
    </ParticlesProvider>
  )
}