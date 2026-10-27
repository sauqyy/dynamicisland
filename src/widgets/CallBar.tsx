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

const icon = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg {...icon}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

function HeadphonesIcon({ off }: { off: boolean }) {
  return (
    <svg {...icon}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="1.6" />
      <rect x="17" y="14" width="4" height="6" rx="1.6" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

/** a handset laid on its back, the usual hang-up symbol */
function HangUpIcon() {
  return (
    <svg {...icon}>
      <path transform="translate(0 -1.1)" d="M3 13.5c0-1.2 1.1-2 2.4-2.4C9 10 15 10 18.6 11.1c1.3.4 2.4 1.2 2.4 2.4v1.2c0 .7-.6 1.2-1.3 1.1l-2.6-.4c-.6-.1-1.1-.6-1.1-1.2v-.9c-1.9-.6-4.1-.6-6 0v.9c0 .6-.5 1.1-1.1 1.2l-2.6.4C3.6 15.9 3 15.4 3 14.7z" />
    </svg>
  )
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
            <>
              <button
                className={`chip call-btn ${state.muted ? 'on' : ''}`}
                aria-pressed={state.muted}
                aria-label={state.muted ? 'Unmute' : 'Mute'}
                title={state.muted ? 'Unmute' : 'Mute'}
                data-cuelume-toggle
                onClick={call.toggleMute}
              >
                <MicIcon off={state.muted} />
              </button>
              <button
                className={`chip call-btn ${state.deafened ? 'on' : ''}`}
                aria-pressed={state.deafened}
                aria-label={state.deafened ? 'Undeafen' : 'Deafen'}
                title={state.deafened ? 'Undeafen' : 'Deafen'}
                data-cuelume-toggle
                onClick={call.toggleDeafen}
              >
                <HeadphonesIcon off={state.deafened} />
              </button>
            </>
          )}
          <button
            className="chip call-btn call-end"
            aria-label={state.phase === 'calling' ? 'Cancel call' : 'End call'}
            title={state.phase === 'calling' ? 'Cancel call' : 'End call'}
            data-cuelume-close
            data-cuelume-emphasis="subtle"
            onClick={call.hangUp}
          >
            <HangUpIcon />
          </button>
        </>
      ) : null}
    </div>
  )
}
