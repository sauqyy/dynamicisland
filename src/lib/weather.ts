import { bmkgForecast, bmkgPlace } from './bmkg'
import { isRainCode, WET } from './weatherOutlook'

export interface Weather {
  city: string
  fahrenheit: boolean
  temp: number
  feels: number
  code: number
  humidity: number
  wind: number
  /** every hour of today and tomorrow, from today's midnight */
  hourly: {
    hour: string
    temp: number
    code: number
    /** chance of rain, % (the models' own) */
    pop?: number
    /** rain that hour, mm: the middle of what the forecasts say */
    mm?: number
    uv?: number
    feels?: number
    /** the share of the forecasts that have it raining that hour (0..1) */
    chance?: number
  }[]
  /** the instant (ms) the first hour of `hourly` starts, and the place's offset from UTC in seconds */
  dayStart?: number
  utcOffset?: number
  /** rain in the last quarter-hour, mm */
  precipNow?: number
  /**
   * the next twelve hours of rain, a quarter-hour at a time: `at` is the instant it starts, `mm` the middle of what
   * the forecasts say, and `chance` the share of them that have it raining (0..1)
   */
  rain15?: { at: number; mm: number; chance?: number }[]
  /** the forecasts this is the consensus of ("ECMWF", …, "BMKG Rempoa") */
  sources?: string[]
  /** index in `hourly` of the current hour */
  nowHour?: number
  fetchedAt: number
}

// .3: a consensus of several forecasts (see fetchWeather); forecasts kept before that are fetched again
const CACHE_KEY = 'di.weather.3'
const MAX_AGE = 20 * 60_000

/** WMO weather codes, as returned by Open-Meteo. */
export function describe(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code === 1) return { icon: '🌤️', label: 'Mostly clear' }
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Overcast' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: 'Rain' }
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' }
  if (code >= 80 && code <= 82) return { icon: '🌧️', label: 'Showers' }
  if (code === 85 || code === 86) return { icon: '🌨️', label: 'Snow showers' }
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '🌡️', label: 'Unknown' }
}

const HOUR = 3600_000
const QUARTER = 15 * 60_000
/** mm in an hour below which it isn't rain worth an umbrella: the quarter-hour threshold, four times */
const WET_HOUR = WET * 4

/**
 * One account of the rain for everything that shows it. Open-Meteo's weather codes call any trace of drizzle "rain"
 * while its quarter-hour amounts say how much really falls, so the hour strip, the sentence and Lumi could disagree:
 * rain icons until evening under a sentence saying it stops at two, or "raining now" on a hot dry afternoon. Here the
 * quarter-hour amounts decide (and the hourly amounts past their twelve hours): an hour or the present moment shows
 * rain only if enough falls, and then with a code as strong as the amount.
 */
export function reconcile(w: Weather) {
  const slots = w.rain15 ?? []
  const covered = (from: number, to: number) => slots.length > 0 && slots[0].at <= from && slots[slots.length - 1].at + QUARTER >= to
  const sum = (from: number, to: number) => slots.filter((s) => s.at >= from && s.at < to).reduce((a, s) => a + s.mm, 0)
  const rainCode = (mmPerHour: number, was: number) =>
    was >= 95 ? was : mmPerHour >= 7.5 ? 65 : mmPerHour >= 2.5 ? 63 : isRainCode(was) && was >= 80 ? was : 61
  /** a code that agrees with the amount: rain only if it is wet, never rain if it is dry */
  // (dry: a rain code becomes the cloud it would fall from, a thunderstorm with no rain to speak of too)
  const agree = (code: number, mmPerHour: number) => (mmPerHour >= WET_HOUR ? rainCode(mmPerHour, code) : isRainCode(code) ? 3 : code)
  if (w.dayStart != null) {
    w.hourly.forEach((h, i) => {
      const from = w.dayStart! + i * HOUR
      if (covered(from, from + HOUR)) h.mm = Math.round(sum(from, from + HOUR) * 10) / 10
      if (h.mm != null) h.code = agree(h.code, h.mm)
    })
  }
  // the present: the quarter-hour under way
  const now = slots.find((s) => s.at <= w.fetchedAt && s.at + QUARTER > w.fetchedAt)
  if (now) w.code = agree(w.code, now.mm * 4)
}

