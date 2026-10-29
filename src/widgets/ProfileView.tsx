import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import type { Profile } from '../lib/supabase'
import { SHOWN_LABEL, shownPresence } from '../lib/presence'
import { Avatar } from './Avatar'

/** Opens someone's profile card; null outside a provider, so avatars there stay plain. */
const OpenProfile = createContext<((p: Profile) => void) | null>(null)
export const ProfileOpener = OpenProfile.Provider

/** how long the profile's closing animation runs before it is really gone (matches the CSS) */
const CLOSE_MS = 180

/** An avatar that opens that person's profile when clicked (and only that: the row under it keeps its own click). */
export function ProfileAvatar({ profile, size, presence = false }: { profile: Profile; size?: number; presence?: boolean }) {
  const open = useContext(OpenProfile)
  const face = <Avatar profile={profile} size={size} presence={presence ? shownPresence(profile) : undefined} />
  if (!open) return face
  return (
    <button
      type="button"
      className="avatar-btn"
      title="View profile"
      aria-label={`View ${profile.display_name || profile.username}'s profile`}
      data-cuelume-navigate
      onClick={(e) => {
        e.stopPropagation()
        open(profile)
      }}
    >
      {face}
    </button>
  )
}

interface Props {
  profile: Profile
  /** what they are doing right now, for friends */
  activity?: string | null
  /** shown when there is a chat with them to open */
  onMessage?: () => void
  onClose: () => void
}

/** Someone's profile over the card: a big picture (tap it to see it full size), name, status and what they are up to. */
export function ProfileView({ profile, activity, onMessage, onClose }: Props) {
  const [zoom, setZoom] = useState(false)
  // closing plays the card's exit animation first, then really leaves
  const [closing, setClosing] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(leaveTimer.current), [])
  const shown = shownPresence(profile)
  const name = profile.display_name || `@${profile.username}`

  const leave = useCallback(
    (then: () => void) => {
      if (leaveTimer.current) return
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setClosing(true)
      leaveTimer.current = setTimeout(then, still ? 0 : CLOSE_MS)
    },
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (zoom) setZoom(false)
      else leave(onClose)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [zoom, onClose, leave])

  if (zoom && profile.avatar_url) {
    return (
      <div className="profile-view zoomed" onClick={(e) => { e.stopPropagation(); setZoom(false) }}>
        <img src={profile.avatar_url} alt={`${name}'s profile picture`} draggable={false} />
        <button className="x pv-close" aria-label="Back to profile" data-cuelume-close onClick={(e) => { e.stopPropagation(); setZoom(false) }}>
          ×
        </button>
      </div>
    )
  }

  return (
    <div className={`profile-view ${closing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button className="x pv-close" aria-label="Close profile" data-cuelume-close onClick={() => leave(onClose)}>
        ×
      </button>
      {profile.avatar_url ? (
        <button
          type="button"
          className="pv-photo"
          title="View full size"
          aria-label="View profile picture full size"
          data-cuelume-tap
          onClick={() => {
            play('navigate')
            setZoom(true)
          }}
        >
          <Avatar profile={profile} size={96} presence={shown} />
        </button>
      ) : (
        <Avatar profile={profile} size={96} presence={shown} />
      )}
      <div className="pv-name">
        <b>{name}</b>
        {profile.display_name && <small className="handle">@{profile.username}</small>}
      </div>
      <small className={`pv-presence ${shown}`}>{SHOWN_LABEL[shown]}</small>
      {profile.status && <p className="pv-status">{profile.status}</p>}
      {activity && <p className="pv-activity">{activity}</p>}
      {onMessage && (
        <button className="pill-btn" data-cuelume-navigate onClick={() => leave(onMessage)}>
          Message
        </button>
      )}
    </div>
  )
}
