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
  hourly: { hour: string; temp: number; code: number; /** chance of rain, % */ pop?: number; /** rain that hour, mm */ mm?: number; uv?: number; feels?: number }[]
  /** the instant (ms) the first hour of `hourly` starts, and the place's offset from UTC in seconds */
  dayStart?: number
  utcOffset?: number
  /** rain in the last quarter-hour, mm */
  precipNow?: number
  /** the next twelve hours of rain, a quarter-hour at a time (mm); `at` is the instant it starts */
  rain15?: { at: number; mm: number }[]
  /** index in `hourly` of the current hour */
  nowHour?: number
  fetchedAt: number
}

// .2: the rain is lined up with the time it falls (see reconcile); forecasts kept before that are fetched again
const CACHE_KEY = 'di.weather.2'
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

interface ForecastResult {
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    weather_code: number
    relative_humidity_2m: number
    wind_speed_10m: number
    precipitation?: number
  }
  utc_offset_seconds?: number
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability?: number[]; precipitation?: number[]; uv_index?: number[]; apparent_temperature?: number[] }
  minutely_15?: { time: string[]; precipitation: number[] }
}

/** Open-Meteo: free, no API key. */
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
    current: 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,uv_index,apparent_temperature',
    // the rain, a quarter of an hour at a time for the next twelve hours: this is what the rain alerts are built on
    minutely_15: 'precipitation',
    forecast_minutely_15: '48',
    forecast_days: '2',
    timezone: 'auto',
    temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Weather service unavailable')
  const f = (await res.json()) as ForecastResult

  const day = f.current.time.slice(0, 10)
  const first = Math.max(0, f.hourly.time.findIndex((t) => t.startsWith(day)))
  // Open-Meteo's times are the place's own clock, with no offset written: the offset says what instant they are
  const offset = f.utc_offset_seconds ?? 0
  const instant = (t: string) => Date.parse(`${t.length === 16 ? t : t.slice(0, 16)}:00Z`) - offset * 1000
  // Open-Meteo's precipitation is what fell in the period *before* the time it is listed at: the hour listed
  // 14:00 holds the rain from 13:00 to 14:00. Each hour here holds the rain that falls during it.
  const hourly = f.hourly.time.slice(first, first + 48).map((t, i) => ({
    hour: t.slice(11, 13),
    temp: Math.round(f.hourly.temperature_2m[first + i]),
    code: f.hourly.weather_code[first + i],
    pop: f.hourly.precipitation_probability?.[first + i],
    mm: f.hourly.precipitation?.[first + i + 1],
    uv: f.hourly.uv_index?.[first + i],
    feels: f.hourly.apparent_temperature?.[first + i] != null ? Math.round(f.hourly.apparent_temperature[first + i]) : undefined,
  }))
  const nowHour = Math.min(hourly.length - 1, Number(f.current.time.slice(11, 13)))

  const w: Weather = {
    city: place.name,
    fahrenheit,
    temp: Math.round(f.current.temperature_2m),
    feels: Math.round(f.current.apparent_temperature),
    code: f.current.weather_code,
    humidity: f.current.relative_humidity_2m,
    wind: Math.round(f.current.wind_speed_10m),
    hourly,
    nowHour,
    dayStart: instant(f.hourly.time[first]),
    utcOffset: offset,
    precipNow: f.current.precipitation,
    // the same for the quarter-hours: the value listed 13:15 fell from 13:00, so that is where it starts
    rain15: f.minutely_15?.time.map((t, i) => ({ at: instant(t) - 15 * 60_000, mm: f.minutely_15!.precipitation[i] ?? 0 })),
    fetchedAt: Date.now(),
  }
  reconcile(w)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w))
  } catch {
    /* ignore */
  }
  return w
}
