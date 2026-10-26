import { useEffect, useRef, useState } from 'react'
import { BACKEND_READY, type Message } from '../lib/supabase'
import type { Auth } from '../lib/useAuth'
import type { Friend, Social } from '../lib/useSocial'
import { Avatar } from './Avatar'

interface Props {
  auth: Auth
  social: Social
  /** what the user is doing right now, e.g. "🎵 Song – Artist", empty when idle */
  activityText: string
  onGoProfile: () => void
  /** set by clicking a message alert: open this friend's chat */
  openChatId?: string | null
  onChatOpened?: () => void
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function noteText() {
  try {
    return (localStorage.getItem('di.notes') ?? '').trim()
  } catch {
    return ''
  }
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  return (
    <div className={`msg ${mine ? 'mine' : ''} ${m.kind}`}>
      {m.kind === 'activity' && <small>Activity</small>}
      {m.kind === 'note' && <small>Note</small>}
      <span>{m.body}</span>
      <time>{timeLabel(m.created_at)}</time>
    </div>
  )
}

function Chat({ friend, me, social, activityText, onBack }: { friend: Friend; me: string; social: Social; activityText: string; onBack: () => void }) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const list = social.messages[friend.profile.id]
  const { open } = social

  useEffect(() => {
    open(friend.profile.id)
    return () => {
      open(null)
    }
  }, [friend.profile.id, open])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [list?.length])

  const send = async (kind: 'text' | 'activity' | 'note', body: string) => {
    setErr(await social.send(friend.profile.id, kind, body))
  }
  const note = noteText()

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="chip" onClick={onBack}>
          ‹ Back
        </button>
        <Avatar profile={friend.profile} size={22} />
        <b>{friend.profile.display_name || `@${friend.profile.username}`}</b>
        {friend.profile.display_name && <small className="handle">@{friend.profile.username}</small>}
        {friend.activity && <small className="chat-activity">{friend.activity}</small>}
      </div>
      <div className="chat-list">
        {!list ? (
          <div className="empty">Loading…</div>
        ) : list.length ? (
          list.map((m) => <Bubble key={m.id} m={m} mine={m.sender === me} />)
        ) : (
          <div className="empty">Say hi 👋</div>
        )}
        <div ref={end} />
      </div>
      {err && <div className="form-msg">{err}</div>}
      <div className="chat-share">
        <button className="chip" disabled={!activityText} title={activityText || 'Nothing to share right now'} onClick={() => send('activity', activityText)}>
          Share activity
        </button>
        <button className="chip" disabled={!note} title={note ? 'Send your notes' : 'Your notes are empty'} onClick={() => send('note', note)}>
          Share note
        </button>
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          send('text', draft)
          setDraft('')
        }}
      >
        <input
          className="todo-input"
          placeholder="Message…"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button className="pill-btn" type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

export function FriendsWidget({ auth, social, activityText, onGoProfile, openChatId, onChatOpened }: Props) {
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [chatWith, setChatWith] = useState<string | null>(null)

  useEffect(() => {
    if (openChatId && social.friends.some((f) => f.profile.id === openChatId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatWith(openChatId)
      onChatOpened?.()
    }
  }, [openChatId, social.friends, onChatOpened])

  if (!BACKEND_READY || !auth.user || !auth.profile) {
    return (
      <div className="scroll-panel" onClick={(e) => e.stopPropagation()}>
        <div className="empty-block">
          <b>{auth.user ? 'Finish your profile first' : 'Sign in to add friends'}</b>
          <small>Friends, messages and shared activity need an account.</small>
          <button className="pill-btn" onClick={onGoProfile}>
            Open Profile
          </button>
        </div>
      </div>
    )
  }

  const friend = social.friends.find((f) => f.profile.id === chatWith)
  if (friend) {
    return (
      <div className="friends" onClick={(e) => e.stopPropagation()}>
        <Chat friend={friend} me={auth.user.id} social={social} activityText={activityText} onBack={() => setChatWith(null)} />
      </div>
    )
  }

  const add = async () => {
    const err = await social.addFriend(username)
    setMsg(err ?? 'Request sent')
    if (!err) setUsername('')
  }

  return (
    <div className="friends scroll-panel" onClick={(e) => e.stopPropagation()}>
      <form
        className="friend-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (username.trim()) add()
        }}
      >
        <input
          className="todo-input"
          placeholder="Add a friend by @username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button className="pill-btn" type="submit" disabled={!username.trim()}>
          Add
        </button>
      </form>
      {msg && <div className="form-msg">{msg}</div>}

      {social.incoming.map((r) => (
        <div key={r.friendshipId} className="friend-row request">
          <Avatar profile={r.profile} size={30} />
          <div className="friend-meta">
            <b>{r.profile.display_name || `@${r.profile.username}`}</b>
            <small>
              <span className="handle">@{r.profile.username}</span> wants to be friends
            </small>
          </div>
          <button className="chip on" onClick={() => social.accept(r.friendshipId)}>
            Accept
          </button>
          <button className="chip" onClick={() => social.remove(r.friendshipId)}>
            Decline
          </button>
        </div>
      ))}

      {social.friends.map((f) => (
        <div key={f.friendshipId} className="friend-row" onClick={() => setChatWith(f.profile.id)}>
          <Avatar profile={f.profile} size={30} />
          <div className="friend-meta">
            <b>{f.profile.display_name || `@${f.profile.username}`}</b>
            <small>
              <span className="handle">@{f.profile.username}</span>
              {(f.activity || f.profile.status) && ` · ${f.activity || f.profile.status}`}
            </small>
          </div>
          {social.unread[f.profile.id] > 0 && <span className="badge">{social.unread[f.profile.id]}</span>}
          <button
            className="x"
            aria-label="Remove friend"
            title="Remove friend"
            onClick={(e) => {
              e.stopPropagation()
              social.remove(f.friendshipId)
            }}
          >
            ×
          </button>
        </div>
      ))}

      {social.outgoing.map((r) => (
        <div key={r.friendshipId} className="friend-row pending">
          <Avatar profile={r.profile} size={30} />
          <div className="friend-meta">
            <b>{r.profile.display_name || `@${r.profile.username}`}</b>
            <small>
              <span className="handle">@{r.profile.username}</span> · request sent
            </small>
          </div>
          <button className="chip" onClick={() => social.remove(r.friendshipId)}>
            Cancel
          </button>
        </div>
      ))}

      {!social.friends.length && !social.incoming.length && !social.outgoing.length && (
        <div className="empty">No friends yet. Add someone by their username.</div>
      )}
    </div>
  )
}
