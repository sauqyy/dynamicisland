import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { listen } from '@tauri-apps/api/event'
import { GooFilter, Island, type Shape } from './island/Island'
import { Art, Bars, MediaWidget } from './widgets/MediaWidget'
import { Ring } from './widgets/TimerWidget'
import { TimerTab, type ClockMode } from './widgets/TimerTab'
import { TodoWidget } from './widgets/TodoWidget'
import { SettingsWidget } from './widgets/SettingsWidget'
import { ShelfWidget } from './widgets/ShelfWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { ClipboardWidget } from './widgets/ClipboardWidget'
import { useClipboard } from './lib/useClipboard'
import { ExpandedHeader } from './widgets/ExpandedHeader'
import {
  DEFAULT_APPS,
  DEMO_APPS,
  DEMO_SHELF,
  describePaths,
  useStoredList,
  type FileItem,
} from './lib/files'
import { SPRINGS, useSettings } from './lib/settings'
import { currentLineIndex } from './lib/lyrics'
import { IS_TAURI, useMedia } from './lib/useMedia'
import type { IslandAlert, PomodoroState, PomoPhase, StopwatchState, Tab, TimerState, Todo } from './types'
import './App.css'

const PAGES: { id: Tab; title: string }[] = [
  { id: 'media', title: 'Now Playing' },
  { id: 'weather', title: 'Weather' },
  { id: 'timer', title: 'Timer' },
  { id: 'todo', title: 'To-do' },
  { id: 'notes', title: 'Notes' },
  { id: 'clipboard', title: 'Clipboard' },
  { id: 'shelf', title: 'Shelf' },
  { id: 'apps', title: 'Apps' },
  { id: 'settings', title: 'Settings' },
]

const LOW_BATTERY = 20
const POMO_MIN: Record<PomoPhase, number> = { focus: 25, break: 5, long: 15 }

function nextPomo(p: PomodoroState): PomodoroState {
  if (p.phase !== 'focus') return { phase: 'focus', done: p.done }
  const done = p.done + 1
  return { phase: done % 4 === 0 ? 'long' : 'break', done }
}

function loadTodos(): Todo[] {
  try {
    return JSON.parse(localStorage.getItem('di.todos') ?? '[]') as Todo[]
  } catch {
    return []
  }
}

function clockText(d: Date, clock24: boolean) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !clock24 })
}

