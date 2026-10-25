export interface Weather {
  city: string
  fahrenheit: boolean
  temp: number
  feels: number
  code: number
  humidity: number
  wind: number
  hourly: { hour: string; temp: number; code: number }[]
  fetchedAt: number
}

const CACHE_KEY = 'di.weather'
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

export function cachedWeather(city: string, fahrenheit: boolean): Weather | null {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Weather | null
    if (w && w.city.toLowerCase() === city.toLowerCase() && w.fahrenheit === fahrenheit) return w
  } catch {
    /* ignore */
  }
  return null
}

export const isFresh = (w: Weather) => Date.now() - w.fetchedAt < MAX_AGE

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
  }
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }
}

/** Open-Meteo: free, no API key. */
export async function fetchWeather(city: string, fahrenheit: boolean): Promise<Weather> {
  const geo = (await (
    await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '1' })}`,
    )
  ).json()) as GeoResult
  const place = geo.results?.[0]
  if (!place) throw new Error('City not found')

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m',
    hourly: 'temperature_2m,weather_code',
    forecast_days: '2',
    timezone: 'auto',
    temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Weather service unavailable')
  const f = (await res.json()) as ForecastResult

  const start = Math.max(0, f.hourly.time.findIndex((t) => t >= f.current.time.slice(0, 13)))
  const hourly = f.hourly.time.slice(start + 1, start + 7).map((t, i) => ({
    hour: t.slice(11, 13),
    temp: Math.round(f.hourly.temperature_2m[start + 1 + i]),
    code: f.hourly.weather_code[start + 1 + i],
  }))

  const w: Weather = {
    city: place.name,
    fahrenheit,
    temp: Math.round(f.current.temperature_2m),
    feels: Math.round(f.current.apparent_temperature),
    code: f.current.weather_code,
    humidity: f.current.relative_humidity_2m,
    wind: Math.round(f.current.wind_speed_10m),
    hourly,
    fetchedAt: Date.now(),
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w))
  } catch {
    /* ignore */
  }
  return w
}
