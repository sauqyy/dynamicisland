import { useCallback, useEffect, useMemo, useState } from 'react'
import { BACKEND_READY, supabase, type Profile } from './supabase'

/** A study session that is running: what for, since when, and the group it is shared with (if any). */
export interface StudySession {
  label: string
  startedAt: number
  /** a deadline this session works towards */
  deadlineId?: number
  /** the group whose study room this session belongs to */
  gid?: string
  /** most minutes this session can count for (the length of its phase), so a laptop that slept does not log hours */
  maxMin: number
}

const KEY = 'di.study'

/** minutes studied per day, then per subject: { "2026-10-29": { "Algo": 50, "Focus": 25 } } */
export type StudyLog = Record<string, Record<string, number>>

function load(): StudyLog {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as StudyLog
  } catch {
    return {}
  }
}

export const dayKey = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const DEFAULT_LABEL = 'Focus'

export const dayTotal = (log: StudyLog, key: string) => Object.values(log[key] ?? {}).reduce((a, b) => a + b, 0)

/** Days in a row (ending today, or yesterday if today has no study yet) with at least a minute studied. */
export function streakOf(totals: (key: string) => number, nowMs: number): number {
  let n = 0
  const d = new Date(nowMs)
  if (totals(dayKey(d.getTime())) <= 0) d.setDate(d.getDate() - 1)
  while (totals(dayKey(d.getTime())) > 0 && n < 400) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** The last `n` days, oldest first. */
export function lastDays(nowMs: number, n: number): string[] {
  const out: string[] = []
  const d = new Date(nowMs)
  for (let i = 0; i < n; i++) {
    out.unshift(dayKey(d.getTime()))
    d.setDate(d.getDate() - 1)
  }
  return out
}

export function fmtStudy(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`
}

/** One finished study session, newest first in the history. */
export interface StudyEntry {
  label: string
  /** when it started (ms) */
  at: number
  min: number
  /** studied in a group's room */
  together?: boolean
}

const HISTORY_KEY = 'di.study.history'
const HISTORY_MAX = 300

function loadHistory(): StudyEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(v) ? (v as StudyEntry[]) : []
  } catch {
    return []
  }
}

/** Study time per subject, and the list of sessions behind it, kept on this device. */
export function useStudyLog() {
  const [log, setLog] = useState<StudyLog>(load)
  const [history, setHistory] = useState<StudyEntry[]>(loadHistory)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(log))
    } catch {
      /* ignore */
    }
  }, [log])
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {
      /* ignore */
    }
  }, [history])

  /** adds studied minutes to today under a subject */
  const add = useCallback((label: string, min: number, startedAt = Date.now(), together = false) => {
    if (min <= 0) return
    const key = dayKey(Date.now())
    setLog((cur) => ({ ...cur, [key]: { ...cur[key], [label]: (cur[key]?.[label] ?? 0) + min } }))
    // a few seconds is a misclick, not a session
    if (min >= 0.5) setHistory((cur) => [{ label, at: startedAt, min, ...(together ? { together } : {}) }, ...cur].slice(0, HISTORY_MAX))
  }, [])

  const clearHistory = useCallback(() => setHistory([]), [])

  return { log, history, add, clearHistory }
}

/** Whether a friend's shared activity says they are studying right now. */
export const isStudying = (activity: string) => activity.startsWith('🍅') || activity.startsWith('📚')

/** What friends see while you study. */
export function studyActivity(session: StudySession | null, room: boolean): string {
  if (!session) return ''
  const what = session.label === DEFAULT_LABEL ? '' : ` ${session.label}`
  return room ? `📚 Studying together${what}` : `🍅 Focusing${what}`
}

export interface BoardRow {
  profile: Profile
  weekMin: number
  todayMin: number
  streak: number
  me: boolean
}

interface DayRow {
  user_id: string
  day: string
  minutes: number
}

/**
 * Study totals per day, shared with friends who do the same (see supabase/study.sql).
 * Your own totals are pushed when `share` is on; friends' totals are read whenever the page is open.
 * Without the table (or the setting) the board just stays empty.
 */
export function useStudyBoard(me: Profile | null, friends: Profile[], log: StudyLog, share: boolean, active: boolean) {
  const [rows, setRows] = useState<DayRow[]>([])
  const myId = me?.id
  const todayKey = dayKey(Date.now())
  const todayMin = Math.round(dayTotal(log, todayKey))

  // push today's total (debounced: it changes every time a session ends)
  useEffect(() => {
    if (!myId || !share || !BACKEND_READY || todayMin <= 0) return
    const t = setTimeout(() => {
      void supabase.from('study_days').upsert({ user_id: myId, day: todayKey, minutes: todayMin }).then(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [myId, share, todayKey, todayMin])

  const friendIds = friends.map((f) => f.id).sort().join(',')
  useEffect(() => {
    if (!myId || !active || !BACKEND_READY) return
    let gone = false
    const since = lastDays(Date.now(), 30)[0]
    const ids = [myId, ...(friendIds ? friendIds.split(',') : [])]
    void supabase
      .from('study_days')
      .select('user_id, day, minutes')
      .in('user_id', ids)
      .gte('day', since)
      .then(({ data }) => {
        if (!gone) setRows((data ?? []) as DayRow[])
      })
    return () => {
      gone = true
    }
  }, [myId, friendIds, active, todayMin])

  const board = useMemo(() => {
    if (!me) return []
    const now = Date.now()
    const week = new Set(lastDays(now, 7))
    const people = [me, ...friends]
    const out: BoardRow[] = people.map((p) => {
      const mine = p.id === me.id
      const byDay = new Map<string, number>()
      if (mine) {
        for (const k of Object.keys(log)) byDay.set(k, dayTotal(log, k))
      } else {
        for (const r of rows) if (r.user_id === p.id) byDay.set(r.day, r.minutes)
      }
      let weekMin = 0
      for (const [k, v] of byDay) if (week.has(k)) weekMin += v
      return {
        profile: p,
        me: mine,
        weekMin,
        todayMin: byDay.get(dayKey(now)) ?? 0,
        streak: streakOf((k) => byDay.get(k) ?? 0, now),
      }
    })
    return out.filter((r) => r.me || r.weekMin > 0).sort((a, b) => b.weekMin - a.weekMin || b.streak - a.streak)
  }, [me, friends, log, rows])

  return board
}
