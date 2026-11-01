/**
 * Where the user is, for the weather. Three ways, the better one first:
 *  - the device's own position (GPS, or Wi-Fi where there is no GPS), which asks the user's permission and is
 *    accurate to a street or two, which is what rain timing needs;
 *  - failing that, and only when the caller allows it, the network's idea of where the connection is, which is
 *    good to about a city: it sends the connection's address to a lookup service, so it is never done silently;
 *  - and when even that fails (a network that blocks those services, a VPN), the main city of the computer's time
 *    zone, which is only ever offered as a suggestion for the user to accept, never applied on its own.
 */
import { searchCities } from './weather'

export interface Place {
  name: string
  lat: number
  lon: number
  /** where it came from: the device, the network, or the time zone */
  how: 'device' | 'network' | 'timezone'
}

/** why the device could not say, so the user is told the thing they can fix */
export class LocationError extends Error {
  /** the device refused (Windows or the app has location switched off) */
  denied: boolean
  constructor(message: string, denied = false) {
    super(message)
    this.denied = denied
  }
}

const DENIED = 'Location is switched off for this app. Turn it on in Windows: Settings > Privacy & security > Location, including "Let desktop apps access your location"'
const NO_FIX = 'Could not find your location'

const timeout = (ms: number) => AbortSignal.timeout(ms)

/** one reading of the device's position */
function readPosition(high: boolean, wait: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: high, timeout: wait, maximumAge: 60_000 }))
}

/**
 * The device's position. It asks for the precise fix first (GPS or Wi-Fi), and only settles for the rough one
 * when that does not come in time: the rough one alone was often a whole district off.
 */
export async function deviceLocation(wait = 8000): Promise<{ lat: number; lon: number; accuracy: number }> {
  if (!('geolocation' in navigator)) throw new LocationError('This computer cannot tell where it is')
  let p: GeolocationPosition
  try {
    p = await readPosition(true, wait)
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) throw new LocationError(DENIED, true)
    p = await readPosition(false, wait).catch((e2: GeolocationPositionError) => {
      throw e2?.code === 1 ? new LocationError(DENIED, true) : new LocationError(NO_FIX)
    })
  }
  return { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }
}

type Namer = (lat: number, lon: number) => Promise<string | undefined>
const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { signal: timeout(6000) })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()) as T
}
/**
 * The services that can name a point, tried in turn: if one is down or blocked, the next one answers. The most
 * local name wins: the kelurahan or desa ("Rempoa"), not the kecamatan around it ("Ciputat Timur"), which is what
 * a phone shows too. OpenStreetMap knows the kelurahan; BigDataCloud stops at the kecamatan, so it comes second.
 * (Smaller still, an RW or RT, is a number, not a place anyone would recognise.)
 */
