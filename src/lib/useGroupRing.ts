import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { BACKEND_READY, supabase, type Profile } from './supabase'
import type { Group } from './useGroups'

/** How long a group voice chat rings before it gives up on its own. */
const RING_MS = 30_000

interface RingSignal {
  from: string
  gid: string
}

export interface GroupRingState {
  gid: string
  from: string
}

/**
 * Ringing a group when someone starts its voice chat. Every member listens on `ring-<group id>`
 * (its own topic: supabase-js hands back the same channel for the same topic, so it can't share
 * `voice-<group id>` with the call). Whoever opens an empty room sends `start`; leaving while still
 * alone sends `stop`. A ring also stops by itself after RING_MS.
 */
export function useGroupRing(me: string | null, groups: Group[], onRing?: (group: Group, from: Profile | undefined) => void) {
  const [ring, setRing] = useState<GroupRingState | null>(null)
  const channels = useRef(new Map<string, RealtimeChannel>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const ringCb = useRef(onRing)
  ringCb.current = onRing
  const ids = groups
    .map((g) => g.id)
    .sort()
    .join(',')

  // a ring timing out only clears that group's ring, and a fresh ring restarts the timer, so a stale timer is harmless
  const clear = useCallback((gid?: string) => setRing((r) => (!r || (gid && r.gid !== gid) ? r : null)), [])

  useEffect(() => {
    if (!me || !BACKEND_READY || !ids) return
    const map = channels.current
    for (const gid of ids.split(',')) {
      const channel = supabase.channel(`ring-${gid}`, { config: { broadcast: { self: false } } })
      channel
        .on('broadcast', { event: 'start' }, ({ payload }) => {
          const p = payload as RingSignal
          const group = groupsRef.current.find((g) => g.id === gid)
          const from = group?.members.find((m) => m.id === p.from)
          if (p.gid !== gid || !group || !from || p.from === me) return
          clearTimeout(timer.current)
          timer.current = setTimeout(() => clear(gid), RING_MS)
          setRing({ gid, from: p.from })
          ringCb.current?.(group, from)
        })
        .on('broadcast', { event: 'stop' }, ({ payload }) => {
          if ((payload as RingSignal).gid === gid) clear(gid)
        })
        .subscribe()
      map.set(gid, channel)
    }
    return () => {
      map.forEach((c) => void supabase.removeChannel(c))
      map.clear()
      clearTimeout(timer.current)
      setRing(null)
    }
  }, [me, ids, clear])

  const send = useCallback(
    (event: 'start' | 'stop', gid: string) => {
      if (!me) return
      channels.current.get(gid)?.send({ type: 'broadcast', event, payload: { from: me, gid } }).catch(() => {})
    },
    [me],
  )

  /** you opened the group's empty voice chat: ring everyone else */
  const start = useCallback((gid: string) => send('start', gid), [send])
  /** you left before anyone answered: stop ringing them */
  const stop = useCallback((gid: string) => send('stop', gid), [send])
  /** answered or declined here: stop ringing on this device only */
  const dismiss = useCallback(() => clear(), [clear])

  return { ring, start, stop, dismiss }
}
