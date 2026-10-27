import { useCallback, useEffect, useRef, useState } from 'react'
import { BACKEND_READY, supabase, type MessageKind, type Profile } from './supabase'

export interface Group {
  id: string
  name: string
  emoji: string
  color: string
  owner: string
  inviteCode: string
  members: Profile[]
}

export interface GroupInvite {
  group: { id: string; name: string; emoji: string; color: string }
  /** who added you */
  from: Profile | null
}

export interface GroupMessage {
  id: number
  group_id: string
  sender: string
  kind: MessageKind
  body: string
  created_at: string
}

interface GroupRow {
  id: string
  name: string
  emoji: string
  color: string
  owner: string
  invite_code: string
}

interface MemberRow {
  group_id: string
  user_id: string
  status: 'invited' | 'member'
  invited_by: string | null
}

const SEEN_KEY = 'di.groups.seen'

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** The text people share to invite someone; joinCode() understands it back. */
export const inviteLink = (code: string) => `dynamicisland://join/${code}`

/** Accepts a bare code or a pasted invite link and returns the code. */
export function joinCode(input: string): string {
  const t = input.trim().replace(/[/?#\s]+$/, '')
  return (t.split(/[/=]/).pop() ?? '').toUpperCase()
}

/** Group chats: the groups you are in, invitations waiting for an answer, and group messages. */
export function useGroups(me: string | null, onIncoming?: (m: GroupMessage, group: Group | undefined, from: Profile | undefined) => void) {
  const [groups, setGroups] = useState<Group[]>([])
  const [invites, setInvites] = useState<GroupInvite[]>([])
  const [messages, setMessages] = useState<Record<string, GroupMessage[]>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const openGroup = useRef<string | null>(null)
  const seen = useRef(loadSeen())
  const incomingCb = useRef(onIncoming)
  incomingCb.current = onIncoming
  const groupsRef = useRef<Group[]>([])
  groupsRef.current = groups

  const markSeen = useCallback((gid: string) => {
    seen.current[gid] = new Date().toISOString()
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen.current))
    } catch {
      /* ignore */
    }
    setUnread((u) => (u[gid] ? { ...u, [gid]: 0 } : u))
  }, [])

  const refresh = useCallback(async () => {
    if (!me || !BACKEND_READY) return
    const [{ data: gs }, { data: ms }] = await Promise.all([
      supabase.from('groups').select('id, name, emoji, color, owner, invite_code'),
      supabase.from('group_members').select('group_id, user_id, status, invited_by'),
    ])
    const groupRows = (gs ?? []) as GroupRow[]
    const memberRows = (ms ?? []) as MemberRow[]
    const ids = [...new Set(memberRows.flatMap((r) => (r.invited_by ? [r.user_id, r.invited_by] : [r.user_id])))]
    const { data: profs } = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [] }
    const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]))

    const mine = new Map(memberRows.filter((r) => r.user_id === me).map((r) => [r.group_id, r]))
    const joined: Group[] = []
    const pending: GroupInvite[] = []
    for (const g of groupRows) {
      const row = mine.get(g.id)
      if (!row) continue
      if (row.status === 'member') {
        joined.push({
          id: g.id,
          name: g.name,
          emoji: g.emoji,
          color: g.color,
          owner: g.owner,
          inviteCode: g.invite_code,
          // the people who have not answered yet are not in the group
          members: memberRows.filter((r) => r.group_id === g.id && r.status === 'member').flatMap((r) => byId.get(r.user_id) ?? []),
        })
      } else {
        pending.push({ group: { id: g.id, name: g.name, emoji: g.emoji, color: g.color }, from: (row.invited_by && byId.get(row.invited_by)) || null })
      }
    }
    setGroups(joined)
    setInvites(pending)

    if (joined.length) {
      const { data: recent } = await supabase
        .from('group_messages')
        .select('group_id, sender, created_at')
        .in('group_id', joined.map((g) => g.id))
        .neq('sender', me)
        .order('created_at', { ascending: false })
        .limit(200)
      const counts: Record<string, number> = {}
      for (const m of (recent ?? []) as { group_id: string; created_at: string }[]) {
        if (m.created_at > (seen.current[m.group_id] ?? '')) counts[m.group_id] = (counts[m.group_id] ?? 0) + 1
      }
      setUnread(counts)
    } else setUnread({})
  }, [me])

  useEffect(() => {
    if (!me || !BACKEND_READY) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const poll = setInterval(refresh, 60_000)
    const channel = supabase
      .channel(`groups-${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, (payload) => {
        const m = payload.new as GroupMessage
        const group = groupsRef.current.find((g) => g.id === m.group_id)
        // realtime also delivers rows for groups we are not in only if policies allow it; ignore those
        if (!group) return
        setMessages((cur) =>
          cur[m.group_id] && !cur[m.group_id].some((x) => x.id === m.id) ? { ...cur, [m.group_id]: [...cur[m.group_id], m] } : cur,
        )
        if (m.sender === me) return
        incomingCb.current?.(m, group, group.members.find((p) => p.id === m.sender))
        if (openGroup.current === m.group_id) markSeen(m.group_id)
        else setUnread((u) => ({ ...u, [m.group_id]: (u[m.group_id] ?? 0) + 1 }))
      })
      .subscribe()
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [me, refresh, markSeen])

  const create = useCallback(
    async (name: string, emoji: string, color: string): Promise<string | null> => {
      if (!me) return 'Not signed in'
      const n = name.trim()
      if (!n) return 'Give the group a name'
      const { error } = await supabase.rpc('create_group', { group_name: n.slice(0, 40), group_emoji: emoji.trim() || '👥', group_color: color })
      if (error) return error.message
      await refresh()
      return null
    },
    [me, refresh],
  )

  /** Join with an invite code or a pasted invite link. */
  const join = useCallback(
    async (input: string): Promise<string | null> => {
      const code = joinCode(input)
      if (!code) return 'Enter an invite code or link'
      const { error } = await supabase.rpc('join_group', { code })
      if (error) return error.message
      await refresh()
      return null
    },
    [refresh],
  )

  /** The owner adds someone by username; they still have to accept. */
  const invite = useCallback(async (groupId: string, username: string): Promise<string | null> => {
    const name = username.trim().replace(/^@/, '').toLowerCase()
    if (!name) return 'Enter a username'
    const { error } = await supabase.rpc('invite_to_group', { gid: groupId, uname: name })
    return error ? error.message : null
  }, [])

  const respond = useCallback(
    async (groupId: string, accept: boolean) => {
      await supabase.rpc('respond_group_invite', { gid: groupId, accept })
      await refresh()
    },
    [refresh],
  )

  /** Leave the group (a member) or remove someone (the owner). */
  const removeMember = useCallback(
    async (groupId: string, userId: string) => {
      await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
      await refresh()
    },
    [refresh],
  )

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await supabase.from('groups').delete().eq('id', groupId)
      await refresh()
    },
    [refresh],
  )

  /** The owner renames the group. */
  const rename = useCallback(
    async (groupId: string, name: string): Promise<string | null> => {
      const n = name.trim().slice(0, 40)
      if (!n) return 'Give the group a name'
      const { error } = await supabase.from('groups').update({ name: n }).eq('id', groupId)
      if (error) return error.message
      await refresh()
      return null
    },
    [refresh],
  )

  /** The owner changes the group's icon. */
  const setIcon = useCallback(
    async (groupId: string, emoji: string, color: string): Promise<string | null> => {
      const { error } = await supabase.from('groups').update({ emoji, color }).eq('id', groupId)
      if (error) return error.message
      await refresh()
      return null
    },
    [refresh],
  )

  const resetCode = useCallback(
    async (groupId: string): Promise<string | null> => {
      const { error } = await supabase.rpc('reset_invite_code', { gid: groupId })
      if (error) return error.message
      await refresh()
      return null
    },
    [refresh],
  )

  const open = useCallback(
    async (groupId: string | null) => {
      openGroup.current = groupId
      if (!groupId || !me) return
      markSeen(groupId)
      const { data } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(60)
      setMessages((cur) => ({ ...cur, [groupId]: ((data ?? []) as GroupMessage[]).reverse() }))
    },
    [me, markSeen],
  )

  const send = useCallback(
    async (groupId: string, kind: MessageKind, body: string): Promise<string | null> => {
      if (!me) return 'Not signed in'
      const text = body.trim().slice(0, 2000)
      if (!text) return null
      const { data, error } = await supabase.from('group_messages').insert({ group_id: groupId, sender: me, kind, body: text }).select().single()
      if (error) return error.message
      const m = data as GroupMessage
      setMessages((cur) => (cur[groupId]?.some((x) => x.id === m.id) ? cur : { ...cur, [groupId]: [...(cur[groupId] ?? []), m] }))
      return null
    },
    [me],
  )

  return { groups, invites, messages, unread, create, join, invite, respond, removeMember, deleteGroup, rename, setIcon, resetCode, open, send }
}

export type Groups = ReturnType<typeof useGroups>
