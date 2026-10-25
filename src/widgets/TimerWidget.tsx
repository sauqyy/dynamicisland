import { fmt } from './MediaWidget'
import type { TimerState } from '../types'

const PRESETS = [1, 5, 10, 25]

interface Props {
  timer: TimerState | null
  now: number
  onStart: (minutes: number) => void
  onCancel: () => void
}

export function Ring({ fraction, size, stroke }: { fraction: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="ring-bg" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

export function TimerWidget({ timer, now, onStart, onCancel }: Props) {
  const remaining = timer ? Math.max(0, (timer.endsAt - now) / 1000) : 0
  const fraction = timer ? remaining / (timer.total / 1000) : 0

  return (
    <div className="timer" onClick={(e) => e.stopPropagation()}>
      {timer ? (
        <>
          <div className="timer-ring">
            <Ring fraction={fraction} size={96} stroke={7} />
            <div className="timer-time">{fmt(Math.ceil(remaining))}</div>
          </div>
          <button className="pill-btn danger" onClick={onCancel}>Cancel</button>
        </>
      ) : (
        <>
          <div className="timer-label">Start a timer</div>
          <div className="presets">
            {PRESETS.map((m) => (
              <button key={m} className="pill-btn" onClick={() => onStart(m)}>
                {m}m
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
