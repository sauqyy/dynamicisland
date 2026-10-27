import { useRef } from 'react'
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
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
        <div className="nothing-icon">
          <Music2 size={28} strokeWidth={1.7} aria-hidden />
        </div>
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
          <SkipBack size={18} fill="currentColor" aria-hidden />
        </button>
        <button className="np-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} data-cuelume-toggle>
          {playing ? <Pause size={18} fill="currentColor" aria-hidden /> : <Play size={18} fill="currentColor" aria-hidden />}
        </button>
        <button onClick={() => onSkip(1)} aria-label="Next" data-cuelume-tap data-cuelume-emphasis="subtle">
          <SkipForward size={18} fill="currentColor" aria-hidden />
        </button>
      </div>
    </div>
  )
}
