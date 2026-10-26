import type { Profile } from '../lib/supabase'

type Look = Pick<Profile, 'avatar_emoji' | 'avatar_color'> & { avatar_url?: string | null }

export function Avatar({ profile, size = 36 }: { profile: Look; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.55, background: profile.avatar_color }}
    >
      {profile.avatar_url ? <img src={profile.avatar_url} alt="" draggable={false} /> : profile.avatar_emoji}
    </span>
  )
}
