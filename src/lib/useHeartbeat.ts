import { useEffect } from 'react'
import { supabase } from './supabase'
import { HEARTBEAT_EVERY } from './presence'

/** Stamps last_seen while the app is open, so friends see you as offline once it stops. */
export function useHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    const beat = () => void supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId).then(() => {})
    beat()
    const id = setInterval(beat, HEARTBEAT_EVERY)
    return () => clearInterval(id)
  }, [userId])
}
