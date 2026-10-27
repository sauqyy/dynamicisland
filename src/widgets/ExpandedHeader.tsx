import { useEffect, useRef, useState, type ReactNode } from 'react'
import { play } from 'cuelume'
import { disclosureCue } from '../lib/sound'
import { Ring } from './TimerWidget'
import { Bars } from './MediaWidget'
import { Avatar } from './Avatar'
import { SettingsCog } from './GroupIcon'
import type { Profile } from '../lib/supabase'
import { PRESENCES, presenceOf, type Presence } from '../lib/presence'

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
  /** edit profile / sign in */
  onProfile: () => void
  onPresence: (v: Presence) => Promise<string | null>
  profileActive: boolean
  onSettings: () => void
  settingsActive: boolean
  /** a newer version was found: put a dot on the cog */
  updateAvailable?: boolean
}

/** The avatar button: opens a Discord-style menu to set availability, with Edit profile at the bottom. */
function ProfileMenu({ profile, active, onProfile, onPresence }: { profile: Profile | null; active: boolean; onProfile: () => void; onPresence: (v: Presence) => Promise<string | null> }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const current = profile ? presenceOf(profile) : null
  return (
    <div className="profile-menu-wrap" ref={box}>
      <button
        className={`head-avatar ${active || open ? 'active' : ''}`}
        aria-label="Profile"
        aria-expanded={open}
        title={profile ? `@${profile.username}` : 'Sign in'}
        // signed out it goes to the Profile page, which sounds as a page change
        {...(profile ? disclosureCue(open) : {})}
        data-cuelume-emphasis="subtle"
        onClick={() => (profile ? setOpen((o) => !o) : onProfile())}
      >
        {profile ? <Avatar profile={profile} size={22} presence={current ?? undefined} /> : <span className="avatar ghost">👤</span>}
      </button>
      {open && profile && (
        <div className="profile-menu" role="menu">
          <div className="pm-who">
            <Avatar profile={profile} size={30} />
            <span>
              <b>{profile.display_name || `@${profile.username}`}</b>
              <small>@{profile.username}</small>
            </span>
          </div>
          <div className="presence-grid" role="radiogroup">
            {PRESENCES.map((o) => (
              <button
                key={o.id}
                role="radio"
                data-p={o.id}
                aria-checked={o.id === current}
                className={o.id === current ? 'active' : ''}
                data-cuelume-select
                onMouseEnter={() => setHint(o.hint)}
                onMouseLeave={() => setHint(null)}
                onClick={async () => {
                  const e = await onPresence(o.id)
                  if (e) play('error', { emphasis: 'subtle' })
                  setErr(e)
                  if (!e) setOpen(false)
                }}
              >
                <i className={`presence-dot inline ${o.id}`} />
                {o.label}
              </button>
            ))}
          </div>
          <div className="pm-hint">{hint ?? PRESENCES.find((o) => o.id === current)?.hint}</div>
          {err && <div className="form-msg">{err}</div>}
          <button
            className="pm-edit"
            onClick={() => {
              setOpen(false)
              onProfile()
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
            Edit profile
          </button>
        </div>
      )}
    </div>
  )
}

/** Title on the left, status (timer ring, date, time, music bars) on the right. */
export function ExpandedHeader({ title, action, timer, date, clock, bars, profile, onProfile, onPresence, profileActive, onSettings, settingsActive, updateAvailable }: Props) {
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
        <ProfileMenu profile={profile} active={profileActive} onProfile={onProfile} onPresence={onPresence} />
        <button
          className={`gear ${settingsActive ? 'active' : ''} ${updateAvailable ? 'has-update' : ''}`}
          aria-label={updateAvailable ? 'Settings (update available)' : 'Settings'}
          title={updateAvailable ? 'Update available' : 'Settings'}
          onClick={onSettings}
        >
          <SettingsCog size={18} />
        </button>
      </div>
    </div>
  )
}
