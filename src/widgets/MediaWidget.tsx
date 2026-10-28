import { useLayoutEffect, useRef, useState } from 'react'
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { currentLineIndex } from '../lib/lyrics'
import type { Track } from '../types'

/** Where the current lyric line sits in the lyrics window, as a share of its height from the top. */
const ANCHOR = 0.3

export function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Art({ track, size }: { track: Track; size: number }) {
  return (
    <div
      className="art"
      style={{
        width: size,
        height: size,
        background: track.art
          ? `center / cover url(${track.art})`
          : `linear-gradient(135deg, hsl(${track.hue} 80% 62%), hsl(${track.hue + 60} 80% 45%))`,
      }}
    />
  )
}

interface Props {
  track: Track | null
  position: number
  /** seconds to run the lyrics ahead (negative = later) */
  lyricOffset?: number
  playing: boolean
  onToggle: () => void
  onSeek: (t: number) => void
  onSkip: (dir: -1 | 1) => void
}

/**
 * Synced lyrics, read like a page: the current line is large and bright a third of the way
 * down, the lines around it fade with distance, long lines wrap, and clicking a line seeks to it.
 */
function Lyrics({ track, idx, onSeek, lyricOffset }: { track: Track; idx: number; onSeek: (t: number) => void; lyricOffset: number }) {
  const box = useRef<HTMLDivElement>(null)
  const stack = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  const lines = track.lyrics

  // lines wrap to different heights, so the offset comes from the line itself, not its index
  useLayoutEffect(() => {
    const place = () => {
      const b = box.current
      const s = stack.current
      if (!b || !s) return
      const line = s.children[Math.max(0, idx)] as HTMLElement | undefined
      if (!line) return
      const target = b.clientHeight * ANCHOR - (idx < 0 ? -line.offsetHeight : 0)
      setShift(Math.round(target - line.offsetTop))
    }
    place()
    const ro = new ResizeObserver(place)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [idx, track.id, lines?.length])

  if (!lines) {
    return (
      <div className="ly" ref={box}>
        <div className="ly-none">{track.lyricsLoading ? 'Finding lyrics…' : 'No synced lyrics for this song'}</div>
      </div>
    )
  }
  return (
    <div className="ly" ref={box}>
      <div className="ly-stack" ref={stack} style={{ transform: `translateY(${shift}px)` }}>
        {lines.map((l, i) => {
          const away = Math.min(3, Math.abs(i - idx))
          return (
            <button
              key={i}
              className={`ly-line d${away} ${i === idx ? 'now' : ''} ${i < idx ? 'past' : ''}`}
              data-cuelume-select
              data-cuelume-emphasis="subtle"
              title="Play from this line"
              onClick={() => onSeek(Math.max(0, l.t - lyricOffset))}
            >
              {l.text || '♪'}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function MediaWidget({ track, position, lyricOffset = 0, playing, onToggle, onSeek, onSkip }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [seeking, setSeeking] = useState(false)

  if (!track) {
    return (
      <div className="media nothing" onClick={(e) => e.stopPropagation()}>
        <div className="nothing-icon">
          <Music2 size={28} strokeWidth={1.7} aria-hidden />
        </div>
        <div>Nothing playing</div>
        <small>Start a song in Spotify or any media app</small>
      </div>
    )
  }

  const idx = track.lyrics ? currentLineIndex(track.lyrics, position + lyricOffset) : -1
  const canSeek = track.duration > 0
  const progress = canSeek ? Math.min(100, (position / track.duration) * 100) : 0

  const seekFromEvent = (clientX: number) => {
    if (!canSeek) return
    const rect = barRef.current!.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(ratio * track.duration)
  }

  return (
    <div className="np-page" onClick={(e) => e.stopPropagation()}>
      <div className="np">
        <Art track={track} size={46} />
        <div className="np-meta">
          <b>{track.title}</b>
          <span>{track.artist}</span>
        </div>
      </div>

      <Lyrics track={track} idx={idx} onSeek={onSeek} lyricOffset={lyricOffset} />

      {/* one row: the three buttons on the left, the timeline with both times on the right */}
      <div className="np-transport">
        <div className="np-buttons">
          <button className="np-skip" onClick={() => onSkip(-1)} aria-label="Previous" data-cuelume-tap data-cuelume-emphasis="subtle">
            <SkipBack size={16} fill="currentColor" aria-hidden />
          </button>
          <button className="np-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} data-cuelume-toggle>
            {playing ? <Pause size={16} fill="currentColor" aria-hidden /> : <Play size={16} fill="currentColor" aria-hidden />}
          </button>
          <button className="np-skip" onClick={() => onSkip(1)} aria-label="Next" data-cuelume-tap data-cuelume-emphasis="subtle">
            <SkipForward size={16} fill="currentColor" aria-hidden />
          </button>
        </div>
        <span className="np-time">{fmt(position)}</span>
        <div
          className={`np-scrub ${seeking ? 'seeking' : ''} ${canSeek ? '' : 'live'}`}
          ref={barRef}
          role="slider"
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={Math.round(track.duration)}
          aria-valuenow={Math.round(position)}
          data-cuelume-select
          data-cuelume-emphasis="subtle"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setSeeking(true)
            seekFromEvent(e.clientX)
          }}
          onPointerMove={(e) => e.buttons === 1 && seekFromEvent(e.clientX)}
          onPointerUp={() => setSeeking(false)}
          onPointerCancel={() => setSeeking(false)}
        >
          <div className="np-track">
            <div className="np-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="np-knob" style={{ left: `${progress}%` }} />
        </div>
        <span className="np-time end">{canSeek ? fmt(track.duration) : 'Live'}</span>
      </div>
    </div>
  )
}
