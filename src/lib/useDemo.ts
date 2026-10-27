import { useCallback, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Message, MessageKind, Profile } from './supabase'
import type { Auth } from './useAuth'
import type { Friend, Request, Social } from './useSocial'

/** Open the browser demo with `?demo` to try accounts, friends and chat with made-up data. */
export const DEMO_SOCIAL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

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
  c: [],
})

/** In-memory stand-ins for useAuth and useSocial. Messages get a canned reply after a moment. */
export function useDemo(): { auth: Auth; social: Social; ping: () => { friend: Friend; body: string } } {
  const [profile, setProfile] = useState<Profile>(ME)
  const [messages, setMessages] = useState<Record<string, Message[]>>(seed)
  const [unread, setUnread] = useState<Record<string, number>>({ a: 1, b: 1 })
  const [incoming, setIncoming] = useState<Request[]>([{ friendshipId: 900, profile: requester }])
  const [extra, setExtra] = useState<Friend[]>([])
  const [outgoing, setOutgoing] = useState<Request[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const opened = useRef<string | null>(null)

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

  return { auth, social, ping }
}
