import { useEffect, useRef, useState } from 'react'
import { cachedWeather, describe, fetchWeather, isFresh, searchCities, type CityHit, type Weather } from '../lib/weather'
import type { Settings } from '../lib/settings'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

export function WeatherWidget({ settings, update }: Props) {
  const { city, fahrenheit, cityLat, cityLon } = settings
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
    fetchWeather(city, fahrenheit, cityLat != null && cityLon != null ? { lat: cityLat, lon: cityLon } : null)
      .then((w) => !cancelled && setWeather(w))
      .catch((e: Error) => !cancelled && setError(e.message === 'Failed to fetch' ? 'You appear to be offline' : e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, fahrenheit])

  const hourlyRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const updateEdges = () => {
    const el = hourlyRef.current
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    const el = hourlyRef.current
    const now = el?.children[weather?.nowHour ?? 0] as HTMLElement | undefined
    if (el && now) el.scrollLeft = now.offsetLeft - el.offsetLeft - 8
    updateEdges()
  }, [weather])
  // sideways wheel / trackpad scrolling; a plain mouse wheel scrolls the strip too
  useEffect(() => {
    const el = hourlyRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [weather])

  const unit = fahrenheit ? '°F' : '°C'

  if (editing || !city) {
    return (
      <CityPicker
        initial={draft}
        canCancel={!!city}
        onCancel={() => setEditing(false)}
        onPick={(hit) => {
          update({ city: hit.name, cityLat: hit.latitude, cityLon: hit.longitude })
          setWeather(null)
          setEditing(false)
        }}
      />
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
      <div
        className={`hourly ${edges.left ? 'more-left' : ''} ${edges.right ? 'more-right' : ''}`}
        ref={hourlyRef}
        onScroll={updateEdges}
      >
        {weather.hourly.map((h, i) => (
          <div key={h.hour} className={`hour ${i === weather.nowHour ? 'now' : ''}`}>
            <small>{i === weather.nowHour ? 'Now' : `${h.hour}:00`}</small>
            <span>{describe(h.code).icon}</span>
            <b>{h.temp}°</b>
          </div>
        ))}
      </div>
    </div>
  )
}

const place = (h: CityHit) => [h.admin1, h.country].filter(Boolean).join(', ')

/** Search box with a drop-down of matching cities. */
function CityPicker({
  initial,
  canCancel,
  onPick,
  onCancel,
}: {
  initial: string
  canCancel: boolean
  onPick: (hit: CityHit) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState(initial)
  const [hits, setHits] = useState<CityHit[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const [active, setActive] = useState(0)
  const touched = useRef(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !touched.current) {
      setHits([])
      setState('idle')
      return
    }
    setState('loading')
    const ctl = new AbortController()
    const id = setTimeout(() => {
      searchCities(q, ctl.signal)
        .then((r) => {
          setHits(r)
          setActive(0)
          setState(r.length ? 'idle' : 'empty')
        })
        .catch((e: Error) => e.name !== 'AbortError' && setState('error'))
    }, 250)
    return () => {
      clearTimeout(id)
      ctl.abort()
    }
  }, [query])

  return (
    <div className="weather center city-picker" onClick={(e) => e.stopPropagation()}>
      <div className="timer-label">Which city?</div>
      <div className="city-box">
        <input
          className="todo-input"
          autoFocus
          placeholder="Search a city, e.g. Jakarta"
          value={query}
          onChange={(e) => {
            touched.current = true
            setQuery(e.target.value)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(hits.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter' && hits[active]) onPick(hits[active])
            else if (e.key === 'Escape' && canCancel) onCancel()
          }}
        />
        {(hits.length > 0 || state !== 'idle') && (
          <div className="city-list" role="listbox">
            {state === 'loading' && !hits.length && <div className="city-note">Searching…</div>}
            {state === 'empty' && <div className="city-note">No matching city</div>}
            {state === 'error' && <div className="city-note">You appear to be offline</div>}
            {hits.map((h, i) => (
              <button
                key={`${h.latitude},${h.longitude}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(h)}
              >
                <span>{h.name}</span>
                <small>{place(h)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {canCancel && (
        <button className="chip" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
