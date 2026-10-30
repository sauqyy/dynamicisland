import { memo } from 'react'
import { LumiFace } from './LumiFace'
import type { LumiMood } from './moods'

/**
 * The six-hour reminder is the pensive cat with its paw at its chin, drawn the way she is drawn: a heavy-lidded
 * look to the side, a hand (a circle) that comes up to her chin and taps there, and a backlight, overexposed, behind
 * her. The reminder itself is the caption.
 */
function LumiThinkBase({ mood, title, sub, ms }: { mood: LumiMood; title: string; sub?: string; ms?: number }) {
  return (
    <div className="th-card">
      <div className="th-glow" />
      <div className="th-lumi">
        <LumiFace mood={mood} height={126} body still sound roam={6} />
      </div>
      <div className="th-cap">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {ms !== undefined && <i className="lc-life th-life" style={{ animationDuration: `${ms}ms` }} />}
    </div>
  )
}

export const LumiThink = memo(LumiThinkBase)
