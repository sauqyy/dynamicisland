import { useState } from 'react'
import { play } from 'cuelume'
import { fmt } from './MediaWidget'
import type { TimerState } from '../types'

const PRESETS = [1, 5, 10, 25]

interface Props {
  timer: TimerState | null
  now: number
  /** length in minutes (may be fractional) */
  onStart: (minutes: number) => void
  onCancel: () => void
}

export function Ring({ fraction, size, stroke, className = '' }: { fraction: number; size: number; stroke: number; className?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className={`ring ${className}`}>
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

function CustomTime({ onStart }: { onStart: (minutes: number) => void }) {
  const [min, setMin] = useState('')
  const [sec, setSec] = useState('')
  const total = (Number(min) || 0) * 60 + (Number(sec) || 0)
  const start = () => total > 0 && onStart(Math.min(total, 99 * 3600) / 60)
  const field = (value: string, set: (v: string) => void, label: string, max: number) => (
    <input
      inputMode="numeric"
      placeholder="0"
      aria-label={label}
      value={value}
      data-cuelume-type
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onBlur={() => Number(value) > max && set(String(max))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && total > 0) {
          play('tap')
          start()
        }
      }}
    />
  )
  return (
    <div className="timer-custom">
      {field(min, setMin, 'Minutes', 999)}
      <span>min</span>
      {field(sec, setSec, 'Seconds', 59)}
      <span>sec</span>
      <button className="pill-btn" disabled={total <= 0} data-cuelume-tap onClick={start}>
        Start
      </button>
    </div>
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
          <button className="pill-btn danger" data-cuelume-close onClick={onCancel}>Cancel</button>
        </>
      ) : (
        <>
          <div className="timer-label">Start a timer</div>
          <div className="presets">
            {PRESETS.map((m) => (
              <button key={m} className="pill-btn" data-cuelume-tap onClick={() => onStart(m)}>
                {m}m
              </button>
            ))}
          </div>
          <CustomTime onStart={onStart} />
        </>
      )}
    </div>
  )
}
