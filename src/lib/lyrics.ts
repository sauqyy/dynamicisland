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

const CACHE_PREFIX = 'di.lyrics.'

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
    const hit = localStorage.getItem(key)
    if (hit) return JSON.parse(hit) as LyricLine[] | null
  } catch {
    /* storage unavailable */
  }

  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (duration) params.set('duration', String(Math.round(duration)))

  let result: LrclibResult | null = null
  try {
    const res = await fetch(`https://lrclib.net/api/get?${params}`, { signal })
    if (res.ok) result = (await res.json()) as LrclibResult
    else if (res.status === 404) {
      const search = await fetch(
        `https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}` })}`,
        { signal },
      )
      if (search.ok) {
        const list = (await search.json()) as LrclibResult[]
        result = list.find((r) => r.syncedLyrics) ?? null
      }
    }
  } catch {
    return null // offline or aborted: don't cache
  }

  const lines = result?.syncedLyrics ? parseLrc(result.syncedLyrics) : null
  try {
    localStorage.setItem(key, JSON.stringify(lines))
  } catch {
    /* ignore */
  }
  return lines
}
