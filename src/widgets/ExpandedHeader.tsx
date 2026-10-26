import type { ReactNode } from 'react'
import { Ring } from './TimerWidget'
import { Bars } from './MediaWidget'
import { Avatar } from './Avatar'
import { SettingsCog } from './GroupIcon'
import type { Profile } from '../lib/supabase'

interface Props {
  title: string
  action?: ReactNode
  /** 0–1 fraction of a running timer, null when none */
  timer: number | null
  date: Date
  clock: string
  /** hue for the music bars, null when nothing is playing */
  bars: number | null
  /** signed-in profile, null when signed out */
  profile: Profile | null
  onProfile: () => void
  profileActive: boolean
  onSettings: () => void
  settingsActive: boolean
}

/** Title on the left, status (timer ring, date, time, music bars) on the right. */
export function ExpandedHeader({ title, action, timer, date, clock, bars, profile, onProfile, profileActive, onSettings, settingsActive }: Props) {
  return (
    <div className={`xhead ${action ? 'has-action' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="xhead-left">
        <span className="xhead-title">{title}</span>
        {action}
      </div>
      <div className="xhead-right">
        {timer !== null && <Ring fraction={timer} size={18} stroke={3} />}
        <span className="xhead-date">
          {date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
        <b className="xhead-time">{clock}</b>
        {bars !== null && <Bars active hue={bars} />}
        <button
          className={`head-avatar ${profileActive ? 'active' : ''}`}
          aria-label="Profile"
          title={profile ? `@${profile.username}` : 'Sign in'}
          onClick={onProfile}
        >
          {profile ? <Avatar profile={profile} size={22} /> : <span className="avatar ghost">👤</span>}
        </button>
        <button className={`gear ${settingsActive ? 'active' : ''}`} aria-label="Settings" title="Settings" onClick={onSettings}>
          <SettingsCog size={18} />
        </button>
      </div>
    </div>
  )
}
