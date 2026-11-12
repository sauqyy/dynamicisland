import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { play } from '../lib/sound'
import type { Message, Profile } from '../lib/supabase'
import { inviteLink, type Group, type GroupMessage, type Groups } from '../lib/useGroups'
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
import { LinkIcon, PlusIcon, SocialEmpty, UserPlusIcon } from './SocialEmpty'

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
          <button className={`chip ${editing ? 'on' : ''}`} onClick={() => setEditing((v) => !v)}>
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

export function GroupChat({ group, me, groups, voice, voiceBlocked, activityText, onBack, fullscreen, onFullscreen, inline }: { group: Group; me: string; groups: Groups; voice?: GroupVoice; voiceBlocked?: boolean; activityText: string; onBack: () => void; fullscreen?: boolean; onFullscreen?: (on: boolean) => void; inline?: boolean }) {
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

  // a voice chat is going on without you: who is in it, how many, and a way in
  const voiceLive =
    !inThisVoice && inVoice.length > 0 ? (

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
    ) : null

  return (
    <div className="chat">
      <div className="chat-head">
        {!inline && (
          <button className="chip" onClick={() => { play('navigate', { direction: 'back' }); onBack() }}>
            ‹ Back
          </button>
        )}
        <GroupIcon group={group} size={22} />
        <span className="chat-title">
          <b>{group.name}</b>
          <small className="handle">{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</small>
        </span>
        {inline && voiceLive}
        <button className={`chip group-info-btn ${info ? 'on' : ''}`} aria-pressed={info} title="Members, invite code and invites" onClick={() => setInfo((v) => !v)}>
          <UserPlusIcon />
          {group.owner === me ? 'Invite' : 'Members'}
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
          {!inline && voiceLive}
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
            <button type="button" className={`chip chat-plus ${sharing ? 'on' : ''}`} title="Share activity or note" data-cuelume-emphasis="subtle" onClick={() => setSharing((v) => !v)}>
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
  groups: Groups
  /** the group whose chat is open on the right */
  selectedId?: string
  onSelect: (groupId: string) => void
  /** the open group chat, built by the Friends page (it also needs voice and call state) */
  chatView: ReactNode
}

/** The Groups page: invitations and your groups down the left, the open chat or the Create and Join forms on the right. */
export function GroupsSplit({ me, groups, selectedId, onSelect, chatView }: Props) {
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👥')
  const [color, setColor] = useState(ACCENTS[1])
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)

  const done = (err: string | null, ok: string) => {
    play(err ? 'error' : 'success', { emphasis: 'subtle' })
    setMsg({ text: err ?? ok, bad: Boolean(err) })
    if (!err) {
      setMode(null)
      setName('')
      setCode('')
    }
  }
  const open = (m: 'create' | 'join') => {
    setMsg(null)
    setMode((cur) => (cur === m ? null : m))
  }

  const nobody = !groups.groups.length && !groups.invites.length
  if (nobody && !mode) {
    return (
      <div className="friends soc" onClick={(e) => e.stopPropagation()}>
        <SocialEmpty kind="groups" onPrimary={() => open('create')} onSecondary={() => open('join')} />
      </div>
    )
  }

  const form =
    mode === 'create' ? (
      <form
        className="soc-pane"
        onSubmit={async (e) => {
          e.preventDefault()
          if (name.trim()) done(await groups.create(name, emoji, color), 'Group created')
        }}
      >
        <b className="soc-pane-t">New group</b>
        <div className="friend-add">
          <GroupIcon group={{ emoji, color }} size={34} />
          <input className="todo-input" placeholder="Group name" value={name} maxLength={40} autoFocus data-cuelume-type onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="pill-btn" type="submit" disabled={!name.trim()} data-cuelume-tap>
            Create
          </button>
        </div>
        <IconPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
        <small className={`soc-note ${msg ? (msg.bad ? 'bad' : 'good') : ''}`}>{msg?.text ?? 'You can invite friends, or share the group code, once it exists.'}</small>
      </form>
    ) : mode === 'join' ? (
      <form
        className="soc-pane"
        onSubmit={async (e) => {
          e.preventDefault()
          if (code.trim()) done(await groups.join(code), 'Joined the group')
        }}
      >
        <b className="soc-pane-t">Join a group</b>
        <div className="friend-add">
          <input className="todo-input" placeholder="Invite code or link" value={code} autoFocus data-cuelume-type onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button className="pill-btn" type="submit" disabled={!code.trim()} data-cuelume-tap>
            Join
          </button>
        </div>
        <small className={`soc-note ${msg ? (msg.bad ? 'bad' : 'good') : ''}`}>{msg?.text ?? 'Ask a member to open the group, press Invite and copy the code or link.'}</small>
      </form>
    ) : null

  return (
    <div className="friends soc" onClick={(e) => e.stopPropagation()}>
      <div className="soc-list">
        <div className="soc-lh">
          <span className="soc-h">
            Groups <i>{groups.groups.length}</i>
          </span>
          <span className="soc-lh-btns">
            <button className={`chip soc-add ${mode === 'create' ? 'on' : ''}`} aria-pressed={mode === 'create'} data-cuelume-tap onClick={() => open('create')}>
              <PlusIcon />
              Create
            </button>
            <button className={`chip soc-add ${mode === 'join' ? 'on' : ''}`} aria-pressed={mode === 'join'} data-cuelume-tap onClick={() => open('join')}>
              <LinkIcon />
              Join
            </button>
          </span>
        </div>
        <div className="soc-rows">
          {groups.invites.map((inv) => (
            <div key={inv.group.id} className="soc-row request">
              <GroupIcon group={inv.group} size={26} />
              <span className="friend-meta">
                <b>{inv.group.name}</b>
                <small>{inv.from ? `${nameOf(inv.from)} invited you` : 'You were invited'}</small>
              </span>
              <button className="chip on soc-mini" aria-label={`Accept ${inv.group.name}`} data-cuelume-tap onClick={() => groups.respond(inv.group.id, true)}>
                ✓
              </button>
              <button className="chip soc-mini" aria-label={`Decline ${inv.group.name}`} data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => groups.respond(inv.group.id, false)}>
                ×
              </button>
            </div>
          ))}
          {groups.groups.map((g) => (
            <button
              key={g.id}
              className={`soc-row ${!mode && g.id === selectedId ? 'active' : ''}`}
              data-cuelume-select
              onClick={() => {
                setMode(null)
                onSelect(g.id)
              }}
            >
              <GroupIcon group={g} size={26} />
              <span className="friend-meta">
                <b>{g.name}</b>
                <small>
                  {g.members.length} {g.members.length === 1 ? 'member' : 'members'}
                  {g.owner === me && ' · you own this'}
                </small>
              </span>
              {groups.unread[g.id] > 0 && <span className="badge">{groups.unread[g.id]}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="soc-main">{form ?? chatView ?? <SocialEmpty kind="groups" onPrimary={() => open('create')} onSecondary={() => open('join')} />}</div>
    </div>
  )
}
