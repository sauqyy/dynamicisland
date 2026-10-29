import { Fragment, useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import type { Message, Profile } from '../lib/supabase'
import { inviteLink, type Group, type GroupMessage, type Groups } from '../lib/useGroups'
import { disclosureCue } from '../lib/sound'
import { ACCENTS } from '../lib/settings'
import type { GroupVoice } from '../lib/useGroupVoice'
import { MAX_VOICE } from '../lib/useGroupVoice'
import { useVoiceRoster } from '../lib/useVoiceRoster'
import { Avatar } from './Avatar'
import { ProfileAvatar } from './ProfileView'
import { ChatInput } from './ChatInput'
import { HeadphonesIcon } from './CallBar'
import { VoiceBar } from './VoiceBar'
import { dayLabel, dayStart, noteText, Ticks, timeLabel } from './FriendsWidget'

const ICONS = ['👥', '📚', '🎮', '🎧', '🎨', '💻', '⚽', '🍕', '🎬', '✈️', '🏠', '💼', '🔥', '🌙', '🚀', '🐱']

/** The round icon of a group: an emoji on a colour. */
export function GroupIcon({ group, size = 30 }: { group: { emoji: string; color: string }; size?: number }) {
  return (
    <span className="group-icon" style={{ width: size, height: size, fontSize: size * 0.55, background: group.color }} aria-hidden>
      {group.emoji}
    </span>
  )
}

function IconPicker({ emoji, color, onEmoji, onColor }: { emoji: string; color: string; onEmoji: (e: string) => void; onColor: (c: string) => void }) {
  return (
    <div className="icon-picker">
      <div className="emoji-grid">
        {ICONS.map((e) => (
          <button key={e} type="button" className={e === emoji ? 'active' : ''} data-cuelume-select onClick={() => onEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      <div className="swatches">
        {ACCENTS.map((c) => (
          <button key={c} type="button" aria-label={c} className={c === color ? 'active' : ''} data-cuelume-select style={{ background: c }} onClick={() => onColor(c)} />
        ))}
      </div>
    </div>
  )
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

const nameOf = (p: Profile) => p.display_name || `@${p.username}`

/** One message: who sent it (their picture beside it), when, and for your own whether the others have read it. */
function GroupBubble({ m, mine, group, readers, seenHere, everyoneRead }: { m: GroupMessage; mine: boolean; group: Group; readers: Profile[]; seenHere: Profile[]; everyoneRead: boolean }) {
  const from = group.members.find((p) => p.id === m.sender)
  const bubble = (
    <div className={`msg ${mine ? 'mine' : ''} ${m.kind}`}>
      {!mine && <small>{from ? nameOf(from) : 'Former member'}</small>}
      {m.kind === 'activity' && <small>Activity</small>}
      {m.kind === 'note' && <small>Note</small>}
      <span>{m.body}</span>
      <time>
        <span className="t">{timeLabel(m.created_at)}</span>
        {mine && <Ticks read={everyoneRead} partial={readers.length > 0} label={readers.length ? `Read by ${readers.map(nameOf).join(', ')}` : 'Sent'} />}
      </time>
    </div>
  )
  return (
    <>
      {mine ? (
        bubble
      ) : (
        <div className="msg-row">
          {from ? <ProfileAvatar profile={from} size={24} /> : <span className="avatar ghost" style={{ width: 24, height: 24 }} />}
          {bubble}
        </div>
      )}
      {seenHere.length > 0 && (
        <div className={`seen-by ${mine ? 'mine' : ''}`} title={`Read by ${seenHere.map(nameOf).join(', ')}`}>
          {seenHere.slice(0, 5).map((p) => (
            <Avatar key={p.id} profile={p} size={14} />
          ))}
          {seenHere.length > 5 && <small>+{seenHere.length - 5}</small>}
        </div>
      )}
    </>
  )
}

function GroupInfo({ group, me, groups, onLeft }: { group: Group; me: string; groups: Groups; onLeft: () => void }) {
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const isOwner = group.owner === me
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [emoji, setEmoji] = useState(group.emoji)
  const [color, setColor] = useState(group.color)
  const flash = (e: string | null, ok: string) => {
    play(e ? 'error' : 'success', { emphasis: 'subtle' })
    setMsg(e ?? ok)
  }

  return (
    <div className="group-info scroll-panel">
      <div className="group-code">
        <small>Invite code</small>
        <b>{group.inviteCode}</b>
        <button className="chip" data-cuelume-tap onClick={() => { copy(group.inviteCode); setMsg('Code copied') }}>
          Copy code
        </button>
        <button className="chip" data-cuelume-tap onClick={() => { copy(inviteLink(group.inviteCode)); setMsg('Link copied') }}>
          Copy link
        </button>
        {isOwner && (
          <button className="chip" data-cuelume-tap title="The old code and link stop working" onClick={async () => flash(await groups.resetCode(group.id), 'New code created')}>
            New code
          </button>
        )}
      </div>

      {isOwner && (
        <form
          className="friend-add"
          onSubmit={async (e) => {
            e.preventDefault()
            const n = name.trim()
            if (!n || n === group.name) return
            flash(await groups.rename(group.id, n), 'Group renamed')
          }}
        >
          <input
            className="todo-input"
            placeholder="Group name"
            value={name}
            maxLength={40}
            data-cuelume-type
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button className="pill-btn" type="submit" disabled={!name.trim() || name.trim() === group.name} data-cuelume-tap>
            Rename
          </button>
        </form>
      )}

      {isOwner && (
        <div className="group-icon-edit">
          <GroupIcon group={{ emoji, color }} size={26} />
          <button className={`chip ${editing ? 'on' : ''}`} {...disclosureCue(editing)} onClick={() => setEditing((v) => !v)}>
            Change icon
          </button>
          {editing && (
            <button
              className="chip"
              data-cuelume-tap
              disabled={emoji === group.emoji && color === group.color}
              onClick={async () => {
                const e = await groups.setIcon(group.id, emoji, color)
                flash(e, 'Icon updated')
                if (!e) setEditing(false)
              }}
            >
              Save
            </button>
          )}
        </div>
      )}
      {isOwner && editing && <IconPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />}

      {isOwner && (
        <form
          className="friend-add"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!username.trim()) return
            const err = await groups.invite(group.id, username)
            flash(err, 'Invitation sent')
            if (!err) setUsername('')
          }}
        >
          <input
            className="todo-input"
            placeholder="Add someone by @username"
            value={username}
            data-cuelume-type
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button className="pill-btn" type="submit" disabled={!username.trim()} data-cuelume-tap>
            Invite
          </button>
        </form>
      )}
      {msg && <div className="form-msg">{msg}</div>}

      {group.members.map((p) => (
        <div key={p.id} className="friend-row" style={{ cursor: 'default' }}>
          <ProfileAvatar profile={p} size={26} presence />
          <div className="friend-meta">
            <b>{p.display_name || `@${p.username}`}</b>
            <small>
              @{p.username}
              {p.id === group.owner && ' · owner'}
              {p.id === me && ' · you'}
            </small>
          </div>
          {isOwner && p.id !== me && (
            <button className="x" aria-label="Remove from group" title="Remove from group" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => groups.removeMember(group.id, p.id)}>
              ×
            </button>
          )}
        </div>
      ))}

      <button
        className="chip"
        data-cuelume-close
        onClick={async () => {
          if (isOwner) await groups.deleteGroup(group.id)
          else await groups.removeMember(group.id, me)
          onLeft()
        }}
      >
        {isOwner ? 'Delete group' : 'Leave group'}
      </button>
    </div>
  )
}

export function GroupChat({ group, me, groups, voice, voiceBlocked, activityText, onBack, fullscreen, onFullscreen }: { group: Group; me: string; groups: Groups; voice?: GroupVoice; voiceBlocked?: boolean; activityText: string; onBack: () => void; fullscreen?: boolean; onFullscreen?: (on: boolean) => void }) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [info, setInfo] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const list = groups.messages[group.id]
  const { open } = groups
  // who is in this group's voice chat: you and the others when you are in it, otherwise whoever is listed in the room
  const inThisVoice = voice?.state.groupId === group.id
  const roster = useVoiceRoster(group.id, !inThisVoice)
  const inVoiceIds = inThisVoice ? voice.state.members : roster
  const inVoice = group.members.filter((p) => inVoiceIds.includes(p.id))

  useEffect(() => {
    open(group.id)
    return () => {
      open(null)
    }
  }, [group.id, open])

  useEffect(() => {
    // scroll the list itself; scrollIntoView would also scroll the page and push the chat header under the date bar
    const el = end.current?.parentElement
    if (el) el.scrollTop = el.scrollHeight
  }, [list?.length, info])

  const send = async (kind: Message['kind'], body: string) => {
    const e = await groups.send(group.id, kind, body)
    if (e) play('error')
    setErr(e)
    setSharing(false)
  }
  const note = noteText()

  // everyone else's read position, and the message each of them has read up to (their picture sits there)
  const readMap = groups.reads[group.id] ?? {}
  const others = group.members.filter((p) => p.id !== me)
  const lastReadMsg = new Map<number, Profile[]>()
  for (const p of others) {
    const upTo = readMap[p.id] ?? 0
    const hit = list ? [...list].reverse().find((x) => x.id <= upTo) : undefined
    if (hit) lastReadMsg.set(hit.id, [...(lastReadMsg.get(hit.id) ?? []), p])
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="chip" onClick={() => { play('navigate', { direction: 'back' }); onBack() }}>
          ‹ Back
        </button>
        <GroupIcon group={group} size={22} />
        <span className="chat-title">
          <b>{group.name}</b>
          <small className="handle">{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</small>
        </span>
        <button className={`chip group-info-btn ${info ? 'on' : ''}`} {...disclosureCue(info)} aria-pressed={info} title="Members and invites" onClick={() => setInfo((v) => !v)}>
          Info
        </button>
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
      {info ? (
        <GroupInfo group={group} me={me} groups={groups} onLeft={onBack} />
      ) : (
        <>
          {voice && <VoiceBar voice={voice} group={group} me={me} />}
          {/* a voice chat is going on without you: who is in it, how many, and a way in */}
          {!inThisVoice && inVoice.length > 0 && (
            <div className="voice-live" role="status">
              <span className="voice-faces" title={`In the voice chat: ${inVoice.map(nameOf).join(', ')}`} aria-hidden>
                {inVoice.map((p) => (
                  <Avatar key={p.id} profile={p} size={20} />
                ))}
              </span>
              <span className="voice-live-count">
                {inVoice.length}/{group.members.length} in call
              </span>
              {voice && (
                <button
                  className="chip voice-join"
                  disabled={Boolean(voice.state.groupId) || voiceBlocked || inVoice.length >= MAX_VOICE}
                  data-cuelume-tap
                  title={voice.state.groupId ? 'Already in a voice chat' : voiceBlocked ? 'You are on a call' : inVoice.length >= MAX_VOICE ? `Voice chat is full (max ${MAX_VOICE})` : 'Join the voice chat'}
                  onClick={() => voice.join(group.id)}
                >
                  <HeadphonesIcon off={false} />
                  Join
                </button>
              )}
            </div>
          )}
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
                  <GroupBubble
                    m={m}
                    mine={m.sender === me}
                    group={group}
                    readers={others.filter((p) => p.id !== m.sender && (readMap[p.id] ?? 0) >= m.id)}
                    seenHere={lastReadMsg.get(m.id) ?? []}
                    everyoneRead={others.length > 0 && others.every((p) => (readMap[p.id] ?? 0) >= m.id)}
                  />
                </Fragment>
              ))
            ) : (
              <div className="empty">Say hi to the group 👋</div>
            )}
            <div ref={end} />
          </div>
          {err && <div className="form-msg">{err}</div>}
          {sharing && (
            <div className="chat-share">
              <button className="chip" disabled={!activityText} data-cuelume-tap onClick={() => send('activity', activityText)}>
                Share activity
              </button>
              <button className="chip" disabled={!note} data-cuelume-tap onClick={() => send('note', note)}>
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
            <ChatInput
              placeholder="Message the group…"
              value={draft}
              onChange={setDraft}
              onSend={() => {
                if (!draft.trim()) return
                send('text', draft)
                setDraft('')
              }}
            />
            {voice && (
              <button
                type="button"
                className="chip chat-call"
                disabled={Boolean(voice.state.groupId) || voiceBlocked}
                data-cuelume-tap
                title={voice.state.groupId ? 'Already in a voice chat' : voiceBlocked ? 'You are on a call' : `Join voice chat (max ${MAX_VOICE})`}
                aria-label="Join voice chat"
                onClick={() => voice.join(group.id)}
              >
                <HeadphonesIcon off={false} />
              </button>
            )}
            <button className="pill-btn" type="submit" disabled={!draft.trim()} data-cuelume-tap>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  )
}

interface Props {
  me: string
  onOpen: (groupId: string) => void
  groups: Groups
}

/** The Groups section of the Friends page: invitations, your groups, create and join. */
export function GroupsPanel({ me, groups, onOpen }: Props) {
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👥')
  const [color, setColor] = useState(ACCENTS[1])
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const done = (err: string | null, ok: string) => {
    play(err ? 'error' : 'success', { emphasis: 'subtle' })
    setMsg(err ?? ok)
    if (!err) {
      setMode(null)
      setName('')
      setCode('')
    }
  }

  return (
    <div className="friends scroll-panel" onClick={(e) => e.stopPropagation()}>
      {groups.invites.map((inv) => (
        <div key={inv.group.id} className="friend-row request">
          <GroupIcon group={inv.group} />
          <div className="friend-meta">
            <b>{inv.group.name}</b>
            <small>{inv.from ? `${inv.from.display_name || `@${inv.from.username}`} invited you` : 'You were invited'}</small>
          </div>
          <button className="chip on" data-cuelume-tap onClick={() => groups.respond(inv.group.id, true)}>
            Accept
          </button>
          <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => groups.respond(inv.group.id, false)}>
            Decline
          </button>
        </div>
      ))}

      <div className="group-actions">
        <button className={`group-action ${mode === 'create' ? 'on' : ''}`} aria-pressed={mode === 'create'} {...disclosureCue(mode === 'create')} onClick={() => setMode(mode === 'create' ? null : 'create')}>
          <span className="ga-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="ga-text">
            <b>New group</b>
            <small>Chat with friends</small>
          </span>
        </button>
        <button className={`group-action ${mode === 'join' ? 'on' : ''}`} aria-pressed={mode === 'join'} {...disclosureCue(mode === 'join')} onClick={() => setMode(mode === 'join' ? null : 'join')}>
          <span className="ga-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
              <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
            </svg>
          </span>
          <span className="ga-text">
            <b>Join a group</b>
            <small>Use an invite code</small>
          </span>
        </button>
      </div>

      {mode === 'create' && (
        <form
          className="group-create"
          onSubmit={async (e) => {
            e.preventDefault()
            if (name.trim()) done(await groups.create(name, emoji, color), 'Group created')
          }}
        >
          <div className="friend-add">
            <GroupIcon group={{ emoji, color }} size={34} />
            <input className="todo-input" placeholder="Group name" value={name} maxLength={40} data-cuelume-type onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            <button className="pill-btn" type="submit" disabled={!name.trim()} data-cuelume-tap>
              Create
            </button>
          </div>
          <IconPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
        </form>
      )}
      {mode === 'join' && (
        <form
          className="friend-add"
          onSubmit={async (e) => {
            e.preventDefault()
            if (code.trim()) done(await groups.join(code), 'Joined the group')
          }}
        >
          <input className="todo-input" placeholder="Invite code or link" value={code} data-cuelume-type onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="pill-btn" type="submit" disabled={!code.trim()} data-cuelume-tap>
            Join
          </button>
        </form>
      )}
      {msg && <div className="form-msg">{msg}</div>}

      {groups.groups.map((g) => (
        <div key={g.id} className="friend-row" data-cuelume-navigate onClick={() => onOpen(g.id)}>
          <GroupIcon group={g} />
          <div className="friend-meta">
            <b>{g.name}</b>
            <small>
              {g.members.length} {g.members.length === 1 ? 'member' : 'members'}
              {g.owner === me && ' · you own this'}
            </small>
          </div>
          {groups.unread[g.id] > 0 && <span className="badge">{groups.unread[g.id]}</span>}
        </div>
      ))}

      {!mode && !groups.groups.length && !groups.invites.length && <div className="empty">No groups yet. Create one or join with an invite code.</div>}
    </div>
  )
}