export function cachedWeather(city: string, fahrenheit: boolean): Weather | null {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Weather | null
    if (w && w.city.toLowerCase() === city.toLowerCase() && w.fahrenheit === fahrenheit) return w
  } catch {
    /* ignore */
  }
  return null
}

// a forecast cached before tomorrow's hours were kept is refreshed once
export const isFresh = (w: Weather) => w.nowHour != null && w.hourly.length > 24 && w.rain15 != null && Date.now() - w.fetchedAt < MAX_AGE

export interface CityHit {
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
}

/** City suggestions for the search box. */
export async function searchCities(query: string, signal?: AbortSignal): Promise<CityHit[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: query, count: '6', language: 'en' })}`,
    { signal },
  )
  if (!res.ok) throw new Error('Search unavailable')
  return ((await res.json()) as { results?: CityHit[] }).results ?? []
}

interface GeoResult {
  results?: { name: string; latitude: number; longitude: number }[]
}

/**
 * The forecast models asked together, by the name Open-Meteo gives each. They see the same sky differently (ECMWF,
 * for one, keeps a light drizzle over the tropics far more often than one falls), so no single one is trusted: every
 * number is the middle of what they say, and "rain" means most of them agree.
 */
const MODELS: [id: string, name: string][] = [
  ['ecmwf_ifs025', 'ECMWF'],
  ['gfs_seamless', 'GFS'],
  ['icon_seamless', 'ICON'],
  ['ukmo_seamless', 'UK Met Office'],
  ['jma_seamless', 'JMA'],
  ['meteofrance_seamless', 'Météo-France'],
]

type Column = (number | null)[] | undefined
interface ForecastResult {
  current: { time: string }
  utc_offset_seconds?: number
  hourly: { time: string[] } & Record<string, Column | string[]>
  minutely_15?: { time: string[] } & Record<string, Column | string[]>
}

/** the middle value, ignoring what a model doesn't give */
function median(xs: (number | null | undefined)[]): number | undefined {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return undefined
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** a weather code for an amount of rain (mm an hour) and the sky around it */
function codeFor(mmPerHour: number, cloud: number | undefined, thunder: boolean, fog: boolean): number {
  if (mmPerHour >= WET_HOUR) return thunder ? 95 : mmPerHour >= 7.5 ? 65 : mmPerHour >= 2.5 ? 63 : 61
  if (fog) return 45
  if (cloud == null) return 3
  return cloud < 15 ? 0 : cloud < 40 ? 1 : cloud < 75 ? 2 : 3
}

/** Open-Meteo (free, no API key), several models at once, and BMKG for a place in Indonesia. */
export async function fetchWeather(
  city: string,
  fahrenheit: boolean,
  coords?: { lat: number; lon: number } | null,
): Promise<Weather> {
  const geo = coords ? {} as GeoResult : (await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '1' })}`,
    )
  ).json()) as GeoResult
  const place = coords ? { name: city, latitude: coords.lat, longitude: coords.lon } : geo.results?.[0]
  if (!place) throw new Error('City not found')

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,uv_index,apparent_temperature,cloud_cover,relative_humidity_2m,wind_speed_10m',
    // the rain, a quarter of an hour at a time for the next twelve hours: this is what the rain alerts are built on
    minutely_15: 'precipitation',
    forecast_minutely_15: '48',
    forecast_days: '2',
    models: MODELS.map(([id]) => id).join(','),
    timezone: 'auto',
    temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
  })
  // BMKG's own forecast for the kelurahan, asked at the same time; the weather never waits on it failing
  const bmkg = bmkgPlace(place.latitude, place.longitude)
    .then(async (p) => (p ? { place: p, slots: await bmkgForecast(p.code) } : null))
    .catch(() => null)
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Weather service unavailable')
  const f = (await res.json()) as ForecastResult
  const local = await bmkg

  // a model's column of a variable ("precipitation" from ECMWF), where it gave one
  const col = (sec: Record<string, Column | string[]>, name: string, id: string) => sec[`${name}_${id}`] as Column
  const models = MODELS.filter(([id]) => col(f.hourly, 'temperature_2m', id)?.some((v) => v != null))
  const at = (sec: Record<string, Column | string[]>, name: string, i: number) => models.map(([id]) => col(sec, name, id)?.[i])

  const day = f.current.time.slice(0, 10)
  const first = Math.max(0, f.hourly.time.findIndex((t) => t.startsWith(day)))
  // Open-Meteo's times are the place's own clock, with no offset written: the offset says what instant they are
  const offset = f.utc_offset_seconds ?? 0
  const instant = (t: string) => Date.parse(`${t.length === 16 ? t : t.slice(0, 16)}:00Z`) - offset * 1000
  // BMKG's three-hourly forecast, as the three hours around each of its times
  const bmkgAt = (t: number) => local?.slots.find((s) => Math.abs(t - s.at) <= 90 * 60_000)

  // Open-Meteo's precipitation is what fell in the period *before* the time it is listed at: the hour listed
  // 14:00 holds the rain from 13:00 to 14:00. Each hour here holds the rain that falls during it.
  const hourly = f.hourly.time.slice(first, first + 48).map((t, i) => {
    const j = first + i
    const from = instant(t)
    const b = bmkgAt(from + 30 * 60_000)
    const mms = [...at(f.hourly, 'precipitation', j + 1), b ? Math.max(b.mm / 3, b.wet ? WET_HOUR : 0) : undefined].filter((x): x is number => x != null)
    const wet = mms.filter((x) => x >= WET_HOUR).length
    const codes = at(f.hourly, 'weather_code', j).filter((x): x is number => x != null)
    const mm = median(mms)
    const temp = median(at(f.hourly, 'temperature_2m', j))
    const feels = median(at(f.hourly, 'apparent_temperature', j))
    return {
      hour: t.slice(11, 13),
      temp: Math.round(temp ?? 0),
      code: codeFor(mm ?? 0, median(at(f.hourly, 'cloud_cover', j)), codes.filter((c) => c >= 95).length * 2 >= codes.length && codes.length > 0, codes.filter((c) => c === 45 || c === 48).length * 2 > codes.length),
      pop: median(at(f.hourly, 'precipitation_probability', j)),
      mm: mm == null ? undefined : Math.round(mm * 10) / 10,
      uv: median(at(f.hourly, 'uv_index', j)),
      feels: feels == null ? undefined : Math.round(feels),
      chance: mms.length ? wet / mms.length : undefined,
    }
  })
  const nowHour = Math.min(hourly.length - 1, Number(f.current.time.slice(11, 13)))

  // the same for the quarter-hours: the value listed 13:15 fell from 13:00, so that is where it starts
  const rain15 = f.minutely_15?.time.map((t, k) => {
    const start = instant(t) - 15 * 60_000
    const b = bmkgAt(start + 7.5 * 60_000)
    const mms = [...at(f.minutely_15!, 'precipitation', k), b ? Math.max(b.mm / 12, b.wet ? WET : 0) : undefined].filter((x): x is number => x != null)
    return { at: start, mm: median(mms) ?? 0, chance: mms.length ? mms.filter((x) => x >= WET).length / mms.length : 0 }
  })

  // now: the hour under way, eased toward the next one by the minute, and the rain of the quarter-hour under way
  const j = first + nowHour
  const minute = Number(f.current.time.slice(14, 16)) / 60
  const ease = (name: string) => {
    const a = median(at(f.hourly, name, j))
    const b = median(at(f.hourly, name, j + 1))
    return a == null ? undefined : b == null ? a : a + (b - a) * minute
  }
  const fetchedAt = Date.now()
  const slotNow = rain15?.find((s) => s.at <= fetchedAt && s.at + 15 * 60_000 > fetchedAt)

  const w: Weather = {
    city: place.name,
    fahrenheit,
    temp: Math.round(ease('temperature_2m') ?? 0),
    feels: Math.round(ease('apparent_temperature') ?? 0),
    code: slotNow ? codeFor(slotNow.mm * 4, median(at(f.hourly, 'cloud_cover', j)), (hourly[nowHour]?.code ?? 0) >= 95, hourly[nowHour]?.code === 45) : hourly[nowHour]?.code ?? 3,
    humidity: Math.round(median(at(f.hourly, 'relative_humidity_2m', j)) ?? 0),
    wind: Math.round(median(at(f.hourly, 'wind_speed_10m', j)) ?? 0),
    hourly,
    nowHour,
    dayStart: instant(f.hourly.time[first]),
    utcOffset: offset,
    precipNow: slotNow?.mm,
    rain15,
    sources: [...models.map(([, name]) => name), ...(local ? [`BMKG ${local.place.desa}`] : [])],
    fetchedAt,
  }
  reconcile(w)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w))
  } catch {
    /* ignore */
  }
  return w
}
