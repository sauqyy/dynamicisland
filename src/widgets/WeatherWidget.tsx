import { useEffect, useRef, useState } from 'react'
import { play } from 'cuelume'
import { cachedWeather, describe, fetchWeather, isFresh, searchCities, type CityHit, type Weather } from '../lib/weather'
import type { Settings } from '../lib/settings'
import { CloudRain, Droplets, LocateFixed, MapPin, Wind } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { LocationError, detectPlace, timezoneGuess, type Place } from '../lib/location'
import { IS_TAURI } from '../lib/useMedia'
import { clockAt, inWords, nextRain } from '../lib/weatherOutlook'
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
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  // when nothing can place the user: their time zone's main city, offered to accept (never applied on its own)
  const [suggest, setSuggest] = useState<Place | null>(null)
  const [denied, setDenied] = useState(false)

  /** find where the user is and follow it; `network` allows the (city-level) lookup by connection when the device cannot say */
  const locate = async (network: boolean, quiet = false) => {
    setLocating(true)
    setLocError(null)
    setSuggest(null)
    setDenied(false)
    try {
      const p = await detectPlace({ allowNetwork: network })
      update({ city: p.name, cityLat: p.lat, cityLon: p.lon, weatherAuto: true })
      setWeather(null)
      setEditing(false)
    } catch (e) {
      // the try made on its own when the page first opens: no blame, just what to press next
      setLocError(quiet ? 'Press Use my location to find where you are' : (e as Error).message)
      if (!quiet) {
        setDenied(e instanceof LocationError && e.denied)
        void timezoneGuess().then(setSuggest)
      }
    } finally {
      setLocating(false)
    }
  }
  // the first time there is no city at all: ask the device where it is (this is what brings up the permission prompt)
  const asked = useRef(false)
  useEffect(() => {
    if (city || asked.current) return
    asked.current = true
    void locate(false, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          // a city picked by hand stays: the weather stops following the user
          update({ city: hit.name, cityLat: hit.latitude, cityLon: hit.longitude, weatherAuto: false })
          setWeather(null)
          setEditing(false)
        }}
        onLocate={() => void locate(true)}
        locating={locating}
        locError={locError}
        denied={denied}
        suggest={suggest}
        onSuggest={(p) => {
          // a guess from the time zone is a city picked by hand: the weather does not follow the user from it
          update({ city: p.name, cityLat: p.lat, cityLon: p.lon, weatherAuto: false })
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
  // what the rain is doing: from the minute-by-minute forecast when we have it
  const ev = weather.rain15 ? nextRain(weather, Date.now()) : null
  const evMins = ev ? (ev.start - Date.now()) / 60_000 : 0
  const rainLine = !weather.rain15
    ? ''
    : !ev
      ? 'No rain expected for the next 12 hours'
      : ev.now
        ? `Raining now (${ev.strength}). ${ev.end ? `It should stop ${inWords((ev.end - Date.now()) / 60_000)}, around ${clockAt(weather, ev.end)}.` : 'It looks like it will last for hours.'}`
        : evMins <= 480
          ? `Rain ${inWords(evMins)} (${ev.strength})${ev.end ? `, easing around ${clockAt(weather, ev.end)}` : ''}. Bring an umbrella if you head out.`
          : 'No rain expected for the next 8 hours'
  // (without it: the next rain in the coming hours, or how long the current rain lasts)
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
          {settings.weatherAuto && <MapPin size={11} aria-label="Following your location" style={{ marginRight: 4, verticalAlign: -1 }} />}
          {weather.city} · {unit}
        </button>
      </div>
      {(rainLine || rainText) && (
        <div className="wx-rain">
          <CloudRain size={16} aria-hidden />
          <span>{rainLine || rainText}</span>
          {weather.rain15 && ev && (ev.now || evMins <= 180) && <RainBars slots={weather.rain15} />}
        </div>
      )}
      <TempCurve hours={weather.hourly} now={start} />
    </div>
  )
}

/** The next three hours of rain, a quarter-hour per bar: how much, and when it starts and stops. */
function RainBars({ slots }: { slots: { at: number; mm: number }[] }) {
  const now = Date.now()
  const next = slots.filter((s) => s.at + 15 * 60_000 > now).slice(0, 12)
  const top = Math.max(0.6, ...next.map((s) => s.mm))
  return (
    <span className="wx-bars" aria-label="Rain over the next three hours">
      {next.map((s) => (
        <i key={s.at} title={`${s.mm.toFixed(1)} mm`} style={{ height: `${Math.max(8, Math.min(100, (s.mm / top) * 100))}%`, opacity: s.mm >= 0.12 ? 1 : 0.22 }} />
      ))}
    </span>
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
  // which day the strip starts on, and whether the current hour is in view
  const [view, setView] = useState({ tomorrow: false, nowInView: true })
  const colPx = () => (strip.current ? strip.current.scrollWidth / hours.length : VISIBLE_COL)
  const onScroll = () => {
    const el = strip.current
    if (!el) return
    const c = colPx()
    const first = el.scrollLeft / c + 0.5
    const nowInView = (now + 1) * c > el.scrollLeft + c * 0.4 && now * c < el.scrollLeft + el.clientWidth - c * 0.4
    setView((v) => (v.tomorrow === first >= 24 && v.nowInView === nowInView ? v : { tomorrow: first >= 24, nowInView }))
  }
  // the current hour opens second from the left, with the hour before it still in view
  const toNow = (smooth: boolean) => {
    const el = strip.current
    if (el) el.scrollTo({ left: Math.max(0, now - 1) * colPx(), behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    toNow(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const today = new Date().toLocaleDateString([], { weekday: 'short' })
  return (
    <div className="wx-hours">
      <div className="wx-hours-head">
        <span className="wx-day">{view.tomorrow ? `Tomorrow · ${tomorrow}` : `Today · ${today}`}</span>
        {!view.nowInView && (
          <button
            className="chip wx-to-now"
            data-cuelume-navigate
            data-cuelume-emphasis="subtle"
            onClick={() => toNow(true)}
          >
            Back to now
          </button>
        )}
      </div>
      <div
        className="wx-chart"
        ref={strip}
        onScroll={onScroll}
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
          <svg viewBox={`0 0 ${W} ${H}`} aria-label="Temperature for today and tomorrow">
            <defs>
              <linearGradient id="wx-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {hours.map((h, i) =>
              isRain(h.code) ? <rect key={i} x={x(i) - COL / 2 + 3} y={0} width={COL - 6} height={H} rx={9} className="wx-rain-col" /> : null,
            )}
            {/* the hours already gone today are dimmed; a line marks now, another marks midnight */}
            <rect x={0} y={0} width={now * COL} height={H} className="wx-past" />
            {hours.length > 24 && <line x1={24 * COL} x2={24 * COL} y1={0} y2={H} className="wx-midnight" />}
            <line x1={x(now)} x2={x(now)} y1={0} y2={H} className="wx-now-line" />
            <path d={`${d} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H}Z`} fill="url(#wx-area)" />
            <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            {pts.map(([px, py], i) => (
              <g key={i} className={i < now ? 'past' : ''}>
                <circle cx={px} cy={py} r={i === now ? 3.5 : 2.2} className={i === now ? 'wx-pt now' : 'wx-pt'} />
                <text x={px} y={py - 9} textAnchor="middle" className="wx-label">
                  {hours[i].temp}°
                </text>
              </g>
            ))}
          </svg>
          <div className="wx-cols" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
            {hours.map((h, i) => (
              <div key={i} className={[isRain(h.code) && 'rain', i === now && 'now', i < now && 'past', i === 24 && 'midnight'].filter(Boolean).join(' ')}>
                <WeatherIcon code={h.code} night={isNight(Number(h.hour))} size={16} />
                <small>{i === now ? 'Now' : i === 24 ? tomorrow : `${h.hour}:00`}</small>
              </div>
            ))}
          </div>
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
  onLocate,
  locating,
  locError,
  denied,
  suggest,
  onSuggest,
}: {
  initial: string
  canCancel: boolean
  onPick: (hit: CityHit) => void
  onCancel: () => void
  onLocate: () => void
  locating: boolean
  locError: string | null
  /** the device is refusing (Windows has location off for it) */
  denied: boolean
  suggest: Place | null
  onSuggest: (p: Place) => void
}) {
  const [query, setQuery] = useState(initial)
  const [hits, setHits] = useState<CityHit[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const [active, setActive] = useState(0)
  const touched = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  // autoFocus would scroll the page's clip box to the still-sliding input and make the page jump
  useEffect(() => input.current?.focus({ preventScroll: true }), [])

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
      <button className="pill-btn" data-cuelume-tap disabled={locating} onClick={onLocate}>
        <LocateFixed size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
        {locating ? 'Finding you…' : 'Use my location'}
      </button>
      {locError && <div className="city-note">{locError.replace(/[.]$/, '')}. You can also search for a city below.</div>}
      {locError && denied && IS_TAURI && (
        <button className="chip" data-cuelume-open onClick={() => invoke('open_url', { url: 'ms-settings:privacy-location' }).catch(() => {})}>
          Open Windows location settings
        </button>
      )}
      {suggest && (
        <button className="chip" data-cuelume-tap onClick={() => onSuggest(suggest)} title="Guessed from your computer's time zone, so it can be a whole region off">
          <MapPin size={12} aria-hidden style={{ marginRight: 4, verticalAlign: -1 }} />
          Use {suggest.name} (from your time zone)
        </button>
      )}
      <div className="city-box">
        <input
          className="todo-input"
          ref={input}
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
