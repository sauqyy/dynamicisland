import { useEffect, useState } from 'react'
import { BACKEND_READY, supabase } from './supabase'
import { DEMO_SOCIAL } from './useDemo'

/**
 * Who is in a group's voice chat right now, for a chat you are looking at without being in the call.
 * It listens to the room's presence (the same channel the call uses) but never announces you.
 * Switch it off while you are in the call yourself: the call knows its own members.
 */
export function useVoiceRoster(groupId: string | null, enabled: boolean): string[] {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    if (!groupId || !enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIds([])
      return
    }
    // the demo has no backend: pretend two people are talking in the first group
    if (DEMO_SOCIAL) {
      setIds(groupId === 'g1' ? ['a', 'b'] : [])
      return
    }
    if (!BACKEND_READY) return
    const channel = supabase.channel(`voice-${groupId}`, { config: { presence: { key: `watch-${Math.random().toString(36).slice(2)}` } } })
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ joinedAt?: number }>()
        const inRoom = Object.entries(state)
          .filter(([key, metas]) => !key.startsWith('watch-') && metas.length > 0)
          .map(([key, metas]) => ({ key, at: metas[0]?.joinedAt ?? 0 }))
          .sort((a, b) => a.at - b.at)
        setIds(inRoom.map((p) => p.key))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
      setIds([])
    }
  }, [groupId, enabled])

  return ids
}