const NAMERS: Namer[] = [
  async (lat, lon) => {
    const r = await getJson<{ address?: Record<string, string> }>(
      `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '14', 'accept-language': 'id,en' })}`,
    )
    const a = r.address ?? {}
    return a.village || a.suburb || a.quarter || a.hamlet || a.city_district || a.town || a.city || a.county || a.state
  },
  async (lat, lon) => {
    const r = await getJson<{ city?: string; locality?: string; principalSubdivision?: string }>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'en' })}`,
    )
    return r.locality || r.city || r.principalSubdivision
  },
]

/** a name for a point: the district or town it is in, or failing every service, its coordinates (never a bare "My location") */
async function nameFor(lat: number, lon: number): Promise<string> {
  for (const namer of NAMERS) {
    const name = await namer(lat, lon).catch(() => undefined)
    if (name) return name
  }
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
}

type Guess = { lat?: number; lon?: number; city?: string; region?: string }
/**
 * The services that can place a connection. Asked all at once (a blocked one only has to time out, not hold up the
 * rest), and the first real answer wins: one that is down, busy or blocked on this network is not the end of it.
 */
const GUESSERS: (() => Promise<Guess>)[] = [
  async () => {
    const r = await getJson<{ success?: boolean; latitude?: number; longitude?: number; city?: string; region?: string }>('https://ipwho.is/')
    if (!r.success) throw new Error('no fix')
    return { lat: r.latitude, lon: r.longitude, city: r.city, region: r.region }
  },
  async () => {
    const r = await getJson<{ latitude?: number; longitude?: number; city?: string; region?: string; error?: boolean }>('https://ipapi.co/json/')
    if (r.error) throw new Error('no fix')
    return { lat: r.latitude, lon: r.longitude, city: r.city, region: r.region }
  },
  async () => {
    const r = await getJson<{ latitude?: number; longitude?: number; cityName?: string; regionName?: string }>('https://freeipapi.com/api/json')
    return { lat: r.latitude, lon: r.longitude, city: r.cityName, region: r.regionName }
  },
  async () => {
    const r = await getJson<{ loc?: string; city?: string; region?: string }>('https://ipinfo.io/json')
    const [lat, lon] = (r.loc ?? '').split(',').map(Number)
    return { lat, lon, city: r.city, region: r.region }
  },
  async () => {
    const r = await getJson<{ latitude?: string; longitude?: string; city?: string; region?: string }>('https://get.geojs.io/v1/ip/geo.json')
    return { lat: Number(r.latitude), lon: Number(r.longitude), city: r.city, region: r.region }
  },
]

/** the first of these to come back with a real point (not 0, 0: some services answer that when they do not know) */
function firstGuess(): Promise<{ lat: number; lon: number; city?: string; region?: string }> {
  return new Promise((resolve, reject) => {
    let left = GUESSERS.length
    for (const guess of GUESSERS) {
      guess()
        .then((r) => {
          const ok = Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat as number) <= 90 && Math.abs(r.lon as number) <= 180 && !(r.lat === 0 && r.lon === 0)
          if (ok) resolve({ lat: r.lat as number, lon: r.lon as number, city: r.city, region: r.region })
          else throw new Error('no fix')
        })
        .catch(() => {
          if (--left === 0) reject(new LocationError('Could not work out where you are from your connection. A VPN, or a network that blocks location lookups, can cause this'))
        })
    }
  })
}

/** the network's idea of where the connection is, good to about a city */
async function networkLocation(): Promise<{ lat: number; lon: number; name: string }> {
  const r = await firstGuess()
  return { lat: r.lat, lon: r.lon, name: r.city || r.region || (await nameFor(r.lat, r.lon)) }
}

/**
 * The main city of the computer's time zone ("Asia/Jakarta" gives Jakarta), looked up like any city the user would
 * type. It can be a whole region away from the user, so it is only a suggestion; null when the time zone names no city.
 */
export async function timezoneGuess(): Promise<Place | null> {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const city = zone.split('/').pop()?.replace(/_/g, ' ')
    if (!city || /^(utc|gmt|etc|local)/i.test(city)) return null
    const hits = await searchCities(city)
    const hit = hits[0]
    return hit ? { name: hit.name, lat: hit.latitude, lon: hit.longitude, how: 'timezone' } : null
  } catch {
    return null
  }
}

/** names that earlier versions saved when they could not name the place: worth replacing */
export const isPlaceholderName = (name: string) => !name.trim() || name === 'My location' || /^-?\d+\.\d+, -?\d+\.\d+$/.test(name)

export async function detectPlace({ allowNetwork }: { allowNetwork: boolean }): Promise<Place> {
  let device: { lat: number; lon: number; accuracy: number } | null = null
  let failed: Error | null = null
  try {
    device = await deviceLocation()
  } catch (e) {
    if (!allowNetwork) throw e
    failed = e as Error
  }
  // a fix this rough (several km: the computer guessed from the connection) is no better than the network's, so
  // it only counts when the network cannot say either
  if (device && !(allowNetwork && device.accuracy > 5000)) return { lat: device.lat, lon: device.lon, name: await nameFor(device.lat, device.lon), how: 'device' }
  try {
    return { ...(await networkLocation()), how: 'network' }
  } catch (e) {
    if (device) return { lat: device.lat, lon: device.lon, name: await nameFor(device.lat, device.lon), how: 'device' }
    // the device being switched off is the thing the user can fix, so that is what they are told
    throw failed instanceof LocationError && failed.denied ? failed : e
  }
}

/** straight-line distance, in km */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
