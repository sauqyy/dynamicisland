import { useEffect, useState } from 'react'

export interface Deadline {
  id: number
  title: string
  /** due moment, ms since epoch */
  due: number
  done: boolean
}

const KEY = 'di.deadlines'

function load(): Deadline[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Deadline[]
  } catch {
    return []
  }
}

export function useDeadlines() {
  const [deadlines, setDeadlines] = useState<Deadline[]>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(deadlines))
    } catch {
      /* ignore */
    }
  }, [deadlines])
  return { deadlines, setDeadlines }
}

/** Open deadlines, nearest first (overdue ones lead, since they are the most urgent). */
export function upcoming(list: Deadline[]): Deadline[] {
  return list.filter((d) => !d.done).sort((a, b) => a.due - b.due)
}

/** "in 2d 3h", "in 45m", "3h overdue" */
export function dueLabel(due: number, now: number): string {
  const diff = due - now
  const abs = Math.abs(diff)
  const min = Math.floor(abs / 60_000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  const span = day >= 1 ? (hr % 24 ? `${day}d ${hr % 24}h` : `${day}d`) : hr >= 1 ? (min % 60 ? `${hr}h ${min % 60}m` : `${hr}h`) : `${Math.max(min, 0)}m`
  if (diff < 0) return min < 1 ? 'due now' : `${span} overdue`
  return min < 1 ? 'due now' : `in ${span}`
}

/** Within this many hours a deadline is "urgent" and takes over the pill. */
export const URGENT_HOURS = 3

/** how urgent a deadline looks: overdue, due within hours, due within a day, or comfortable */
export function urgency(due: number, now: number): 'late' | 'urgent' | 'soon' | 'ok' {
  if (due < now) return 'late'
  if (due - now < URGENT_HOURS * 3600_000) return 'urgent'
  return due - now < 24 * 3600_000 ? 'soon' : 'ok'
}

/** value for a datetime-local input */
export function toInputValue(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
