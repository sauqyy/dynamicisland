import { createContext, useContext } from 'react'
import type { EqStyle } from '../lib/settings'

/** The equalizer's look and colour from Settings, so every place that draws one stays in step. */
export const EqContext = createContext<{ style: EqStyle; color: string }>({ style: 'bars', color: 'art' })

/** 'art' follows the album colour, 'accent' the accent, anything else is a CSS colour. */
export function eqFill(color: string, hue: number) {
  if (color === 'art') return `hsl(${hue} 90% 70%)`
  if (color === 'accent') return 'var(--accent)'
  return color
}

interface Props {
  /** moving while music plays, resting while paused */
  active: boolean
  /** hue of the album art, used when the colour follows the music */
  hue: number
  /** overrides for previews in Settings */
  variant?: EqStyle
  color?: string
}

/**
 * The little "music is playing" mark. Three looks:
 * bars, rounded bars bouncing out of step; wave, a sine line flowing to the left;
 * pulse, three dots rising one after another.
 */
export function Bars({ active, hue, variant, color }: Props) {
  const ctx = useContext(EqContext)
  const look = variant ?? ctx.style
  const fill = eqFill(color ?? ctx.color, hue)
  const cls = `bars eq-${look} ${active ? 'playing' : 'paused'}`
  const style = { ['--eq' as string]: fill }

  if (look === 'wave') {
    // two periods of a sine; sliding by one period loops without a seam
    const d = 'M0 7 Q 3 1 6 7 T 12 7 T 18 7 T 24 7 T 30 7 T 36 7 T 42 7 T 48 7'
    return (
      <span className={cls} style={style} aria-hidden>
        <svg viewBox="0 0 24 14" width="24" height="14">
          <g className="eq-wave-a">
            <path d={d} />
          </g>
          <g className="eq-wave-b">
            <path d={d} />
          </g>
        </svg>
      </span>
    )
  }
  const count = look === 'pulse' ? 3 : 4
  return (
    <span className={cls} style={style} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  )
}
