import type { Weather } from './weather'
import type { LumiMood } from '../mascot/lumi/moods'

/** the forecast is read in quarter-hours */
const STEP = 15 * 60_000
/** millimetres in a quarter-hour: below this it is not worth mentioning */
export const WET = 0.12

export const isRainCode = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95

export type Strength = 'light' | 'moderate' | 'heavy'
/** by millimetres an hour: drizzle, ordinary rain, a downpour */
export const strength = (mmPerHour: number): Strength => (mmPerHour < 2.5 ? 'light' : mmPerHour < 7.5 ? 'moderate' : 'heavy')

export interface RainEvent {
  /** when it starts (already past, when it is raining now) */
  start: number
  /** when it stops, or null if it is still going at the end of the forecast */
  end: number | null
  /** the heaviest it gets, in mm an hour */
  peak: number
  /** how much falls in all, in mm */
  total: number
  now: boolean
  strength: Strength
}

/** the location's own clock: Open-Meteo gives times in the place's time zone, and we keep that offset */
export const offsetOf = (w: Weather) => w.utcOffset ?? -new Date().getTimezoneOffset() * 60
const hourAt = (w: Weather, ms: number) => new Date(ms + offsetOf(w) * 1000).getUTCHours()
const dateAt = (w: Weather, ms: number) => new Date(ms + offsetOf(w) * 1000).toISOString().slice(0, 10)
/** "14:30", in the place's own time */
export const clockAt = (w: Weather, ms: number) => new Date(ms + offsetOf(w) * 1000).toISOString().slice(11, 16)

/** minutes as words: "in a few minutes", "in 25 minutes", "in about an hour", "in about 2½ hours" */
export function inWords(min: number): string {
  if (min <= 3) return 'in a few minutes'
  if (min < 50) return `in ${Math.max(5, Math.round(min / 5) * 5)} minutes`
  if (min < 80) return 'in about an hour'
  const h = Math.round(min / 30) / 2
  return `in about ${h % 1 ? `${Math.floor(h)}½` : h} hours`
}

/** the quarter-hours of rain we have: the minute-by-minute forecast, or the hourly one spread out when that is all there is */
function slotsOf(w: Weather): { at: number; mm: number }[] {
  if (w.rain15?.length) return w.rain15
  if (!w.dayStart) return []
  return w.hourly.flatMap((h, i) => {
    const at = w.dayStart! + i * 3600_000
    const mm = h.mm ?? (isRainCode(h.code) ? 0.8 : 0)
    return [0, 1, 2, 3].map((q) => ({ at: at + q * STEP, mm: mm / 4 }))
  })
}

/**
 * The rain that matters now: the one falling, or the next to come. Gaps of one quarter-hour are not the end of it
 * (rain stutters); the end is a dry half hour.
 */
export function nextRain(w: Weather, now: number): RainEvent | null {
  const slots = slotsOf(w).filter((s) => s.at + STEP > now - STEP)
  const runs: { start: number; end: number; peak: number; total: number }[] = []
  let cur: { start: number; end: number; peak: number; total: number; dry: number } | null = null
  for (const s of slots) {
    if (s.mm >= WET) {
      if (!cur) cur = { start: s.at, end: s.at + STEP, peak: 0, total: 0, dry: 0 }
      cur.end = s.at + STEP
      cur.peak = Math.max(cur.peak, s.mm * 4)
      cur.total += s.mm
      cur.dry = 0
    } else if (cur) {
      cur.dry++
      if (cur.dry >= 2) {
        runs.push(cur)
        cur = null
      }
    }
  }
  if (cur) runs.push(cur)
  const horizon = slots.length ? slots[slots.length - 1].at + STEP : now
  const fallingNow = (w.precipNow ?? 0) >= 0.1 || isRainCode(w.code)
  const mk = (r: { start: number; end: number; peak: number; total: number }, isNow: boolean): RainEvent => ({
    start: r.start,
    end: r.end >= horizon - STEP ? null : r.end,
    peak: r.peak,
    total: r.total,
    now: isNow,
    strength: strength(r.peak),
  })
  const going = runs.find((r) => r.start <= now + STEP && r.end > now)
  if (fallingNow || going) {
    if (going) return mk(going, true)
    // it says it is raining but the quarter-hours do not: we know nothing about how long
    return { start: now, end: null, peak: Math.max(0.5, (w.precipNow ?? 0) * 4), total: 0, now: true, strength: strength(Math.max(0.5, (w.precipNow ?? 0) * 4)) }
  }
  const next = runs.find((r) => r.start > now)
  return next ? mk(next, false) : null
}

