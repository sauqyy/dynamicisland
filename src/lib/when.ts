/**
 * Reading a due date the way people type one, in English or Indonesian: "tomorrow 5pm", "fri",
 * "6 nov 23:59", "in 2 hours", "besok jam 9", "jumat sore", "lusa", "minggu depan".
 */

const DAY = 86_400_000

/** A date without a time is due at the end of that day, as deadlines usually are. */
export const DEFAULT_TIME = { h: 23, m: 59 }

const WEEKDAYS: [RegExp, number][] = [
  [/^(sun|sunday|min|minggu|ahad)$/, 0],
  [/^(mon|monday|sen|senin)$/, 1],
  [/^(tue|tues|tuesday|sel|selasa)$/, 2],
  [/^(wed|wednesday|rab|rabu)$/, 3],
  [/^(thu|thur|thurs|thursday|kam|kamis)$/, 4],
  [/^(fri|friday|jum|jumat|jum'at)$/, 5],
  [/^(sat|saturday|sab|sabtu)$/, 6],
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'ma', 'jun', 'jul', 'ag', 'sep', 'o', 'nov', 'de']
/** "nov", "november", "okt", "oktober", "agustus", "mei" → 0-based month */
function monthOf(w: string): number | null {
  const m = w.toLowerCase()
  if (/^(may|mei)$/.test(m)) return 4
  if (/^mar/.test(m)) return 2
  if (/^(aug|agu|agt|agustus)/.test(m)) return 7
  if (/^(oct|okt)/.test(m)) return 9
  if (/^(dec|des)/.test(m)) return 11
  const i = MONTHS.findIndex((p) => p.length >= 3 && m.startsWith(p))
  return i >= 0 && m.length >= 3 ? i : null
}

const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0)
const at = (day: number, h: number, m: number) => new Date(new Date(day).setHours(h, m, 0, 0)).getTime()

/** "17:00", "17.30", "5pm", "5.30pm", "1730", "jam 5", "pukul 9 malam" → hours and minutes */
export function parseTime(text: string): { h: number; m: number } | null {
  const s = text.toLowerCase().trim()
  let h: number | null = null
  let m = 0
  let r: RegExpMatchArray | null
  if ((r = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/))) {
    h = Number(r[1]) % 12 + (r[3].startsWith('p') ? 12 : 0)
    m = Number(r[2] ?? 0)
  } else if ((r = s.match(/\b(\d{1,2})[:.](\d{2})\b/))) {
    h = Number(r[1])
    m = Number(r[2])
  } else if ((r = s.match(/\b(?:jam|pukul|pkl|at|@)\s*(\d{1,2})(?:[:.](\d{2}))?\b/))) {
    h = Number(r[1])
    m = Number(r[2] ?? 0)
  } else if ((r = s.match(/^(\d{1,2})(\d{2})$/))) {
    // "1730", "930"
    h = Number(r[1])
    m = Number(r[2])
  } else if ((r = s.match(/^(\d{1,2})$/))) {
    h = Number(r[1])
  }
  // Indonesian parts of the day: "jam 5 sore" is 17:00, "jam 9 malam" 21:00, "jam 1 siang" 13:00
  if (h !== null && h < 12) {
    if (/\b(sore|malam|evening|night)\b/.test(s) && h >= 3) h += 12
    else if (/\bsiang\b/.test(s) && h <= 3) h += 12
  }
  if (h === null) {
    if (/\b(noon|midday|tengah hari)\b/.test(s)) return { h: 12, m: 0 }
    if (/\b(midnight|tengah malam)\b/.test(s)) return { h: 23, m: 59 }
    if (/\b(morning|pagi)\b/.test(s)) return { h: 9, m: 0 }
    if (/\b(siang|afternoon)\b/.test(s)) return { h: 13, m: 0 }
    if (/\b(sore|evening)\b/.test(s)) return { h: 17, m: 0 }
    if (/\b(malam|night)\b/.test(s)) return { h: 21, m: 0 }
    return null
  }
  return h <= 23 && m <= 59 ? { h, m } : null
}

/**
 * A moment from what was typed, or null when nothing in it reads as a date or time. A date alone
 * is due at 23:59; a time alone is today, or tomorrow once that time has passed.
 */
