import { useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import { cachedWeather, describe, fetchWeather, isFresh, searchCities, type CityHit, type Weather } from '../lib/weather'
import type { Settings } from '../lib/settings'
import { CloudRain, Droplets, Wind } from 'lucide-react'
import { WeatherIcon, isNight } from './WeatherIcon'

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
          <button className="pill-btn" data-cuelume-open onClick={() => setEditing(true)}>
            Change city
          </button>
        )}
      </div>
    )
  }

  const now = describe(weather.code)
  const start = weather.nowHour ?? 0
  const hours = weather.hourly.slice(start, start + HOURS)
  // today's high and low; the strip also holds tomorrow
  const temps = weather.hourly.slice(0, 24).map((h) => h.temp)
  const hi = Math.max(...temps)
  const lo = Math.min(...temps)
  // the next rain in the coming hours (or how long the current rain lasts)
  const rainingNow = isRain(weather.code)
  const rainFrom = rainingNow ? -1 : hours.findIndex((h, i) => i > 0 && isRain(h.code))
  const rainUntil = rainingNow ? hours.findIndex((h, i) => i > 0 && !isRain(h.code)) : -1
  const rainText = rainingNow
    ? rainUntil > 0
      ? `Raining now, easing around ${hours[rainUntil].hour}:00`
      : 'Raining now, for the next few hours'
    : rainFrom > 0
      ? `Rain from ${hours[rainFrom].hour}:00. Bring an umbrella if you head out.`
      : ''
  return (
    <div className="wx" onClick={(e) => e.stopPropagation()}>
      <div className="wx-now">
        <span className="wx-temp">{weather.temp}°</span>
        <span className="wx-desc">
          <b>{now.label}</b>
          <span>
            H {hi}° · L {lo}° · Feels {weather.feels}°
          </span>
          <span className="wx-extra">
            <Droplets size={13} aria-hidden /> {weather.humidity}%
            <Wind size={13} aria-hidden /> {weather.wind} km/h
          </span>
        </span>
        <button className="chip wx-city" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => { setDraft(city); setEditing(true) }}>
          {weather.city} · {unit}
        </button>
      </div>
      {rainText && (
        <div className="wx-rain">
          <CloudRain size={16} aria-hidden />
          <span>{rainText}</span>
        </div>
      )}
      <TempCurve hours={weather.hourly} now={start} />
    </div>
  )
}

/** Hours the rain heads-up looks ahead, and hours visible at once in the curve. */
const HOURS = 8
/** Width of one hour in the curve, in px: eight fit across the card. */
const VISIBLE_COL = 50.5
const isRain = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95

/** Today's hours as a temperature curve with rainy hours shaded, scrolled so the current hour is first. */
function TempCurve({ hours, now }: { hours: Weather['hourly']; now: number }) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = strip.current
    if (el) el.scrollLeft = (now * el.scrollWidth) / hours.length
  }, [now, hours.length])
  // drag the strip sideways with the mouse, like a touch screen
  const drag = useRef<{ x: number; left: number } | null>(null)
  // sideways wheel / trackpad scrolling; a plain mouse wheel scrolls the strip too
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  if (hours.length < 2) return null
  const COL = 50
  const W = hours.length * COL
  const H = 58
  const ts = hours.map((h) => h.temp)
  const min = Math.min(...ts)
  const span = Math.max(3, Math.max(...ts) - min)
  const x = (i: number) => (i + 0.5) * COL
  const y = (t: number) => 46 - ((t - min) / span) * 28
  const pts = hours.map((h, i) => [x(i), y(h.temp)])
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1][0] + pts[i][0]) / 2
    d += ` C${mx} ${pts[i - 1][1]} ${mx} ${pts[i][1]} ${pts[i][0]} ${pts[i][1]}`
  }
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString([], { weekday: 'short' })
  return (
    <div
      className="wx-chart"
      ref={strip}
      onPointerDown={(e) => {
        // keep the island and the page swipe from taking this drag
        e.stopPropagation()
        if (e.button !== 0) return
        drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft }
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.classList.add('dragging')
      }}
      onPointerMove={(e) => {
        if (drag.current) e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x)
      }}
      onPointerUp={(e) => {
        drag.current = null
        e.currentTarget.classList.remove('dragging')
      }}
      onPointerCancel={(e) => {
        drag.current = null
        e.currentTarget.classList.remove('dragging')
      }}
    >
      <div className="wx-strip" style={{ width: (W * VISIBLE_COL) / COL }}>
        <svg viewBox={`0 0 ${W} ${H}`} aria-label="Temperature through the day">
          <defs>
            <linearGradient id="wx-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {hours.map((h, i) =>
            isRain(h.code) ? <rect key={i} x={x(i) - COL / 2 + 3} y={0} width={COL - 6} height={H} rx={9} className="wx-rain-col" /> : null,
          )}
          <path d={`${d} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H}Z`} fill="url(#wx-area)" />
          <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          {pts.map(([px, py], i) => (
            <g key={i}>
              <circle cx={px} cy={py} r={i === now ? 3.5 : 2.2} className={i === now ? 'wx-pt now' : 'wx-pt'} />
              <text x={px} y={py - 9} textAnchor="middle" className="wx-label">
                {hours[i].temp}°
              </text>
            </g>
          ))}
        </svg>
        <div className="wx-cols" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
          {hours.map((h, i) => (
            <div key={i} className={isRain(h.code) ? 'rain' : ''}>
              <WeatherIcon code={h.code} night={isNight(Number(h.hour))} size={16} />
              <small>{i === now ? 'Now' : i >= 24 && h.hour === '00' ? tomorrow : h.hour}</small>
            </div>
          ))}
        </div>
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
          data-cuelume-type
          onChange={(e) => {
            touched.current = true
            setQuery(e.target.value)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (active < hits.length - 1) play('select', { emphasis: 'subtle', direction: 'forward' })
              setActive((a) => Math.min(hits.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (active > 0) play('select', { emphasis: 'subtle', direction: 'back' })
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter' && hits[active]) {
              play('select')
              onPick(hits[active])
            } else if (e.key === 'Escape' && canCancel) {
              play('close', { emphasis: 'subtle' })
              onCancel()
            }
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
                data-cuelume-select
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
        <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