/** Lumi's advice on the rain chart: when to head out, and the window on the chart it means. */
export interface GoAdvice {
  mood: 'rainSoon' | 'rainNow' | 'rainEnds'
  text: string
  /** the dry window to go in (shaded on the chart), or null when there is none in the next three hours */
  from: number | null
  to: number | null
}

/**
 * Not the forecast again, but what to do with it: go now while it's dry, wait for it to pass, or take the
 * umbrella because there's no dry spell worth waiting for. Looks three hours ahead, like the chart.
 */
export function goAdvice(w: Weather, ev: RainEvent | null, now: number): GoAdvice | null {
  if (!ev) return null
  const horizon = now + 3 * 3600_000
  // when the next rain after `t` begins, or the end of the window
  const dryUntil = (t: number) => slotsOf(w).find((s) => s.at >= t && s.at < horizon && s.mm >= WET)?.at ?? horizon
  // "25 min", "about an hour", "about 2 hours"
  const mins = (ms: number) => inWords((ms - now) / 60_000).replace(/^in /, '').replace(/ minutes$/, ' min')
  if (ev.now) {
    if (ev.end && ev.end < horizon) {
      const wait = (ev.end - now) / 60_000
      return wait <= 45
        ? { mood: 'rainEnds', text: `Worth waiting: dry from ${clockAt(w, ev.end)}, in ${mins(ev.end)}`, from: ev.end, to: dryUntil(ev.end) }
        : { mood: 'rainNow', text: `Take the umbrella if you go now. Dry from ${clockAt(w, ev.end)}`, from: ev.end, to: dryUntil(ev.end) }
    }
    return { mood: 'rainNow', text: 'No dry spell in the next 3 hours: take the umbrella', from: null, to: null }
  }
  if (ev.start - now >= 15 * 60_000) return { mood: 'rainSoon', text: `Go before ${clockAt(w, ev.start)}: dry for ${mins(ev.start)}`, from: now, to: ev.start }
  if (ev.end && ev.end < horizon) return { mood: 'rainSoon', text: `Too close to beat it: wait until ${clockAt(w, ev.end)}, or take the umbrella`, from: ev.end, to: dryUntil(ev.end) }
  return { mood: 'rainNow', text: 'It sets in for hours: take the umbrella', from: null, to: null }
}

/** today's rain, hour by hour, from now: is it a rainy day? */
export function rainyDay(w: Weather, now: number): { from: number; to: number; mm: number } | null {
  if (!w.dayStart) return null
  const wet: { at: number; mm: number }[] = []
  w.hourly.slice(0, 24).forEach((h, i) => {
    const at = w.dayStart! + i * 3600_000
    if (at + 3600_000 <= now) return
    const mm = h.mm ?? (isRainCode(h.code) ? 0.8 : 0)
    if (mm >= 0.25 || (isRainCode(h.code) && (h.pop ?? 100) >= 50)) wet.push({ at, mm })
  })
  const mm = wet.reduce((a, b) => a + b.mm, 0)
  if (wet.length < 3 && mm < 6) return null
  return { from: wet[0].at, to: wet[wet.length - 1].at + 3600_000, mm }
}

export interface PlannedAlert {
  /** the same key is never sent twice */
  key: string
  icon: string
  text: string
  sub?: string
  /** how Lumi says it (with her face and her sounds), when she is on; otherwise it is a plain alert */
  mood: LumiMood
}

interface Context {
  /** the next class, so the advice can be about it */
  nextClass?: { title: string; start: number }
}

const celsius = (w: Weather, t: number) => (w.fahrenheit ? (t - 32) / 1.8 : t)

/**
 * What to tell the user about the weather right now: rain on its way (about an hour ahead, and again as it
 * arrives if it will be heavy), rain falling and when it should stop, a rainy day, a storm, strong sun, heat.
 * Pure: the same forecast and time give the same alerts, and the caller remembers which it has already sent.
 */
