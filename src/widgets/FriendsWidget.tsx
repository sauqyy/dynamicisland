import { Fragment, useEffect, useRef, useState } from 'react'
import { BACKEND_READY, type Message } from '../lib/supabase'
import type { Auth } from '../lib/useAuth'
import type { Friend, Social } from '../lib/useSocial'
import type { Groups } from '../lib/useGroups'
import type { Call } from '../lib/useCall'
import { CallBar } from './CallBar'
import { GroupChat, GroupIcon, GroupsPanel } from './GroupsWidget'
import { DEMO_SOCIAL } from '../lib/useDemo'
import { shownPresence } from '../lib/presence'
import { Avatar } from './Avatar'
import { play } from 'cuelume'
import { disclosureCue } from '../lib/sound'

export interface OpenChat {
  friend: string | null
  group: string | null
}

interface Props {
  auth: Auth
  social: Social
  /** 1:1 voice calls; missing in the demo */
  call?: Call
  /** group chats; missing in the demo */
  groups?: Groups
  /** which page of the Social group this is */
  section?: 'friends' | 'groups'
  /** what the user is doing right now, e.g. "🎵 Song – Artist", empty when idle */
  activityText: string
  onGoProfile: () => void
  /** set by clicking a message alert: open this friend's chat */
  /** the open chat, kept by the app so it survives switching between the Friends and Groups pages */
  chat: OpenChat
  /** change the open chat; `page` also moves to that page of the Social group */
  onChat: (chat: OpenChat, page?: 'friends' | 'groups') => void
  openChatId?: string | null
  onChatOpened?: () => void
  /** chat only: the card is fullscreen, and the button to toggle it */
  fullscreen?: boolean
  onFullscreen?: (on: boolean) => void
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "Today", "Yesterday", the weekday for the past week, otherwise the date. */
export function dayLabel(iso: string) {
  const d = new Date(iso)
  const days = Math.round((dayStart(new Date()) - dayStart(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' })
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function noteText() {
  try {
    return (localStorage.getItem('di.notes') ?? '').trim()
  } catch {
    return ''
  }
}

/** One tick when sent, two ticks once the friend has opened the chat. */
function Ticks({ read }: { read: boolean }) {
  return (
    <svg className={`ticks ${read ? 'read' : ''}`} width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={read ? 'Read' : 'Sent'}>
      <path d="m1 5.2 3 3L10 1.5" />
      {read && <path d="m7 7.6.7.7L14 1.5" />}
    </svg>
  )
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  return (
    <div className={`msg ${mine ? 'mine' : ''} ${m.kind}`}>
      {m.kind === 'activity' && <small>Activity</small>}
      {m.kind === 'note' && <small>Note</small>}
      <span>{m.body}</span>
      <time>
        <span className="t">{timeLabel(m.created_at)}</span>
        {mine && <Ticks read={Boolean(m.read_at)} />}
      </time>
    </div>
  )
}

function Chat({ friend, me, social, call, activityText, onBack, fullscreen, onFullscreen }: { friend: Friend; me: string; social: Social; call?: Call; activityText: string; onBack: () => void; fullscreen?: boolean; onFullscreen?: (on: boolean) => void }) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
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

  // a new message from them while the chat is open
  const lastId = useRef<number | null>(null)
  const last = list?.[list.length - 1]
  useEffect(() => {
    if (!last) return
    if (lastId.current !== null && last.id !== lastId.current && last.sender !== me) play('ready', { emphasis: 'subtle' })
    lastId.current = last.id
  }, [last, me])

  const send = async (kind: 'text' | 'activity' | 'note', body: string) => {
    const e = await social.send(friend.profile.id, kind, body)
    if (e) play('error')
    setErr(e)
    setSharing(false)
  }
  const note = noteText()

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="chip" onClick={() => { play('navigate', { direction: 'back' }); onBack() }}>
          ‹ Back
        </button>
        <Avatar profile={friend.profile} size={22} presence={shownPresence(friend.profile)} />
        <b>{friend.profile.display_name || `@${friend.profile.username}`}</b>
        {friend.profile.display_name && <small className="handle">@{friend.profile.username}</small>}
        {friend.activity && <small className="chat-activity">{friend.activity}</small>}
        {onFullscreen && (
          <button
            className="chip chat-full"
            aria-pressed={Boolean(fullscreen)}
            data-cuelume-toggle
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={() => onFullscreen(!fullscreen)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        )}
      </div>
      {call && <CallBar call={call} friend={friend} />}
      <div className="chat-list">
        {!list ? (
          <div className="empty">Loading…</div>
        ) : list.length ? (
          list.map((m, i) => (
            <Fragment key={m.id}>
              {(i === 0 || dayStart(new Date(m.created_at)) !== dayStart(new Date(list[i - 1].created_at))) && (
                <div className="chat-day">
                  <span>{dayLabel(m.created_at)}</span>
                </div>
              )}
              <Bubble m={m} mine={m.sender === me} />
            </Fragment>
          ))
        ) : (
          <div className="empty">Say hi 👋</div>
        )}
        <div ref={end} />
      </div>
      {err && <div className="form-msg">{err}</div>}
      {sharing && (
      <div className="chat-share">
        <button className="chip" disabled={!activityText} data-cuelume-tap title={activityText || 'Nothing to share right now'} onClick={() => send('activity', activityText)}>
          Share activity
        </button>
        <button className="chip" disabled={!note} data-cuelume-tap title={note ? 'Send your notes' : 'Your notes are empty'} onClick={() => send('note', note)}>
          Share note
        </button>
      </div>
      )}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          send('text', draft)
          setDraft('')
        }}
      >
        <button type="button" className={`chip chat-plus ${sharing ? 'on' : ''}`} title="Share activity or note" {...disclosureCue(sharing)} data-cuelume-emphasis="subtle" onClick={() => setSharing((v) => !v)}>
          +
        </button>
        <input
          className="todo-input"
          placeholder="Message…"
          value={draft}
          data-cuelume-type
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {call && (
          <button
            type="button"
            className="chip chat-call"
            disabled={call.state.phase !== 'idle' || shownPresence(friend.profile) === 'offline'}
            data-cuelume-tap
            title={shownPresence(friend.profile) === 'offline' ? 'Offline' : 'Voice call'}
            aria-label="Voice call"
            onClick={() => call.start(friend.profile.id)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </button>
        )}
        <button className="pill-btn" type="submit" disabled={!draft.trim()} data-cuelume-tap>
          Send
        </button>
      </form>
    </div>
  )
}

export function FriendsWidget({ auth, social, call, groups, section = 'friends', chat: open, onChat, activityText, onGoProfile, openChatId, onChatOpened, fullscreen, onFullscreen }: Props) {
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (openChatId && social.friends.some((f) => f.profile.id === openChatId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      onChat({ friend: openChatId, group: null })
      onChatOpened?.()
    }
  }, [openChatId, social.friends, onChatOpened, onChat])

  if (!(BACKEND_READY || DEMO_SOCIAL) || !auth.user || !auth.profile) {
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

  // a friend's chat belongs to the Friends page, a group's to the Groups page
  const friend = section === 'friends' ? social.friends.find((f) => f.profile.id === open.friend) : undefined
  const group = section === 'groups' ? groups?.groups.find((g) => g.id === open.group) : undefined
  const openFriend = (id: string) => {
    onChat({ friend: id, group: null }, 'friends')
  }
  const openGroup = (id: string) => {
    onChat({ friend: null, group: id }, 'groups')
  }
  const back = () => {
    onFullscreen?.(false)
    onChat({ friend: null, group: null })
  }
  const chatView = friend ? (
    <Chat key={friend.profile.id} friend={friend} me={auth.user.id} social={social} call={call} activityText={activityText} onBack={back} fullscreen={fullscreen} onFullscreen={onFullscreen} />
  ) : group && groups ? (
    <GroupChat key={group.id} group={group} me={auth.user.id} groups={groups} activityText={activityText} onBack={back} fullscreen={fullscreen} onFullscreen={onFullscreen} />
  ) : null
  if (chatView) {
    if (!fullscreen) {
      return (
        <div className="friends" onClick={(e) => e.stopPropagation()}>
          {chatView}
        </div>
      )
    }
    // fullscreen: friends down the left with the group chats below them, the open chat filling the right
    return (
      <div className="friends fs-split" onClick={(e) => e.stopPropagation()}>
        <div className="fs-contacts">
          {social.friends.map((f) => (
            <button
              key={f.friendshipId}
              className={`fs-contact ${f.profile.id === friend?.profile.id ? 'active' : ''}`}
              data-cuelume-select
              onClick={() => openFriend(f.profile.id)}
            >
              <Avatar profile={f.profile} size={34} presence={shownPresence(f.profile)} />
              <span className="friend-meta">
                <b>{f.profile.display_name || `@${f.profile.username}`}</b>
                <small>{f.activity || f.profile.status || `@${f.profile.username}`}</small>
              </span>
              {social.unread[f.profile.id] > 0 && <span className="badge">{social.unread[f.profile.id]}</span>}
            </button>
          ))}
          {groups && groups.groups.length > 0 && <div className="fs-section">Groups</div>}
          {groups?.groups.map((g) => (
            <button key={g.id} className={`fs-contact ${g.id === group?.id ? 'active' : ''}`} data-cuelume-select onClick={() => openGroup(g.id)}>
              <GroupIcon group={g} size={34} />
              <span className="friend-meta">
                <b>{g.name}</b>
                <small>{g.members.length} {g.members.length === 1 ? 'member' : 'members'}</small>
              </span>
              {groups.unread[g.id] > 0 && <span className="badge">{groups.unread[g.id]}</span>}
            </button>
          ))}
        </div>
        {chatView}
      </div>
    )
  }

  if (groups && section === 'groups') {
    return <GroupsPanel me={auth.user.id} groups={groups} onOpen={openGroup} />
  }

  const add = async () => {
    const err = await social.addFriend(username)
    play(err ? 'error' : 'success', { emphasis: 'subtle' })
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
          data-cuelume-type
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button className="pill-btn" type="submit" disabled={!username.trim()} data-cuelume-tap>
          Add
        </button>
      </form>
      {msg && <div className="form-msg">{msg}</div>}
      {call && social.friends.map((f) => <CallBar key={f.friendshipId} call={call} friend={f} />)}

      {social.incoming.map((r) => (
        <div key={r.friendshipId} className="friend-row request">
          <Avatar profile={r.profile} size={30} />
          <div className="friend-meta">
            <b>{r.profile.display_name || `@${r.profile.username}`}</b>
            <small>
              <span className="handle">@{r.profile.username}</span> wants to be friends
            </small>
          </div>
          <button className="chip on" data-cuelume-tap onClick={() => social.accept(r.friendshipId)}>
            Accept
          </button>
          <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => social.remove(r.friendshipId)}>
            Decline
          </button>
        </div>
      ))}

      {social.friends.map((f) => (
        <div key={f.friendshipId} className="friend-row" data-cuelume-navigate onClick={() => openFriend(f.profile.id)}>
          <Avatar profile={f.profile} size={30} presence={shownPresence(f.profile)} />
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
            data-cuelume-close
            data-cuelume-emphasis="subtle"
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
          <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => social.remove(r.friendshipId)}>
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
