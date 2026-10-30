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

/** the device's position */
export function deviceLocation(wait = 9000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This computer cannot tell where it is'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Location is switched off for this app' : 'Could not find your location')),
      { enableHighAccuracy: false, timeout: wait, maximumAge: 10 * 60_000 },
    )
  })
}

/** a name for a point: the town or district it is in */
async function nameFor(lat: number, lon: number): Promise<string> {
  const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'en' })}`, { signal: timeout(6000) })
  if (!res.ok) throw new Error('no name')
  const r = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string }
  return r.locality || r.city || r.principalSubdivision || 'My location'
}

/** the network's idea of where the connection is, good to about a city */
async function networkLocation(): Promise<{ lat: number; lon: number; name: string }> {
  const res = await fetch('https://ipwho.is/', { signal: timeout(7000) })
  if (!res.ok) throw new Error('Could not find your location')
  const r = (await res.json()) as { success?: boolean; latitude?: number; longitude?: number; city?: string; region?: string }
  if (!r.success || r.latitude == null || r.longitude == null) throw new Error('Could not find your location')
  return { lat: r.latitude, lon: r.longitude, name: r.city || r.region || 'My location' }
}

export async function detectPlace({ allowNetwork }: { allowNetwork: boolean }): Promise<Place> {
  try {
    const p = await deviceLocation()
    return { ...p, name: await nameFor(p.lat, p.lon).catch(() => 'My location'), how: 'device' }
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
