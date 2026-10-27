import { Fragment, useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import type { Message } from '../lib/supabase'
import { inviteLink, type Group, type GroupMessage, type Groups } from '../lib/useGroups'
import { disclosureCue } from '../lib/sound'
import { ACCENTS } from '../lib/settings'
import { Avatar } from './Avatar'
import { dayLabel, dayStart, noteText, timeLabel } from './FriendsWidget'

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

function GroupBubble({ m, mine, group }: { m: GroupMessage; mine: boolean; group: Group }) {
  const from = group.members.find((p) => p.id === m.sender)
  return (
    <div className={`msg ${mine ? 'mine' : ''} ${m.kind}`}>
      {!mine && <small>{from ? from.display_name || `@${from.username}` : 'Former member'}</small>}
      {m.kind === 'activity' && <small>Activity</small>}
      {m.kind === 'note' && <small>Note</small>}
      <span>{m.body}</span>
      <time>
        <span className="t">{timeLabel(m.created_at)}</span>
      </time>
    </div>
  )
}

function GroupInfo({ group, me, groups, onLeft }: { group: Group; me: string; groups: Groups; onLeft: () => void }) {
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const isOwner = group.owner === me
  const [editing, setEditing] = useState(false)
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
          <Avatar profile={p} size={26} />
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

export function GroupChat({ group, me, groups, activityText, onBack, fullscreen, onFullscreen }: { group: Group; me: string; groups: Groups; activityText: string; onBack: () => void; fullscreen?: boolean; onFullscreen?: (on: boolean) => void }) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [info, setInfo] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const list = groups.messages[group.id]
  const { open } = groups

  useEffect(() => {
    open(group.id)
    return () => {
      open(null)
    }
  }, [group.id, open])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [list?.length, info])

  const send = async (kind: Message['kind'], body: string) => {
    const e = await groups.send(group.id, kind, body)
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
        <GroupIcon group={group} size={22} />
        <b>{group.name}</b>
        <small className="handle">{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</small>
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
                  <GroupBubble m={m} mine={m.sender === me} group={group} />
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
            <input
              className="todo-input"
              placeholder="Message the group…"
              value={draft}
              data-cuelume-type
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
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

      <div className="chat-share">
        <button className={`chip ${mode === 'create' ? 'on' : ''}`} {...disclosureCue(mode === 'create')} onClick={() => setMode(mode === 'create' ? null : 'create')}>
          New group
        </button>
        <button className={`chip ${mode === 'join' ? 'on' : ''}`} {...disclosureCue(mode === 'join')} onClick={() => setMode(mode === 'join' ? null : 'join')}>
          Join with code
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

      {!groups.groups.length && !groups.invites.length && <div className="empty">No groups yet. Create one or join with an invite code.</div>}
    </div>
  )
}
