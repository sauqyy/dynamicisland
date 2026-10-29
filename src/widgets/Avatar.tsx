import type { Profile } from '../lib/supabase'
import { SHOWN_LABEL, type Shown } from '../lib/presence'

type Look = Pick<Profile, 'avatar_emoji' | 'avatar_color'> & { avatar_url?: string | null }

/** `presence` adds the Discord-style status dot in the bottom-right corner. */
export function Avatar({ profile, size = 36, presence }: { profile: Look; size?: number; presence?: Shown }) {
  const face = (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.55, background: profile.avatar_color }}
    >
      {profile.avatar_url ? <img src={profile.avatar_url} alt="" draggable={false} /> : profile.avatar_emoji}
    </span>
  )
  if (!presence) return face
  const dot = Math.min(18, Math.max(8, Math.round(size * 0.36)))
  // centred on the circle's edge at the bottom right (1 - 1/√2 of the radius in from the corner),
  // so it sits on the rim of a big picture as well as a small one
  const at = Math.round(size * 0.1464 - dot / 2)
  return (
    <span className="avatar-wrap" style={{ ['--dot' as string]: `${dot}px`, ['--dot-at' as string]: `${at}px` }}>
      {face}
      <i className={`presence-dot ${presence}`} title={SHOWN_LABEL[presence]} />
    </span>
  )
}