export function parseWhen(text: string, now = Date.now()): number | null {
  const s = text.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return null

  // "in 2 hours", "in 30 min", "2 jam lagi", "3 hari lagi", "dalam 2 jam"
  const rel = s.match(/\b(?:in|dalam)\s+(\d+)\s*(m|mins?|minutes?|menit|h|hrs?|hours?|jam|d|days?|hari|w|weeks?|minggu)\b/) ?? s.match(/\b(\d+)\s*(m|mins?|minutes?|menit|h|hrs?|hours?|jam|d|days?|hari|w|weeks?|minggu)\s+lagi\b/)
  if (rel) {
    const n = Number(rel[1])
    const u = rel[2]
    const ms = /^(m|min|mins|minute|minutes|menit)$/.test(u) ? 60_000 : /^(h|hr|hrs|hour|hours|jam)$/.test(u) ? 3600_000 : /^(w|week|weeks|minggu)$/.test(u) ? 7 * DAY : DAY
    const t = now + n * ms
    // days and weeks keep the end of the day unless a time is given; minutes and hours are exact
    if (ms >= DAY) {
      const time = parseTime(s.replace(rel[0], '')) ?? DEFAULT_TIME
      return at(startOf(t), time.h, time.m)
    }
    return Math.ceil(t / 60_000) * 60_000
  }

  let day: number | null = null
  let rest = s
  const take = (re: RegExp) => {
    const r = rest.match(re)
    if (r) rest = rest.replace(r[0], ' ')
    return r
  }
  const today = startOf(now)

  if (take(/\b(day after tomorrow|lusa)\b/)) day = today + 2 * DAY
  else if (take(/\b(tomorrow|tmr|tmrw|besok)\b/)) day = today + DAY
  else if (take(/\b(today|tonight|hari ini|malam ini|nanti)\b/)) day = today
  else if (take(/\b(next week|minggu depan|pekan depan)\b/)) {
    // next Monday
    const d = new Date(today).getDay()
    day = today + ((8 - d) % 7 || 7) * DAY
  }

  // a weekday: its next one (today counts), or the one after with "next"/"depan"
  if (day === null) {
    for (const w of rest.split(' ')) {
      const hit = WEEKDAYS.find(([re]) => re.test(w.replace(/[^a-z']/g, '')))
      if (!hit) continue
      if (/\b(next|depan)\b/.test(rest)) {
        // "next mon": the Monday of next week (weeks start on Monday), not the coming one plus seven
        const monday = today + ((8 - new Date(today).getDay()) % 7 || 7) * DAY
        day = monday + ((hit[1] + 6) % 7) * DAY
      } else day = today + ((hit[1] - new Date(today).getDay() + 7) % 7) * DAY
      rest = rest.replace(w, ' ')
      break
    }
  }

  // a date: "6 nov", "nov 6", "6 november 2026", "6/11", "6-11-2026" (day first, as in Indonesia)
  if (day === null) {
    let d: number | null = null
    let mo: number | null = null
    let y: number | null = null
    let r: RegExpMatchArray | null
    // only taken out of the text once the word is really a month ("5 sore" is a time)
    const named = (re: RegExp, di: number, mi: number) => {
      const x = rest.match(re)
      if (!x || monthOf(x[mi]) === null) return null
      rest = rest.replace(x[0], ' ')
      return { d: Number(x[di]), mo: monthOf(x[mi]), y: x[3] ? Number(x[3]) : null }
    }
    const nm = named(/\b(\d{1,2})\s+([a-z]{3,})\.?(?:\s+(\d{4}))?\b/, 1, 2) ?? named(/\b([a-z]{3,})\.?\s+(\d{1,2})(?:\s+(\d{4}))?\b/, 2, 1)
    if (nm) {
      d = nm.d
      mo = nm.mo
      y = nm.y
    } else if ((r = rest.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/)) && Number(r[2]) >= 1 && Number(r[2]) <= 12 && !/[:]/.test(r[0])) {
      // "17.00" and "9.30" are times (no 17th or 30th month), "6.11" is a date
      rest = rest.replace(r[0], ' ')
      d = Number(r[1])
      mo = Number(r[2]) - 1
      y = r[3] ? (r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3])) : null
    }
    if (d !== null && mo !== null && d >= 1 && d <= 31) {
      const year = y ?? new Date(now).getFullYear()
      let t = new Date(year, mo, d).getTime()
      // "6 jan" in November is next January, unless a year was written
      if (y === null && t < today) t = new Date(year + 1, mo, d).getTime()
      if (new Date(t).getDate() === d) day = t
    }
  }

  const time = parseTime(rest)
  if (day === null && !time) return null
  if (day === null) {
    // a time alone: today, or tomorrow once it has passed
    const t = at(today, time!.h, time!.m)
    return t > now ? t : at(today + DAY, time!.h, time!.m)
  }
  const tm = time ?? DEFAULT_TIME
  return at(day, tm.h, tm.m)
}
