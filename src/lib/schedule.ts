import { useEffect, useState } from 'react'

export interface Slot {
  id: number
  /** 0 = Monday … 6 = Sunday */
  day: number
  /** "HH:MM" */
  start: string
  end: string
  title: string
  /** where it is held, e.g. "Room 2.3" */
  room?: string
}

const KEY = 'di.schedule'

function load(): Slot[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Slot[]
  } catch {
    return []
  }
}

/** The week's classes. Lives in App so the pill can count down to the next one. */
export function useSchedule() {
  const [slots, setSlots] = useState<Slot[]>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(slots))
    } catch {
      /* ignore */
    }
  }, [slots])
  return { slots, setSlots }
}

/** Monday-first index of the day that `ms` falls on */
export const dayOf = (ms: number) => (new Date(ms).getDay() + 6) % 7

export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export interface ClassState {
  /** the class that is on right now */
  current?: Slot
  /** whole minutes until the current class ends */
  endsIn?: number
  /** the next class today */
  next?: Slot
  /** whole minutes until it starts */
  startsIn?: number
}

/** What is on right now and what comes next today. */
export function classState(slots: Slot[], nowMs: number): ClassState {
  const d = new Date(nowMs)
  const day = dayOf(nowMs)
  const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  const today = slots.filter((s) => s.day === day).sort((a, b) => minutes(a.start) - minutes(b.start))
  const current = today.find((s) => minutes(s.start) <= nowMin && nowMin < minutes(s.end))
  const next = today.find((s) => minutes(s.start) > nowMin)
  return {
    current,
    endsIn: current ? Math.ceil(minutes(current.end) - nowMin) : undefined,
    next,
    startsIn: next ? Math.ceil(minutes(next.start) - nowMin) : undefined,
  }
}

/** "Algo in 12 min · Room 2.3" */
export function nextClassLabel(s: Slot, startsIn: number): string {
  const when = startsIn >= 60 ? `${Math.floor(startsIn / 60)}h ${startsIn % 60 ? `${startsIn % 60}m` : ''}`.trim() : `${startsIn} min`
  return `${s.title} in ${when}${s.room ? ` · ${s.room}` : ''}`
}