export function planAlerts(w: Weather, now: number, ctx: Context = {}): PlannedAlert[] {
  const out: PlannedAlert[] = []
  const hour = hourAt(w, now)
  const date = dateAt(w, now)
  const awake = hour >= 6 && hour < 22
  const ev = nextRain(w, now)

  // is the rain going to catch the next class?
  const cls = ctx.nextClass && ctx.nextClass.start - now < 3 * 3600_000 && ctx.nextClass.start > now - 30 * 60_000 ? ctx.nextClass : undefined
  const catchesClass = Boolean(ev && cls && ev.start <= cls.start + 3600_000 && (ev.end === null || ev.end > cls.start - 30 * 60_000))
  const className = cls?.title.replace(/\s*\(.*\)\s*$/, '')

  if (ev && hour >= 6 && hour < 23) {
    const mins = (ev.start - now) / 60_000
    const until = ev.end ? `, easing around ${clockAt(w, ev.end)}` : ', and it may last a while'
    const nap = catchesClass ? `Bring an umbrella to ${className}` : ev.strength === 'light' ? 'A light jacket will do' : 'Bring an umbrella'
    if (!ev.now && mins > 0 && mins <= 70) {
      out.push({ key: `soon:${ev.start}`, icon: '☂️', mood: 'rainSoon', text: `Raining ${inWords(mins)}`, sub: `${cap(ev.strength)} rain${until}. ${nap}` })
      if (mins <= 12 && ev.strength !== 'light') out.push({ key: `near:${ev.start}`, icon: '🌧️', mood: 'rainSoon', text: `Rain starting ${inWords(mins)}`, sub: 'Grab your umbrella before you head out' })
    } else if (ev.now) {
      if (ev.end && (ev.end - now) / 60_000 <= 75) {
        out.push({ key: `ends:${ev.start}`, icon: '🌧️', mood: 'rainEnds', text: `Rain should stop ${inWords((ev.end - now) / 60_000)}`, sub: `Around ${clockAt(w, ev.end)}. Hold on a little longer` })
      } else {
        out.push({ key: `now:${ev.start}`, icon: '🌧️', mood: 'rainNow', text: "It's raining", sub: ev.end ? `${cap(ev.strength)} rain until about ${clockAt(w, ev.end)}` : `${cap(ev.strength)} rain, and it looks like it will last for hours` })
      }
    }
  }

  if (awake) {
    // the first look of the day
    const day = rainyDay(w, now)
    // (rain that is already here, or about to be, has its own alert: the summary would only repeat it)
    if (day && hour < 18 && !(ev && (ev.now || ev.start - now <= 70 * 60_000))) {
      out.push({ key: `day:${date}`, icon: '🌧️', mood: 'rainyDay', text: 'Rainy day today!', sub: `Rain on and off from ${clockAt(w, day.from)} to ${clockAt(w, day.to)}${day.mm >= 1 ? `, about ${Math.round(day.mm)} mm` : ''}` })
    }
    // a thunderstorm in the next three hours
    if (w.dayStart) {
      const storm = w.hourly.findIndex((h, i) => h.code >= 95 && w.dayStart! + i * 3600_000 + 3600_000 > now && w.dayStart! + i * 3600_000 < now + 3 * 3600_000)
      if (storm >= 0) {
        const at = Math.max(now, w.dayStart + storm * 3600_000)
        out.push({ key: `storm:${w.dayStart + storm * 3600_000}`, icon: '⛈️', mood: 'storm', text: at - now < 20 * 60_000 ? 'Thunderstorm now' : `Thunderstorm ${inWords((at - now) / 60_000)}`, sub: 'Best to stay indoors until it passes' })
      }
    }
    if (hour < 15 && w.dayStart) {
      const day24 = w.hourly.slice(0, 24).map((h, i) => ({ i, h })).filter(({ i }) => w.dayStart! + i * 3600_000 + 3600_000 > now)
      const uv = Math.max(0, ...day24.filter(({ i }) => i >= 9 && i <= 16).map(({ h }) => h.uv ?? 0))
      if (uv >= 8) {
        const peak = day24.filter(({ i }) => i >= 9 && i <= 16).sort((a, b) => (b.h.uv ?? 0) - (a.h.uv ?? 0))[0]
        out.push({ key: `uv:${date}`, icon: '☀️', mood: 'strongSun', text: 'Strong sun today', sub: `UV ${Math.round(uv)} around ${String(peak.i).padStart(2, '0')}:00. Sunscreen helps` })
      }
      const hot = Math.max(-99, ...day24.filter(({ i }) => i >= 10 && i <= 17).map(({ h }) => celsius(w, h.feels ?? h.temp)))
      if (hot >= 35) out.push({ key: `heat:${date}`, icon: '🌡️', mood: 'hot', text: 'Hot day ahead', sub: `Feels like ${Math.round(w.fahrenheit ? hot * 1.8 + 32 : hot)}° this afternoon. Drink water, stay in the shade` })
    }
  }
  return out
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
