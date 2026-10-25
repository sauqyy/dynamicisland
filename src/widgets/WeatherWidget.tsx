import { useEffect, useState } from 'react'
import { cachedWeather, describe, fetchWeather, isFresh, type Weather } from '../lib/weather'
import type { Settings } from '../lib/settings'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

export function WeatherWidget({ settings, update }: Props) {
  const { city, fahrenheit } = settings
  const [weather, setWeather] = useState<Weather | null>(() => (city ? cachedWeather(city, fahrenheit) : null))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(!city)
  const [draft, setDraft] = useState(city)

  useEffect(() => {
    if (!city) return
    const cached = cachedWeather(city, fahrenheit)
    if (cached && isFresh(cached)) {
      setWeather(cached)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchWeather(city, fahrenheit)
      .then((w) => !cancelled && setWeather(w))
      .catch((e: Error) => !cancelled && setError(e.message === 'Failed to fetch' ? 'You appear to be offline' : e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [city, fahrenheit])

  const unit = fahrenheit ? '°F' : '°C'

  if (editing || !city) {
    return (
      <div className="weather center" onClick={(e) => e.stopPropagation()}>
        <div className="timer-label">Which city?</div>
        <input
          className="todo-input"
          placeholder="e.g. Jakarta"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && draft.trim()) {
              update({ city: draft.trim() })
              setEditing(false)
            }
          }}
        />
      </div>
    )
  }

  if (!weather) {
    return (
      <div className="weather center" onClick={(e) => e.stopPropagation()}>
        <div className="timer-label">{error ?? (loading ? 'Loading weather…' : '')}</div>
        {error && (
          <button className="pill-btn" onClick={() => setEditing(true)}>
            Change city
          </button>
        )}
      </div>
    )
  }

  const now = describe(weather.code)
  return (
    <div className="weather" onClick={(e) => e.stopPropagation()}>
      <div className="weather-now">
        <span className="weather-icon">{now.icon}</span>
        <div>
          <div className="weather-temp">
            {weather.temp}
            {unit}
          </div>
          <div className="weather-desc">{now.label}</div>
        </div>
        <div className="weather-side">
          <button className="chip" onClick={() => { setDraft(city); setEditing(true) }}>
            {weather.city}
          </button>
          <small>
            Feels {weather.feels}° · 💧{weather.humidity}% · 💨{weather.wind}
          </small>
        </div>
      </div>
      <div className="hourly">
        {weather.hourly.map((h) => (
          <div key={h.hour} className="hour">
            <small>{h.hour}:00</small>
            <span>{describe(h.code).icon}</span>
            <b>{h.temp}°</b>
          </div>
        ))}
      </div>
    </div>
  )
}
