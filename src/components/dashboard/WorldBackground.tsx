import { useEffect, useMemo, useRef } from 'react'
import { AGENT_MAP, type AgentId } from '../../config/agents'
import { StreamBg } from '../common/StreamBg'

const SYMBOL_COUNT = 8
const DOT_COUNT = 18

export function useWorldCss(agent: AgentId): React.CSSProperties {
  const w = AGENT_MAP[agent].world
  return useMemo(() => {
    return {
      '--amb-1': w.ambience[0],
      '--amb-2': w.ambience[1],
      '--amb-3': w.ambience[2],
      '--w-glow': w.glow,
      '--w-grid': w.grid,
    } as React.CSSProperties
  }, [agent])
}

export function WorldBackground({ agent }: { agent: AgentId }) {
  const w = AGENT_MAP[agent].world
  const style = useWorldCss(agent)
  const symbols = useMemo(
    () =>
      Array.from({ length: SYMBOL_COUNT }, (_, i) => ({
        id: i,
        ch: w.symbols[i % w.symbols.length],
        left: Math.random() * 96 + 2,
        size: 18 + Math.random() * 34,
        dur: 16 + Math.random() * 18,
        delay: -Math.random() * 30,
        drift: (Math.random() - 0.5) * 40,
      })),
    [agent]
  )
  const dots = useMemo(
    () =>
      Array.from({ length: DOT_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 3.5,
        dur: 6 + Math.random() * 10,
        delay: -Math.random() * 12,
        color: w.particle[i % w.particle.length],
      })),
    [agent]
  )

  return (
    <div
      key={agent}
      className="world-bg no-pointer animate-world-in"
      aria-hidden
      style={style}
    >
      <StreamBg
        key={`v-${agent}`}
        images={w.images || []}
        cycleMs={9000}
        opacity={0.5}
        className="world-video"
      />
      <div className="world-aurora" />
      <div className="world-aurora world-aurora-2" />
      <div className="world-aurora world-aurora-3" />

      {dots.map((d) => (
        <span
          key={d.id}
          className="world-dot"
          style={{
            left: d.left + '%',
            top: d.top + '%',
            width: d.size,
            height: d.size,
            background: d.color,
            boxShadow: `0 0 ${d.size * 3}px ${d.color}`,
            animationDuration: d.dur + 's',
            animationDelay: d.delay + 's',
          }}
        />
      ))}

      {symbols.map((s) => (
        <span
          key={s.id}
          className="world-symbol"
          style={{
            left: s.left + '%',
            fontSize: s.size,
            animationDuration: s.dur + 's',
            animationDelay: s.delay + 's',
            ['--drift' as string]: s.drift + 'px',
            color: w.glow,
            textShadow: `0 0 22px ${w.glow}`,
          }}
        >
          {s.ch}
        </span>
      ))}

      <div className="world-floor" />
      <div className="world-vignette" />
    </div>
  )
}