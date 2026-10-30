import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SoundName } from 'cuelume'
import type { IslandAlert, Todo } from '../../types'
import { say } from './moments'

const IS_TAURI = '__TAURI_INTERNALS__' in window
const H = 3600_000
/** quiet for this long and she falls asleep */
const SLEEP_AFTER = 5 * 60
/** this long at the computer without a real break and she suggests some water */
const WATER_EVERY = 90 * 60_000
const GREETED_KEY = 'di.lumi.greeted'
const FIRED_KEY = 'di.lumi.fired'

type Push = (a: Omit<IslandAlert, 'id'>, cue?: SoundName) => void

/** An exam on the timetable, as far as she needs to know it. */
export interface ExamRef {
  key: string
  title: string
  start: number
  end: number
}

interface Opts {
  /** Lumi is on (Settings) */
  enabled: boolean
  /** she may speak up on her own */
  nudges: boolean
  /** first hello done: before that she stays quiet and lets the intro do the talking */
  met: boolean
  name: string
  now: number
  push: Push
  todos: Todo[]
  exams: ExamRef[]
  /** in class or in a study session: she keeps her thoughts to herself */
  busy: boolean
  /** the day in a few words, for the good morning */
  summary: () => string
}

/** What was already said, so a restart does not say it again. */
const fired = {
  has: (k: string) => {
    try {
      return (JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[]).includes(k)
    } catch {
      return false
    }
  },
  add: (k: string) => {
    try {
      const all = (JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[]).slice(-80)
      localStorage.setItem(FIRED_KEY, JSON.stringify([...all, k]))
    } catch {
      /* ignore */
    }
  },
}

/**
 * The things Lumi does on her own, besides the alerts the app already raises (those just get her face):
 * falls asleep when it is quiet and startles awake when you are back, says good morning, wishes luck before
 * an exam and cheers after it, cheers for ticked to-dos, and now and then suggests some water or sleep.
 * Returns what the resting face should be doing.
 */