export default function App() {
  const { track, playing, position, toggle, seek, skip } = useMedia()
  const { settings, update } = useSettings()
  const [hidden, setHidden] = useState(false)
  const [pomo, setPomo] = useState<PomodoroState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [privacy, setPrivacy] = useState<{ mic: string | null; camera: string | null }>({ mic: null, camera: null })
  const clipboard = useClipboard()
  const shelf = useStoredList('di.shelf', IS_TAURI ? [] : DEMO_SHELF)
  const apps = useStoredList('di.apps', IS_TAURI ? [] : DEMO_APPS)
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [tab, setTab] = useState<Tab>('media')
  const [clockMode, setClockMode] = useState<ClockMode>('timer')
  const [alert, setAlert] = useState<IslandAlert | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [sw, setSw] = useState<StopwatchState>({ running: false, startedAt: 0, base: 0, laps: [] })
  const [now, setNow] = useState(() => Date.now())
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [battery, setBattery] = useState<number | null>(null)
  const alertId = useRef(0)
  const tabRef = useRef(tab)
  tabRef.current = tab
  const addShelf = shelf.add
  const addApps = apps.add

  useEffect(() => {
    try {
      localStorage.setItem('di.todos', JSON.stringify(todos))
    } catch {
      /* ignore */
    }
  }, [todos])

  // wall clock + timer tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), timer ? 250 : 15000)
    return () => clearInterval(id)
  }, [timer])

  const pushAlert = useCallback((a: Omit<IslandAlert, 'id'>) => {
    setAlert({ ...a, id: ++alertId.current })
  }, [])

  useEffect(() => {
    if (!alert) return
    const id = setTimeout(() => setAlert(null), 2600)
    return () => clearTimeout(id)
  }, [alert])

  useEffect(() => {
    if (!timer || now < timer.endsAt) return
    if (pomo) {
      const next = nextPomo(pomo)
      const total = POMO_MIN[next.phase] * 60_000
      setPomo(next)
      setTimer({ endsAt: Date.now() + total, total })
      pushAlert(
        next.phase === 'focus'
          ? { icon: '🎯', text: 'Focus time', sub: `Session ${next.done + 1}` }
          : { icon: '☕', text: next.phase === 'long' ? 'Long break' : 'Break time', sub: `${next.done} done` },
      )
    } else {
      setTimer(null)
      pushAlert({ icon: '⏰', text: 'Timer done' })
    }
  }, [now, timer, pomo, pushAlert])

  // Windows battery + volume events from Rust
  useEffect(() => {
    if (!IS_TAURI) return
    let wasCharging: boolean | null = null
    let lockState = { caps: false, num: false }
    let lastPrivacy: { mic: string | null; camera: string | null } = { mic: null, camera: null }
    let warned = false
    const offs = [
      listen<{ percent: number; charging: boolean } | null>('battery', (e) => {
        const b = e.payload
        setBattery(b ? b.percent : null)
        if (!b) return
        if (wasCharging !== null && wasCharging !== b.charging) {
          pushAlert(
            b.charging
              ? { icon: '⚡', text: 'Charging', sub: `${b.percent}%`, value: b.percent }
              : { icon: '🔋', text: 'On battery', sub: `${b.percent}%`, value: b.percent },
          )
        }
        wasCharging = b.charging
        if (!b.charging && b.percent <= LOW_BATTERY && !warned) {
          warned = true
          pushAlert({ icon: '🪫', text: 'Low battery', sub: `${b.percent}%`, value: b.percent })
        } else if (b.charging || b.percent > LOW_BATTERY + 5) warned = false
      }),
      listen<{ caps: boolean; num: boolean }>('lockkeys', (e) => {
        const { caps, num } = e.payload
        // report whichever key just changed
        if (caps !== lockState.caps) {
          pushAlert({ icon: caps ? '🔠' : '🔡', text: caps ? 'Caps Lock on' : 'Caps Lock off' })
        } else if (num !== lockState.num) {
          pushAlert({ icon: '🔢', text: num ? 'Num Lock on' : 'Num Lock off' })
        }
        lockState = { caps, num }
      }),
      listen<{ mic: string | null; camera: string | null }>('privacy', (e) => {
        const p = e.payload
        setPrivacy(p)
        if (p.camera && p.camera !== lastPrivacy.camera) {
          pushAlert({ icon: '📷', text: 'Camera in use', sub: p.camera })
        } else if (p.mic && p.mic !== lastPrivacy.mic) {
          pushAlert({ icon: '🎙️', text: 'Microphone in use', sub: p.mic })
        }
        lastPrivacy = p
      }),
      listen<{ level: number; muted: boolean }>('volume', (e) => {
        const { level, muted } = e.payload
        pushAlert({
          icon: muted || level === 0 ? '🔇' : level < 50 ? '🔉' : '🔊',
          text: muted ? 'Muted' : 'Volume',
          sub: `${level}%`,
          value: muted ? 0 : level,
        })
      }),
    ]
    return () => offs.forEach((o) => o.then((f) => f()))
  }, [pushAlert])

  // In the native app the webview is click-through, so Rust reports hover.
  useEffect(() => {
    if (!IS_TAURI) return
    const offs = [
      listen<boolean>('island-hover', (e) => setHovered(e.payload)),
      listen<boolean>('island-hidden', (e) => setHidden(e.payload)),
    ]
    return () => offs.forEach((o) => o.then((f) => f()))
  }, [])

  // Pin a few system apps the first time, with their real Explorer icons.
  const appsSeeded = useRef(false)
  useEffect(() => {
    if (!IS_TAURI || appsSeeded.current) return
    appsSeeded.current = true
    if (localStorage.getItem('di.apps')) return
    describePaths(DEFAULT_APPS).then(addApps).catch(() => {})
  }, [addApps])

  // Files dragged onto the island: open it on the shelf (or the apps page) and collect them.
  useEffect(() => {
    if (!IS_TAURI) return
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      const ev = e.payload
      if (ev.type === 'enter') {
        setDragging(true)
        setExpanded(true)
        setTab((t) => (t === 'apps' ? 'apps' : 'shelf'))
      } else if (ev.type === 'leave') {
        setDragging(false)
      } else if (ev.type === 'drop') {
        setDragging(false)
        const items = await describePaths(ev.paths).catch(() => [] as FileItem[])
        if (tabRef.current === 'apps') addApps(items)
        else addShelf(items)
      }
    })
    return () => {
      un.then((f) => f())
    }
  }, [addShelf, addApps])

  // Browser demo only: plain HTML5 file drop so the shelf can be tried without Tauri.
  const onBrowserDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const items: FileItem[] = [...e.dataTransfer.files].map((f) => ({
      id: `${f.name}#${Date.now()}`,
      path: f.name,
      name: f.name,
      size: f.size,
      isDir: false,
    }))
    if (tabRef.current === 'apps') addApps(items)
    else addShelf(items)
  }

  // Clicking outside can't be detected when click-through, so collapse when the cursor leaves.
  useEffect(() => {
    if (!IS_TAURI || !expanded || hovered) return
    const id = setTimeout(() => setExpanded(false), 700)
    return () => clearTimeout(id)
  }, [expanded, hovered])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        setTab((t) => {
          const i = PAGES.findIndex((p) => p.id === t)
          return PAGES[(i + dir + PAGES.length) % PAGES.length].id
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const lyricIdx = track?.lyrics ? currentLineIndex(track.lyrics, position) : -1
  const lyricText = lyricIdx >= 0 ? track!.lyrics![lyricIdx].text : ''
  const showLyricPeek = playing && !!lyricText
  // idle pill shows the lyric line instead of the clock when asked to and one is available
  const idleLyric = settings.idle === 'lyrics' && showLyricPeek

  const mode = expanded ? 'expanded' : alert ? 'alert' : hovered ? 'peek' : 'idle'

  // every page uses the same card size so the navigation arrows never move
  const expandedHeight = settings.cardH

  const shape: Shape = useMemo(() => {
    switch (mode) {
      case 'expanded':
        return { w: settings.cardW, h: expandedHeight, r: 44 }
      case 'alert':
        return { w: 320, h: 60, r: 26 }
      case 'peek':
        return { w: showLyricPeek ? 300 : 230, h: 40, r: 16 }
      default:
        return { w: idleLyric ? 300 : 140, h: 34, r: 13 }
    }
  }, [mode, expandedHeight, settings.cardW, showLyricPeek, idleLyric])

  const remaining = timer ? Math.max(0, (timer.endsAt - now) / 1000) : 0
  const bubble = timer
    ? {
        split: mode === 'idle' || mode === 'peek',
        content: (
          <div className="bubble-inner">
            <Ring fraction={remaining / (timer.total / 1000)} size={28} stroke={3} />
            <span>{Math.ceil(remaining / 60)}</span>
          </div>
        ),
      }
    : null

  const hitW = shape.w + (bubble?.split ? 100 : 0)
  useEffect(() => {
    if (IS_TAURI) {
      invoke('set_hit_area', { w: hitW * settings.scale, h: shape.h * settings.scale }).catch(() => {})
    }
  }, [hitW, shape.h, settings.scale])

  const go = (dir: -1 | 1) =>
    setTab((t) => {
      const i = PAGES.findIndex((p) => p.id === t)
      return PAGES[(i + dir + PAGES.length) % PAGES.length].id
    })

  const startTimer = (minutes: number) => {
    setPomo(null)
    setTimer({ endsAt: Date.now() + minutes * 60_000, total: minutes * 60_000 })
  }
  const stopTimer = () => {
    setPomo(null)
    setTimer(null)
  }
  const startPomo = () => {
    setPomo({ phase: 'focus', done: 0 })
    setTimer({ endsAt: Date.now() + POMO_MIN.focus * 60_000, total: POMO_MIN.focus * 60_000 })
  }
  const skipPomo = () => pomo && setTimer({ endsAt: Date.now(), total: 1 })

  const onSkip = (dir: -1 | 1) => {
    skip(dir)
    if (!IS_TAURI) pushAlert({ icon: dir > 0 ? '⏭' : '⏮', text: dir > 0 ? 'Next track' : 'Previous track' })
  }

  const d = new Date(now)
  const clock = clockText(d, settings.clock24)
  let content: React.ReactNode
  let contentKey: string

  if (mode === 'expanded') {
    contentKey = `expanded-${tab}-${clockMode}`
    const page = PAGES.find((p) => p.id === tab)!
    const action =
      tab === 'shelf' && shelf.items.length ? (
        <button className="chip" onClick={shelf.clear}>Clear</button>
      ) : tab === 'clipboard' && clipboard.items.length ? (
        <button className="chip" onClick={clipboard.clear}>Clear</button>
      ) : null
    content = (
      <div className="expanded">
        <ExpandedHeader
          title={page.title}
          action={action}
          timer={timer ? remaining / (timer.total / 1000) : null}
          date={d}
          clock={clock}
          bars={playing && track ? track.hue : null}
        />
        <div className="expanded-body">
          {tab === 'media' && (
            <MediaWidget
              track={track}
              position={position}
              playing={playing}
              onToggle={toggle}
              onSeek={seek}
              onSkip={onSkip}
            />
          )}
          {tab === 'timer' && (
            <TimerTab
              mode={clockMode}
              setMode={setClockMode}
              timer={timer}
              now={now}
              onStart={startTimer}
              onCancel={stopTimer}
              sw={sw}
              setSw={setSw}
              pomo={pomo}
              onPomoStart={startPomo}
              onPomoStop={stopTimer}
              onPomoSkip={skipPomo}
            />
          )}
          {tab === 'todo' && <TodoWidget todos={todos} setTodos={setTodos} />}
          {tab === 'notes' && <NotesWidget />}
          {tab === 'weather' && <WeatherWidget settings={settings} update={update} />}
          {tab === 'clipboard' && (
            <ClipboardWidget
              items={clipboard.items}
              onCopy={(t) => {
                clipboard.copy(t)
                pushAlert({ icon: '📋', text: 'Copied' })
              }}
            />
          )}
          {tab === 'shelf' && (
            <ShelfWidget items={shelf.items} onRemove={shelf.remove} emptyHint="Drag files here to keep them handy" />
          )}
          {tab === 'apps' && (
            <ShelfWidget
              apps
              items={apps.items}
              onRemove={apps.remove}
              emptyHint="Drop an app or shortcut here to pin it"
            />
          )}
          {tab === 'settings' && <SettingsWidget settings={settings} update={update} />}
        </div>
        <button className="nav-arrow left" aria-label="Previous page" onClick={(e) => { e.stopPropagation(); go(-1) }}>
          ‹
        </button>
        <button className="nav-arrow right" aria-label="Next page" onClick={(e) => { e.stopPropagation(); go(1) }}>
          ›
        </button>
        <div className="dots" onClick={(e) => e.stopPropagation()}>
          {PAGES.map((p) => (
            <button
              key={p.id}
              aria-label={p.title}
              className={p.id === tab ? 'active' : ''}
              onClick={() => setTab(p.id)}
            />
          ))}
        </div>
        {dragging && (
          <div className="drop-overlay">
            {tab === 'apps' ? 'Release to pin' : 'Release to add to Shelf'}
          </div>
        )}
      </div>
    )
  } else if (mode === 'alert' && alert) {
    contentKey = `alert-${alert.id}`
    content = (
      <div className="alert">
        <span className="alert-icon">{alert.icon}</span>
        <div className="alert-text">
          <span>{alert.text}</span>
          {alert.sub && <small>{alert.sub}</small>}
        </div>
        {alert.value !== undefined && (
          <div className="liquid-bar">
            <div className="liquid-fill" style={{ width: `${alert.value}%` }} />
          </div>
        )}
      </div>
    )
  } else if (mode === 'peek') {
    contentKey = showLyricPeek ? 'peek-lyric' : playing && track ? 'peek-track' : 'peek-clock'
    content =
      showLyricPeek && track ? (
        <div className="peek">
          <Art track={track} size={22} />
          <span className="peek-text lyric-line" key={lyricIdx}>{lyricText}</span>
        </div>
      ) : (
        <div className="peek center">
          <span className="peek-text">
            {playing && track
              ? `${track.title} · ${track.artist}`
              : [
                  clock,
                  d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
                  battery !== null ? `${battery}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </div>
      )
  } else {
    contentKey = idleLyric ? `idle-lyric-${lyricIdx}` : 'idle'
    content = (
      <div className={`idle ${idleLyric ? 'lyric-idle' : ''}`}>
        {playing && track && <Bars active hue={track.hue} />}
        {idleLyric ? <span className="idle-lyric">{lyricText}</span> : <span>{clock}</span>}
        {privacy.camera && <span className="dot cam" title={`Camera: ${privacy.camera}`} />}
        {privacy.mic && <span className="dot mic" title={`Microphone: ${privacy.mic}`} />}
      </div>
    )
  }

  return (
    <div
      className={`root ${IS_TAURI ? 'native' : 'demo'} ${hidden ? 'hidden' : ''}`}
      style={{ ['--accent' as string]: settings.accent, ['--scale' as string]: settings.scale }}
      onClick={() => !IS_TAURI && setExpanded(false)}
      onDragOver={(e) => {
        if (IS_TAURI) return
        e.preventDefault()
        if (!dragging) {
          setDragging(true)
          setExpanded(true)
          setTab((t) => (t === 'apps' ? 'apps' : 'shelf'))
        }
      }}
      onDragLeave={(e) => !IS_TAURI && e.relatedTarget === null && setDragging(false)}
      onDrop={(e) => !IS_TAURI && onBrowserDrop(e)}
    >
      <GooFilter />
      <Island
        shape={shape}
        contentKey={contentKey}
        bubble={bubble}
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(true)
        }}
        onHover={(h) => !IS_TAURI && setHovered(h)}
        spring={SPRINGS[settings.anim]}
      >
        {content}
      </Island>

      {!IS_TAURI && (
        <div className="demo-panel" onClick={(e) => e.stopPropagation()}>
          <b>Browser demo</b>
          <button onClick={() => pushAlert({ icon: '⚡', text: 'Charging', sub: '78%', value: 78 })}>Plug in charger</button>
          <button onClick={() => pushAlert({ icon: '🪫', text: 'Low battery', sub: '15%', value: 15 })}>Low battery</button>
          <button onClick={() => pushAlert({ icon: '🔊', text: 'Volume', value: Math.round(Math.random() * 100) })}>Volume change</button>
          <button onClick={() => startTimer(0.25)}>15 s timer</button>
          <button onClick={toggle}>{playing ? 'Pause' : 'Play'} music</button>
        </div>
      )}
    </div>
  )
}
