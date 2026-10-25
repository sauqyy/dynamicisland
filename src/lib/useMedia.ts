import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { fetchLyrics, type LyricLine } from './lyrics'
import { DEMO } from './mock'
import type { Track } from '../types'

export const IS_TAURI = '__TAURI_INTERNALS__' in window

/** Mirrors `MediaInfo` in src-tauri/src/media.rs */
interface NativeMedia {
  id: string
  title: string
  artist: string
  album: string
  playing: boolean
  position: number
  duration: number
}

interface Sync {
  pos: number
  at: number
  playing: boolean
}

function hueOf(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 360
}

const DEMO_INFO: NativeMedia = {
  id: DEMO.id,
  title: DEMO.title,
  artist: DEMO.artist,
  album: '',
  playing: true,
  position: 0,
  duration: DEMO.duration,
}

/**
 * The currently playing track. Native: from the Windows media session (Spotify, browser, ...),
 * with lyrics looked up on LRCLIB. Browser: a fake looping demo track.
 */
export function useMedia() {
  const [info, setInfo] = useState<NativeMedia | null>(IS_TAURI ? null : DEMO_INFO)
  const [art, setArt] = useState<{ id: string; url: string } | null>(null)
  const [lyrics, setLyrics] = useState<{ id: string; lines: LyricLine[] | null } | null>(
    IS_TAURI ? null : { id: DEMO.id, lines: DEMO.lyrics },
  )
  const [position, setPosition] = useState(0)
  const sync = useRef<Sync>({ pos: 0, at: performance.now(), playing: !IS_TAURI })
  const infoRef = useRef(info)
  infoRef.current = info

  const resync = useCallback((pos: number, playing: boolean) => {
    sync.current = { pos, at: performance.now(), playing }
  }, [])

  // native events
  useEffect(() => {
    if (!IS_TAURI) return
    const offs = [
      listen<NativeMedia | null>('media', (e) => {
        const m = e.payload
        setInfo(m)
        if (m) resync(m.position, m.playing)
      }),
      listen<{ id: string; data_url: string }>('media-art', (e) =>
        setArt({ id: e.payload.id, url: e.payload.data_url }),
      ),
    ]
    return () => offs.forEach((o) => o.then((f) => f()))
  }, [resync])

  // lyrics for whatever is playing
  const trackId = info?.id
  useEffect(() => {
    if (!IS_TAURI || !trackId) return
    const { title, artist, duration } = infoRef.current!
    const ctrl = new AbortController()
    fetchLyrics(title, artist, duration || undefined, ctrl.signal).then((lines) => {
      if (!ctrl.signal.aborted) setLyrics({ id: trackId, lines })
    })
    return () => ctrl.abort()
  }, [trackId])

  // local clock between events
  const duration = info?.duration ?? 0
  useEffect(() => {
    const id = setInterval(() => {
      const s = sync.current
      let p = s.pos + (s.playing ? (performance.now() - s.at) / 1000 : 0)
      if (duration > 0 && p >= duration) {
        if (IS_TAURI) p = duration
        else {
          resync(0, s.playing)
          p = 0
        }
      }
      setPosition(p)
    }, 100)
    return () => clearInterval(id)
  }, [duration, resync])

  const [demoPlaying, setDemoPlaying] = useState(true)
  const playing = IS_TAURI ? (info?.playing ?? false) : demoPlaying

  const toggle = useCallback(() => {
    const now = sync.current.pos + (sync.current.playing ? (performance.now() - sync.current.at) / 1000 : 0)
    if (IS_TAURI) {
      invoke('media_toggle').catch(() => {})
      resync(now, !sync.current.playing)
      setInfo((i) => (i ? { ...i, playing: !i.playing } : i))
    } else {
      resync(now, !sync.current.playing)
      setDemoPlaying((p) => !p)
    }
  }, [resync])

  const seek = useCallback(
    (t: number) => {
      if (IS_TAURI) invoke('media_seek', { seconds: t }).catch(() => {})
      resync(t, sync.current.playing)
      setPosition(t)
    },
    [resync],
  )

  const skip = useCallback(
    (dir: -1 | 1) => {
      if (IS_TAURI) invoke(dir > 0 ? 'media_next' : 'media_prev').catch(() => {})
      else resync(0, sync.current.playing)
    },
    [resync],
  )

  const track: Track | null = useMemo(() => {
    if (!info) return null
    const hasLyrics = lyrics?.id === info.id
    return {
      id: info.id,
      title: info.title,
      artist: info.artist,
      duration: info.duration,
      hue: hueOf(info.id),
      art: art?.id === info.id ? art.url : undefined,
      lyrics: hasLyrics ? lyrics.lines : null,
      lyricsLoading: !hasLyrics,
    }
  }, [info, art, lyrics])

  return { track, playing, position, toggle, seek, skip }
}
