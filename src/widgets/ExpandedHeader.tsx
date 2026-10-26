import type { ReactNode } from 'react'
import { Ring } from './TimerWidget'
import { Bars } from './MediaWidget'

interface Props {
  title: string
  action?: ReactNode
  /** 0–1 fraction of a running timer, null when none */
  timer: number | null
  date: Date
  clock: string
  /** hue for the music bars, null when nothing is playing */
  bars: number | null
  onSettings: () => void
  settingsActive: boolean
}

/** Title on the left, status (timer ring, date, time, music bars) on the right. */
export function ExpandedHeader({ title, action, timer, date, clock, bars, onSettings, settingsActive }: Props) {
  return (
    <div className="xhead" onClick={(e) => e.stopPropagation()}>
      <div className="xhead-left">
        <span className="xhead-title">{title}</span>
        {action}
      </div>
      <div className="xhead-right">
        {timer !== null && <Ring fraction={timer} size={18} stroke={3} />}
        <span className="xhead-date">
          {date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <b className="xhead-time">{clock}</b>
        {bars !== null && <Bars active hue={bars} />}
        <button className={`gear ${settingsActive ? 'active' : ''}`} aria-label="Settings" title="Settings" onClick={onSettings}>
          ⚙
        </button>
      </div>
    </div>
  )
}
