import { useCallback, useEffect, useRef, useState } from 'react'
import { BACKEND_READY, supabase, type Message, type MessageKind, type Profile } from './supabase'

export interface Friend {
  friendshipId: number
  profile: Profile
  /** what they are doing right now, if they share it */
  activity: string
}

export interface Request {
  friendshipId: number
  profile: Profile
}

const SEEN_KEY = 'di.chat.seen'

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

interface FriendshipRow {
  id: number
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
}

/** Friends, friend requests, chat and shared activity for the signed-in user. */
export function useSocial(me: string | null, onIncoming?: (m: Message, from: Friend | undefined) => void) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [incoming, setIncoming] = useState<Request[]>([])
  const [outgoing, setOutgoing] = useState<Request[]>([])
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const openChat = useRef<string | null>(null)
  const seen = useRef(loadSeen())
  const incomingCb = useRef(onIncoming)
  incomingCb.current = onIncoming
  const friendsRef = useRef<Friend[]>([])
  friendsRef.current = friends

  const markSeen = useCallback((friendId: string) => {
    seen.current[friendId] = new Date().toISOString()
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen.current))
    } catch {
      /* ignore */
    }
    setUnread((u) => (u[friendId] ? { ...u, [friendId]: 0 } : u))
  }, [])

  const refresh = useCallback(async () => {
    if (!me || !BACKEND_READY) return
    const { data: rows } = await supabase
      .from('friendships')
      .select('id, requester, addressee, status')
      .or(`requester.eq.${me},addressee.eq.${me}`)
    const list = (rows ?? []) as FriendshipRow[]
    const otherOf = (r: FriendshipRow) => (r.requester === me ? r.addressee : r.requester)
    const ids = [...new Set(list.map(otherOf))]
    if (!ids.length) {
      setFriends([])
      setIncoming([])
      setOutgoing([])
      return
    }
    const [{ data: profs }, { data: acts }] = await Promise.all([
      supabase.from('profiles').select('*').in('id', ids),
      supabase.from('activity').select('user_id, text, updated_at').in('user_id', ids),
    ])
    const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))
    // an activity older than 10 minutes is stale (the app was closed)
    const fresh = Date.now() - 10 * 60_000
    const act = new Map(
      ((acts ?? []) as { user_id: string; text: string; updated_at: string }[])
        .filter((a) => a.text && Date.parse(a.updated_at) > fresh)
        .map((a) => [a.user_id, a.text]),
    )
    const out: Friend[] = []
    const inc: Request[] = []
    const sent: Request[] = []
    for (const r of list) {
      const profile = byId.get(otherOf(r))
      if (!profile) continue
      if (r.status === 'accepted') out.push({ friendshipId: r.id, profile, activity: act.get(profile.id) ?? '' })
      else if (r.addressee === me) inc.push({ friendshipId: r.id, profile })
      else sent.push({ friendshipId: r.id, profile })
    }
    setFriends(out)
    setIncoming(inc)
    setOutgoing(sent)

    // unread = messages the database has not marked read and that are newer than the last time this device
    // opened the chat (read_at lives on the account, so signing out and in again does not bring them back)
    const { data: recent } = await supabase
      .from('messages')
      .select('sender, created_at')
      .eq('recipient', me)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    const counts: Record<string, number> = {}
    for (const m of (recent ?? []) as { sender: string; created_at: string }[]) {
      if (m.created_at > (seen.current[m.sender] ?? '')) counts[m.sender] = (counts[m.sender] ?? 0) + 1
    }
    setUnread(counts)
  }, [me])

  useEffect(() => {
    if (!me || !BACKEND_READY) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const poll = setInterval(refresh, 60_000)
    const channel = supabase
      .channel(`social-${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity' }, () => refresh())
      // a friend changed their availability
      // (heartbeats arrive here too, so a known friend is patched in place instead of reloading everything)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const p = payload.new as Profile
        if (friendsRef.current.some((f) => f.profile.id === p.id)) {
          setFriends((cur) => cur.map((f) => (f.profile.id === p.id ? { ...f, profile: p } : f)))
        } else refresh()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message
        if (m.sender !== me && m.recipient !== me) return
        const friendId = m.sender === me ? m.recipient : m.sender
        setMessages((cur) =>
          cur[friendId] && !cur[friendId].some((x) => x.id === m.id) ? { ...cur, [friendId]: [...cur[friendId], m] } : cur,
        )
        if (m.sender !== me) {
          incomingCb.current?.(m, friendsRef.current.find((f) => f.profile.id === friendId))
          if (openChat.current === friendId) {
            markSeen(friendId)
            supabase.rpc('mark_read', { friend: friendId }).then(() => {})
          }
          else setUnread((u) => ({ ...u, [friendId]: (u[friendId] ?? 0) + 1 }))
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        // the friend opened the chat: our messages to them get their double tick
        const m = payload.new as Message
        if (m.sender !== me) return
        setMessages((cur) =>
          cur[m.recipient] ? { ...cur, [m.recipient]: cur[m.recipient].map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)) } : cur,
        )
      })
      .subscribe()
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [me, refresh, markSeen])

  const addFriend = useCallback(
    async (username: string): Promise<string | null> => {
      if (!me) return 'Not signed in'
      const name = username.trim().replace(/^@/, '').toLowerCase()
      if (!name) return 'Enter a username'
      const { data: target } = await supabase.from('profiles').select('id').eq('username', name).maybeSingle()
      if (!target) return `No one is called @${name}`
      if (target.id === me) return "That's you"
      const { error } = await supabase.from('friendships').insert({ requester: me, addressee: target.id })
      if (error) return error.code === '23505' ? 'Already requested' : error.message
      await refresh()
      return null
    },
    [me, refresh],
  )

  const accept = useCallback(
    async (friendshipId: number) => {
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (friendshipId: number) => {
      await supabase.from('friendships').delete().eq('id', friendshipId)
      await refresh()
    },
    [refresh],
  )

  const open = useCallback(
    async (friendId: string | null) => {
      openChat.current = friendId
      if (!friendId || !me) return
      markSeen(friendId)
      supabase.rpc('mark_read', { friend: friendId }).then(() => {})
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender.eq.${me},recipient.eq.${friendId}),and(sender.eq.${friendId},recipient.eq.${me})`)
        .order('created_at', { ascending: false })
        .limit(60)
      setMessages((cur) => ({ ...cur, [friendId]: ((data ?? []) as Message[]).reverse() }))
    },
    [me, markSeen],
  )

  const send = useCallback(
    async (to: string, kind: MessageKind, body: string): Promise<string | null> => {
      if (!me) return 'Not signed in'
      const text = body.trim().slice(0, 2000)
      if (!text) return null
      const { data, error } = await supabase
        .from('messages')
        .insert({ sender: me, recipient: to, kind, body: text })
        .select()
        .single()
      if (error) return error.message
      const m = data as Message
      setMessages((cur) => (cur[to]?.some((x) => x.id === m.id) ? cur : { ...cur, [to]: [...(cur[to] ?? []), m] }))
      return null
    },
    [me],
  )

  /** Publishes (or with null, clears) what the user is doing so friends can see it. */
  const publishActivity = useCallback(
    async (text: string | null) => {
      if (!me || !BACKEND_READY) return
      if (text) await supabase.from('activity').upsert({ user_id: me, text, updated_at: new Date().toISOString() })
      else await supabase.from('activity').delete().eq('user_id', me)
    },
    [me],
  )

  return { friends, incoming, outgoing, messages, unread, addFriend, accept, remove, open, send, publishActivity }
}

export type Social = ReturnType<typeof useSocial>
