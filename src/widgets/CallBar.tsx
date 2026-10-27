import { useEffect, useState } from 'react'
import type { Call } from '../lib/useCall'
import type { Friend } from '../lib/useSocial'
import { Avatar } from './Avatar'

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{clock(now - since)}</>
}

/** The state of the voice call with one friend: ringing, connecting, live, or why it just ended. */
export function CallBar({ call, friend }: { call: Call; friend: Friend }) {
  const { state } = call
  if (state.peer !== friend.profile.id || (state.phase === 'idle' && !state.error)) return null

  const name = friend.profile.display_name || `@${friend.profile.username}`
  const label =
    state.phase === 'incoming'
      ? 'Incoming voice call'
      : state.phase === 'calling'
        ? 'Calling…'
        : state.phase === 'connecting'
          ? 'Connecting…'
          : state.phase === 'active' && state.since
            ? <Timer since={state.since} />
            : state.error

  return (
    <div className={`call-bar ${state.phase}`} role="status">
      <Avatar profile={friend.profile} size={26} />
      <span className="friend-meta">
        <b>{name}</b>
        <small>{label}</small>
      </span>
      {state.phase === 'incoming' ? (
        <>
          <button className="chip on" data-cuelume-tap onClick={call.accept}>
            Accept
          </button>
          <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={call.decline}>
            Decline
          </button>
        </>
      ) : state.phase !== 'idle' ? (
        <>
          {state.phase === 'active' && (
            <button className={`chip ${state.muted ? 'on' : ''}`} aria-pressed={state.muted} data-cuelume-toggle onClick={call.toggleMute}>
              {state.muted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button className="chip call-end" data-cuelume-close data-cuelume-emphasis="subtle" onClick={call.hangUp}>
            {state.phase === 'calling' ? 'Cancel' : 'End'}
          </button>
        </>
      ) : null}
    </div>
  )
}
