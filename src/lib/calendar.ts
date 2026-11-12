import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

/** One meeting, already placed on the timeline (a repeating event gives one of these per day). */
export interface Meeting {
  id: string
  title: string
  start: number
  end: number
  where?: string
  /** link that joins the call: Meet, Zoom, Teams ... */
  join?: string
}

interface RawEvent {
  uid: string
  title: string
  where?: string
  join?: string
  /** wall-clock start, in `tz` (or the local zone when there is none) */
  wall: { y: number; mo: number; d: number; h: number; mi: number; s: number }
  tz?: string
  /** start time and length for events written in UTC */
  fixedStart?: number
  length: number
  rrule?: Record<string, string>
  exdates: number[]
}

const DAY = 86_400_000
const JOIN = /https:\/\/(?:[\w-]+\.)?(?:zoom\.us|zoom\.com|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|whereby\.com|webex\.com)\/[^\s<>"\\)]+/i

const unescapeText = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

/** Offset of `tz` from UTC at the given moment, in ms. Undefined when the zone is not an IANA name. */
function zoneOffset(tz: string, at: number): number | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(at))
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(at / 1000) * 1000
  } catch {
    return undefined
  }
}

function wallToUtc(w: RawEvent['wall'], tz?: string): number {
  if (!tz) return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s).getTime()
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  const off = zoneOffset(tz, guess)
  // Outlook's own zone names ("SE Asia Standard Time") are not IANA: read them as local time
  if (off === undefined) return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s).getTime()
  return guess - (zoneOffset(tz, guess - off) ?? off)
}

interface IcsDate {
  wall: RawEvent['wall']
  utc?: number
  allDay: boolean
}

function parseDate(value: string): IcsDate | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number)
  const wall = { y, mo, d, h, mi, s }
  return { wall, utc: m[7] ? Date.UTC(y, mo - 1, d, h, mi, s) : undefined, allDay: m[4] === undefined }
}

function parseIcs(text: string): RawEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const out: RawEvent[] = []
  let cur: Record<string, { params: Record<string, string>; value: string }[]> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT' && cur) {
      const ev = toEvent(cur)
      if (ev) out.push(ev)
      cur = null
    } else if (cur) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const [name, ...ps] = line.slice(0, colon).split(';')
      const params: Record<string, string> = {}
      for (const p of ps) {
        const eq = p.indexOf('=')
        if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/"/g, '')
      }
      ;(cur[name.toUpperCase()] ??= []).push({ params, value: line.slice(colon + 1) })
    }
  }
  return out
}

