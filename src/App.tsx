import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { listen } from '@tauri-apps/api/event'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { PAGE_VARIANTS } from './lib/pageAnim'
import { GooFilter, Island, type Shape } from './island/Island'
import { Art, Bars, MediaWidget } from './widgets/MediaWidget'
import { Ring } from './widgets/TimerWidget'
import { TimerTab, type ClockMode } from './widgets/TimerTab'
import { TodoWidget } from './widgets/TodoWidget'
import { useUpdater } from './lib/useUpdater'
import { getVersion } from '@tauri-apps/api/app'
import { CHANGELOG, releaseToShow, type Release } from './lib/changelog'
import { SettingsWidget } from './widgets/SettingsWidget'
import { ShelfWidget } from './widgets/ShelfWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { Dock } from './widgets/Dock'
import { ClipboardWidget } from './widgets/ClipboardWidget'
import { ProfileWidget } from './widgets/ProfileWidget'
import { Avatar } from './widgets/Avatar'
import { FriendsWidget, type OpenChat } from './widgets/FriendsWidget'
import { useAuth } from './lib/useAuth'
import { useSocial } from './lib/useSocial'
import { useGroups } from './lib/useGroups'
import { useCall } from './lib/useCall'
import { DEMO_SOCIAL, useDemo } from './lib/useDemo'
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
import { SPRINGS, STAGE, useSettings } from './lib/settings'
import { onAccent, useResolvedTheme } from './lib/theme'
import { currentLineIndex } from './lib/lyrics'
import { IS_TAURI, useMedia } from './lib/useMedia'
import { useAutoIdle } from './lib/useAutoIdle'
import { useHeartbeat } from './lib/useHeartbeat'
import { play, type PlayOptions, type SoundName } from 'cuelume'
import { useSoundSetup } from './lib/sound'
import { cachedWeather, describe as describeWeather } from './lib/weather'
import { GROUPS, PAGES, SHORT, type IslandAlert, type PomodoroState, type PomoPhase, type StopwatchState, type Tab, type TimerState, type Todo } from './types'
import './App.css'

// loaded once at startup: building a fresh Audio per message re-fetches and re-decodes the file, which is what made the sound lag
const messageAudio = new Audio('/message.mp3')
messageAudio.preload = 'auto'
messageAudio.volume = 0.3

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

const TAB_KEY = 'di.tab'

/** The page that was open last time, so the card comes back where it was left. */
function loadTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    if (PAGES.some((p) => p.id === t)) return t as Tab
  } catch {
    /* ignore */
  }
  return 'media'
}

/** Pill width that fits a line of text, up to what the stage can hold. */
const textWidth = (text: string) => Math.min(STAGE.w - 40, Math.max(300, text.length * 7.2 + 80))

function stepPage(list: { id: Tab }[], from: Tab, dir: -1 | 1): Tab {
  const i = list.findIndex((p) => p.id === from)
  if (i < 0) {
    // a page hidden from the carousel (or opened by a file drop): step to the next visible one in full order
    const all = PAGES.findIndex((p) => p.id === from)
    const after = PAGES.slice(all + 1).concat(PAGES.slice(0, all))
    const ordered = dir > 0 ? after : [...after].reverse()
    return (ordered.find((p) => list.some((l) => l.id === p.id)) ?? list[0]).id
  }
  return list[(i + dir + list.length) % list.length].id
}

function clockText(d: Date, clock24: boolean) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !clock24 })
}

