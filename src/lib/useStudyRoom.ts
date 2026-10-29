import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { BACKEND_READY, supabase, type Profile } from './supabase'
import type { Group } from './useGroups'

/** One person's seat in a group's study room; everyone in the room shares the host's clock. */
interface Seat {
  id: string
  endsAt: number
  total: number
  task: string
  /** when this person sat down, so the earliest seat is the host's */
  joined: number
}

export interface StudyRoom {
  gid: string
  endsAt: number
  total: number
  task: string
  /** who started it */
  host: string
  /** everyone in it */
  members: string[]
}

/**
 * Study rooms: a shared focus timer per group. Every member listens on `study-<group id>`; sitting down
 * tracks your presence there with the room's end time, so anyone who joins later lands on the same clock.
 * The room is gone when the last person leaves (presence drops on its own if the app closes).
 */
export function useStudyRoom(me: string | null, groups: Group[], onOpened?: (room: StudyRoom, group: Group, host: Profile | undefined) => void) {
  const [rooms, setRooms] = useState<Record<string, StudyRoom>>({})
  const channels = useRef(new Map<string, RealtimeChannel>())
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const openedCb = useRef(onOpened)
  openedCb.current = onOpened
  const known = useRef(new Set<string>())
  const ids = groups
    .map((g) => g.id)
    .sort()
    .join(',')

  useEffect(() => {
    if (!me || !BACKEND_READY || !ids) return
    const map = channels.current
    for (const gid of ids.split(',')) {
      const channel = supabase.channel(`study-${gid}`, { config: { presence: { key: me } } })
      channel
        .on('presence', { event: 'sync' }, () => {
          const seats = Object.values(channel.presenceState<Seat>()).flatMap((metas) => metas.slice(-1))
          setRooms((cur) => {
            const next = { ...cur }
            if (!seats.length) {
              delete next[gid]
              known.current.delete(gid)
              return next
            }
            const host = [...seats].sort((a, b) => a.joined - b.joined)[0]
            const room: StudyRoom = { gid, endsAt: host.endsAt, total: host.total, task: host.task, host: host.id, members: seats.map((s) => s.id) }
            next[gid] = room
            if (!known.current.has(gid)) {
              known.current.add(gid)
              const group = groupsRef.current.find((g) => g.id === gid)
              if (group && host.id !== me && host.endsAt > Date.now()) {
                openedCb.current?.(room, group, group.members.find((m) => m.id === host.id))
              }
            }
            return next
          })
        })
        .subscribe()
      map.set(gid, channel)
    }
    return () => {
      map.forEach((c) => void supabase.removeChannel(c))
      map.clear()
      known.current.clear()
      setRooms({})
    }
  }, [me, ids])

  /** sit down in a group's room; `clock` is given when you start it, and left out when you join one that is running */
  const join = useCallback(
    (gid: string, clock?: { endsAt: number; total: number; task: string }) => {
      const channel = channels.current.get(gid)
      if (!channel || !me) return
      const room = rooms[gid]
      const c = clock ?? (room ? { endsAt: room.endsAt, total: room.total, task: room.task } : null)
      if (!c) return
      const seat: Seat = { id: me, ...c, joined: Date.now() }
      void channel.track(seat)
    },
    [me, rooms],
  )

  const leave = useCallback((gid: string) => {
    void channels.current.get(gid)?.untrack()
  }, [])

  return { rooms, join, leave }
}
