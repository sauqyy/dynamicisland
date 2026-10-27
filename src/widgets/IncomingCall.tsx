import type { Profile } from '../lib/supabase'
import { Avatar } from './Avatar'
import { HangUpIcon } from './CallBar'
import { GroupIcon } from './GroupsWidget'

/** a handset held up to the ear, the usual answer symbol (nudged so its weight, not its box, sits in the middle) */
function AnswerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path transform="translate(1 -.9)" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  )
}

interface Props {
  /** who is calling: a friend... */
  profile?: Profile
  /** ...or a group */
  group?: { emoji: string; color: string }
  name: string
  sub: string
  onAnswer: () => void
  onDecline: () => void
}

/** Props for a button inside the island, which expands on click and drags on pointer down. */
export const own = (fn: () => void) => ({
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  },
})

/** What the island shows while a call rings and you hover it. */
export function IncomingCall({ profile, group, name, sub, onAnswer, onDecline }: Props) {
  return (
    <div className="alert incoming-call">
      {profile ? <Avatar profile={profile} size={36} /> : group ? <GroupIcon group={group} size={36} /> : null}
      <div className="alert-text">
        <span>{name}</span>
        <small>{sub}</small>
      </div>
      <button className="ring-btn decline" aria-label="Decline call" title="Decline" data-cuelume-close data-cuelume-emphasis="subtle" {...own(onDecline)}>
        <HangUpIcon />
      </button>
      <button className="ring-btn answer" aria-label="Answer call" title="Answer" data-cuelume-tap {...own(onAnswer)}>
        <AnswerIcon />
      </button>
    </div>
  )
}
