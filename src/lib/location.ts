/**
 * Where the user is, for the weather. Two ways, the better one first:
 *  - the device's own position (GPS, or Wi-Fi where there is no GPS), which asks the user's permission and is
 *    accurate to a street or two, which is what rain timing needs;
 *  - failing that, and only when the caller allows it, the network's idea of where the connection is, which is
 *    good to about a city: it sends the connection's address to a lookup service, so it is never done silently.
 */
export interface Place {
  name: string
  lat: number
  lon: number
  /** where it came from: the device, or the network */
  how: 'device' | 'network'
}

const timeout = (ms: number) => AbortSignal.timeout(ms)

/** one reading of the device's position */
function readPosition(high: boolean, wait: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: high, timeout: wait, maximumAge: 60_000 }))
}

/**
 * The device's position. It asks for the precise fix first (GPS or Wi-Fi), and only settles for the rough one
 * when that does not come in time: the rough one alone was often a whole district off.
 */
export async function deviceLocation(wait = 9000): Promise<{ lat: number; lon: number; accuracy: number }> {
  if (!('geolocation' in navigator)) throw new Error('This computer cannot tell where it is')
  let p: GeolocationPosition
  try {
    p = await readPosition(true, wait)
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) throw new Error('Location is switched off for this app')
    p = await readPosition(false, wait).catch(() => {
      throw new Error('Could not find your location')
    })
  }
  return { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }
}

type Namer = (lat: number, lon: number) => Promise<string | undefined>
const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { signal: timeout(6000) })
  if (!res.ok) throw new Error('no name')
  return (await res.json()) as T
}
/** the services that can name a point, tried in turn: if one is down or blocked, the next one answers */
const NAMERS: Namer[] = [
  async (lat, lon) => {
    const r = await getJson<{ city?: string; locality?: string; principalSubdivision?: string }>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'en' })}`,
    )
    return r.locality || r.city || r.principalSubdivision
  },
  async (lat, lon) => {
    const r = await getJson<{ address?: Record<string, string> }>(
      `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '14', 'accept-language': 'en' })}`,
    )
    const a = r.address ?? {}
    return a.suburb || a.city_district || a.village || a.town || a.city || a.county || a.state
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

/** the network's idea of where the connection is, good to about a city */
async function networkLocation(): Promise<{ lat: number; lon: number; name: string }> {
  const res = await fetch('https://ipwho.is/', { signal: timeout(7000) })
  if (!res.ok) throw new Error('Could not find your location')
  const r = (await res.json()) as { success?: boolean; latitude?: number; longitude?: number; city?: string; region?: string }
  if (!r.success || r.latitude == null || r.longitude == null) throw new Error('Could not find your location')
  return { lat: r.latitude, lon: r.longitude, name: r.city || r.region || (await nameFor(r.latitude, r.longitude)) }
}

/** names that earlier versions saved when they could not name the place: worth replacing */
export const isPlaceholderName = (name: string) => !name.trim() || name === 'My location' || /^-?\d+\.\d+, -?\d+\.\d+$/.test(name)

export async function detectPlace({ allowNetwork }: { allowNetwork: boolean }): Promise<Place> {
  try {
    const p = await deviceLocation()
    // a fix this rough (several km: the computer guessed from the connection) is no better than the network's, so
    // it only counts when there is nothing else to go on
    if (!(allowNetwork && p.accuracy > 5000)) return { lat: p.lat, lon: p.lon, name: await nameFor(p.lat, p.lon), how: 'device' }
  } catch (e) {
    if (!allowNetwork) throw e
  }
  return { ...(await networkLocation()), how: 'network' }
}

/** straight-line distance, in km */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
