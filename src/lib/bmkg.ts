/**
 * BMKG, Indonesia's own weather agency, forecasts every kelurahan and desa by itself (api.bmkg.go.id), which is the
 * most local forecast there is for a place in Indonesia. It is asked by the area's Kemendagri code ("36.74.05.1005"
 * is Rempoa), so a point is turned into one: OpenStreetMap names the province, city, kecamatan and kelurahan around
 * it, and the Kemendagri list (wilayah.id) gives each name's code. The code is kept per spot, so that is done once.
 * Outside Indonesia, or when a name can't be matched, there is simply no BMKG forecast. Data: BMKG (Badan Meteorologi,
 * Klimatologi, dan Geofisika).
 */

import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

export interface BmkgPlace {
  /** the Kemendagri code of the kelurahan / desa */
  code: string
  /** its name, as BMKG and Kemendagri write it */
  desa: string
}

export interface BmkgSlot {
  /** the instant BMKG's forecast is for */
  at: number
  /** rain over the three hours around it, mm */
  mm: number
  /** BMKG calls it rain (light rain or more, or a thunderstorm) */
  wet: boolean
  /** BMKG's own words, in English ("Partly Cloudy") */
  desc: string
}

const CACHE = 'di.bmkg.place'
/** a spot (about 100 m) keeps its code; an answer of "nowhere" is asked again after a week */
const key = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`
const RETRY = 7 * 86_400_000

const timeout = () => AbortSignal.timeout(8000)
const getJson = async <T,>(url: string): Promise<T> => {
  // BMKG and wilayah.id refuse a page's own request (no CORS, or a 403 for another site's Origin): the app asks
  // from Rust instead (public_data.rs); OpenStreetMap answers the page directly
  if (IS_TAURI && !url.startsWith('https://nominatim.openstreetmap.org/')) return JSON.parse(await invoke<string>('public_json', { url })) as T
  // (the browser demo goes through the dev server's proxy for them, see vite.config.ts)
  if (import.meta.env.DEV && !IS_TAURI) url = url.replace('https://api.bmkg.go.id', '/__bmkg').replace('https://wilayah.id', '/__wilayah')
  const res = await fetch(url, { signal: timeout() })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()) as T
}

/** "Kota Tangerang Selatan", "Kab. Bogor", "DKI Jakarta", "Kelurahan Rempoa" -> the name alone, for comparing */
function bare(s: string) {
  return s
    .toLowerCase()
    .replace(/daerah khusus ibukota|daerah istimewa|\b(provinsi|kota administrasi|kota adm\.?|kota|kabupaten administrasi|kabupaten|kab\.?|kecamatan|kec\.?|kelurahan|kel\.?|desa|dki|di)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

/** the entry whose name is the same as one of `names`, or failing that, contains it (or is contained by it) */
function pick<T extends { name: string }>(list: T[], names: (string | undefined)[]): T | undefined {
  const want = names.filter(Boolean).map((n) => bare(n!)).filter(Boolean)
  return (
    list.find((x) => want.includes(bare(x.name))) ??
    list.find((x) => {
      const b = bare(x.name)
      return want.some((w) => b.length > 3 && w.length > 3 && (b.includes(w) || w.includes(b)))
    })
  )
}

type Region = { code: string; name: string }
const regions = async (path: string) => (await getJson<{ data: Region[] }>(`https://wilayah.id/api/${path}.json`)).data

async function lookUp(lat: number, lon: number): Promise<BmkgPlace | null> {
  const r = await getJson<{ address?: Record<string, string> }>(
    `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '14', 'accept-language': 'id' })}`,
  )
  const a = r.address ?? {}
  if (a.country_code !== 'id') return null
  const prov = pick(await regions('provinces'), [a.state, a.province, a.region])
  if (!prov) return null
  const city = pick(await regions(`regencies/${prov.code}`), [a.city, a.county, a.town, a.municipality])
  if (!city) return null
  const district = pick(await regions(`districts/${city.code}`), [a.city_district, a.district, a.subdistrict, a.suburb, a.municipality])
  if (!district) return null
  const village = pick(await regions(`villages/${district.code}`), [a.village, a.suburb, a.quarter, a.hamlet, a.neighbourhood])
  return village ? { code: village.code, desa: village.name } : null
}

/** the kelurahan / desa a point is in, by its Kemendagri code; null outside Indonesia or when it can't be matched */
export async function bmkgPlace(lat: number, lon: number): Promise<BmkgPlace | null> {
  const k = key(lat, lon)
  let saved: Record<string, { place: BmkgPlace | null; at: number }> = {}
  try {
    saved = JSON.parse(localStorage.getItem(CACHE) ?? '{}')
  } catch {
    /* start again */
  }
  const hit = saved[k]
  if (hit && (hit.place || Date.now() - hit.at < RETRY)) return hit.place
  const place = await lookUp(lat, lon)
  try {
    // only the last few spots are kept
    const keep = Object.entries(saved).sort((x, y) => y[1].at - x[1].at).slice(0, 7)
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries([...keep, [k, { place, at: Date.now() }]])))
  } catch {
    /* ignore */
  }
  return place
}

/** BMKG's three-hourly forecast for a kelurahan / desa, for about the next three days */
export async function bmkgForecast(code: string): Promise<BmkgSlot[]> {
  type Entry = { datetime: string; tp?: number; weather?: number; weather_desc_en?: string }
  const r = await getJson<{ data?: { cuaca?: Entry[][] }[] }>(`https://api.bmkg.go.id/publik/prakiraan-cuaca?${new URLSearchParams({ adm4: code })}`)
  return (r.data?.[0]?.cuaca ?? []).flat().map((e) => ({
    at: Date.parse(e.datetime),
    mm: e.tp ?? 0,
    // BMKG's codes: 60 and up is rain (60 light, 61 rain, 63 heavy), 95 and 97 thunderstorms
    wet: (e.weather ?? 0) >= 60,
    desc: e.weather_desc_en ?? '',
  }))
}
