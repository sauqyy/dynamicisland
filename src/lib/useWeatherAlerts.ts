import { useEffect, useRef } from 'react'
import type { SoundName } from 'cuelume'
import type { IslandAlert } from '../types'
import { detectPlace, isPlaceholderName, kmBetween } from './location'
import { fetchWeather } from './weather'
import { planAlerts } from './weatherOutlook'
import type { Settings } from './settings'

const SEEN_KEY = 'di.wx.seen'
const CHECK_EVERY = 10 * 60_000
const WHERE_EVERY = 30 * 60_000
/** moved less than this and she is still "here": the name and the forecast stay put */
const MOVED_KM = 3

type Push = (a: Omit<IslandAlert, 'id'>, cue?: SoundName) => void

/** what was already said, with when, so the same rain is never announced twice */
function loadSeen(): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>
    const cut = Date.now() - 3 * 86_400_000
    return Object.fromEntries(Object.entries(all).filter(([, t]) => t > cut))
  } catch {
    return {}
  }
}

interface Opts {
  enabled: boolean
  city: string
  lat: number | null
  lon: number | null
  fahrenheit: boolean
  push: Push
  /** the next class, so the umbrella advice can be about it */
  nextClass?: { title: string; start: number }
}

/**
 * Watches the forecast for where the user is, and tells them what they would want to know before they find out
 * the hard way: "Raining in about an hour", "Rain should stop in about 25 minutes", "Rainy day today!", a storm,
 * strong sun, heat. It looks every ten minutes, says each thing once, and takes its time between alerts.
 */
export function useWeatherAlerts({ enabled, city, lat, lon, fahrenheit, push, nextClass }: Opts) {
  const ctx = useRef(nextClass)
  ctx.current = nextClass
  const pushRef = useRef(push)
  pushRef.current = push

  useEffect(() => {
    if (!enabled || lat == null || lon == null) return
    let alive = true
    const timers: number[] = []
    const run = async () => {
      try {
        const w = await fetchWeather(city, fahrenheit, { lat, lon })
        if (!alive) return
        const seen = loadSeen()
        const fresh = planAlerts(w, Date.now(), { nextClass: ctx.current }).filter((a) => !seen[a.key])
        fresh.forEach((a, i) => {
          seen[a.key] = Date.now()
          // one at a time, a few seconds apart
          timers.push(window.setTimeout(() => alive && pushRef.current({ icon: a.icon, text: a.text, sub: a.sub, lumi: a.mood, openTab: 'weather' }, 'attention'), i * 4500))
        })
        if (fresh.length) localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
      } catch {
        /* offline, or the service is down: try again at the next look */
      }
    }
    timers.push(window.setTimeout(() => void run(), 20_000))
    const id = window.setInterval(() => void run(), CHECK_EVERY)
    return () => {
      alive = false
      timers.forEach((t) => window.clearTimeout(t))
      window.clearInterval(id)
    }
  }, [enabled, city, lat, lon, fahrenheit])
}

/**
 * While the user has asked the weather to follow them, find out where they are now and then, and move the city
 * (and with it the forecast and the alerts) when they have really moved.
 */
export function useFollowLocation({ enabled, city, lat, lon, update }: { enabled: boolean; city: string; lat: number | null; lon: number | null; update: (patch: Partial<Settings>) => void }) {
  const here = useRef({ city, lat, lon })
  here.current = { city, lat, lon }
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const look = async () => {
      try {
        const p = await detectPlace({ allowNetwork: true })
        if (!alive) return
        const was = here.current
        if (was.lat == null || was.lon == null || kmBetween({ lat: was.lat, lon: was.lon }, p) > MOVED_KM || (isPlaceholderName(was.city) && !isPlaceholderName(p.name))) update({ city: p.name, cityLat: p.lat, cityLon: p.lon })
      } catch {
        /* no fix this time */
      }
    }
    const first = window.setTimeout(() => void look(), 3000)
    const id = window.setInterval(() => void look(), WHERE_EVERY)
    return () => {
      alive = false
      window.clearTimeout(first)
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
