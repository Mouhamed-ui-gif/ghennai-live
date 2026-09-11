import type { AgentId } from '../../config/agents'
import { AGENTS } from '../../config/agents'

export function Cube3D({ agent }: { agent: AgentId }) {
  const a = AGENTS.find((x) => x.id === agent) ?? AGENTS[0]
  return (
    <div className="cube-scene">
      <div className="cube" style={{ ['--cube-glow' as string]: a.world.glow, ['--w-color' as string]: a.color } as React.CSSProperties}>
        {['front', 'back', 'right', 'left', 'top', 'bottom'].map((f, i) => (
          <span key={f} className={`cube-face cube-face-${f} cube-emoji`}>
            {a.world.symbols[i % a.world.symbols.length]}
          </span>
        ))}
      </div>
    </div>
  )
}