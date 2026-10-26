import { useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { currentLineIndex } from '../lib/lyrics'
import type { Track } from '../types'

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

  const seekFromEvent = (clientX: number) => {
    if (!canSeek) return
    const rect = barRef.current!.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(ratio * track.duration)
  }

  return (
    <div className="media" onClick={(e) => e.stopPropagation()}>
      <div className="media-head">
        <Art track={track} size={44} />
        <div className="media-meta">
          <div className="title">{track.title}</div>
          <div className="artist">{track.artist}</div>
        </div>
      </div>

      <div className="lyrics">
        {lines ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={idx}
              className="lyric-stack"
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            >
              <div className="lyric prev">{lines[idx - 1]?.text ?? ''}</div>
              <div className="lyric now">{idx >= 0 ? lines[idx].text || '♪' : '♪'}</div>
              <div className="lyric next">{lines[idx + 1]?.text ?? ''}</div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="lyric none">
            {track.lyricsLoading ? 'Finding lyrics…' : 'No synced lyrics found'}
          </div>
        )}
      </div>

      <div
        className="scrub"
        ref={barRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromEvent(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromEvent(e.clientX)}
      >
        <div className="scrub-fill" style={{ width: canSeek ? `${Math.min(100, (position / track.duration) * 100)}%` : '0%' }} />
      </div>
      <div className="times">
        <span>{fmt(position)}</span>
        <span>{canSeek ? `-${fmt(track.duration - position)}` : ''}</span>
      </div>

      <div className="controls">
        <button onClick={() => onSkip(-1)} aria-label="Previous">⏮</button>
        <button className="play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => onSkip(1)} aria-label="Next">⏭</button>
      </div>
    </div>
  )
}
