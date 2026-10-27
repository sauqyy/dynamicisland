import type { GroupVoice } from '../lib/useGroupVoice'
import { MAX_VOICE } from '../lib/useGroupVoice'
import type { Group } from '../lib/useGroups'
import { Avatar } from './Avatar'
import { HangUpIcon, HeadphonesIcon, MicIcon } from './CallBar'

/** Who is in this group's voice chat, with mute, deafen and leave. Shows why a join failed too. */
export function VoiceBar({ voice, group }: { voice: GroupVoice; group: Group }) {
  const { state } = voice
  if (state.groupId !== group.id) return null
  if (!state.joining && !state.members.length && !state.error) return null

  const inRoom = group.members.filter((m) => state.members.includes(m.id))
  const live = state.joining || state.members.length > 0

  return (
    <div className="call-bar active voice-bar" role="status">
      <span className="friend-meta">
        <b>{state.joining ? 'Joining voice…' : `Voice · ${state.members.length}/${MAX_VOICE}`}</b>
        {live && (
          <span className="voice-people">
            {inRoom.map((p) => (
              <Avatar key={p.id} profile={p} size={20} />
            ))}
          </span>
        )}
        {!live && <small>{state.error}</small>}
      </span>
      {live && (
        <>
          <button
            className={`chip call-btn ${state.muted ? 'on' : ''}`}
            aria-pressed={state.muted}
            aria-label={state.muted ? 'Unmute' : 'Mute'}
            title={state.muted ? 'Unmute' : 'Mute'}
            data-cuelume-toggle
            onClick={voice.toggleMute}
          >
            <MicIcon off={state.muted} />
          </button>
          <button
            className={`chip call-btn ${state.deafened ? 'on' : ''}`}
            aria-pressed={state.deafened}
            aria-label={state.deafened ? 'Undeafen' : 'Deafen'}
            title={state.deafened ? 'Undeafen' : 'Deafen'}
            data-cuelume-toggle
            onClick={voice.toggleDeafen}
          >
            <HeadphonesIcon off={state.deafened} />
          </button>
          <button
            className="chip call-btn call-end"
            aria-label="Leave voice chat"
            title="Leave voice chat"
            data-cuelume-close
            data-cuelume-emphasis="subtle"
            onClick={voice.leave}
          >
            <HangUpIcon />
          </button>
        </>
      )}
    </div>
  )
}
