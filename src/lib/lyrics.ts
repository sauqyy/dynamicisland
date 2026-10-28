export interface LyricLine {
  /** seconds from the start of the track */
  t: number
  text: string
}

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) out.push({ t: Number(s[1]) * 60 + Number(s[2]), text })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Index of the line being sung at time `t`, or -1 before the first line. */
export function currentLineIndex(lines: LyricLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].t <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

interface LrclibResult {
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

// v2: the first version cached "no lyrics" after any failed request, so some songs got stuck without lyrics
const CACHE_PREFIX = 'di.lyrics2.'
const OLD_CACHE_PREFIX = 'di.lyrics.'

/**
 * Fetches time-synced lyrics from LRCLIB (https://lrclib.net, free, no key).
 * Returns null when nothing synced was found. Results are cached in localStorage.
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  duration?: number,
  signal?: AbortSignal,
): Promise<LyricLine[] | null> {
  const key = `${CACHE_PREFIX}${artist}|${title}`.toLowerCase()
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(OLD_CACHE_PREFIX)) localStorage.removeItem(k)
    }
    const hit = localStorage.getItem(key)
    if (hit) return JSON.parse(hit) as LyricLine[] | null
  } catch {
    /* storage unavailable */
  }

  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (duration) params.set('duration', String(Math.round(duration)))

  // ask for the exact match and the search at the same time instead of one after the other:
  // when the exact match misses (a slightly different track length is enough) the lyrics
  // used to arrive a whole round trip later
  // a miss is only worth remembering when LRCLIB answered "not found"; a network error, a rate limit
  // or a server error says nothing about the song, so those are not cached
  let failed = false
  const getJson = async (url: string) => {
    const res = await fetch(url, { signal })
    if (res.ok) return (await res.json()) as unknown
    if (res.status !== 404) failed = true
    return null
  }
  let result: LrclibResult | null = null
  try {
    const exact = getJson(`https://lrclib.net/api/get?${params}`).catch((e) => {
      if (signal?.aborted) throw e
      failed = true
      return null
    })
    const search = getJson(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}` })}`).catch((e) => {
      if (signal?.aborted) throw e
      failed = true
      return null
    })
    const hit = (await exact) as LrclibResult | null
    if (hit?.syncedLyrics) result = hit
    else {
      const list = ((await search) as LrclibResult[] | null) ?? []
      result = list.find((r) => r.syncedLyrics) ?? null
    }
  } catch {
    return null // aborted: don't cache
  }

  const lines = result?.syncedLyrics ? parseLrc(result.syncedLyrics) : null
  if (!lines && failed) return null
  try {
    localStorage.setItem(key, JSON.stringify(lines))
  } catch {
    /* ignore */
  }
  return lines
}
