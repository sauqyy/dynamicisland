import type { ReactNode } from 'react'
import type { Profile } from '../lib/supabase'
import { Avatar } from './Avatar'
import { HangUpIcon, HeadphonesIcon, MicIcon } from './CallBar'
import { GroupIcon } from './GroupsWidget'
import { own } from './IncomingCall'

interface Props {
  profile?: Profile
  group?: { emoji: string; color: string }
  /** the call timer, or what is happening before it starts ("Calling…") */
  label: ReactNode
  /** mute and deafen only make sense once audio flows */
  controls: boolean
  muted: boolean
  deafened: boolean
  onMute: () => void
  onDeafen: () => void
  onEnd: () => void
}

/** The collapsed island while you are in a call: who, how long, and the controls. */
export function InCallPill({ profile, group, label, controls, muted, deafened, onMute, onDeafen, onEnd }: Props) {
  return (
    <div className="incall">
      {profile ? <Avatar profile={profile} size={26} /> : group ? <GroupIcon group={group} size={26} /> : null}
      <span className="incall-time">{label}</span>
      {controls && (
        <>
          <button className={`pill-ico ${muted ? 'on' : ''}`} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} data-cuelume-toggle {...own(onMute)}>
            <MicIcon off={muted} />
          </button>
          <button className={`pill-ico ${deafened ? 'on' : ''}`} aria-pressed={deafened} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'} data-cuelume-toggle {...own(onDeafen)}>
            <HeadphonesIcon off={deafened} />
          </button>
        </>
      )}
      <button className="pill-ico end" aria-label="End call" title="End call" data-cuelume-close data-cuelume-emphasis="subtle" {...own(onEnd)}>
        <HangUpIcon />
      </button>
    </div>
  )
}
