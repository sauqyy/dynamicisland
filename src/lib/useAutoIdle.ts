import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import type { Presence } from './presence'

/** Away from the keyboard and mouse this long (seconds) and an Online user is shown as Idle. */
export const IDLE_AFTER = 5 * 60

/**
 * Switches Online to Idle after a while away and back to Online on return. It only touches a status it set
 * itself, so Do Not Disturb, Invisible and a manually chosen Idle are left alone.
 */
export function useAutoIdle(presence: Presence | undefined, setPresence: (v: Presence) => void, enabled: boolean) {
  const auto = useRef(false)
  const last = useRef(Date.now())
  const current = useRef(presence)
  const set = useRef(setPresence)
  current.current = presence
  set.current = setPresence

  useEffect(() => {
    if (!enabled) return
    // in a browser only activity on the page counts; the desktop app asks the system
    const touch = () => (last.current = Date.now())
    const events = ['mousemove', 'keydown', 'pointerdown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const tick = async () => {
      let idle = (Date.now() - last.current) / 1000
      if (IS_TAURI) idle = await invoke<number>('idle_seconds').catch(() => idle)
      const p = current.current
      if (p === 'online' && idle >= IDLE_AFTER) {
        auto.current = true
        set.current('idle')
      } else if (auto.current && p === 'idle' && idle < 10) {
        auto.current = false
        set.current('online')
      } else if (p !== 'idle') {
        auto.current = false // the user changed it themselves
      }
    }
    const id = setInterval(tick, 15_000)
    return () => {
      clearInterval(id)
      events.forEach((e) => window.removeEventListener(e, touch))
    }
  }, [enabled])
}
