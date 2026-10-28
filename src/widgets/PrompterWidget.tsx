import { useEffect, useRef, useState } from 'react'
import { play as cue } from 'cuelume'
import { FlipHorizontal2, Minus, Pause, Play, Plus, SquarePen } from 'lucide-react'

const KEY = 'di.prompter'

interface Saved {
  text: string
  /** scroll speed, px per second */
  speed: number
  /** text size, px */
  size: number
  mirror: boolean
}

const DEFAULTS: Saved = { text: '', speed: 40, size: 26, mirror: false }

function load(): Saved {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>) }
  } catch {
    return DEFAULTS
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A teleprompter: write or paste a script, then read it as it scrolls past at your pace. */
export function PrompterWidget({ fullscreen, onFullscreen }: { fullscreen: boolean; onFullscreen: (on: boolean) => void }) {
  const [saved, setSaved] = useState<Saved>(load)
  const [reading, setReading] = useState(false)
  const [running, setRunning] = useState(false)
  const view = useRef<HTMLDivElement>(null)
  const speed = useRef(saved.speed)
  speed.current = saved.speed
  const patch = (p: Partial<Saved>) => setSaved((s) => ({ ...s, ...p }))

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(saved))
      } catch {
        /* ignore */
      }
    }, 300)
    return () => clearTimeout(id)
  }, [saved])

  // scroll at `speed` px/s; the frame time keeps it steady whatever the refresh rate
  useEffect(() => {
    if (!reading || !running) return
    let raf = 0
    let last = performance.now()
    let pos = view.current?.scrollTop ?? 0
    const step = (t: number) => {
      const el = view.current
      if (!el) return
      // follow a manual scroll (wheel, drag) instead of snapping back
      if (Math.abs(el.scrollTop - Math.round(pos)) > 2) pos = el.scrollTop
      pos += (speed.current * (t - last)) / 1000
      last = t
      el.scrollTop = pos
      if (pos >= el.scrollHeight - el.clientHeight) {
        setRunning(false)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [reading, running])

  const start = () => {
    if (!saved.text.trim()) return
    cue('tap')
    setReading(true)
    setRunning(true)
  }
  const edit = () => {
    setRunning(false)
    setReading(false)
  }
  // playing again after the script has run out starts it over
  const togglePlay = () => {
    const el = view.current
    if (!running && el && el.scrollTop > 0 && el.scrollTop >= el.scrollHeight - el.clientHeight - 2) el.scrollTop = 0
    setRunning((r) => !r)
  }

  const fullBtn = (
    <button
      className="chip wk-full"
      aria-pressed={fullscreen}
      data-cuelume-toggle
      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      onClick={() => onFullscreen(!fullscreen)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  )

  if (!reading) {
    return (
      <div className={`tp ${fullscreen ? 'tp-fs' : ''}`} onClick={(e) => e.stopPropagation()}>
        <textarea
          className="notes-input tp-script"
          placeholder="Paste or write your script…"
          value={saved.text}
          data-cuelume-type
          onChange={(e) => patch({ text: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="tp-bar">
          <span className="tp-count">{saved.text.trim() ? `${saved.text.trim().split(/\s+/).length} words` : ''}</span>
          {fullBtn}
          <button className="pill-btn" data-cuelume-tap onClick={start} disabled={!saved.text.trim()}>
            <Play size={12} aria-hidden /> Start
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`tp reading ${fullscreen ? 'tp-fs' : ''}`}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          togglePlay()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          e.stopPropagation()
          patch({ speed: clamp(saved.speed + (e.key === 'ArrowUp' ? 5 : -5), 10, 200) })
        }
      }}
      ref={(el) => el?.focus({ preventScroll: true })}
    >
      <div className="tp-stage">
        <div className="tp-view" ref={view} onClick={togglePlay} style={{ fontSize: saved.size * (fullscreen ? 1.7 : 1) }}>
          <div className={`tp-text ${saved.mirror ? 'mirror' : ''}`}>{saved.text}</div>
        </div>
        <i className="tp-line" aria-hidden />
      </div>
      <div className="tp-bar">
        <button className="chip" data-cuelume-tap onClick={edit} aria-label="Edit script" title="Edit script">
          <SquarePen size={12} aria-hidden />
        </button>
        <button className="chip" data-cuelume-toggle aria-pressed={running} onClick={togglePlay} aria-label={running ? 'Pause' : 'Play'}>
          {running ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
        </button>
        <span className="tp-group" title="Speed">
          <button className="chip" data-cuelume-tap onClick={() => patch({ speed: clamp(saved.speed - 5, 10, 200) })} aria-label="Slower">
            <Minus size={12} aria-hidden />
          </button>
          <small>{saved.speed}</small>
          <button className="chip" data-cuelume-tap onClick={() => patch({ speed: clamp(saved.speed + 5, 10, 200) })} aria-label="Faster">
            <Plus size={12} aria-hidden />
          </button>
        </span>
        <span className="tp-group" title="Text size">
          <button className="chip" data-cuelume-tap onClick={() => patch({ size: clamp(saved.size - 2, 14, 60) })} aria-label="Smaller text">
            A−
          </button>
          <button className="chip" data-cuelume-tap onClick={() => patch({ size: clamp(saved.size + 2, 14, 60) })} aria-label="Larger text">
            A+
          </button>
        </span>
        <button className={`chip ${saved.mirror ? 'on' : ''}`} data-cuelume-toggle aria-pressed={saved.mirror} onClick={() => patch({ mirror: !saved.mirror })} aria-label="Mirror text" title="Mirror text">
          <FlipHorizontal2 size={12} aria-hidden />
        </button>
        {fullBtn}
      </div>
    </div>
  )
}