export default function App() {
  const { track, playing, position, toggle, seek, skip } = useMedia()
  const { settings, update } = useSettings()
  useSoundSetup(settings.uiSounds, settings.soundPack, settings.soundVolume, settings.typingSounds)
  const [hidden, setHidden] = useState(false)
  const updater = useUpdater()
  const [pomo, setPomo] = useState<PomodoroState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [privacy, setPrivacy] = useState<{ mic: string | null; camera: string | null }>({ mic: null, camera: null })
  const clipboard = useClipboard({
    paused: settings.clipPaused,
    autoClearMin: settings.clipAutoClear,
    skipSecrets: settings.clipSkipSecrets,
  })
  const shelf = useStoredList('di.shelf', IS_TAURI ? [] : DEMO_SHELF)
  const apps = useStoredList('di.apps', IS_TAURI ? [] : DEMO_APPS)
  const [expanded, setExpanded] = useState(false)
  // fullscreen chat: the window first grows to the monitor, then the island springs out to fill it
  const [fs, setFs] = useState<{ w: number; h: number } | null>(null)
  const [fsWin, setFsWin] = useState(false) // the window is covering the monitor
  const fsTimer = useRef(0)
  const [notes, setNotes] = useState<Release | null>(null) // "What's new" card after an update
  // the browser demo's button panel can be dragged out of the way by its title
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 })
  const panelDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const realAuth = useAuth()
  const demo = useDemo()
  const auth = DEMO_SOCIAL ? demo.auth : realAuth
  const meId = !DEMO_SOCIAL && auth.user && auth.profile ? auth.user.id : null
  const [hovered, setHovered] = useState(false)
  const [intro, setIntro] = useState(0) // bumped by the demo's Replay intro button
  const [tab, setTab] = useState<Tab>(loadTab)
  const [pos, setPos] = useState({ x: settings.posX, y: settings.posY })
  const [moving, setMoving] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; active: boolean } | null>(null)
  const motionRef = useRef({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    last: 0,
    raf: 0,
    held: false,
    magX: false,
    magY: false,
  })
  const justDragged = useRef(false)
  const [clockMode, setClockMode] = useState<ClockMode>('timer')
  const [alert, setAlert] = useState<IslandAlert | null>(null)
  const [holdOpen, setHoldOpen] = useState(false)
  const [pendingChat, setPendingChat] = useState<string | null>(null)
  const [openChat, setOpenChat] = useState<OpenChat>({ friend: null, group: null })
  const [updating, setUpdating] = useState<{ stage: string; percent: number } | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [sw, setSw] = useState<StopwatchState>({ running: false, startedAt: 0, base: 0, laps: [] })
  const [now, setNow] = useState(() => Date.now())
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [battery, setBattery] = useState<number | null>(null)
  const alertId = useRef(0)
  const tabRef = useRef(tab)
  tabRef.current = tab
  const pages = useMemo(
    () => PAGES.filter((p) => p.id === 'settings' || !settings.hiddenPages.includes(p.id)),
    [settings.hiddenPages],
  )
  // the groups that still have a visible page, and which one the current page is in
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => pages.some((x) => x.id === p)) })).filter((g) => g.pages.length),
    [pages],
  )
  const group = groups.find((g) => g.pages.includes(tab)) ?? groups[0]
  // each group remembers the page you were last on, so tapping it again returns there
  const lastInGroup = useRef<Record<string, Tab>>({})
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const fsRef = useRef(fs)
  fsRef.current = fs
  const posRef = useRef(pos)
  posRef.current = pos

  const enterFullscreen = useCallback(async () => {
    if (!IS_TAURI) {
      setFs({ w: window.innerWidth, h: window.innerHeight })
      return
    }
    clearTimeout(fsTimer.current)
    const [w, h] = await invoke<[number, number]>('set_fullscreen', { on: true }).catch(() => [0, 0] as [number, number])
    if (!w) return
    setFsWin(true)
    setFs({ w, h })
  }, [])
  const exitFullscreen = useCallback(() => {
    setFs(null)
    if (!IS_TAURI) return
    // hand the window back once the island has shrunk into the card again
    clearTimeout(fsTimer.current)
    fsTimer.current = window.setTimeout(() => {
      invoke('set_fullscreen', { on: false }).catch(() => {})
      setFsWin(false)
    }, 750)
  }, [])
  const toggleFullscreen = (on: boolean) => (on ? void enterFullscreen() : exitFullscreen())

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      /* ignore */
    }
  }, [tab])

  // keep the live position in step with the stored one (e.g. after Reset)
  useEffect(() => {
    if (!dragRef.current?.active && !motionRef.current.raf) setPos({ x: settings.posX, y: settings.posY })
  }, [settings.posX, settings.posY])
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

  const pushAlert = useCallback((a: Omit<IslandAlert, 'id'>, cue?: SoundName, opts?: PlayOptions) => {
    setAlert({ ...a, id: ++alertId.current })
    if (cue) play(cue, opts)
  }, [])

  // tell the user once per version when the automatic check finds an update; the cog keeps a dot until it is installed
  const alertedUpdate = useRef('')
  useEffect(() => {
    if (updater.state.s !== 'available' || alertedUpdate.current === updater.state.version) return
    alertedUpdate.current = updater.state.version
    pushAlert({ icon: '⬆️', text: 'Update available', sub: `v${updater.state.version} · open Settings to install` }, 'ready')
  }, [updater.state, pushAlert])

  const playMessageSound = () => {
    if (settings.messageSound) {
      messageAudio.currentTime = 0
      messageAudio.play().catch(() => {})
    }
  }

  const realSocial = useSocial(meId, (m, from) => {
    if (auth.profile?.presence === 'dnd') return
    playMessageSound()
    pushAlert({
      icon: '💬',
      text: from?.profile.display_name || from?.profile.username || 'New message',
      sub: (m.kind === 'activity' ? '🎵 shared an activity' : m.kind === 'note' ? '📝 shared a note' : m.body).slice(0, 42),
      avatar: from?.profile,
      chatWith: from?.profile.id,
    })
  })

  const call = useCall(meId, realSocial.friends, (from) => {
    if (auth.profile?.presence === 'dnd') return
    pushAlert(
      { icon: '📞', text: from.profile.display_name || from.profile.username, sub: 'Incoming voice call', avatar: from.profile, chatWith: from.profile.id },
      'attention',
    )
  })

  const groupChats = useGroups(meId, (m, group, from) => {
    if (auth.profile?.presence === 'dnd') return
    playMessageSound()
    pushAlert({
      icon: group?.emoji ?? '👥',
      text: group?.name ?? 'Group chat',
      sub: `${from?.display_name || from?.username || 'Someone'}: ${m.kind === 'activity' ? '🎵 shared an activity' : m.kind === 'note' ? '📝 shared a note' : m.body}`.slice(0, 42),
    })
  })

  useEffect(() => {
    if (!alert) return
    const id = setTimeout(() => setAlert(null), 2600)
    return () => clearTimeout(id)
  }, [alert])

  const advancePomo = useCallback(
    (p: PomodoroState) => {
      const next = nextPomo(p)
      const total = POMO_MIN[next.phase] * 60_000
      const start = Date.now()
      setPomo(next)
      setTimer({ endsAt: start + total, total })
      setNow(start) // so the ring shows the new phase full straight away instead of waiting for the next tick
      pushAlert(
        next.phase === 'focus'
          ? { icon: '🎯', text: 'Focus time', sub: `Session ${next.done + 1}` }
          : { icon: '☕', text: next.phase === 'long' ? 'Long break' : 'Break time', sub: `${next.done} done` },
        'attention',
      )
    },
    [pushAlert],
  )

  useEffect(() => {
    if (!timer || now < timer.endsAt) return
    if (pomo) {
      advancePomo(pomo)
    } else {
      setTimer(null)
      pushAlert({ icon: '⏰', text: 'Timer done' }, 'attention')
    }
  }, [now, timer, pomo, pushAlert, advancePomo])

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
            'toggle',
            { emphasis: 'subtle', direction: b.charging ? 'forward' : 'back' },
          )
        }
        wasCharging = b.charging
        if (!b.charging && b.percent <= LOW_BATTERY && !warned) {
          warned = true
          pushAlert({ icon: '🪫', text: 'Low battery', sub: `${b.percent}%`, value: b.percent }, 'warning')
        } else if (b.charging || b.percent > LOW_BATTERY + 5) warned = false
      }),
      listen<{ caps: boolean; num: boolean }>('lockkeys', (e) => {
        const { caps, num } = e.payload
        // report whichever key just changed
        if (caps !== lockState.caps) {
          pushAlert({ icon: caps ? '🔠' : '🔡', text: caps ? 'Caps Lock on' : 'Caps Lock off' }, 'toggle', { emphasis: 'subtle', direction: caps ? 'forward' : 'back' })
        } else if (num !== lockState.num) {
          pushAlert({ icon: '🔢', text: num ? 'Num Lock on' : 'Num Lock off' }, 'toggle', { emphasis: 'subtle', direction: num ? 'forward' : 'back' })
        }
        lockState = { caps, num }
      }),
      listen<{ mic: string | null; camera: string | null }>('privacy', (e) => {
        const p = e.payload
        setPrivacy(p)
        if (p.camera && p.camera !== lastPrivacy.camera) {
          pushAlert({ icon: '📷', text: 'Camera in use', sub: p.camera }, 'warning', { emphasis: 'subtle' })
        } else if (p.mic && p.mic !== lastPrivacy.mic) {
          pushAlert({ icon: '🎙️', text: 'Microphone in use', sub: p.mic }, 'warning', { emphasis: 'subtle' })
        }
        lastPrivacy = p
      }),
      listen<{ level: number; muted: boolean }>('volume', (e) => {
        const { level, muted } = e.payload
        pushAlert({
          kind: 'volume',
          icon: muted || level === 0 ? '🔇' : level < 50 ? '🔉' : '🔊',
          text: muted ? 'Muted' : 'Volume',
          sub: `${level}%`,
          value: muted ? 0 : level,
        })
      }),
      listen<{ level: number }>('brightness', (e) => {
        const { level } = e.payload
        pushAlert({
          kind: 'brightness',
          icon: level < 50 ? '🔅' : '🔆',
          text: 'Brightness',
          sub: `${level}%`,
          value: level,
        })
      }),
    ]
    return () => offs.forEach((o) => o.then((f) => f()))
  }, [pushAlert])

  // in-place update: progress shows in the island itself
  useEffect(() => {
    if (!IS_TAURI) return
    let started = false
    const off = listen<{ stage: string; percent: number }>('update-progress', (e) => {
      if (e.payload.stage === 'failed') {
        started = false
        setUpdating(null)
        pushAlert({ icon: '⚠️', text: 'Update failed', sub: 'Try again from Settings' }, 'error')
      } else {
        setExpanded(false)
        if (!started) play('loading')
        started = true
        setUpdating(e.payload)
      }
    })
    return () => {
      off.then((f) => f())
    }
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
        play('tap', { emphasis: 'strong' })
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
    play('tap', { emphasis: 'strong' })
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
    if (!IS_TAURI || !expanded || hovered || holdOpen || fs || notes) return
    const id = setTimeout(() => setExpanded(false), 700)
    return () => clearTimeout(id)
  }, [expanded, hovered, holdOpen, fs, notes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fsRef.current) exitFullscreen()
        else setExpanded(false)
      }
      if (!fsRef.current && !document.querySelector('.chat') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        setTab((t) => stepPage(pagesRef.current, t, dir))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitFullscreen])

  // after an update, open the island once with what changed
  useEffect(() => {
    if (!IS_TAURI) return
    getVersion()
      .then((v) => {
        const r = releaseToShow(v)
        if (r) {
          setNotes(r)
          setExpanded(true)
        }
      })
      .catch(() => {})
  }, [])

  // chats only live on the Friends and Groups pages
  useEffect(() => {
    if (tab !== 'friends' && tab !== 'groups') setOpenChat({ friend: null, group: null })
  }, [tab])

  // fullscreen only belongs to an open chat
  useEffect(() => {
    if (fs && !(expanded && (tab === 'friends' || tab === 'groups'))) exitFullscreen()
  }, [fs, expanded, tab, exitFullscreen])

  // what friends can see: the song or timer that is running
  const activityText = playing && track ? `🎵 ${track.title} – ${track.artist}` : timer ? (pomo ? '🍅 Focusing' : '⏳ Timer running') : ''
  const social = DEMO_SOCIAL ? demo.social : realSocial
  const { saveProfile } = auth
  useAutoIdle(auth.profile?.presence ?? (auth.profile ? 'online' : undefined), (v) => void saveProfile({ presence: v }), Boolean(auth.profile))
  useHeartbeat(DEMO_SOCIAL ? undefined : auth.user?.id)
  const unreadCount =
    Object.values(social.unread).reduce((a, b) => a + b, 0) +
    (DEMO_SOCIAL ? 0 : Object.values(groupChats.unread).reduce((a, b) => a + b, 0) + groupChats.invites.length)
  const { publishActivity } = social
  useEffect(() => {
    if (!meId) return
    if (!settings.shareActivity) {
      publishActivity(null)
      return
    }
    const send = () => publishActivity(activityText || null)
    const id = setTimeout(send, 1200)
    const beat = setInterval(send, 4 * 60_000)
    return () => {
      clearTimeout(id)
      clearInterval(beat)
    }
  }, [meId, settings.shareActivity, activityText, publishActivity])

  const theme = useResolvedTheme(settings.theme)
  const accent = settings.accentFromMusic && playing && track ? `hsl(${track.hue} 78% 62%)` : settings.accent
  const onAcc = settings.accentFromMusic && playing && track ? '#000' : onAccent(settings.accent)

  const lyricIdx = track?.lyrics ? currentLineIndex(track.lyrics, position + settings.lyricOffset) : -1
  const lyricText = lyricIdx >= 0 ? track!.lyrics![lyricIdx].text : ''
  const showLyricPeek = playing && !!lyricText
  // idle pill shows the lyric line instead of the clock when asked to and one is available
  const idleLyric = settings.idle === 'lyrics' && showLyricPeek

  // other things the pill can show; falls back to the clock when there is nothing to show yet.
  // Re-read when the card closes, which is when the city may have changed.
  const idleExtra = useMemo(() => {
    if (settings.idle === 'weather' && settings.city) {
      const w = cachedWeather(settings.city, settings.fahrenheit)
      return w ? `${describeWeather(w.code).icon} ${w.temp}°${settings.fahrenheit ? 'F' : 'C'} · ${w.city}` : ''
    }
    return ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.idle, settings.city, settings.fahrenheit, expanded])
  const idleText = idleLyric ? lyricText : idleExtra

  const mode = updating ? 'alert' : expanded ? 'expanded' : alert ? 'alert' : hovered ? 'peek' : 'idle'

  // every page uses the same card size so the navigation arrows never move
  const expandedHeight = settings.cardH

  // grow the pill to fit the lyric line, up to what the stage can hold
  const lyricW = textWidth(lyricText)
  const idleW = idleLyric ? lyricW : idleExtra ? Math.min(textWidth(idleExtra), Math.max(140, idleExtra.length * 9 + 60)) : 140

  const shape: Shape = useMemo(() => {
    switch (mode) {
      case 'expanded':
        if (fs) return { w: fs.w / settings.scale, h: fs.h / settings.scale, r: 0 }
        return { w: settings.cardW, h: expandedHeight, r: 44 }
      case 'alert':
        return { w: 320, h: 60, r: 26 }
      case 'peek':
        return { w: showLyricPeek ? lyricW : 230, h: 40, r: 16 }
      default:
        return { w: idleW, h: 34, r: 13 }
    }
  }, [mode, fs, settings.scale, expandedHeight, settings.cardW, showLyricPeek, idleW, lyricW])

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

  useEffect(() => {
    if (group) lastInGroup.current[group.id] = tab
  }, [group, tab])

  const go = (dir: -1 | 1) => setTab((t) => stepPage(pages, t, dir))

  // which way the page change goes: 1 = towards the next page, -1 = back (shortest way round)
  const pageDrag = useDragControls()
  const pageIdx = Math.max(0, pages.findIndex((p) => p.id === tab))
  const prevIdx = useRef(pageIdx)
  const dirRef = useRef<1 | -1>(1)
  if (prevIdx.current !== pageIdx) {
    let diff = pageIdx - prevIdx.current
    if (Math.abs(diff) > pages.length / 2) diff = -diff
    dirRef.current = diff >= 0 ? 1 : -1
    prevIdx.current = pageIdx
  }

  // the card opening and closing, and every page change inside it (arrows, dock, keys, swipes)
  // jumping between a friend's chat and a group's chat is a chat selection, not a page change
  const isSocial = (t: Tab) => t === 'friends' || t === 'groups'
  const chatSwitch = useRef(false)
  chatSwitch.current = Boolean(openChat.friend || openChat.group)
  const soundState = useRef({ expanded, tab })
  useEffect(() => {
    const was = soundState.current
    // opening is a press on the island, so it taps; closing lets the card fall shut
    if (expanded !== was.expanded) play(expanded ? 'tap' : 'close', { emphasis: expanded ? 'normal' : 'subtle' })
    else if (expanded && tab !== was.tab && !(chatSwitch.current && isSocial(tab) && isSocial(was.tab))) play('navigate', { emphasis: 'subtle', direction: dirRef.current > 0 ? 'forward' : 'back' })
    soundState.current = { expanded, tab }
  }, [expanded, tab])

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
  const skipPomo = () => pomo && advancePomo(pomo)

  const onSkip = (dir: -1 | 1) => {
    skip(dir)
    if (!IS_TAURI) pushAlert({ icon: dir > 0 ? '⏭' : '⏮', text: dir > 0 ? 'Next track' : 'Previous track' })
  }

  // Drag the island to move it. The pill follows the cursor on a spring and sticks to the
  // centre line / top edge like a magnet: it gets pulled in with a little overshoot.
  const stepSpring = useCallback(() => {
    const m = motionRef.current
    const now = performance.now()
    const dt = Math.min(0.032, (now - m.last) / 1000)
    m.last = now
    // soft and bouncy while stuck to a magnet, tight when following the cursor
    const stuck = m.magX || m.magY
    const k = stuck ? 520 : 1100
    const c = stuck ? 17 : 62
    let moving = false
    for (const axis of ['x', 'y'] as const) {
      const err = m.target[axis] - m.pos[axis]
      m.vel[axis] += (k * err - c * m.vel[axis]) * dt
      m.pos[axis] += m.vel[axis] * dt
      if (Math.abs(err) > 0.4 || Math.abs(m.vel[axis]) > 4) moving = true
    }
    if (!moving && !m.held) {
      m.pos = { ...m.target }
      m.vel = { x: 0, y: 0 }
    }
    const next = { x: Math.round(m.pos.x), y: Math.max(0, Math.round(m.pos.y)) }
    if (next.x !== posRef.current.x || next.y !== posRef.current.y) {
      setPos(next)
      invoke('set_offset', { x: next.x, y: next.y }).catch(() => {})
    }
    if (moving || m.held) {
      m.raf = requestAnimationFrame(stepSpring)
    } else {
      m.raf = 0
      update({ posX: next.x, posY: next.y })
    }
  }, [update])

  const glideTo = useCallback(
    (x: number, y: number, held: boolean) => {
      const m = motionRef.current
      m.target = { x, y }
      m.held = held
      if (!m.raf) {
        m.pos = { x: posRef.current.x, y: posRef.current.y }
        m.last = performance.now()
        m.raf = requestAnimationFrame(stepSpring)
      }
    },
    [stepSpring],
  )

  const dragHandlers = IS_TAURI
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return
          const el = e.target as HTMLElement
          if (el.closest('button, input, textarea, a, .scrub, [draggable="true"]')) return
          // inside the open card only the header strip is a handle
          if (mode === 'expanded' && !el.closest('.xhead')) return
          dragRef.current = { sx: e.screenX, sy: e.screenY, ox: posRef.current.x, oy: posRef.current.y, active: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          const g = dragRef.current
          if (!g) return
          const dx = e.screenX - g.sx
          const dy = e.screenY - g.sy
          if (!g.active) {
            if (Math.hypot(dx, dy) < 5) return
            g.active = true
            play('select')
            setMoving(true)
            invoke('set_dragging', { on: true }).catch(() => {})
          }
          const maxX = window.screen.width / 2 - 80
          const rawX = Math.max(-maxX, Math.min(maxX, g.ox + dx))
          const rawY = Math.max(0, Math.min(window.screen.height - 120, g.oy + dy))
          const m = motionRef.current
          // magnets grab at 24px and let go at 44px, so they feel sticky
          m.magX = Math.abs(rawX) < (m.magX ? 44 : 24)
          m.magY = rawY < (m.magY ? 30 : 14)
          glideTo(m.magX ? 0 : Math.round(rawX), m.magY ? 0 : Math.round(rawY), true)
        },
        onPointerUp: () => {
          const g = dragRef.current
          dragRef.current = null
          if (!g?.active) return
          play('tap', { emphasis: 'strong' })
          setMoving(false)
          invoke('set_dragging', { on: false }).catch(() => {})
          justDragged.current = true
          setTimeout(() => (justDragged.current = false), 0)
          const m = motionRef.current
          glideTo(m.target.x, m.target.y, false)
        },
        // double-click the pill to send it back to the centre top
        onDoubleClick: () => {
          if (mode === 'expanded' || (!posRef.current.x && !posRef.current.y)) return
          play('navigate', { emphasis: 'subtle', direction: 'back' })
          setExpanded(false)
          const m = motionRef.current
          m.magX = m.magY = true
          glideTo(0, 0, false)
        },
      }
    : undefined

  const d = new Date(now)
  const clock = clockText(d, settings.clock24)
  let content: React.ReactNode
  let contentKey: string

  if (mode === 'expanded') {
    contentKey = 'expanded'
    const page = PAGES.find((p) => p.id === tab)!
    const action =
      tab === 'shelf' && shelf.items.length ? (
        <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={shelf.clear}>Clear</button>
      ) : tab === 'clipboard' ? (
        <>
          <button
            className={`chip ${settings.clipPaused ? 'on' : ''}`}
            aria-pressed={settings.clipPaused}
            data-cuelume-toggle
            onClick={() => update({ clipPaused: !settings.clipPaused })}
          >
            {settings.clipPaused ? 'Resume' : 'Pause'}
          </button>
          {clipboard.items.length > 0 && <button className="chip" data-cuelume-close data-cuelume-emphasis="subtle" onClick={clipboard.clear}>Clear</button>}
        </>
      ) : null
    content = (
      <div className={`expanded ${fs ? 'fs' : ''}`}>
        <ExpandedHeader
          title={page.title}
          timer={timer ? remaining / (timer.total / 1000) : null}
          date={d}
          clock={clock}
          bars={playing && track ? track.hue : null}
          profile={auth.profile}
          onProfile={() => setTab('profile')}
          onPresence={(v) => auth.saveProfile({ presence: v })}
          profileActive={tab === 'profile'}
          onSettings={() => setTab('settings')}
          settingsActive={tab === 'settings'}
          updateAvailable={updater.state.s === 'available'}
        />
        {group && group.pages.length > 1 && (
          <div className="subtabs" onClick={(e) => e.stopPropagation()}>
            {group.pages.map((id) => (
              <button key={id} className={id === tab ? 'active' : ''} onClick={() => setTab(id)}>
                {id === tab && (
                  <motion.span layoutId="subtab-ind" className="subtab-ind" style={{ borderRadius: 999 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} />
                )}
                <span className="subtab-label">{SHORT[id]}</span>
              </button>
            ))}
          </div>
        )}
        <div className={`expanded-body ${action ? 'with-actions' : ''} ${group && group.pages.length > 1 ? 'has-subtabs' : ''}`}>
          {action && <div className="body-actions">{action}</div>}
          <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
            <motion.div
              // Friends and Groups share one page, so moving between them (e.g. from a chat) does not animate
              key={tab === 'groups' ? 'friends' : tab}
              className="page"
              custom={dirRef.current}
              variants={PAGE_VARIANTS[settings.tabAnim]}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ transformPerspective: 900 }}
              {...(settings.tabAnim === 'elastic'
                ? {
                    drag: 'x' as const,
                    dragControls: pageDrag,
                    dragListener: false,
                    dragConstraints: { left: 0, right: 0 },
                    dragElastic: 0.45,
                    onPointerDown: (e: React.PointerEvent) => {
                      // let inputs, sliders and buttons keep their own dragging
                      if (!(e.target as HTMLElement).closest('input, textarea, button, a, .scrub, [draggable="true"], .todo-item')) pageDrag.start(e)
                    },
                    onDragEnd: (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
                      if (info.offset.x < -70 || info.velocity.x < -450) go(1)
                      else if (info.offset.x > 70 || info.velocity.x > 450) go(-1)
                    },
                  }
                : {})}
            >
            {tab === 'media' && (
              <MediaWidget
                track={track}
                position={position}
                lyricOffset={settings.lyricOffset}
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
                paused={settings.clipPaused}
                mask={settings.clipMask}
                onRemove={clipboard.remove}
                onCopy={(item) => {
                  clipboard.copy(item)
                  pushAlert({ icon: '📋', text: 'Copied' }, 'success', { emphasis: 'subtle' })
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
            {(tab === 'friends' || tab === 'groups') && (
              <FriendsWidget
                section={tab}
                auth={auth}
                social={social}
                call={DEMO_SOCIAL ? undefined : call}
                groups={DEMO_SOCIAL ? demo.groups : groupChats}
                activityText={activityText}
                onGoProfile={() => setTab('profile')}
                chat={openChat}
                onChat={(c, page) => {
                  setOpenChat(c)
                  if (page && page !== tab) setTab(page)
                }}
                openChatId={pendingChat}
                onChatOpened={() => setPendingChat(null)}
                fullscreen={Boolean(fs)}
                onFullscreen={toggleFullscreen}
              />
            )}
            {tab === 'profile' && <ProfileWidget auth={auth} settings={settings} update={update} onHold={setHoldOpen} />}
            {tab === 'settings' && <SettingsWidget settings={settings} update={update} updater={updater} />}
            </motion.div>
          </AnimatePresence>
          <button className="nav-arrow left" aria-label="Previous page" onClick={(e) => { e.stopPropagation(); go(-1) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.5 6 8.5 12l6 6" />
            </svg>
          </button>
          <button className="nav-arrow right" aria-label="Next page" onClick={(e) => { e.stopPropagation(); go(1) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9.5 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <Dock
          groups={groups}
          activeId={group?.id}
          onSelect={(id) => {
            const g = groups.find((x) => x.id === id)!
            setTab(g.pages.includes(lastInGroup.current[id]) ? lastInGroup.current[id] : g.pages[0])
          }}
        />
        {notes && (
          <div className="whatsnew" onClick={(e) => e.stopPropagation()}>
            <small>What's new in v{notes.version}</small>
            <b>{notes.title}</b>
            <ul>
              {notes.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <button className="pill-btn" data-cuelume-close onClick={() => setNotes(null)}>
              Got it
            </button>
          </div>
        )}
        {dragging && (
          <div className="drop-overlay">
            {tab === 'apps' ? 'Release to pin' : 'Release to add to Shelf'}
          </div>
        )}
      </div>
    )
  } else if (mode === 'alert' && updating) {
    contentKey = 'updating'
    const installing = updating.stage === 'installing'
    content = (
      <div className="alert">
        <span className="alert-icon">⬇️</span>
        <div className="alert-text">
          <span>{installing ? 'Installing' : 'Updating'}</span>
          <small>{installing ? 'Restarting…' : `${updating.percent}%`}</small>
        </div>
        <div className="liquid-bar">
          <div className="liquid-fill" style={{ width: `${updating.percent}%` }} />
        </div>
      </div>
    )
  } else if (mode === 'alert' && alert) {
    // held volume/brightness keys keep one mounted alert so the bar slides instead of fading out and in
    contentKey = alert.kind ? `alert-${alert.kind}` : `alert-${alert.id}`
    content = (
      <div className="alert">
        {alert.avatar ? <Avatar profile={alert.avatar} size={34} /> : <span className="alert-icon">{alert.icon}</span>}
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
    contentKey = idleLyric ? `idle-lyric-${lyricIdx}` : idleExtra ? 'idle-extra' : 'idle'
    content = (
      <div className={`idle ${idleText ? 'lyric-idle' : 'idle-grid'}`}>
        {idleText ? (
          <>
            {playing && track && settings.idleBars && !idleLyric && <Bars active hue={track.hue} />}
            <span className="idle-lyric">{idleText}</span>
            {unreadCount > 0 && <span className="dot unread-dot" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`} />}
            {privacy.camera && <span className="dot cam" title={`Camera: ${privacy.camera}`} />}
            {privacy.mic && <span className="dot mic" title={`Microphone: ${privacy.mic}`} />}
          </>
        ) : (
          <>
            {/* the clock stays in the exact middle; bars hang off its left, dots off its right */}
            <span className="idle-side left">{playing && track && settings.idleBars && <Bars active hue={track.hue} />}</span>
            <span>{clock}</span>
            <span className="idle-side right">
              {unreadCount > 0 && <span className="dot unread-dot" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`} />}
              {privacy.camera && <span className="dot cam" title={`Camera: ${privacy.camera}`} />}
              {privacy.mic && <span className="dot mic" title={`Microphone: ${privacy.mic}`} />}
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      className={`root ${IS_TAURI ? 'native' : 'demo'} ${hidden ? 'hidden' : ''} ${theme} ${theme === 'glass' ? `tint-${settings.glassTint}` : ''} ${moving ? 'dragging' : ''} ${fs || fsWin ? 'fullchat' : ''}`}
      style={{
        ['--accent' as string]: accent,
        ['--on-accent' as string]: onAcc,
        ['--scale' as string]: settings.scale,
        ['--clock-size' as string]: `${settings.clockSize}px`,
      }}
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
        floating={pos.y > 2}
        offset={pos}
        centered={Boolean(fs)}
        dragHandlers={dragHandlers}
        onClick={(e) => {
          e.stopPropagation()
          if (justDragged.current) return
          if (mode === 'alert' && alert?.chatWith) {
            setPendingChat(alert.chatWith)
            setTab('friends')
            setAlert(null)
          }
          setExpanded(true)
        }}
        onHover={(h) => !IS_TAURI && setHovered(h)}
        spring={SPRINGS[settings.anim]}
        intro={intro}
      >
        {content}
      </Island>

      {!IS_TAURI && (
        <div
          className="demo-panel"
          style={{ translate: `${panelPos.x}px ${panelPos.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <b
            className="demo-grip"
            title="Drag to move"
            onPointerDown={(e) => {
              panelDrag.current = { sx: e.clientX, sy: e.clientY, ox: panelPos.x, oy: panelPos.y }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const g = panelDrag.current
              if (g) setPanelPos({ x: g.ox + e.clientX - g.sx, y: g.oy + e.clientY - g.sy })
            }}
            onPointerUp={() => (panelDrag.current = null)}
          >
            ⠿ Browser demo
          </b>
          <button onClick={() => pushAlert({ icon: '⚡', text: 'Charging', sub: '78%', value: 78 }, 'toggle', { emphasis: 'subtle', direction: 'forward' })}>Plug in charger</button>
          <button onClick={() => pushAlert({ icon: '🪫', text: 'Low battery', sub: '15%', value: 15 }, 'warning')}>Low battery</button>
          <button onClick={() => pushAlert({ kind: 'volume', icon: '🔊', text: 'Volume', value: Math.round(Math.random() * 100) })}>Volume change</button>
          <button onClick={() => pushAlert({ kind: 'brightness', icon: '🔆', text: 'Brightness', value: Math.round(Math.random() * 100) })}>Brightness change</button>
          <button onClick={() => startTimer(0.25)}>15 s timer</button>
          <button
            onClick={() => {
              if (DEMO_SOCIAL) {
                const { friend, body } = demo.ping()
                if (auth.profile?.presence !== 'dnd') {
                  playMessageSound()
                  pushAlert({ icon: '💬', text: friend.profile.display_name, sub: body, avatar: friend.profile, chatWith: friend.profile.id })
                }
              } else {
                playMessageSound()
                pushAlert({ icon: '💬', text: 'Rina', sub: 'Are you free tonight?' })
              }
            }}
          >
            Message
          </button>
          <button onClick={() => pushAlert({ icon: '⬆️', text: 'Update available', sub: 'v9.9.9 · open Settings to install' }, 'ready')}>
            Update alert
          </button>
          <button
            onClick={() => {
              setNotes(CHANGELOG[0])
              setExpanded(true)
            }}
          >
            What's new
          </button>
          <button onClick={() => setIntro((n) => n + 1)}>Replay intro</button>
          <button onClick={toggle}>{playing ? 'Pause' : 'Play'} music</button>
        </div>
      )}
    </div>
  )
}
