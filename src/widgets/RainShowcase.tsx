import { useState } from 'react'
import { CloudRain } from 'lucide-react'
import type { Weather } from '../lib/weather'
import { clockAt, goAdvice, inWords, nextRain, offsetOf } from '../lib/weatherOutlook'
import { LumiFace } from '../mascot/lumi/LumiFace'
import { RainTimeline } from './RainTimeline'
import { WeatherWidget } from './WeatherWidget'
import { DEFAULTS, type Settings } from '../lib/settings'

/** Dev only (`/?rain`): the rain card in the situations it has to explain, side by side. */

const Q = 15 * 60_000
// a fixed "now" a little after a quarter-hour, so every scenario lines up the same way
const NOW = Math.floor(Date.now() / Q) * Q + 4 * 60_000

/** mm in each quarter-hour, starting with the one under way */
function weather(mm: number[], raining: boolean): Weather {
  const start = Math.floor(NOW / Q) * Q
  return {
    city: 'Depok',
    temp: 27,
    feels: 30,
    code: raining ? 61 : 3,
    humidity: 84,
    wind: 9,
    hourly: [],
    precipNow: raining ? mm[0] * 4 : 0,
    rain15: mm.concat(Array(48 - mm.length).fill(0)).map((v, i) => ({ at: start + i * Q, mm: v })),
    utcOffset: -new Date().getTimezoneOffset() * 60,
    fetchedAt: NOW,
  } as unknown as Weather
}

const SCENES: { name: string; w: Weather }[] = [
  { name: 'Light rain on its way (your screenshot)', w: weather([0, 0, 0.3, 0.35, 0.3, 0.25, 0.15, 0.14, 0.13, 0.12, 0, 0, 0], false) },
  { name: 'Raining now, stopping soon (hovering 13:00)', w: weather([0.9, 0.7, 0.2, 0, 0, 0, 0, 0, 0, 0.2, 0.3, 0, 0], true) },
  { name: 'A downpour that settles in', w: weather([0, 0.4, 1.6, 2.4, 2.9, 2.2, 1.5, 1.2, 0.9, 0.8, 0.7, 0.6, 0.6], false) },
  { name: 'Dry for a couple of hours first', w: weather([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 1.4, 2.1, 1.8], false) },
]

function Card({ w, pin }: { w: Weather; pin?: number }) {
  const ev = nextRain(w, NOW)
  const advice = goAdvice(w, ev, NOW)
  const mins = ev ? (ev.start - NOW) / 60_000 : 0
  const line = !ev
    ? 'No rain expected'
    : ev.now
      ? `Raining now (${ev.strength}).${ev.end ? ` It should stop ${inWords((ev.end - NOW) / 60_000)}, around ${clockAt(w, ev.end)}.` : ' It looks like it will last for hours.'}`
      : `Rain ${inWords(mins)} (${ev.strength})${ev.end ? `, easing around ${clockAt(w, ev.end)}` : ''}.`
  return (
    <div className="wx" style={{ width: 460 }}>
      <div className="wx-rain">
        {advice ? (
          <span className="wx-rain-lumi">
            <LumiFace mood={advice.mood} height={44} body still follow={false} />
          </span>
        ) : (
          <CloudRain size={16} aria-hidden />
        )}
        <span className="wx-rain-text">
          <span>{line}</span>
          {advice && <b className="wx-go">{advice.text}</b>}
        </span>
        <RainTimeline slots={w.rain15!} event={ev} clock={(ms) => clockAt(w, ms)} utcOffset={offsetOf(w)} go={advice} now={NOW} pin={pin} />
      </div>
    </div>
  )
}

/** the real Weather page, its settings kept here so its questions and toggles can be tried */
function LiveWeather() {
  const [s, setS] = useState<Settings>({ ...DEFAULTS, city: LIVE.city, cityLat: LIVE.lat, cityLon: LIVE.lon, weatherAuto: false, fahrenheit: false, weatherAsked: location.search.includes('asked') })
  return <WeatherWidget settings={s} update={(patch) => setS((x) => ({ ...x, ...patch }))} />
}

const LIVE = (() => {
  const [lat, lon] = (new URLSearchParams(location.search).get('live') ?? '').split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { city: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon } : { city: 'Depok', lat: -6.3628, lon: 106.8269 }
})()

export function RainShowcase() {
  return (
    <div
      className="root"
      style={
        {
          '--island-bg': '#0b0d14',
          '--fg': '#f2f4ff',
          '--fg-rgb': '242 244 255',
          background: '#05060a',
          minHeight: '100vh',
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, max-content)',
          gap: 18,
          color: 'var(--fg)',
          fontFamily: 'var(--font-ui)',
        } as React.CSSProperties
      }
    >
      {/* the real card on today's real forecast: UI Depok, or any point (`?rain&live=-6.2883,106.7582`) */}
      {location.search.includes('live') && (
        <div style={{ gridColumn: '1 / -1', width: 480, background: '#0b0d14', borderRadius: 24, padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>Live: {LIVE.city}, right now</div>
          <LiveWeather />
        </div>
      )}
      {SCENES.map((s) => (
        <div key={s.name} style={{ background: '#0b0d14', borderRadius: 24, padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>{s.name}</div>
          <Card w={s.w} pin={s.name.includes('hovering') ? 3 : undefined} />
        </div>
      ))}
    </div>
  )
}