export function useLumiRoutines({ enabled, nudges, met, name, now, push, todos, exams, busy, summary }: Opts) {
  const [rest, setRest] = useState<'idle' | 'sleep' | 'wake'>('idle')
  const pushRef = useRef(push)
  pushRef.current = push
  const live = useRef({ nudges, met, busy, name, summary })
  live.current = { nudges, met, busy, name, summary }
  /** may she speak now? */
  const may = () => live.current.nudges && live.current.met

  // asleep when nothing has happened for a while, startled awake when something does; and the clock
  // behind the water and sleep reminders, which counts only the time someone is really there
  const last = useRef(Date.now())
  const active = useRef({ ms: 0, water: 0, late: '' })
  useEffect(() => {
    if (!enabled) return
    let asleep = false
    let wake = 0
    const mark = () => {
      last.current = Date.now()
    }
    window.addEventListener('pointermove', mark)
    window.addEventListener('keydown', mark)
    window.addEventListener('pointerdown', mark)
    const STEP = 4000
    const tick = async () => {
      let idle = (Date.now() - last.current) / 1000
      if (IS_TAURI) idle = await invoke<number>('idle_seconds').catch(() => idle)
      if (!asleep && idle >= SLEEP_AFTER) {
        asleep = true
        setRest('sleep')
      } else if (asleep && idle < 5) {
        asleep = false
        setRest('wake')
        window.clearTimeout(wake)
        wake = window.setTimeout(() => setRest('idle'), 1900)
      }
      const a = active.current
      if (idle >= 4 * 60) {
        // four minutes off counts as a break
        a.ms = 0
        a.water = 0
        return
      }
      if (idle < 60) {
        a.ms += STEP
        a.water += STEP
      }
      const { name: who, busy: b } = live.current
      if (!may() || b) return
      if (a.water >= WATER_EVERY) {
        a.water = 0
        pushRef.current({ icon: '💧', text: say('hydrate', who).title, sub: say('hydrate', who).sub, lumi: 'hydrate' }, 'ready')
      }
      // after midnight, ten minutes in: once a night
      const hour = new Date().getHours()
      const night = new Date().toDateString()
      if (hour < 4 && a.ms > 10 * 60_000 && a.late !== night) {
        a.late = night
        const s = say('lateNight', who)
        pushRef.current({ icon: '🌙', text: s.title, sub: s.sub, lumi: 'lateNight', ms: 7000 }, 'ready')
      }
    }
    const id = setInterval(() => void tick(), STEP)
    return () => {
      clearInterval(id)
      window.clearTimeout(wake)
      window.removeEventListener('pointermove', mark)
      window.removeEventListener('keydown', mark)
      window.removeEventListener('pointerdown', mark)
    }
  }, [enabled])

  // the first time she sees you each day: good morning, with the day in a few words
  useEffect(() => {
    if (!enabled || !met) return
    const today = new Date().toDateString()
    try {
      if (localStorage.getItem(GREETED_KEY) === today) return
    } catch {
      return
    }
    const id = setTimeout(() => {
      try {
        localStorage.setItem(GREETED_KEY, today)
      } catch {
        /* ignore */
      }
      const { nudges: n, name: who, summary: sum } = live.current
      const hour = new Date().getHours()
      if (!n || hour < 5 || hour >= 11) return
      const s = say('goodMorning', who)
      pushRef.current({ icon: '☀️', text: s.title, sub: sum() || s.sub, lumi: 'goodMorning', ms: 7000 }, 'ready')
    }, 5000)
    return () => clearTimeout(id)
  }, [enabled, met])

  // to-dos ticked off
  const doneBefore = useRef<number | null>(null)
  const lastTick = useRef(0)
  useEffect(() => {
    const done = todos.filter((t) => t.done).length
    const open = todos.length - done
    const before = doneBefore.current
    doneBefore.current = done
    if (!enabled || before === null || done <= before || !may()) return
    if (open === 0) {
      const s = say('allTodosDone', live.current.name)
      pushRef.current({ icon: '🎉', text: s.title, sub: s.sub, lumi: 'allTodosDone', ms: 6500 }, 'success')
    } else if (Date.now() - lastTick.current > 20_000) {
      lastTick.current = Date.now()
      const s = say('todoDone', live.current.name)
      pushRef.current({ icon: '✔️', text: s.title, sub: `${open} left`, lumi: 'todoDone', ms: 2200 })
    }
  }, [todos, enabled])

  // exams: the evening before, a few minutes before it starts, and once it is over
  const known = useRef(new Map<string, ExamRef>())
  useEffect(() => {
    if (!enabled || !met) return
    for (const e of exams) known.current.set(e.key, e)
    const once = (k: string, go: () => void) => {
      if (fired.has(k)) return
      fired.add(k)
      if (may()) go()
    }
    const who = live.current.name
    for (const e of known.current.values()) {
      const toStart = e.start - now
      if (toStart > 0 && toStart <= 26 * H && toStart >= 14 * H) {
        once(`${e.key}:eve`, () => {
          const s = say('examTomorrow', who)
          pushRef.current({ icon: '📝', text: `${e.title} exam tomorrow`, sub: s.sub, lumi: 'examTomorrow', ms: 7000 }, 'attention')
        })
      }
      if (toStart > 0 && toStart <= 30 * 60_000) {
        once(`${e.key}:luck`, () => {
          const s = say('examLuck', who)
          pushRef.current({ icon: '🍀', text: s.title, sub: `${e.title} starts soon. Deep breath.`, lumi: 'examLuck', ms: 7000 }, 'ready')
        })
      }
      if (now > e.end && now - e.end < 4 * H) {
        once(`${e.key}:done`, () => {
          const s = say('examDone', who)
          pushRef.current(
            {
              icon: '🎉',
              text: s.title,
              sub: `${e.title}. How did it go?`,
              lumi: 'examDone',
              ms: 14000,
              actions: [
                {
                  label: 'It went well',
                  primary: true,
                  run: () => pushRef.current({ icon: '✅', text: 'I knew it!', sub: 'Proud of you. Enjoy the rest of your day.', lumi: 'allTodosDone', ms: 5200 }, 'success'),
                },
                {
                  label: 'A tough one',
                  run: () => pushRef.current({ icon: '🤍', text: "It's over now", sub: 'You did what you could. Rest, then eat something.', lumi: 'classDone', ms: 6000 }),
                },
              ],
            },
            'success',
          )
        })
        known.current.delete(e.key)
      }
    }
  }, [now, exams, enabled, met])

  return { rest }
}