function toEvent(p: Record<string, { params: Record<string, string>; value: string }[]>): RawEvent | undefined {
  const first = (k: string) => p[k]?.[0]
  const s = first('DTSTART')
  if (!s || first('STATUS')?.value === 'CANCELLED' || first('RECURRENCE-ID')) return undefined
  const start = parseDate(s.value)
  // all-day events have no time to count down to
  if (!start || start.allDay) return undefined
  const tz = start.utc === undefined ? s.params.TZID : undefined
  const startMs = start.utc ?? wallToUtc(start.wall, tz)
  const e = first('DTEND') && parseDate(first('DTEND')!.value)
  let length = 3600_000
  if (e && !e.allDay) length = (e.utc ?? wallToUtc(e.wall, first('DTEND')!.params.TZID ?? tz)) - startMs
  else {
    const dur = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(first('DURATION')?.value ?? '')
    if (dur) length = (Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0)) * 60_000
  }
  const text = [first('LOCATION')?.value, first('URL')?.value, first('X-GOOGLE-CONFERENCE')?.value, first('DESCRIPTION')?.value]
    .filter(Boolean)
    .map((v) => unescapeText(v!))
    .join('\n')
  const rrule = first('RRULE')
    ? Object.fromEntries(first('RRULE')!.value.split(';').map((kv) => kv.split('=') as [string, string]))
    : undefined
  const exdates = (p.EXDATE ?? [])
    .flatMap((x) => x.value.split(','))
    .map((v) => {
      const d = parseDate(v)
      return d && (d.utc ?? wallToUtc(d.wall, tz))
    })
    .filter((v): v is number => typeof v === 'number')
  return {
    uid: first('UID')?.value ?? `${startMs}`,
    title: unescapeText(first('SUMMARY')?.value ?? 'Meeting'),
    where: first('LOCATION') && !JOIN.test(first('LOCATION')!.value) ? unescapeText(first('LOCATION')!.value) : undefined,
    join: JOIN.exec(text)?.[0],
    wall: start.wall,
    tz,
    fixedStart: start.utc,
    length: Math.max(length, 0),
    rrule,
    exdates,
  }
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** The meetings that touch [from, to]. Handles daily, weekly, monthly and yearly repeats. */
function expand(ev: RawEvent, from: number, to: number): Meeting[] {
  const mk = (start: number): Meeting => ({
    id: `${ev.uid}@${start}`, title: ev.title, start, end: start + ev.length, where: ev.where, join: ev.join,
  })
  const base = ev.fixedStart ?? wallToUtc(ev.wall, ev.tz)
  if (!ev.rrule) return base + ev.length >= from && base <= to ? [mk(base)] : []
  const r = ev.rrule
  const interval = Math.max(1, Number(r.INTERVAL ?? 1))
  const until = r.UNTIL ? parseDate(r.UNTIL) : undefined
  const untilMs = until && (until.utc ?? wallToUtc(until.wall, ev.tz)) + (until.allDay ? DAY : 0)
  const count = r.COUNT ? Number(r.COUNT) : Infinity
  const byDay = r.BYDAY?.split(',').map((d) => WEEKDAYS.indexOf(d.slice(-2)))
  const w = ev.wall
  const startDay = Date.UTC(w.y, w.mo - 1, w.d)
  const out: Meeting[] = []
  let n = 0
  // walk the event's own calendar days, so repeats keep their wall-clock time across daylight saving
  const last = Math.floor((to + 2 * DAY - startDay) / DAY)
  for (let i = 0; i <= last && n < count && i < 5000; i++) {
    const day = new Date(startDay + i * DAY)
    const [y, mo, d, wd] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), day.getUTCDay()]
    let hit = false
    switch (r.FREQ) {
      case 'DAILY':
        hit = i % interval === 0
        break
      case 'WEEKLY': {
        const weeks = Math.floor((i + ((new Date(startDay).getUTCDay() + 6) % 7)) / 7)
        hit = weeks % interval === 0 && (byDay ? byDay.includes(wd) : wd === new Date(startDay).getUTCDay())
        break
      }
      case 'MONTHLY':
        hit = d === w.d && ((y - w.y) * 12 + mo - w.mo) % interval === 0
        break
      case 'YEARLY':
        hit = d === w.d && mo === w.mo && (y - w.y) % interval === 0
        break
    }
    if (!hit) continue
    const start = ev.fixedStart !== undefined ? ev.fixedStart + i * DAY : wallToUtc({ ...w, y, mo, d }, ev.tz)
    // UTC events that repeat across daylight saving would drift; Google writes zoned ones, so keep it simple
    if (untilMs !== undefined && start > untilMs) break
    n++
    if (ev.exdates.includes(start)) continue
    if (start + ev.length >= from && start <= to) out.push(mk(start))
  }
  return out
}

/** Meetings from a little ago until `ahead` ms from now, soonest first. */
export function upcoming(feed: RawEvent[], now: number, ahead = 36 * 3600_000): Meeting[] {
  return feed
    .flatMap((e) => expand(e, now - 3600_000, now + ahead))
    .sort((a, b) => a.start - b.start)
}

/** The next meeting that has not started yet. */
export const nextMeeting = (list: Meeting[], now: number) => list.find((m) => m.start > now)

export function meetingLabel(m: Meeting, now: number) {
  const min = Math.max(1, Math.round((m.start - now) / 60_000))
  return `${m.title} · in ${min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`}`
}

const REFRESH = 15 * 60_000

/** A calendar feed (an .ics address), refreshed every 15 minutes. Empty address = off. */
export function useCalendar(address: string) {
  const [feed, setFeed] = useState<RawEvent[]>([])
  useEffect(() => {
    const url = address.trim().replace(/^webcal:\/\//i, 'https://')
    if (!/^https:\/\//i.test(url)) {
      setFeed([])
      return
    }
    let stopped = false
    const load = async () => {
      try {
        const text = IS_TAURI ? await invoke<string>('fetch_text', { url }) : await (await fetch(url)).text()
        if (!stopped) setFeed(parseIcs(text))
      } catch {
        /* offline or a bad address: keep whatever was loaded */
      }
    }
    load()
    const id = setInterval(load, REFRESH)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [address])
  return feed
}
