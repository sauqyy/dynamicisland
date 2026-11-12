import type { ReactNode } from 'react'

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const UserPlusIcon = () => (
  <Svg>
    <circle cx="10" cy="8.5" r="3.3" />
    <path d="M3.5 19.5c.7-3.4 3.2-5.2 6.5-5.2 1.6 0 3 .4 4.1 1.2M18 8v6M15 11h6" />
  </Svg>
)
export const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const LinkIcon = () => (
  <Svg>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Svg>
)

/** What a new account sees on the Friends and Groups pages: three dashed placeholders and the way to fill them. */
export function SocialEmpty({ kind, onPrimary, onSecondary }: { kind: 'friends' | 'groups'; onPrimary: () => void; onSecondary?: () => void }) {
  const friends = kind === 'friends'
  return (
    <div className="soc-empty">
      <span className="soc-ghosts" aria-hidden>
        <i>
          <UserPlusIcon />
        </i>
        <i>
          <UserPlusIcon />
        </i>
        <i>
          <UserPlusIcon />
        </i>
      </span>
      <div className="soc-empty-text">
        <b>{friends ? 'No friends yet' : 'No groups yet'}</b>
        <p>
          {friends
            ? 'Add people by their username. Once they accept, they show up here with their own chat, and you can call them from the island.'
            : 'Create a group for a class or a project, or join one with a code from a friend. Groups get a shared chat and a voice chat.'}
        </p>
        <div className="soc-empty-actions">
          <button className="pill-btn" data-cuelume-tap onClick={onPrimary}>
            {friends ? <UserPlusIcon /> : <PlusIcon />}
            {friends ? 'Add a friend' : 'Create a group'}
          </button>
          {onSecondary && (
            <button className="chip" data-cuelume-tap onClick={onSecondary}>
              <LinkIcon />
              Join with a code
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
