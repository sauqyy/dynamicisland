import { useCallback, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { BACKEND_READY, type Message, type MessageKind, type Profile } from './supabase'
import type { Auth } from './useAuth'
import type { Friend, Request, Social } from './useSocial'
import type { Call, CallState } from './useCall'
import { MAX_VOICE, type GroupVoice, type VoiceState } from './useGroupVoice'
import { joinCode, type Group, type GroupInvite, type GroupMessage, type GroupReads, type Groups } from './useGroups'

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const IN_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Accounts, friends and chat with made-up data. On by itself in the browser dev server when no
 * Supabase project is configured (there is nothing real to talk to), and anywhere with `?demo`.
 * `?nodemo` turns the automatic one off.
 */
export const DEMO_SOCIAL =
  params !== null && (params.has('demo') || (import.meta.env.DEV && !BACKEND_READY && !IN_TAURI && !params.has('nodemo')))

const ME: Profile = {
  id: 'me',
  username: 'you',
  display_name: 'You',
  avatar_emoji: '😎',
  avatar_color: '#60a5fa',
  avatar_url: null,
  status: '📚 Studying',
  presence: 'online',
}

const people: Profile[] = [
  { id: 'a', username: 'zhillan', display_name: 'Zhillan', avatar_emoji: '🦊', avatar_color: '#fb923c', avatar_url: null, status: '💻 Working', presence: 'online' },
  { id: 'b', username: 'mira_k', display_name: 'Mira', avatar_emoji: '🐼', avatar_color: '#f472b6', avatar_url: null, status: '', presence: 'idle' },
  { id: 'c', username: 'dev_ardi', display_name: 'Ardi', avatar_emoji: '🎧', avatar_color: '#c084fc', avatar_url: null, status: '🎮 Gaming', presence: 'dnd' },
  { id: 'e', username: 'kaito', display_name: 'Kaito', avatar_emoji: '🐙', avatar_color: '#60a5fa', avatar_url: null, status: '', presence: 'invisible' },
]
const requester: Profile = { id: 'd', username: 'nadia', display_name: 'Nadia', avatar_emoji: '🌙', avatar_color: '#2dd4bf', avatar_url: null, status: '' }

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
let nextId = 100

const seed = (): Record<string, Message[]> => ({
  a: [
    { id: 6, sender: 'a', recipient: 'me', kind: 'text', body: 'long time no see!', created_at: ago(60 * 24 * 4) },
    { id: 7, sender: 'me', recipient: 'a', kind: 'text', body: 'haha yeah, been busy', created_at: ago(60 * 30), read_at: ago(60 * 29) },
    { id: 1, sender: 'a', recipient: 'me', kind: 'text', body: 'yo, did you see the new island update?', created_at: ago(42) },
    { id: 2, sender: 'me', recipient: 'a', kind: 'text', body: 'yes!! the drag and snap feels so good', created_at: ago(40), read_at: ago(39) },
    { id: 3, sender: 'a', recipient: 'me', kind: 'activity', body: '🎵 Liquid Skies – Demo Artist', created_at: ago(12) },
    { id: 4, sender: 'a', recipient: 'me', kind: 'note', body: 'To buy: milk, eggs, coffee beans\nCall mom at 7', created_at: ago(5) },
  ],
  b: [{ id: 5, sender: 'b', recipient: 'me', kind: 'text', body: 'are you free tonight?', created_at: ago(180) }],
  c: [
    { id: 8, sender: 'c', recipient: 'me', kind: 'text', body: 'gg last night 🎮', created_at: ago(60 * 26) },
    { id: 9, sender: 'me', recipient: 'c', kind: 'text', body: 'rematch this weekend?', created_at: ago(60 * 25), read_at: ago(60 * 25) },
    { id: 10, sender: 'c', recipient: 'me', kind: 'text', body: 'deal, saturday after lunch', created_at: ago(60 * 24) },
  ],
})

/** In-memory stand-ins for useAuth and useSocial. Messages get a canned reply after a moment. */
export function useDemo(): { auth: Auth; social: Social; groups: Groups; call: Call; voice: GroupVoice; ping: () => { friend: Friend; body: string }; ringCall: () => void; groupRing: string | null; ringGroupCall: () => void; answerGroupRing: () => void; declineGroupRing: () => void } {
  const [profile, setProfile] = useState<Profile>(ME)
  const [messages, setMessages] = useState<Record<string, Message[]>>(seed)
  const [unread, setUnread] = useState<Record<string, number>>({ a: 1, b: 1 })
  const [incoming, setIncoming] = useState<Request[]>([{ friendshipId: 900, profile: requester }])
  const [extra, setExtra] = useState<Friend[]>([])
  const [outgoing, setOutgoing] = useState<Request[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const opened = useRef<string | null>(null)

  const [groupList, setGroupList] = useState<Group[]>(() => [
    { id: 'g1', name: 'Study crew', emoji: '📚', color: '#60a5fa', owner: 'a', inviteCode: 'STUDY123', members: [ME, people[0], people[1]] },
  ])
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([{ group: { id: 'g2', name: 'Weekend gaming', emoji: '🎮', color: '#c084fc' }, from: people[2] }])
  const [groupMsgs, setGroupMsgs] = useState<Record<string, GroupMessage[]>>({
    g1: [
      { id: 1, group_id: 'g1', sender: 'a', kind: 'text', body: 'exam prep tonight?', created_at: ago(90) },
      { id: 2, group_id: 'g1', sender: 'b', kind: 'text', body: 'yes! library at 7', created_at: ago(80) },
    ],
  })
  const [groupUnread, setGroupUnread] = useState<Record<string, number>>({ g1: 2 })
  // who has read how far; people catch up a moment after you send
  const [groupReads, setGroupReads] = useState<GroupReads>({ g1: { a: 2, b: 1 } })

  const friends: Friend[] = [
    ...people.map((p, i) => ({
      friendshipId: i + 1,
      profile: p,
      activity: p.id === 'a' ? '🎵 Liquid Skies – Demo Artist' : p.id === 'c' ? '🎮 Gaming' : '',
    })),
    ...extra,
  ].filter((f) => !removed.includes(f.profile.id))

  const push = useCallback((m: Message) => {
    const peer = m.sender === 'me' ? m.recipient : m.sender
    setMessages((cur) => ({ ...cur, [peer]: [...(cur[peer] ?? []), m] }))
  }, [])

  const send = useCallback(
    async (to: string, kind: MessageKind, body: string) => {
      const text = body.trim()
      if (!text) return null
      const id = nextId++
      push({ id, sender: 'me', recipient: to, kind, body: text, created_at: new Date().toISOString(), read_at: null })
      // the friend "opens the chat" a moment later: one tick becomes two blue ticks
      setTimeout(() => {
        setMessages((cur) => ({ ...cur, [to]: (cur[to] ?? []).map((m) => (m.id === id ? { ...m, read_at: new Date().toISOString() } : m)) }))
      }, 1100)
      const replies: Record<MessageKind, string> = { text: 'haha nice 😄', activity: 'oh cool, nice taste!', note: 'thanks, saved it 📝' }
      setTimeout(() => {
        push({ id: nextId++, sender: to, recipient: 'me', kind: 'text', body: replies[kind], created_at: new Date().toISOString() })
        if (opened.current !== to) setUnread((u) => ({ ...u, [to]: (u[to] ?? 0) + 1 }))
      }, 1600)
      return null
    },
    [push],
  )

  // stable identity: the chat effect depends on it
  const open = useCallback(async (id: string | null) => {
    opened.current = id
    if (id) setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u))
  }, [])

  /** Simulates a friend writing to you right now. */
  const ping = () => {
    const friend = friends[Math.floor(Math.random() * friends.length)]
    const lines = ['are you free tonight?', 'check this out 👀', 'lol you have to see this', 'on my way!', 'did you finish the project?']
    const body = lines[Math.floor(Math.random() * lines.length)]
    push({ id: nextId++, sender: friend.profile.id, recipient: 'me', kind: 'text', body, created_at: new Date().toISOString() })
    if (opened.current !== friend.profile.id) setUnread((u) => ({ ...u, [friend.profile.id]: (u[friend.profile.id] ?? 0) + 1 }))
    return { friend, body }
  }

  const auth: Auth = {
    user: { id: 'me', email: 'you@example.com' } as User,
    profile,
    loading: false,
    signIn: async () => null,
    signUp: async () => null,
    signInWithGoogle: async () => null,
    signOut: async () => {},
    saveProfile: async (patch) => {
      setProfile((p) => ({ ...p, ...patch }))
      return null
    },
  }

  const social: Social = {
    friends,
    incoming,
    outgoing,
    messages,
    unread,
    addFriend: async (username) => {
      const name = username.trim().replace(/^@/, '').toLowerCase()
      if (!name) return 'Enter a username'
      setOutgoing((o) => [
        ...o,
        { friendshipId: nextId++, profile: { ...requester, id: `x${nextId}`, username: name, display_name: '', avatar_emoji: '🙂' } },
      ])
      return null
    },
    accept: async (id) => {
      const r = incoming.find((x) => x.friendshipId === id)
      if (r) setExtra((e) => [...e, { friendshipId: id, profile: r.profile, activity: '' }])
      setIncoming((i) => i.filter((x) => x.friendshipId !== id))
    },
    remove: async (id) => {
      setIncoming((i) => i.filter((x) => x.friendshipId !== id))
      setOutgoing((o) => o.filter((x) => x.friendshipId !== id))
      const f = friends.find((x) => x.friendshipId === id)
      if (f) setRemoved((r) => [...r, f.profile.id])
    },
    open,
    send,
    publishActivity: async () => {},
  }

  const groups: Groups = {
    groups: groupList,
    invites: groupInvites,
    messages: groupMsgs,
    unread: groupUnread,
    reads: groupReads,
    create: async (name, emoji, color) => {
      if (!name.trim()) return 'Give the group a name'
      const id = `g${nextId++}`
      setGroupList((l) => [...l, { id, name: name.trim(), emoji: emoji || '👥', color, owner: 'me', inviteCode: id.toUpperCase().padEnd(8, 'X'), members: [ME] }])
      return null
    },
    join: async (input) => {
      if (joinCode(input) !== 'STUDY123' && joinCode(input) !== 'JOIN2025') return 'That invite code does not exist (try JOIN2025)'
      setGroupList((l) => [...l, { id: `g${nextId++}`, name: 'Design club', emoji: '🎨', color: '#f472b6', owner: 'e', inviteCode: 'JOIN2025', members: [ME, people[3]] }])
      return null
    },
    invite: async (gid, username) => {
      if (!username.trim()) return 'Enter a username'
      const p: Profile = { ...requester, id: `x${nextId++}`, username: username.trim().replace(/^@/, ''), display_name: '', avatar_emoji: '🙂' }
      setGroupList((l) => l.map((g) => (g.id === gid ? { ...g, members: [...g.members, p] } : g)))
      return null
    },
    respond: async (gid, accept) => {
      const inv = groupInvites.find((i) => i.group.id === gid)
      setGroupInvites((l) => l.filter((i) => i.group.id !== gid))
      if (inv && accept) setGroupList((l) => [...l, { ...inv.group, owner: 'c', inviteCode: 'GAME4567', members: [ME, people[2]] }])
    },
    removeMember: async (gid, uid) => {
      if (uid === 'me') setGroupList((l) => l.filter((g) => g.id !== gid))
      else setGroupList((l) => l.map((g) => (g.id === gid ? { ...g, members: g.members.filter((p) => p.id !== uid) } : g)))
    },
    rename: async (gid, name) => {
      if (!name.trim()) return 'Give the group a name'
      setGroupList((l) => l.map((g) => (g.id === gid ? { ...g, name: name.trim() } : g)))
      return null
    },
    setIcon: async (gid, emoji, color) => {
      setGroupList((l) => l.map((g) => (g.id === gid ? { ...g, emoji, color } : g)))
      return null
    },
    deleteGroup: async (gid) => setGroupList((l) => l.filter((g) => g.id !== gid)),
    resetCode: async (gid) => {
      setGroupList((l) => l.map((g) => (g.id === gid ? { ...g, inviteCode: 'NEW' + String(nextId++).padStart(5, '0') } : g)))
      return null
    },
    open: async (gid) => {
      if (gid) setGroupUnread((u) => (u[gid] ? { ...u, [gid]: 0 } : u))
    },
    send: async (gid, kind, body) => {
      const text = body.trim()
      if (!text) return null
      const id = nextId++
      setGroupMsgs((c) => ({ ...c, [gid]: [...(c[gid] ?? []), { id, group_id: gid, sender: 'me', kind, body: text, created_at: new Date().toISOString() }] }))
      const readBy = (who: string) => setGroupReads((r) => ({ ...r, [gid]: { ...r[gid], [who]: id } }))
      setTimeout(() => readBy('a'), 900)
      setTimeout(() => readBy('b'), 2600)
      setTimeout(() => {
        setGroupMsgs((c) => ({ ...c, [gid]: [...(c[gid] ?? []), { id: nextId++, group_id: gid, sender: 'a', kind: 'text', body: 'sounds good 👍', created_at: new Date().toISOString() }] }))
      }, 1400)
      return null
    },
  }

  // a scripted call: rings, connects, then runs until ended. No microphone, no audio.
  const [callState, setCallState] = useState<CallState>({ phase: 'idle', peer: null, muted: false, deafened: false, since: null, error: null })
  const callTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const endCall = () => {
    callTimers.current.forEach(clearTimeout)
    callTimers.current = []
    setCallState({ phase: 'idle', peer: null, muted: false, deafened: false, since: null, error: null })
  }
  const call: Call = {
    state: callState,
    start: async (peer) => {
      setCallState({ phase: 'calling', peer, muted: false, deafened: false, since: null, error: null })
      callTimers.current = [
        setTimeout(() => setCallState((c) => ({ ...c, phase: 'connecting' })), 1500),
        setTimeout(() => setCallState((c) => ({ ...c, phase: 'active', since: Date.now() })), 2500),
      ]
    },
    accept: async () => {
      setCallState((c) => ({ ...c, phase: 'connecting' }))
      callTimers.current = [setTimeout(() => setCallState((c) => ({ ...c, phase: 'active', since: Date.now() })), 1200)]
    },
    decline: endCall,
    hangUp: endCall,
    toggleMute: () => setCallState((c) => ({ ...c, muted: !c.muted, deafened: c.muted ? false : c.deafened })),
    toggleDeafen: () => setCallState((c) => ({ ...c, deafened: !c.deafened, muted: !c.deafened })),
    micStream: () => null,
  }

  /** Simulates a friend calling you right now. */
  const ringCall = () => {
    if (callState.phase !== 'idle') return
    setCallState({ phase: 'incoming', peer: people[0].id, muted: false, deafened: false, since: null, error: null })
  }

  // scripted group voice: you and two members of the group, no audio
  const noVoice: VoiceState = { groupId: null, joining: false, members: [], muted: false, deafened: false, since: null, error: null }
  const [voiceState, setVoiceState] = useState<VoiceState>(noVoice)
  const voice: GroupVoice = {
    state: voiceState,
    join: async (gid) => {
      setVoiceState({ ...noVoice, groupId: gid, joining: true })
      setTimeout(() => setVoiceState((v) => (v.groupId === gid ? { ...v, joining: false, members: ['me', 'a', 'b'].slice(0, MAX_VOICE), since: Date.now() } : v)), 1200)
    },
    leave: () => setVoiceState(noVoice),
    toggleMute: () => setVoiceState((v) => ({ ...v, muted: !v.muted, deafened: v.muted ? false : v.deafened })),
    toggleDeafen: () => setVoiceState((v) => ({ ...v, deafened: !v.deafened, muted: !v.deafened })),
    micStream: () => null,
  }

  // a group's voice chat ringing: the group's id while it rings
  const [groupRing, setGroupRing] = useState<string | null>(null)
  const ringGroupCall = () => {
    if (callState.phase !== 'idle' || voiceState.groupId) return
    setGroupRing(groupList[0]?.id ?? null)
  }
  const answerGroupRing = () => {
    const gid = groupRing
    setGroupRing(null)
    if (gid) void voice.join(gid)
  }
  const declineGroupRing = () => setGroupRing(null)

  return { auth, social, groups, call, voice, ping, ringCall, groupRing, ringGroupCall, answerGroupRing, declineGroupRing }
}
