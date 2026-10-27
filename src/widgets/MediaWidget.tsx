import { useRef } from 'react'
import { currentLineIndex } from '../lib/lyrics'
import type { Track } from '../types'

/** Height of one lyric line in the Playing page (must match .ly-line in App.css). */
const LINE = 28

export function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Bars({ active, hue }: { active: boolean; hue: number }) {
  return (
    <div className="bars" style={{ ['--hue' as string]: hue }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={active ? 'on' : ''} style={{ animationDelay: `${i * 0.13}s` }} />
      ))}
    </div>
  )
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

export function MediaWidget({ track, position, lyricOffset = 0, playing, onToggle, onSeek, onSkip }: Props) {
  const barRef = useRef<HTMLDivElement>(null)

  if (!track) {
    return (
      <div className="media nothing" onClick={(e) => e.stopPropagation()}>
        <div className="nothing-icon">♫</div>
        <div>Nothing playing</div>
        <small>Start a song in Spotify or any media app</small>
      </div>
    )
  }

  const lines = track.lyrics
  const idx = lines ? currentLineIndex(lines, position + lyricOffset) : -1
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
        <Art track={track} size={56} />
        <div className="np-meta">
          <b>{track.title}</b>
          <span>{track.artist}</span>
        </div>
      </div>

      {/* a three-line window: the current line in the middle, sliding up as the song goes on */}
      <div className="ly">
        {lines ? (
          <div className="ly-stack" style={{ transform: `translateY(${(1 - idx) * LINE}px)` }}>
            {lines.map((l, i) => (
              <div key={i} className={`ly-line ${i === idx ? 'now' : ''}`}>
                {l.text || '♪'}
              </div>
            ))}
          </div>
        ) : (
          <div className="ly-none">{track.lyricsLoading ? 'Finding lyrics…' : 'No synced lyrics found'}</div>
        )}
      </div>

      <div
        className="scrub"
        ref={barRef}
        data-cuelume-select
        data-cuelume-emphasis="subtle"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromEvent(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromEvent(e.clientX)}
      >
        <div className="scrub-fill" style={{ width: `${progress}%` }} />
        <div className="scrub-knob" style={{ left: `${progress}%` }} />
      </div>
      <div className="times">
        <span>{fmt(position)}</span>
        <span>{canSeek ? `-${fmt(track.duration - position)}` : ''}</span>
      </div>

      <div className="np-controls">
        <button onClick={() => onSkip(-1)} aria-label="Previous" data-cuelume-tap data-cuelume-emphasis="subtle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19 5.6v12.8a.7.7 0 0 1-1.1.6L9 12.6a.7.7 0 0 1 0-1.2l8.9-6.4a.7.7 0 0 1 1.1.6z" />
            <rect x="5" y="5" width="2.6" height="14" rx="1.1" />
          </svg>
        </button>
        <button className="np-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} data-cuelume-toggle>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {playing ? (
              <>
                <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" />
                <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" />
              </>
            ) : (
              <path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.6-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" />
            )}
          </svg>
        </button>
        <button onClick={() => onSkip(1)} aria-label="Next" data-cuelume-tap data-cuelume-emphasis="subtle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M5 5.6v12.8a.7.7 0 0 0 1.1.6l8.9-6.4a.7.7 0 0 0 0-1.2L6.1 5a.7.7 0 0 0-1.1.6z" />
            <rect x="16.4" y="5" width="2.6" height="14" rx="1.1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
