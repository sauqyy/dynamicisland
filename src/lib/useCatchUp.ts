import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import type { IslandAlert } from '../types'

/**
 * Noticing the user is away (no keyboard or mouse for AWAY_AFTER, the computer asleep, or the app
 * not running at all), noting what came in meanwhile, and on their return greeting them with it as
 * one catch-up. Nothing stops while they're away: alerts still pop up and SCELE still syncs.
 *
 * - Away from the keyboard: the system's idle time (GetLastInputInfo), asked every few seconds.
 * - Asleep: the island's own clock jumping ahead (its timers don't run while the computer sleeps).
 * - Off, or the app closed: when it was last running, written every half minute.
 */

/** No input for this long and the user is away. */
export const AWAY_AFTER = 10 * 60
/** The island not running (or the computer asleep) for this long: a greeting rather than a welcome back. */
const OFF_AFTER = 30 * 60_000
/** Past this, the island waits no longer for the first sync after the return before showing what it has. */
const READY_WAIT = 20_000
const LAST_KEY = 'di.lastActive'

/** Coming back after the computer was off or asleep (a greeting), or after being away from the keyboard. */
export type CatchUpKind = 'hello' | 'back'

export interface CatchUpDigest {
  kind: CatchUpKind
  /** ms: when the user left */
  since: number
  /** ms: when they came back */
  until: number
  /** what would have popped up while they were away, oldest first */
  held: Omit<IslandAlert, 'id'>[]
}

/** Alerts worth keeping for later: about the user's work, people and the computer, not passing feedback (volume, Caps Lock). */
const KEEP = new Set(['📅', '🎓', '📣', '📄', '🏅', '✅', '⏰', '🎯', '☕', '🪫', '⬆️', '⚠️'])

const readLast = () => {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0
  } catch {
    return 0
  }
}
const writeLast = (t: number) => {
  try {
    localStorage.setItem(LAST_KEY, String(t))
  } catch {
    /* ignore */
  }
}

/**
 * `ready(since)`: whether what the catch-up reads is fresh since that moment (SCELE synced again);
 * `onReturn`: the user is back, so anything that refreshes on a timer can refresh now.
 */
export function useCatchUp({ enabled, ready, onReturn }: { enabled: boolean; ready: (since: number) => boolean; onReturn?: () => void }) {
  const [digest, setDigest] = useState<CatchUpDigest | null>(null)
  // away: since when, and of which kind; back: since when, while the catch-up waits to be ready
  const away = useRef<{ since: number; kind: CatchUpKind } | null>(null)
  const back = useRef<number | null>(null)
  const held = useRef<Omit<IslandAlert, 'id'>[]>([])
  const [holding, setHolding] = useState(false)
  const readyRef = useRef(ready)
  readyRef.current = ready
  const returnRef = useRef(onReturn)
  returnRef.current = onReturn
  // in a browser only activity on the page counts; the desktop app asks the system
  const lastInput = useRef(Date.now())
  const lastTick = useRef(Date.now())

  const leave = useCallback((since: number, kind: CatchUpKind) => {
    if (away.current) return
    away.current = { since, kind }
    held.current = []
    setHolding(true)
  }, [])
  const arrive = useCallback(() => {
    if (!away.current || back.current !== null) return
    back.current = Date.now()
    returnRef.current?.()
  }, [])

  // the island wasn't running for a while before this start: greet the user once it's ready
  useEffect(() => {
    if (!enabled) return
    const last = readLast()
    if (last && Date.now() - last > OFF_AFTER) {
      leave(last, 'hello')
      arrive()
    }
    writeLast(Date.now())
  }, [enabled, leave, arrive])

  useEffect(() => {
    if (!enabled) return
    const touch = () => (lastInput.current = Date.now())
    const events = ['mousemove', 'keydown', 'pointerdown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        const now = Date.now()
        // the clock jumped: the computer was asleep since the last tick
        const gap = now - lastTick.current
        lastTick.current = now
        if (gap > 3 * 60_000 && !away.current) {
          leave(now - gap, gap > OFF_AFTER ? 'hello' : 'back')
          arrive()
        }
        let idle = (now - lastInput.current) / 1000
        if (IS_TAURI) idle = await invoke<number>('idle_seconds').catch(() => idle)
        if (!away.current && idle >= AWAY_AFTER) leave(now - idle * 1000, 'back')
        else if (away.current && back.current === null && idle < 5) arrive()
        // still here (not away): this is the moment to come back to after a shutdown
        if (!away.current) writeLast(now)

        // back, and the catch-up has what it needs (or has waited long enough): show it
        if (away.current && back.current !== null && (readyRef.current(back.current) || now - back.current > READY_WAIT)) {
          const a = away.current
          setDigest({ kind: a.kind, since: a.since, until: back.current, held: held.current })
          away.current = null
          back.current = null
          held.current = []
          setHolding(false)
          writeLast(now)
        }
      } finally {
        busy = false
      }
    }
    // often enough that coming back is noticed within a couple of seconds
    const id = setInterval(tick, 2000)
    const leaving = () => writeLast(Date.now())
    window.addEventListener('beforeunload', leaving)
    return () => {
      clearInterval(id)
      events.forEach((e) => window.removeEventListener(e, touch))
      window.removeEventListener('beforeunload', leaving)
    }
  }, [enabled, leave, arrive])

  /**
   * Notes an alert for the catch-up while the user is away. Away from the keyboard, it still shows
   * (they may be watching the screen without touching it), so this returns false. Just back from
   * sleep or a shutdown, while the catch-up gets ready, it doesn't: everything that came due while
   * the computer was off would otherwise pop up at once, and the greeting shows it all together.
   */
  const hold = useCallback((a: Omit<IslandAlert, 'id'>) => {
    if (!away.current || a.kind || !KEEP.has(a.icon)) return false
    // the same thing said twice (a deadline's steps, a re-sent notice) is kept once
    if (!held.current.some((h) => h.text === a.text && h.sub === a.sub)) held.current.push(a)
    return back.current !== null
  }, [])

  const dismiss = useCallback(() => setDigest(null), [])

  /** Browser demo: as if the user left `minutes` ago (asleep, or away from the keyboard) and is back now. */
  const simulate = useCallback(
    (kind: CatchUpKind, minutes: number, meanwhile: Omit<IslandAlert, 'id'>[] = []) => {
      setDigest(null)
      away.current = null
      back.current = null
      leave(Date.now() - minutes * 60_000, kind)
      for (const m of meanwhile) hold(m)
      arrive()
    },
    [leave, arrive, hold],
  )

  return { digest, holding, hold, dismiss, simulate }
}
