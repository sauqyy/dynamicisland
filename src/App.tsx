import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { listen } from '@tauri-apps/api/event'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { PAGE_VARIANTS } from './lib/pageAnim'
import { GooFilter, Island, type Shape } from './island/Island'
import { Art, MediaWidget } from './widgets/MediaWidget'
import { Bars, EqContext } from './widgets/Equalizer'
import { Ring } from './widgets/TimerWidget'
import { TimerTab, type ClockMode } from './widgets/TimerTab'
import { TodoWidget } from './widgets/TodoWidget'
import { useUpdater } from './lib/useUpdater'
import { getVersion } from '@tauri-apps/api/app'
import { CHANGELOG, releaseToShow, type Release } from './lib/changelog'
import { SettingsWidget } from './widgets/SettingsWidget'
import { AstraWelcome } from './widgets/AstraWelcome'
import { astraIntroSeen, markAstraIntro } from './lib/astraIntro'
import { markUpdateSeen, updateSeen } from './lib/updateSeen'
import { ShelfWidget } from './widgets/ShelfWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { PrompterWidget } from './widgets/PrompterWidget'
import { DeadlinesWidget } from './widgets/DeadlinesWidget'
import { ScheduleWidget } from './widgets/ScheduleWidget'
import { StudyWidget } from './widgets/StudyWidget'
import { dueLabel, upcoming, urgency, URGENT_HOURS, useDeadlines, type Deadline } from './lib/deadlines'
import { classState, nextClassLabel, useSchedule } from './lib/schedule'
import { DEFAULT_LABEL, studyActivity, useStudyBoard, useStudyLog, type StudySession } from './lib/study'
import { useStudyRoom, type StudyRoom } from './lib/useStudyRoom'
import { WeatherWidget } from './widgets/WeatherWidget'
import { LumiWidget } from './widgets/LumiWidget'
import { SceleWidget } from './widgets/SceleWidget'
import { TodayWidget } from './widgets/TodayWidget'
import { CatchUpCard, needsYou, type UnreadFrom } from './widgets/CatchUpCard'
import { useCatchUp } from './lib/useCatchUp'
import { CampusSetup } from './widgets/CampusSetup'
import { demoForgetSlcmSession } from './lib/slcm'
import { UI_YELLOW, UiLogo } from './widgets/UiLogo'
import { useScele } from './lib/useScele'
import { demoPostGrade, demoResetScele, demoSubmitLab } from './lib/scele'
import { NO_STUDENT, useStudent } from './lib/sso'
import { ClipboardWidget } from './widgets/ClipboardWidget'
import { ProfileWidget } from './widgets/ProfileWidget'
import { Avatar } from './widgets/Avatar'
import { IncomingCall } from './widgets/IncomingCall'
import { InCallPill } from './widgets/InCallPill'
import { Timer } from './widgets/CallBar'
import { FriendsWidget, type OpenChat } from './widgets/FriendsWidget'
import { useAuth } from './lib/useAuth'
import { useSocial } from './lib/useSocial'
import { useGroups } from './lib/useGroups'
import { useCall } from './lib/useCall'
import { useGroupVoice } from './lib/useGroupVoice'
import { useGroupRing } from './lib/useGroupRing'
import { DEMO_SOCIAL, useDemo } from './lib/useDemo'
import { playJoin, playLeave } from './lib/callSounds'
import { useClipboard } from './lib/useClipboard'
import { Rail, type PageCounts } from './island/Rail'
import { MascotEyes } from './mascot/MascotEyes'
import { LumiFace } from './mascot/lumi/LumiFace'
import { setLumiLook } from './mascot/lumi/lumiLook'
import { LumiCard, lumiShape } from './mascot/lumi/LumiCard'
import { LumiIntro } from './mascot/lumi/LumiIntro'
import { useLumiRoutines, type ExamRef } from './mascot/lumi/useLumi'
import { LumiCalmContext } from './mascot/lumi/calm'
import { useFollowLocation, useWeatherAlerts } from './lib/useWeatherAlerts'
import { configureLumiSound, hasSfx } from './mascot/lumi/lumiSfx'
import { DUE_QUIP, moodForAlert, say } from './mascot/lumi/moments'
import type { LumiMood } from './mascot/lumi/moods'
import { AstraChatWidget } from './widgets/AstraChatWidget'
import { AssistantCard, assistantShape } from './widgets/AssistantCard'
import { useAssistant } from './lib/useAssistant'
import { loadNeural } from './lib/neuralVoice'
import { demoStt, loadStt, setSttModel, sttDeferred, useSttStatus } from './lib/speechToText'
import { llmInstalled, loadLlm } from './lib/localBrain'
import { AlertIcon, alertTone } from './island/AlertIcon'
import {
  DEFAULT_APPS,
  DEMO_APPS,
  DEMO_SHELF,
  describePaths,
  useStoredList,
  type FileItem,
} from './lib/files'
import { CLOUD_MODEL, SPRINGS, STAGE, useSettings, useSettingsSync } from './lib/settings'
import { onAccent, useResolvedTheme } from './lib/theme'
import { currentLineIndex } from './lib/lyrics'
import { IS_TAURI, useMedia } from './lib/useMedia'
import { useAutoIdle } from './lib/useAutoIdle'
import { useHeartbeat } from './lib/useHeartbeat'
import { play, type PlayOptions, type SoundName } from 'cuelume'
import { useSoundSetup } from './lib/sound'
import { cachedWeather } from './lib/weather'
import { WeatherIcon, isNight } from './widgets/WeatherIcon'
import { GROUPS, PAGES, type IslandAlert, type PomodoroState, type PomoPhase, type StopwatchState, type Tab, type TimerState, type Todo } from './types'
import './App.css'

// loaded once at startup: building a fresh Audio per message re-fetches and re-decodes the file, which is what made the sound lag
const messageAudio = new Audio('/message.mp3')
messageAudio.preload = 'auto'
messageAudio.volume = 0.3

// rings on a loop while a voice call is incoming
const ringAudio = new Audio('/ringtone.mp3')
ringAudio.preload = 'auto'
ringAudio.loop = true
ringAudio.volume = 0.5

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
/** The Universitas Indonesia build (VITE_CAMPUS=1). Written out here, not imported, so the bundler can drop the campus modules from the regular build. */
// also the browser dev server, for the SCELE demo (see campus.ts)
const CAMPUS = (import.meta.env.VITE_CAMPUS === '1' || (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window) && !location.search.includes('nocampus')))
const CAMPUS_PAGES: Tab[] = ['deadlines', 'classes', 'inbox']
/** what the campus hook returns in the regular build, where it is never called */
const NO_SCELE = { deadlines: [], notices: [] } as unknown as ReturnType<typeof useScele>

/** The page that was open last time, so the card comes back where it was left. */
function loadTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    if (PAGES.some((p) => p.id === t)) return t as Tab
  } catch {
    /* ignore */
  }
  // the Universitas Indonesia build opens on the day at a glance
  return CAMPUS ? 'today' : 'media'
}

/** the day the "Verify your SSO UI" alert was last shown */
const VERIFY_NUDGE_KEY = 'di.ui.verifyNudge'
/** set once Lumi has introduced herself and been told what to call the user */
const LUMI_INTRO_KEY = 'di.lumi.intro'
/** set once connecting Universitas Indonesia is finished and its "all set" has been seen */
const SETUP_DONE_KEY = 'di.ui.setupDone'

/** Has Lumi said hello yet? */
function lumiSeen() {
  try {
    return localStorage.getItem(LUMI_INTRO_KEY) === '1'
  } catch {
    return true
  }
}

/** "ZHILLAN BANIAKSA" → "Zhillan": the first name, written the way people write names */
function niceName(full: string) {
  const first = full.trim().split(/\s+/)[0] ?? ''
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : ''
}

/** What verifying with SSO UI has opened up, each a tap away. */
const UNLOCKED: { tab: Tab; title: string; text: string }[] = [
  { tab: 'today', title: 'Today', text: "Your next class, what's due and your to-dos, in one place." },
  { tab: 'classes', title: 'Classes', text: "Your week of classes, with each one's room, topic and slides." },
  { tab: 'deadlines', title: 'Due', text: "SCELE assignments and whether they're submitted, your own deadlines, and grades." },
  { tab: 'inbox', title: 'Inbox', text: "Course announcements and new materials as they're posted." },
]

/**
 * Shown once, right after SSO UI verification succeeds: the Universitas Indonesia features that
 * just unlocked, and SCELE as the next step, since Classes, Due and Inbox are filled from it.
 */
function Welcome({ name, sceleConnected, onGo, onClose }: { name: string; sceleConnected: boolean; onGo: (t: Tab) => void; onClose: () => void }) {
  const first = name.split(' ')[0]
  return (
    <div className="whatsnew welcome" onClick={(e) => e.stopPropagation()}>
      <UiLogo size={34} color={UI_YELLOW} />
      <small>Verified with SSO UI</small>
      <b>{first ? `Welcome, ${first}` : 'Welcome'}</b>
      <p className="welcome-lede">Campus is unlocked. Here's what's new for you:</p>
      <ul className="welcome-list">
        {UNLOCKED.map((u) => (
          <li key={u.tab}>
            <button data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => onGo(u.tab)}>
              <b>{u.title}</b>
              <span>{u.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {!sceleConnected && <p className="welcome-note">One step left: connect SCELE and your timetable on Today, with your SSO UI password once.</p>}
      <div className="welcome-acts">
        <button className="pill-btn" data-cuelume-close data-cuelume-emphasis="subtle" onClick={onClose}>
          Later
        </button>
        <button className="pill-btn primary" data-cuelume-open onClick={() => onGo('today')}>
          {sceleConnected ? 'Show me Today' : 'Continue setup'}
        </button>
      </div>
    </div>
  )
}

/** The open card's height follows its page, within these bounds (design px). */
const CARD_MIN = 200
/** the welcome back is only as tall as what it says: a greeting alone is short */
const CATCHUP_MIN = 118
const CARD_MAX = STAGE.h - 14
/** Date and time row above the page, and the page's bottom padding plus the rail row below it. */
const CARD_TOP = 40
const CARD_PAD = 62
const ACTIONS_H = 34

/** Pill width that fits a line of text, up to what the stage can hold. */
const textWidth = (text: string) => Math.min(STAGE.w - 40, Math.max(300, text.length * 7.2 + 80))
/** The same with room for the art on the left and the waveform on the right. */
const liveWidth = (text: string) => Math.min(STAGE.w - 40, Math.max(236, text.length * 7.2 + 104))

/** One line of pill text; a new line rises in as the old one leaves. */
function LiveText({ text, k }: { text: string; k: string | number }) {
  return (
    <span className="live-text">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={k}
          className="live-line"
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.28 } }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.16 } }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

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

/** px kept clear between the island and the left or right side of the screen */
const SCREEN_EDGE = 8

export default function App() {
  // the playback position is only needed smoothly while the Playing page is open (see below)
  const mediaFast = useRef(false)
  const { track, playing, position, toggle, seek, skip } = useMedia(mediaFast)
  const { settings, update, adopt } = useSettings()
  const assistant = useAssistant({
    enabled: settings.assistant,
    hotkey: settings.assistantKey,
    talk: settings.assistantTalk,
    brain: settings,
    voice: {
      enabled: settings.assistantSpeak,
      voice: settings.assistantVoice,
      rate: settings.assistantRate,
      cloud: settings.assistantVoiceEngine === 'openai' ? { voice: settings.assistantCloudVoice, model: CLOUD_MODEL } : null,
    },
    // the parts of the island the assistant can operate
    controls: {
      startTimer: (m) => startTimer(m),
      addTodo: (text) => setTodos((t) => [...t, { id: Date.now(), text, done: false }]),
      isPlaying: () => playingRef.current,
    },
    // what Claude is told about the moment: the time, and what is playing
    getContext: () => {
      const d = new Date()
      const when = d.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      const music = track ? `${playing ? 'Playing now' : 'Paused'}: "${track.title}"${track.artist ? ` by ${track.artist}` : ''}.` : ''
      return `It is ${when}. ${music}`.trim()
    },
    // an answer typed for in the Chat tab lands in the pill when the island is not open to show it
    onChatReply: (text) => {
      if (expandedRef.current) return
      pushAlertRef.current({ icon: '✨', text: settingsRef.current.mascotName || 'Astra', sub: text.replace(/\s+/g, ' ').slice(0, 60), openTab: 'astra' }, 'ready')
    },
  })
  const expandedRef = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const pushAlertRef = useRef<(a: Omit<IslandAlert, 'id'>, cue?: SoundName) => void>(() => {})
  // the mic light is expected while you talk to the island, so it should not warn about itself
  const playingRef = useRef(false)
  playingRef.current = playing
  const [astraIntro, setAstraIntro] = useState(false) // the Astra (beta) welcome, shown once
  // get listening and talking ready in the background (the first time they download), so nobody waits for them
  useEffect(() => {
    if (!IS_TAURI || !settings.assistant || astraIntro) return
    // the size is chosen before anything loads, and a change of size reloads it
    setSttModel(settings.assistantListenModel)
    // someone who put the download off is not surprised by it later
    if (sttDeferred()) return
    const t = setTimeout(() => void loadStt().catch(() => {}), 2000)
    return () => clearTimeout(t)
  }, [settings.assistant, settings.assistantListenModel, astraIntro])
  useEffect(() => {
    if (!IS_TAURI || !settings.assistant || settings.assistantEngine !== 'local') return
    // started in the background so the first question does not wait for it, but only when it is already downloaded:
    // a multi-gigabyte download should start when it is asked for, not by itself
    let alive = true
    const t = setTimeout(async () => {
      if (alive && (await llmInstalled(settings.assistantLocalModel))) void loadLlm(settings.assistantLocalModel).catch(() => {})
    }, 6000)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [settings.assistant, settings.assistantEngine, settings.assistantLocalModel])
  useEffect(() => {
    if (!IS_TAURI || !settings.assistant || !settings.assistantSpeak || settings.assistantVoiceEngine === 'openai') return
    const t = setTimeout(() => void loadNeural().catch(() => {}), 8000)
    return () => clearTimeout(t)
  }, [settings.assistant, settings.assistantSpeak, settings.assistantVoiceEngine])
  const assistantAwake = useRef(false)
  assistantAwake.current = assistant.state.phase !== 'idle'
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
  const afterIntro = useRef<Release | null>(null) // the update notes that wait behind it
  // the welcome after SSO UI verification succeeds, and Today's "Verify" sending the user to Profile
  const [welcome, setWelcome] = useState(false)
  // Lumi's first hello (once per install, or when an update brings her), and whether it has happened
  const [lumiIntro, setLumiIntro] = useState(false)
  const [lumiMet, setLumiMet] = useState(() => {
    try {
      return localStorage.getItem(LUMI_INTRO_KEY) === '1'
    } catch {
      return true
    }
  })
  const lumiOn = CAMPUS && settings.lumi
  const lumiOnRef = useRef(lumiOn)
  useEffect(() => {
    configureLumiSound({ on: settings.uiSounds && settings.lumiLook.sounds, volume: settings.soundVolume, calm: settings.lumiCalm })
  }, [settings.uiSounds, settings.lumiLook.sounds, settings.soundVolume, settings.lumiCalm])
  lumiOnRef.current = lumiOn
  // her look reaches every place she is drawn
  useLayoutEffect(() => setLumiLook(settings.lumiLook), [settings.lumiLook])
  /** the demo panel: one of her moments, as if it had just happened */
  const lumiDemo = (mood: LumiMood, extra: Partial<IslandAlert> = {}) => {
    const s = say(mood, settings.callMe.trim() || 'Zhillan')
    setExpanded(false)
    pushAlert({ icon: '✨', text: s.title, sub: s.sub, lumi: mood, ms: 6500, ...extra }, 'ready')
  }
  // how tall the catch-up's content is, so the island fits it
  const [catchUpH, setCatchUpH] = useState(0)
  const [spotlight, setSpotlight] = useState(0)
  // the browser demo's button panel can be dragged out of the way by its title
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 })
  const panelDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const realAuth = useAuth()
  const demo = useDemo()
  const auth = DEMO_SOCIAL ? demo.auth : realAuth
  const meId = !DEMO_SOCIAL && auth.user && auth.profile ? auth.user.id : null
  useSettingsSync(DEMO_SOCIAL ? null : (realAuth.user?.id ?? null), settings, adopt)
  const [hovered, setHovered] = useState(false)
  const [intro, setIntro] = useState(0) // bumped by the demo's Replay intro button
  const [tab, setTab] = useState<Tab>(loadTab)
  const [pos, setPos] = useState({ x: settings.posX, y: settings.posY })
  const [moving, setMoving] = useState(false)
  // docked on the taskbar, growing upwards; and where the taskbar starts, in px from the top of the window
  const [docked, setDocked] = useState(settings.posBottom)
  const [taskbarTop, setTaskbarTop] = useState(0)
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
    magBottom: settings.posBottom,
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
  const { deadlines, setDeadlines } = useDeadlines()
  const openDeadlines = useMemo(() => upcoming(deadlines), [deadlines])
  const { slots, setSlots } = useSchedule()
  const { log: studyLog, history: studyHistory, add: logStudy, clearHistory: clearStudyHistory } = useStudyLog()
  // what the current focus session is for, and the study session that is counting minutes (the ref lets timers read it without waiting for a render)
  const [task, setTask] = useState('')
  const taskRef = useRef(task)
  taskRef.current = task
  const taskDeadline = useRef<number | undefined>(undefined)
  const [study, setStudyState] = useState<StudySession | null>(null)
  const studyRef = useRef<StudySession | null>(null)
  const leaveRoomRef = useRef<(gid: string) => void>(() => {})
  const [battery, setBattery] = useState<number | null>(null)
  // natural height of the page on show, measured as it renders
  const [pageH, setPageH] = useState(240)
  const fitObserver = useRef<ResizeObserver | null>(null)
  const fitRef = useCallback((el: HTMLDivElement | null) => {
    // the page that is leaving reports null; the one arriving takes over the observer
    if (!el) return
    fitObserver.current?.disconnect()
    fitObserver.current = new ResizeObserver(() => setPageH(el.offsetHeight))
    fitObserver.current.observe(el)
    setPageH(el.offsetHeight)
  }, [])
  const alertId = useRef(0)
  const tabRef = useRef(tab)
  tabRef.current = tab
  mediaFast.current = expanded && tab === 'media'
  // the Campus pages only exist for a Fasilkom student verified with SSO UI on the Profile page
  const student = CAMPUS ? useStudent() : NO_STUDENT
  const campus = Boolean(student.student?.fasilkom)
  const pages = useMemo(
    () =>
      PAGES.filter(
        (p) =>
          (p.id === 'settings' || !settings.hiddenPages.includes(p.id)) &&
          (campus || !CAMPUS_PAGES.includes(p.id)) &&
          (p.id !== 'astra' || settings.assistant) &&
          // once Campus is unlocked, your own deadlines are on Due with SCELE's
          !(CAMPUS && campus && p.id === 'deadlist'),
      ),
    [settings.hiddenPages, campus, settings.assistant],
  )
  // the groups that still have a visible page, and which one the current page is in
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => pages.some((x) => x.id === p)) })).filter((g) => g.pages.length),
    [pages],
  )
  const group = groups.find((g) => g.pages.includes(tab)) ?? groups[0]
  // a saved Astra page falls back to the first visible one once talking to the island is off
  useEffect(() => {
    if (tab === 'astra' && !settings.assistant) setTab(pages[0]?.id ?? 'media')
  }, [tab, settings.assistant, pages])
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
    if (dragRef.current?.active || motionRef.current.raf) return
    setPos({ x: settings.posX, y: settings.posY })
    setDocked(settings.posBottom)
    motionRef.current.magBottom = settings.posBottom
  }, [settings.posX, settings.posY, settings.posBottom])

  // tell the window it's docked (it then reaches down to the taskbar and no further), and learn where
  // the taskbar starts; looked at again now and then, as the taskbar can move or change size
  useEffect(() => {
    if (!IS_TAURI) return
    const look = () =>
      invoke<number>('set_dock_bottom', { on: docked })
        .then((line) => line > 0 && setTaskbarTop(line))
        .catch(() => {})
    look()
    const id = setInterval(look, 10_000)
    return () => clearInterval(id)
  }, [docked, settings.monitor])
  // tray menu → "Reset island position": the way back when the pill ends up somewhere it can't be clicked
  useEffect(() => {
    if (!IS_TAURI) return
    const off = listen('reset-position', () => update({ posX: 0, posY: 0 }))
    return () => void off.then((f) => f())
  }, [update])
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
    // the Universitas Indonesia build gives the alerts it already raises Lumi's face
    const lumi = CAMPUS && lumiOnRef.current ? (a.lumi ?? (a.avatar || a.nowPlaying ? undefined : (moodForAlert(a) ?? undefined))) : undefined
    // a deadline reminder carries a short line for how close it is ("time to lock in.")
    const quip = lumi && a.icon === '📅' && a.sub ? DUE_QUIP[lumi] : undefined
    setAlert({ ...a, lumi, ...(quip ? { sub: `${a.sub} · ${quip}` } : null), id: ++alertId.current })
    // she has her own voice for a moment, so the generic alert sound stays out of her way
    if (cue && !(lumi && hasSfx(lumi))) play(cue, opts)
  }, [])
  pushAlertRef.current = pushAlert
  expandedRef.current = expanded

  // study sessions: a focus phase or a shared room counts its minutes into the log when it ends
  const beginStudy = useCallback((label: string, opts: { maxMin: number; deadlineId?: number; gid?: string }) => {
    const s: StudySession = { label: label.trim() || DEFAULT_LABEL, startedAt: Date.now(), ...opts }
    studyRef.current = s
    setStudyState(s)
  }, [])
  const endStudy = useCallback(() => {
    const s = studyRef.current
    if (!s) return
    studyRef.current = null
    setStudyState(null)
    logStudy(s.label, Math.min((Date.now() - s.startedAt) / 60_000, s.maxMin), s.startedAt, Boolean(s.gid))
    if (s.gid) leaveRoomRef.current(s.gid)
  }, [logStudy])
  // away and back: everything keeps running while the user is away (alerts, sounds, SCELE's sync),
  // and what came in meanwhile is noted, to greet them with as one catch-up when they return, once
  // SCELE has synced again
  const sceleRef = useRef<ReturnType<typeof useScele> | null>(null)
  const catchUp = useCatchUp({
    enabled: settings.catchUp,
    ready: (since) => {
      const sc = sceleRef.current
      return !CAMPUS || !sc?.account || (sc.syncedAt >= since && !sc.syncing)
    },
    onReturn: () => sceleRef.current?.syncSoon?.(),
  })
  const { hold } = catchUp
  /** An alert now, or (the user being away) kept for the catch-up. */
  const alertOrHold = useCallback(
    (a: Omit<IslandAlert, 'id'>, cue?: SoundName, opts?: PlayOptions) => {
      if (hold(a)) return
      pushAlert(a, cue, opts)
    },
    [hold, pushAlert],
  )
  const scele = CAMPUS ? useScele(alertOrHold, student.student === undefined ? undefined : campus) : NO_SCELE
  sceleRef.current = CAMPUS ? scele : null
  // a Campus page left open from before is not there once the verification is removed
  useEffect(() => {
    if (student.student === null && CAMPUS_PAGES.includes(tab)) setTab('profile')
  }, [student.student, tab])
  // Deadlines left open from before Campus unlocked: they're on Due now
  useEffect(() => {
    if (CAMPUS && campus && tab === 'deadlist') setTab('deadlines')
  }, [campus, tab])

  // Universitas Indonesia: verifying with SSO UI is the way in, so the island points there until
  // it's done, and says what has opened up the moment it is
  const sawUnverified = useRef(false)
  useEffect(() => {
    if (!CAMPUS || student.student === undefined) return
    if (!student.student?.fasilkom) {
      sawUnverified.current = true
      return
    }
    // verified just now, not found verified at start-up
    if (!sawUnverified.current) return
    sawUnverified.current = false
    setWelcome(true)
    setExpanded(true)
    setTab('today')
  }, [student.student])
  // not verified: a word about it once a day, a moment after the island starts
  useEffect(() => {
    if (!CAMPUS || student.student !== null) return
    const today = new Date().toDateString()
    try {
      if (localStorage.getItem(VERIFY_NUDGE_KEY) === today) return
    } catch {
      return
    }
    const id = setTimeout(() => {
      try {
        localStorage.setItem(VERIFY_NUDGE_KEY, today)
      } catch {
        /* ignore */
      }
      pushAlert({ icon: '🎓', text: 'Verify your SSO UI', sub: 'Unlock your classes and SCELE deadlines', openTab: 'profile' }, 'ready')
    }, 2500)
    return () => clearTimeout(id)
  }, [student.student, pushAlert])
  /** From Today's "Verify with SSO UI": to the Universitas Indonesia card on Profile, lit up. */
  const goVerify = useCallback(() => {
    setTab('profile')
    setSpotlight((n) => n + 1)
  }, [])

  // Connecting Universitas Indonesia (SSO UI, SCELE, SLCM) as one setup on Today, until it's done
  // and seen. An install that is already fully connected when it starts never shows it.
  const [setupDone, setSetupDone] = useState(() => {
    try {
      return localStorage.getItem(SETUP_DONE_KEY) === '1'
    } catch {
      return false
    }
  })
  const finishSetup = useCallback(() => {
    setSetupDone(true)
    try {
      localStorage.setItem(SETUP_DONE_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])
  const setupSeenOpen = useRef(false)
  useEffect(() => {
    if (!CAMPUS || setupDone || student.student === undefined) return
    // still finding out what's connected
    if (campus && (scele.account === undefined || !scele.slcmKnown)) return
    const complete = campus && Boolean(scele.account) && Boolean(scele.slcm)
    if (!complete) setupSeenOpen.current = true
    else if (!setupSeenOpen.current) finishSetup()
  }, [setupDone, student.student, campus, scele.account, scele.slcm, scele.slcmKnown, finishSetup])
  /** SSO UI from the setup card: in the browser, with the island kept open for the way back. */
  const verifyFromSetup = useCallback(async () => {
    setHoldOpen(true)
    try {
      const who = await student.verify()
      if (!who.fasilkom && !who.needs_scele) throw `Signed in as ${who.name || who.username}, but SSO UI doesn't list you as a Fasilkom UI student.`
    } finally {
      setHoldOpen(false)
    }
  }, [student])
  /** Profile's "Disconnect everything": SSO UI, SCELE (its token too), SLCM and UI's sessions, all at once. */
  const disconnectCampus = useCallback(() => {
    student.forget()
    if (!IS_TAURI) demoForgetSlcmSession()
    setSetupDone(false)
    setupSeenOpen.current = false
    try {
      localStorage.removeItem(SETUP_DONE_KEY)
    } catch {
      /* ignore */
    }
  }, [student])
  // what is still due before midnight, for the badge on the pill
  const dueToday = useMemo(() => {
    const midnight = new Date(now).setHours(24, 0, 0, 0)
    return scele.deadlines.filter((d) => d.due > now && d.due < midnight && d.submission !== 'submitted').length
  }, [scele.deadlines, now])
  const sceleUnreadCount = scele.notices.filter((n) => !n.read).length
  // looking at the Inbox page for a second reads it: its count goes (a glance passing through doesn't)
  const markInboxRead = scele.markInboxRead
  useEffect(() => {
    if (!expanded || tab !== 'inbox' || !sceleUnreadCount || !markInboxRead) return
    const t = setTimeout(markInboxRead, 1000)
    return () => clearTimeout(t)
  }, [expanded, tab, sceleUnreadCount, markInboxRead])

  // a new song (skipped to, or the next one in the queue) shows what is now playing
  const lastTrackId = useRef(track?.id)
  useEffect(() => {
    const was = lastTrackId.current
    lastTrackId.current = track?.id
    if (!track || !was || was === track.id) return
    pushAlert({ icon: '🎵', text: track.title, sub: track.artist, nowPlaying: true })
    // only a change of song counts, not the art or lyrics arriving for the same one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, pushAlert])

  // an available update stays in the pill until it is hovered; after that it stays away, even across restarts,
  // until a newer version comes along. The cog keeps its dot until the update is installed.
  const [fakeUpdate, setFakeUpdate] = useState('') // the browser demo's pretend update
  const [seenUpdate, setSeenUpdate] = useState(updateSeen)
  const updateVersion = updater.state.s === 'available' ? updater.state.version : fakeUpdate
  const cuedUpdate = useRef('')
  useEffect(() => {
    if (!updateVersion || updateVersion === seenUpdate || cuedUpdate.current === updateVersion) return
    cuedUpdate.current = updateVersion
    play('ready')
  }, [updateVersion, seenUpdate])

  // alerts and rings are held back during class and focus sessions, on top of the Focus status; what arrives is counted
  const cls = useMemo(() => classState(slots, now), [slots, now])
  const inClass = settings.classMode && Boolean(cls.current)
  const focusing = settings.focusMute && Boolean(study)
  const silent = inClass || focusing
  const quiet = auth.profile?.presence === 'dnd' || silent
  const missed = useRef(0)
  /** true when an incoming alert should be dropped */
  const hush = () => {
    if (auth.profile?.presence === 'dnd') return true
    if (!silent) return false
    missed.current++
    return true
  }

  const playMessageSound = () => {
    if (settings.messageSound) {
      messageAudio.currentTime = 0
      messageAudio.play().catch(() => {})
    }
  }

  const realSocial = useSocial(meId, (m, from) => {
    if (hush()) return
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
    if (hush()) return
    pushAlert(
      { icon: '📞', text: from.profile.display_name || from.profile.username, sub: 'Incoming voice call', avatar: from.profile, chatWith: from.profile.id },
      'attention',
    )
  })

  const activeCall = DEMO_SOCIAL ? demo.call : call

  const groupChats = useGroups(meId, (m, group, from) => {
    if (hush()) return
    playMessageSound()
    pushAlert({
      icon: group?.emoji ?? '👥',
      text: group?.name ?? 'Group chat',
      sub: `${from?.display_name || from?.username || 'Someone'}: ${m.kind === 'activity' ? '🎵 shared an activity' : m.kind === 'note' ? '📝 shared a note' : m.body}`.slice(0, 42),
    })
  })

  // someone starting a group's voice chat rings the rest of the group
  const groupRinger = useGroupRing(meId, groupChats.groups, (group, from) => {
    if (activeCall.state.phase !== 'idle' || voice.state.groupId || hush()) return
    pushAlert(
      { icon: '📞', text: group.name, sub: `${from?.display_name || from?.username || 'Someone'} started a voice chat`, avatar: from },
      'attention',
    )
  })
  const voice = useGroupVoice(meId, groupChats.groups, groupRinger)

  // the id of the group whose voice chat is ringing, unless you are already in a call
  const groupRing = DEMO_SOCIAL
    ? demo.groupRing
    : groupRinger.ring && activeCall.state.phase === 'idle' && !voice.state.groupId
      ? groupRinger.ring.gid
      : null
  const incomingCall = activeCall.state.phase === 'incoming' || Boolean(groupRing)
  const ringing = incomingCall && !quiet

  // friends studying in a group's room, and the room you sit in
  const studyRoom = useStudyRoom(DEMO_SOCIAL ? null : meId, groupChats.groups, (room, group, host) => {
    if (quiet) return
    pushAlert(
      { icon: '📚', text: group.name, sub: `${host?.display_name || host?.username || 'Someone'} is studying · ${room.task || 'join them'}`.slice(0, 42), openTab: 'study' },
      'attention',
    )
  })
  leaveRoomRef.current = studyRoom.leave
  // the browser demo has no backend, so it keeps its own pretend study rooms
  const [demoRooms, setDemoRooms] = useState<Record<string, StudyRoom>>({})
  const rooms = DEMO_SOCIAL ? demoRooms : studyRoom.rooms
  // the ringtone follows the sound volume slider in Settings
  useEffect(() => {
    ringAudio.volume = Math.min(1, Math.max(0, settings.soundVolume))
  }, [settings.soundVolume])
  useEffect(() => {
    if (ringing) {
      ringAudio.currentTime = 0
      ringAudio.play().catch(() => {})
    } else ringAudio.pause()
    return () => ringAudio.pause()
  }, [ringing])
  const answerGroupRing = () => {
    if (DEMO_SOCIAL) return demo.answerGroupRing()
    const gid = groupRing
    groupRinger.dismiss()
    if (gid) void voice.join(gid)
  }
  const declineGroupRing = DEMO_SOCIAL ? demo.declineGroupRing : groupRinger.dismiss

  useEffect(() => {
    if (!alert) return
    // Lumi's moments stay longer, and stay while the pointer is on them
    if (alert.lumi && hovered) return
    const id = setTimeout(() => setAlert(null), alert.lumi ? (alert.ms ?? (alert.actions?.length ? 12000 : 5200)) : 2600)
    return () => clearTimeout(id)
  }, [alert, alert?.lumi ? hovered : false])

  const advancePomo = useCallback(
    (p: PomodoroState) => {
      endStudy() // a finished (or skipped) focus phase is logged; a break has nothing to log
      const next = nextPomo(p)
      const total = POMO_MIN[next.phase] * 60_000
      const start = Date.now()
      setPomo(next)
      setTimer({ endsAt: start + total, total })
      setNow(start) // so the ring shows the new phase full straight away instead of waiting for the next tick
      if (next.phase === 'focus') beginStudy(taskRef.current, { maxMin: POMO_MIN.focus, deadlineId: taskDeadline.current })
      alertOrHold(
        next.phase === 'focus'
          ? { icon: '🎯', text: 'Focus time', sub: taskRef.current ? `${taskRef.current} · session ${next.done + 1}` : `Session ${next.done + 1}` }
          : { icon: '☕', text: next.phase === 'long' ? 'Long break' : 'Break time', sub: next.phase === 'long' ? `${next.done} done · stretch your legs` : `${next.done} done` },
        'attention',
      )
    },
    [alertOrHold, endStudy, beginStudy],
  )

  useEffect(() => {
    if (!timer || now < timer.endsAt) return
    if (pomo) {
      advancePomo(pomo)
    } else {
      const wasRoom = Boolean(studyRef.current?.gid)
      endStudy()
      setTimer(null)
      // the goal the timer was set for, so the alert says what the time was for
      alertOrHold(wasRoom ? { icon: '📚', text: 'Study session done' } : timer.goal ? { icon: '⏰', text: "Time's up", sub: timer.goal } : { icon: '⏰', text: 'Timer done' }, 'attention')
    }
  }, [now, timer, pomo, alertOrHold, advancePomo, endStudy])

  // when class or a focus session ends, say what came in while the island was quiet
  const wasSilent = useRef(false)
  useEffect(() => {
    if (wasSilent.current && !silent && missed.current > 0) {
      const n = missed.current
      // after the "break time" / "class over" alert has had its moment
      setTimeout(() => pushAlert({ icon: '💬', text: n === 1 ? 'Someone was thinking of you' : `${n} people were thinking of you`, sub: n === 1 ? '1 message or call while you were away' : `${n} messages and calls while you were away` }), 2800)
    }
    if (!silent) missed.current = 0
    wasSilent.current = silent
  }, [silent, pushAlert])

  // reminders that only fire once: due-soon deadlines, the class that is about to start, class mode switching on
  const notified = useRef(new Set<string>())
  const lastClass = useRef<number | undefined>(undefined)
  useEffect(() => {
    const fire = (key: string, a: Omit<IslandAlert, 'id'>, cue: SoundName = 'attention') => {
      if (notified.current.has(key)) return
      notified.current.add(key)
      pushAlert(a, cue)
    }
    if (settings.deadlineAlert) {
      for (const x of openDeadlines) {
        const left = x.due - now
        if (left <= 0 || left > URGENT_HOURS * 3600_000) continue
        const hour = left <= 3600_000
        if (hour) notified.current.add(`dl-${x.id}-3h`)
        fire(`dl-${x.id}-${hour ? '1h' : '3h'}`, { icon: '⚠️', text: x.title, sub: `Due ${dueLabel(x.due, now)}`, openTab: 'deadlist' })
      }
    }
    const today = new Date(now).toDateString()
    if (settings.classPill && cls.next && cls.startsIn !== undefined && cls.startsIn <= 10) {
      fire(`${today}-${cls.next.id}-soon`, { icon: '🎓', text: nextClassLabel(cls.next, cls.startsIn) })
    }
    if (settings.classMode && cls.current) {
      fire(`${today}-${cls.current.id}-on`, { icon: '🎓', text: 'Class mode on', sub: `${cls.current.title}${cls.current.room ? ` · ${cls.current.room}` : ''} · alerts held` })
    }
    if (lastClass.current !== undefined && !cls.current && settings.classMode) pushAlert({ icon: '🎓', text: 'Class over' }, 'ready')
    lastClass.current = cls.current?.id
  }, [now, cls, openDeadlines, settings.deadlineAlert, settings.classPill, settings.classMode, pushAlert])

  // eye-rest and stretch reminders while studying without a real break
  const strain = useRef({ last: Date.now(), studied: 0, away: 0, eyes: 20, stretch: 45 })
  useEffect(() => {
    const s = strain.current
    const dt = Math.min(now - s.last, 60_000)
    s.last = now
    if (!study) {
      s.away += dt
      // four minutes off counts as a break
      if (s.away >= 4 * 60_000) Object.assign(s, { studied: 0, eyes: 20, stretch: 45 })
      return
    }
    s.away = 0
    s.studied += dt
    if (!settings.wellbeing) return
    const min = s.studied / 60_000
    if (min >= s.stretch) {
      s.stretch += 45
      s.eyes = Math.ceil((min + 1) / 20) * 20
      pushAlert({ icon: '🧘', text: 'Stretch break', sub: `${Math.floor(min)} min in · stand up, roll your shoulders` }, 'attention')
    } else if (min >= s.eyes) {
      s.eyes += 20
      pushAlert({ icon: '👀', text: 'Rest your eyes', sub: 'Look at something 6 m away for 20 seconds' }, 'attention')
    }
  }, [now, study, settings.wellbeing, pushAlert])

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
          alertOrHold({ icon: '🪫', text: 'Low battery', sub: `${b.percent}%`, value: b.percent }, 'warning')
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
        } else if (p.mic && p.mic !== lastPrivacy.mic && !assistantAwake.current) {
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

  // the to-do whose details are open: files dropped on the island are attached to it
  const todoOpen = useRef<number | null>(null)
  const onTodoOpen = useCallback((id: number | null) => {
    todoOpen.current = id
  }, [])
  const attachToTodo = useCallback((id: number, items: FileItem[]) => {
    const add = items.map((f) => ({ id: f.id, name: f.name, path: f.path, size: f.size, isDir: f.isDir }))
    setTodos((list) => list.map((t) => (t.id === id ? { ...t, attachments: [...(t.attachments ?? []), ...add] } : t)))
  }, [])
  /** Where dropped files go: the open to-do, else the apps page or the shelf. */
  const takeFiles = useCallback(
    (items: FileItem[]) => {
      if (tabRef.current === 'todo' && todoOpen.current !== null) attachToTodo(todoOpen.current, items)
      else if (tabRef.current === 'apps') addApps(items)
      else addShelf(items)
    },
    [attachToTodo, addApps, addShelf],
  )

  // Files dragged onto the island: open it on the shelf (or the apps page, or the open to-do) and collect them.
  useEffect(() => {
    if (!IS_TAURI) return
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      const ev = e.payload
      if (ev.type === 'enter') {
        setDragging(true)
        setExpanded(true)
        setTab((t) => (t === 'apps' ? 'apps' : t === 'todo' && todoOpen.current !== null ? 'todo' : 'shelf'))
      } else if (ev.type === 'leave') {
        setDragging(false)
      } else if (ev.type === 'drop') {
        setDragging(false)
        play('tap', { emphasis: 'strong' })
        takeFiles(await describePaths(ev.paths).catch(() => [] as FileItem[]))
      }
    })
    return () => {
      un.then((f) => f())
    }
  }, [takeFiles])

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
    takeFiles(items)
  }

  // Clicking outside can't be detected when click-through, so collapse when the cursor leaves.
  useEffect(() => {
    if (!IS_TAURI || !expanded || hovered || holdOpen || fs || notes || astraIntro || lumiIntro || welcome || catchUp.digest) return
    const id = setTimeout(() => setExpanded(false), 700)
    return () => clearTimeout(id)
  }, [expanded, hovered, holdOpen, fs, notes, astraIntro, lumiIntro, welcome, catchUp.digest])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape steps back one level at a time: out of fullscreen, then out of an open chat (back to the list, the
      // island still open), and only then closes the island
      if (e.key === 'Escape') {
        const inChat = (tabRef.current === 'friends' || tabRef.current === 'groups') && Boolean(openChatRef.current.friend || openChatRef.current.group)
        if (fsRef.current) exitFullscreen()
        else if (inChat && expandedRef.current) setOpenChat({ friend: null, group: null })
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
        // (the Universitas Indonesia build has no Astra; Lumi says hello first, then the notes follow)
        if (CAMPUS && !lumiSeen()) {
          afterIntro.current = r
          setLumiIntro(true)
          setExpanded(true)
        } else if (!CAMPUS && !astraIntroSeen()) {
          // Astra comes first; the notes follow once she has been answered
          afterIntro.current = r
          setAstraIntro(true)
          setExpanded(true)
        } else if (r) {
          setNotes(r)
          setExpanded(true)
        }
      })
      .catch(() => {})
  }, [])

  // the browser demo has no update to announce, so Lumi simply says hello once the page has settled
  useEffect(() => {
    if (!CAMPUS || IS_TAURI || lumiSeen()) return
    const id = setTimeout(() => {
      setLumiIntro(true)
      setExpanded(true)
    }, 1400)
    return () => clearTimeout(id)
  }, [])

  // chats only live on the Friends and Groups pages
  useEffect(() => {
    if (tab !== 'friends' && tab !== 'groups') setOpenChat({ friend: null, group: null })
  }, [tab])

  // fullscreen only belongs to an open chat, the prompter or the schedule
  useEffect(() => {
    if (fs && !(expanded && (tab === 'friends' || tab === 'groups' || tab === 'prompter' || tab === 'schedule' || tab === 'settings'))) exitFullscreen()
  }, [fs, expanded, tab, exitFullscreen])

  // what friends can see: the song or timer that is running
  const activityText = study
    ? studyActivity(study, Boolean(study.gid))
    : inClass
      ? '🎓 In class'
      : playing && track
        ? `🎵 ${track.title} – ${track.artist}`
        : timer
          ? (pomo ? '🍅 Focusing' : '⏳ Timer running')
          : ''
  const social = DEMO_SOCIAL ? demo.social : realSocial
  const friendProfiles = useMemo(() => social.friends.map((f) => f.profile), [social.friends])
  const studyBoard = useStudyBoard(auth.profile ?? null, friendProfiles, studyLog, settings.shareStudy && !DEMO_SOCIAL, expanded && tab === 'study')
  const { saveProfile } = auth
  useAutoIdle(auth.profile?.presence ?? (auth.profile ? 'online' : undefined), (v) => void saveProfile({ presence: v }), Boolean(auth.profile))
  useHeartbeat(DEMO_SOCIAL ? undefined : auth.user?.id)
  const unreadCount =
    Object.values(social.unread).reduce((a, b) => a + b, 0) +
    (DEMO_SOCIAL ? 0 : Object.values(groupChats.unread).reduce((a, b) => a + b, 0) + groupChats.invites.length)
  // who wrote while the user was away, for the catch-up: friends, then groups
  // what is new on each page, for the rail: the page says how many, and its group adds them up
  const friendMsgs = Object.values(social.unread).reduce((a, b) => a + b, 0)
  const groupMsgs = DEMO_SOCIAL ? 0 : Object.values(groupChats.unread).reduce((a, b) => a + b, 0)
  const groupInvites = DEMO_SOCIAL ? 0 : groupChats.invites.length
  const pageCounts = useMemo<PageCounts>(() => {
    const c: PageCounts = {}
    const say = (n: number, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : [])
    const friends = friendMsgs + social.incoming.length
    if (friends) c.friends = { n: friends, label: [...say(friendMsgs, 'unread message', 'unread messages'), ...say(social.incoming.length, 'friend request', 'friend requests')].join(', ') }
    if (groupMsgs + groupInvites) c.groups = { n: groupMsgs + groupInvites, label: [...say(groupMsgs, 'unread message', 'unread messages'), ...say(groupInvites, 'group invite', 'group invites')].join(', ') }
    if (sceleUnreadCount) c.inbox = { n: sceleUnreadCount, label: say(sceleUnreadCount, 'new SCELE notification', 'new SCELE notifications')[0] }
    return c
  }, [friendMsgs, groupMsgs, groupInvites, social.incoming.length, sceleUnreadCount])
  const unreadFrom = useMemo<UnreadFrom[]>(
    () => [
      ...social.friends
        .filter((f) => social.unread[f.profile.id])
        .map((f) => ({ key: f.profile.id, who: f.profile.display_name || f.profile.username, count: social.unread[f.profile.id], chatWith: f.profile.id })),
      ...(DEMO_SOCIAL ? [] : groupChats.groups.filter((g) => groupChats.unread[g.id]).map((g) => ({ key: `g${g.id}`, who: g.name, count: groupChats.unread[g.id], group: true }))),
    ],
    [social.friends, social.unread, groupChats.groups, groupChats.unread],
  )
  // what to call the user: their SSO UI name (Universitas Indonesia), else their profile's
  const firstName = ((CAMPUS && settings.callMe.trim()) || (CAMPUS && student.student?.name) || auth.profile?.display_name || '').trim().split(/\s+/)[0] ?? ''
  // a catch-up opens the island; a welcome back with nothing new and nothing needing the user isn't shown
  // ("All quiet while you were away" is for when something still needs them, like a deadline today)
  const digest = catchUp.digest
  const { dismiss: dismissCatchUp } = catchUp
  useEffect(() => {
    if (!digest) return
    const t = Date.now()
    const quiet = !digest.held.length && !unreadFrom.length
    const needed = needsYou(t, CAMPUS && campus && scele.upcoming ? scele.upcoming(t, 2) : [], CAMPUS && campus ? scele.deadlines : [], deadlines, todos).length > 0
    if (digest.kind === 'back' && quiet && !needed) {
      dismissCatchUp()
      return
    }
    setExpanded(true)
    play('ready')
    // only when a new catch-up arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest])
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
  const eqLook = useMemo(() => ({ style: settings.eqStyle, color: settings.eqColor }), [settings.eqStyle, settings.eqColor])
  const accent = settings.accentFromMusic && playing && track ? `hsl(${track.hue} 78% 62%)` : settings.accent
  const mascotColor = settings.mascotColor === 'accent' ? accent : settings.mascotColor
  const glowPhase = assistant.state.phase
  const glowFor = glowPhase === 'listening' ? 'listening' : glowPhase === 'thinking' ? 'thinking' : glowPhase === 'speaking' || glowPhase === 'done' || glowPhase === 'confirm' ? 'speaking' : glowPhase === 'error' ? 'error' : null
  const onAcc = settings.accentFromMusic && playing && track ? '#000' : onAccent(settings.accent)

  const lyricIdx = track?.lyrics ? currentLineIndex(track.lyrics, position + settings.lyricOffset) : -1
  const lyricText = lyricIdx >= 0 ? track!.lyrics![lyricIdx].text : ''
  const showLyricPeek = playing && !!lyricText
  // idle pill shows the lyric line instead of the clock when asked to and one is available
  const idleLyric = settings.idle === 'lyrics' && showLyricPeek

  // other things the pill can show; falls back to the clock when there is nothing to show yet.
  // Re-read when the card closes, which is when the city may have changed.
  const idleWeather = useMemo(() => {
    if (settings.idle === 'weather' && settings.city) {
      const w = cachedWeather(settings.city, settings.fahrenheit, { lat: settings.cityLat, lon: settings.cityLon })
      if (w) return { code: w.code, text: `${w.temp}°${settings.fahrenheit ? 'F' : 'C'} · ${w.city}` }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.idle, settings.city, settings.fahrenheit, expanded])
  // the nearest open deadline; hovering the pill lists them all
  const nearest = settings.idle === 'deadline' ? openDeadlines[0] : undefined
  const idleDeadline = nearest ? `${nearest.title} · ${dueLabel(nearest.due, now)}` : ''

  // what the pill says about studying, most pressing first: the running session, the class on now, a class about to start,
  // a deadline a few hours away, a class later today. `key` stays the same while the text ticks, so the line does not re-animate.
  const studyStatus = useMemo((): { text: string; key: string; kind: 'study' | 'class' | 'urgent' } | null => {
    if (study && timer) {
      const left = Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
      const clockLeft = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
      const what = study.label === DEFAULT_LABEL ? (study.gid ? 'Studying together' : 'Focus') : study.label
      return { text: `${study.gid ? '📚' : '🍅'} ${what} · ${clockLeft}`, key: `study-${study.startedAt}`, kind: 'study' }
    }
    if (pomo && timer && pomo.phase !== 'focus') {
      const left = Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
      return { text: `☕ Break · ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, key: `break-${pomo.done}`, kind: 'study' }
    }
    if (settings.classPill && cls.current && cls.endsIn !== undefined) {
      return { text: `🎓 ${cls.current.title}${cls.current.room ? ` · ${cls.current.room}` : ''} · ${cls.endsIn}m left`, key: `class-${cls.current.id}`, kind: 'class' }
    }
    if (settings.classPill && cls.next && cls.startsIn !== undefined && cls.startsIn <= 20) {
      return { text: `🎓 ${nextClassLabel(cls.next, cls.startsIn)}`, key: `next-${cls.next.id}`, kind: 'class' }
    }
    if (settings.deadlineAlert) {
      const hot = openDeadlines.find((x) => x.due - now < URGENT_HOURS * 3600_000 && x.due - now > -30 * 60_000)
      if (hot) return { text: `⚠ ${hot.title} · ${dueLabel(hot.due, now)}`, key: `dl-${hot.id}`, kind: 'urgent' }
    }
    if (settings.classPill && cls.next && cls.startsIn !== undefined && cls.startsIn <= 90) {
      return { text: `🎓 ${nextClassLabel(cls.next, cls.startsIn)}`, key: `next-${cls.next.id}`, kind: 'class' }
    }
    return null
  }, [study, timer, pomo, now, cls, openDeadlines, settings.classPill, settings.deadlineAlert])

  const idleExtra = studyStatus?.text ?? idleWeather?.text ?? idleDeadline
  const weatherGlyph = idleWeather && !idleLyric && !studyStatus ? <WeatherIcon code={idleWeather.code} night={isNight(new Date(now).getHours())} size={15} /> : null
  const idleText = studyStatus ? studyStatus.text : idleLyric ? lyricText : idleExtra
  const d = new Date(now)
  const clock = clockText(d, settings.clock24)
  // while music plays the pill carries the album art and the waveform around its text:
  // the lyric line when the pill shows lyrics, otherwise the weather or the clock
  const live = playing && track ? idleText || clock : ''
  const peekText = playing && track ? lyricText || `${track.title} · ${track.artist}` : ''

  // hovering the island while a call rings shows who is calling, with answer and decline
  const caller = ringing && !groupRing ? social.friends.find((f) => f.profile.id === activeCall.state.peer) : undefined
  const groupCaller = ringing && groupRing ? (DEMO_SOCIAL ? demo.groups : groupChats).groups.find((g) => g.id === groupRing) : undefined
  // while you are in a call the collapsed island becomes the call: a friend, or a group's voice chat
  const activeVoice = DEMO_SOCIAL ? demo.voice : voice
  const callPhase = activeCall.state.phase
  const friendInCall = callPhase === 'calling' || callPhase === 'connecting' || callPhase === 'active' ? social.friends.find((f) => f.profile.id === activeCall.state.peer) : undefined
  const voiceGroup =
    activeVoice.state.groupId && (activeVoice.state.joining || activeVoice.state.members.length > 0)
      ? (DEMO_SOCIAL ? demo.groups : groupChats).groups.find((g) => g.id === activeVoice.state.groupId)
      : undefined
  const inCall = Boolean(friendInCall || voiceGroup)
  // the speech model downloads in the background: the collapsed island shows how far along it is
  const stt = useSttStatus()
  const updatePill = Boolean(updateVersion) && updateVersion !== seenUpdate && !updating && !expanded && !astraIntro && assistant.state.phase === 'idle'
  useEffect(() => {
    if (!updatePill || !hovered) return
    markUpdateSeen(updateVersion)
    setSeenUpdate(updateVersion)
  }, [updatePill, hovered, updateVersion])
  const modelPill = !updating && !expanded && !astraIntro && assistant.state.phase === 'idle' && stt.state === 'loading' && stt.progress > 0 && stt.progress < 1
  const sawDownload = useRef(false)
  useEffect(() => {
    if (stt.state === 'loading' && stt.progress > 0) sawDownload.current = true
    else if (stt.state === 'ready' && sawDownload.current) {
      sawDownload.current = false
      pushAlert({ icon: '✅', text: `${settings.mascotName || 'Astra'} is ready`, sub: 'Speech recognition downloaded' }, 'ready')
    } else if (stt.state === 'error') sawDownload.current = false
  }, [stt.state, stt.progress, pushAlert, settings.mascotName])
  // Lumi's own doings: sleeping and waking, good morning, exam wishes, cheering for ticked to-dos, water
  const exams = useMemo<ExamRef[]>(
    () =>
      CAMPUS && campus && scele.upcoming
        ? scele
            .upcoming(now, 3)
            .filter((m) => m.kind === 'exam' && m.slot.start)
            .map((m) => ({ key: `${m.title}|${m.start}`, title: m.title.replace(/\s*\(.*\)\s*$/, ''), start: m.start, end: m.end }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, campus, scele.syncedAt],
  )
  // the weather: told what matters (rain on its way, when it stops, a rainy day...) for where the user is
  useWeatherAlerts({
    enabled: settings.weatherAlerts,
    city: settings.city,
    lat: settings.cityLat,
    lon: settings.cityLon,
    fahrenheit: settings.fahrenheit,
    push: alertOrHold,
    nextClass: cls.next && cls.startsIn !== undefined ? { title: cls.next.title, start: now + cls.startsIn * 60_000 } : undefined,
  })
  useFollowLocation({ enabled: settings.weatherAuto, city: settings.city, lat: settings.cityLat, lon: settings.cityLon, update })
  const { rest: lumiRest } = useLumiRoutines({
    enabled: lumiOn,
    nudges: settings.lumiNudges,
    met: lumiMet && !lumiIntro,
    name: firstName,
    now,
    push: alertOrHold,
    todos,
    exams,
    busy: Boolean(study) || Boolean(cls.current),
    summary: () => {
      const t = Date.now()
      const day = new Date(t).toDateString()
      const classes = CAMPUS && campus && scele.upcoming ? scele.upcoming(t, 1).filter((m) => m.kind !== 'off' && new Date(m.start).toDateString() === day).length : 0
      const due =
        (CAMPUS && campus ? scele.deadlines.filter((d) => d.submission !== 'submitted' && d.due > t && d.due < t + 24 * 3600_000).length : 0) +
        deadlines.filter((d) => !d.done && d.due > t && d.due < t + 24 * 3600_000).length
      const parts = [classes ? `${classes} class${classes > 1 ? 'es' : ''} today` : '', due ? `${due} due in the next day` : ''].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'A clear day so far. Enjoy it.'
    },
  })
  const mode = updating
    ? 'alert'
    : assistant.state.phase !== 'idle'
      ? 'assistant'
      : expanded
      ? 'expanded'
      : (caller || groupCaller) && hovered
        ? 'call'
        : alert || modelPill || updatePill
          ? 'alert'
          : inCall
            ? 'incall'
            : hovered
              ? 'peek'
              : 'idle'
  // smart mode keeps the resting pill out of sight; hovering its spot, alerts and calls still bring it in
  const tucked = settings.smartMode && mode === 'idle' && !moving

  // the card fits the page it shows; a page taller than the card scrolls inside it
  const hasActions = (tab === 'shelf' && shelf.items.length > 0) || tab === 'clipboard'
  const expandedHeight = notes || astraIntro || lumiIntro || welcome
    ? CARD_MAX
    : catchUp.digest
      ? Math.min(CARD_MAX, Math.max(CATCHUP_MIN, catchUpH || CARD_MAX))
    : settings.cardFit
      ? Math.round(Math.min(CARD_MAX, Math.max(CARD_MIN, CARD_TOP + CARD_PAD + (hasActions ? ACTIONS_H : 0) + pageH)))
      : Math.min(CARD_MAX, settings.cardH)

  // grow the pill to fit the lyric line, up to what the stage can hold
  const idleW = (live ? liveWidth(live) : idleExtra ? Math.min(textWidth(idleExtra), Math.max(140, idleExtra.length * 9 + 60)) : 140) + (lumiOn && !idleText && settings.lumiClock ? (live ? 44 : 30) : 0)
  const peekW = peekText ? Math.max(340, liveWidth(peekText)) : 300

  // hovering the pill during a group call drops down who is in the voice chat
  const voicePeople = voiceGroup ? voiceGroup.members.filter((p) => activeVoice.state.members.includes(p.id)) : []
  const showVoicePeople = mode === 'incall' && hovered && voicePeople.length > 0
  const voiceRows = showVoicePeople ? Math.ceil(voicePeople.length / 2) : 0

  // hovering the pill in deadline mode drops down the whole list (the first few, then a "+N more" row)
  const dlShown = openDeadlines.slice(0, 6)
  const dlRows = mode === 'peek' && settings.idle === 'deadline' && openDeadlines.length ? dlShown.length + (openDeadlines.length > dlShown.length ? 1 : 0) : 0

  const shape: Shape = useMemo(() => {
    switch (mode) {
      case 'expanded':
        if (fs) return { w: fs.w / settings.scale, h: fs.h / settings.scale, r: 0 }
        return { w: settings.cardW, h: expandedHeight, r: 32 }
      case 'alert':
        // volume and brightness are a slim level meter; a message has room for the friend and a reply
        if (!updating && alert?.lumi) return lumiShape(alert.actions?.length ?? 0, alert.lumi, settings.lumiCalm)
        if (!updating && alert?.kind) return { w: 290, h: 40, r: 16 }
        if (!updating && alert?.avatar) return { w: 380, h: 56, r: 24 }
        if (!updating && alert?.nowPlaying) return { w: 360, h: 56, r: 24 }
        return { w: 340, h: 48, r: 22 }
      case 'assistant':
        return assistantShape(assistant.state.phase, assistant.state.heard, assistant.state.replyLen, assistant.state.actions.length > 0)
      case 'call':
        return { w: 340, h: 64, r: 28 }
      case 'incall':
        return voiceRows ? { w: 300, h: 42 + 14 + voiceRows * 30, r: 22 } : { w: 250, h: 42, r: 18 }
      case 'peek':
        if (dlRows) return { w: 340, h: 14 + dlRows * 30, r: 20 }
        return { w: peekW, h: 40, r: 16 }
      default:
        return { w: idleW, h: 34, r: 13 }
    }
  }, [mode, fs, settings.scale, expandedHeight, settings.cardW, idleW, peekW, updating, alert?.kind, alert?.lumi, alert?.actions?.length, alert?.avatar, alert?.nowPlaying, voiceRows, dlRows, assistant.state.phase, assistant.state.heard, assistant.state.replyLen, assistant.state.actions.length])

  const remaining = timer ? Math.max(0, (timer.endsAt - now) / 1000) : 0
  const bubble = timer
    ? {
        // while the pill itself counts down a study session the bubble would only repeat it
        split: (mode === 'idle' && studyStatus?.kind !== 'study') || mode === 'peek',
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

  // The island never hangs off the side of the screen. Parked near an edge, anything wider than where it sits (the
  // open card, mostly) comes in just far enough to fit, and goes back out when it closes: where it was put is kept.
  const [screenW, setScreenW] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setScreenW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const reach = Math.max(0, screenW / 2 - (hitW * settings.scale) / 2 - SCREEN_EDGE)
  const shownX = fs ? pos.x : Math.max(-reach, Math.min(reach, pos.x))
  const shown = useMemo(() => ({ x: shownX, y: pos.y }), [shownX, pos.y])
  const shownRef = useRef(shown)
  shownRef.current = shown
  // where it is on screen is where clicks land: the window's hit-testing follows the same offset
  useEffect(() => {
    if (IS_TAURI) invoke('set_offset', { x: shown.x, y: shown.y }).catch(() => {})
  }, [shown.x, shown.y])

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

  // the card opening and closing, and every page change inside it (rail, keys, swipes)
  // jumping between a friend's chat and a group's chat is a chat selection, not a page change
  const isSocial = (t: Tab) => t === 'friends' || t === 'groups'
  const chatSwitch = useRef(false)
  chatSwitch.current = Boolean(openChat.friend || openChat.group)
  const openChatRef = useRef(openChat)
  openChatRef.current = openChat
  const soundState = useRef({ expanded, tab })
  useEffect(() => {
    const was = soundState.current
    const groupOf = (t: Tab) => GROUPS.find((g) => g.pages.includes(t))?.id
    // opening is a press on the island, so it taps; closing lets the card fall shut.
    // Moving to another group on the rail selects it; moving within a group navigates.
    if (expanded !== was.expanded) play(expanded ? 'tap' : 'close', { emphasis: expanded ? 'normal' : 'subtle' })
    else if (expanded && tab !== was.tab && !(chatSwitch.current && isSocial(tab) && isSocial(was.tab))) {
      play(groupOf(tab) !== groupOf(was.tab) ? 'select' : 'navigate', { emphasis: 'subtle', direction: dirRef.current > 0 ? 'forward' : 'back' })
    }
    soundState.current = { expanded, tab }
  }, [expanded, tab])

  const startTimer = (minutes: number, goal?: string) => {
    endStudy()
    setPomo(null)
    setTimer({ endsAt: Date.now() + minutes * 60_000, total: minutes * 60_000, goal: goal?.trim() || undefined })
  }
  const stopTimer = () => {
    endStudy()
    setPomo(null)
    setTimer(null)
  }
  const startPomo = () => {
    endStudy()
    setPomo({ phase: 'focus', done: 0 })
    setTimer({ endsAt: Date.now() + POMO_MIN.focus * 60_000, total: POMO_MIN.focus * 60_000 })
    beginStudy(taskRef.current, { maxMin: POMO_MIN.focus, deadlineId: taskDeadline.current })
  }
  const skipPomo = () => pomo && advancePomo(pomo)
  const pickTask = (t: string) => {
    taskDeadline.current = undefined
    setTask(t)
  }
  // one tap on a deadline: a focus session named after it
  const startOnDeadline = (dl: Deadline) => {
    endStudy()
    taskDeadline.current = dl.id
    taskRef.current = dl.title
    setTask(dl.title)
    setClockMode('pomodoro')
    startPomo()
    pushAlert({ icon: '🎯', text: 'Focus time', sub: dl.title.slice(0, 40) }, 'attention')
  }

  // studying by yourself: a plain countdown for a subject, logged when it ends or is stopped
  const startSolo = (label: string, minutes: number) => {
    endStudy()
    const startedAt = Date.now()
    setPomo(null)
    setTimer({ endsAt: startedAt + minutes * 60_000, total: minutes * 60_000 })
    setNow(startedAt)
    beginStudy(label, { maxMin: minutes })
  }

  // sitting down in a group's study room puts you on the same clock as everyone in it
  const startRoom = (gid: string, minutes: number) => {
    endStudy()
    const total = minutes * 60_000
    const startedAt = Date.now()
    const label = taskRef.current.trim() || DEFAULT_LABEL
    setPomo(null)
    setTimer({ endsAt: startedAt + total, total })
    setNow(startedAt)
    beginStudy(label, { gid, maxMin: minutes })
    studyRoom.join(gid, { endsAt: startedAt + total, total, task: label === DEFAULT_LABEL ? '' : label })
    const me = demo.auth.profile?.id
    if (DEMO_SOCIAL && me) setDemoRooms((r) => ({ ...r, [gid]: { gid, endsAt: startedAt + total, total, task: label === DEFAULT_LABEL ? '' : label, host: me, members: [me] } }))
  }
  const joinRoom = (gid: string) => {
    const room = rooms[gid]
    if (!room || room.endsAt <= Date.now()) return
    endStudy()
    setPomo(null)
    setTimer({ endsAt: room.endsAt, total: room.total })
    setNow(Date.now())
    beginStudy(room.task || DEFAULT_LABEL, { gid, maxMin: (room.endsAt - Date.now()) / 60_000 })
    studyRoom.join(gid)
    const me = demo.auth.profile?.id
    if (DEMO_SOCIAL && me) setDemoRooms((r) => (r[gid] && !r[gid].members.includes(me) ? { ...r, [gid]: { ...r[gid], members: [...r[gid].members, me] } } : r))
  }
  // demo: leaving a pretend room takes you out of it, and it closes when nobody is left
  useEffect(() => {
    const me = demo.auth.profile?.id
    if (!DEMO_SOCIAL || !me || study?.gid) return
    setDemoRooms((cur) => {
      if (!Object.values(cur).some((r) => r.members.includes(me))) return cur
      const next: Record<string, StudyRoom> = {}
      for (const r of Object.values(cur)) {
        const members = r.members.filter((m) => m !== me)
        if (members.length) next[r.gid] = { ...r, members }
      }
      return next
    })
  }, [study?.gid, demo.auth.profile?.id])
  // demo: a friend starts a room in the first group, and a second one sits down a few seconds later
  const demoStudyTogether = () => {
    const group = demo.groups.groups[0]
    const me = demo.auth.profile?.id
    const others = group?.members.filter((p) => p.id !== me) ?? []
    const host = others[0]
    if (!group || !host) return
    const total = 25 * 60_000
    const room: StudyRoom = { gid: group.id, endsAt: Date.now() + total, total, task: 'Calculus', host: host.id, members: [host.id] }
    setExpanded(false)
    setDemoRooms({ [group.id]: room })
    pushAlert({ icon: '📚', text: group.name, sub: `${host.display_name || host.username || 'Someone'} is studying · ${room.task}`.slice(0, 42), openTab: 'study' }, 'attention')
    if (others[1]) setTimeout(() => setDemoRooms((r) => (r[group.id] ? { ...r, [group.id]: { ...r[group.id], members: [...r[group.id].members, others[1].id] } } : r)), 3500)
  }

  const onSkip = (dir: -1 | 1) => {
    skip(dir)
    // the demo's skip restarts its one song, so it raises the song-change alert itself
    if (!IS_TAURI && track) pushAlert({ icon: '🎵', text: track.title, sub: track.artist, nowPlaying: true })
  }

  // browser demo: the lock keys it pretends to toggle, and a fake update download
  const demoLocks = useRef({ caps: false, num: false })
  const demoUpdate = useRef(0)
  const runDemoUpdate = () => {
    clearInterval(demoUpdate.current)
    setExpanded(false)
    play('loading')
    let percent = 0
    setUpdating({ stage: 'downloading', percent })
    demoUpdate.current = window.setInterval(() => {
      percent = Math.min(100, percent + 7)
      if (percent < 100) return setUpdating({ stage: 'downloading', percent })
      clearInterval(demoUpdate.current)
      setUpdating({ stage: 'installing', percent: 100 })
      setTimeout(() => setUpdating(null), 1800)
    }, 160)
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
    // (the window learns the offset from `shown`, which keeps the island on screen)
    if (next.x !== posRef.current.x || next.y !== posRef.current.y) setPos(next)
    if (moving || m.held) {
      m.raf = requestAnimationFrame(stepSpring)
    } else {
      m.raf = 0
      update({ posX: next.x, posY: next.y, posBottom: m.magBottom })
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

  // where the island's top goes when it rests on the taskbar, at its current height and size
  const dockTop = () => taskbarTop - shape.h * settings.scale
  // saved lower than resting on the taskbar (behind it, from before the taskbar dock): put it on the taskbar
  useEffect(() => {
    if (!taskbarTop || docked || dragRef.current?.active) return
    if (posRef.current.y <= taskbarTop - shape.h * settings.scale) return
    motionRef.current.magBottom = true
    setDocked(true)
    update({ posBottom: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskbarTop])
  const dockAt = useMemo(() => (docked && taskbarTop > 0 ? { line: taskbarTop, scale: settings.scale } : null), [docked, taskbarTop, settings.scale])

  const dragHandlers = IS_TAURI
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return
          const el = e.target as HTMLElement
          if (el.closest('button, input, textarea, a, .scrub, [draggable="true"]')) return
          // inside the open card only the header strip is a handle
          if (mode === 'expanded' && !el.closest('.xtop')) return
          // docked, the island's top is wherever its height puts it above the taskbar
          const oy = motionRef.current.magBottom ? Math.round(dockTop()) : posRef.current.y
          // a card drawn further in than where it was put (near an edge) is moved from where it is seen
          const ox = shownRef.current.x
          if (oy !== posRef.current.y || ox !== posRef.current.x) setPos({ x: ox, y: oy })
          posRef.current = { x: ox, y: oy }
          dragRef.current = { sx: e.screenX, sy: e.screenY, ox: posRef.current.x, oy, active: false }
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
          // never lower than resting on the taskbar, so it can't slip behind it
          const dockY = Math.max(0, Math.round(dockTop()))
          const rawY = Math.max(0, Math.min(dockY, g.oy + dy))
          const m = motionRef.current
          // magnets grab at 24px and let go at 44px, so they feel sticky: the centre line, the top
          // edge, and the taskbar at the bottom
          m.magX = Math.abs(rawX) < (m.magX ? 44 : 24)
          m.magY = rawY < (m.magY ? 30 : 14)
          m.magBottom = taskbarTop > 0 && !m.magY && rawY > dockY - (m.magBottom ? 30 : 14)
          setDocked(m.magBottom)
          glideTo(m.magX ? 0 : Math.round(rawX), m.magY ? 0 : m.magBottom ? dockY : Math.round(rawY), true)
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
          if (mode === 'expanded' || (!posRef.current.x && !posRef.current.y && !motionRef.current.magBottom)) return
          play('navigate', { emphasis: 'subtle', direction: 'back' })
          setExpanded(false)
          const m = motionRef.current
          m.magX = m.magY = true
          m.magBottom = false
          setDocked(false)
          glideTo(0, 0, false)
        },
      }
    : undefined

  let content: React.ReactNode
  let contentKey: string
  const dueBadge = dueToday > 0 ? <span className="sc-badge" title={`${dueToday} due today on SCELE`}>{dueToday}</span> : null

  if (mode === 'assistant') {
    contentKey = `assistant-${assistantShape(assistant.state.phase, assistant.state.heard, assistant.state.replyLen, assistant.state.actions.length > 0).w}-${assistant.state.phase === 'error' ? 'err' : 'ok'}`
    content = (
      <AssistantCard
        state={assistant.state}
        level={assistant.level}
        bands={assistant.bands}
        name={settings.mascotName || 'Astra'}
        color={mascotColor}
        accessories={settings.mascotAccessories}
        accessoryColors={settings.mascotAccessoryColors}
        talk={settings.assistantTalk}
        onConfirm={assistant.answerConfirm}
      />
    )
  } else if (mode === 'expanded') {
    contentKey = 'expanded'
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
      <div className={`expanded ${fs ? 'fs' : ''} ${settings.cardFit ? '' : 'fixed'} chat-${settings.chatAnim}`}>
        <div className="xtop">
          <span className="xtop-date">{d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <span className="xtop-status">
            {playing && track && <Bars active hue={track.hue} />}
            {timer && <Ring fraction={remaining / (timer.total / 1000)} size={16} stroke={2.5} />}
            <b className="xtop-time">{clock}</b>
          </span>
        </div>
        <div className="xbody">
          {action && <div className="xactions">{action}</div>}
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
                      if (!(e.target as HTMLElement).closest('input, textarea, button, a, .scrub, .wx-chart, [draggable="true"], .todo-item')) pageDrag.start(e)
                    },
                    onDragEnd: (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
                      if (info.offset.x < -70 || info.velocity.x < -450) go(1)
                      else if (info.offset.x > 70 || info.velocity.x > 450) go(-1)
                    },
                  }
                : {})}
            >
            <div className="page-fit" ref={fitRef}>
            {tab === 'astra' && (
              <AstraChatWidget
                chat={assistant.chat}
                name={settings.mascotName || 'Astra'}
                color={mascotColor}
                accessories={settings.mascotAccessories}
                accessoryColors={settings.mascotAccessoryColors}
                voiceOn={settings.assistantSpeak}
              />
            )}
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
                task={task}
                setTask={pickTask}
                taskSuggestions={[...new Set([...slots.map((s) => s.title), ...openDeadlines.map((x) => x.title)])]}
                onPomoStart={startPomo}
                onPomoStop={stopTimer}
                onPomoSkip={skipPomo}
              />
            )}
            {CAMPUS && tab === 'today' && (
              <TodayWidget
                now={now}
                scele={campus ? scele : null}
                deadlines={deadlines}
                todos={todos}
                setTodos={setTodos}
                slots={slots}
                timer={pomo ? null : timer}
                pages={pages.map((p) => p.id)}
                go={setTab}
                setup={student.student !== undefined && !setupDone ? <CampusSetup student={student} scele={scele} verify={verifyFromSetup} onDone={finishSetup} /> : undefined}
              />
            )}
            {tab === 'todo' && <TodoWidget todos={todos} setTodos={setTodos} onOpen={onTodoOpen} />}
            {tab === 'notes' && <NotesWidget />}
            {tab === 'prompter' && <PrompterWidget fullscreen={Boolean(fs)} onFullscreen={toggleFullscreen} />}
            {tab === 'deadlist' && <DeadlinesWidget deadlines={deadlines} setDeadlines={setDeadlines} now={now} onStart={startOnDeadline} studyingId={study?.deadlineId} />}
            {tab === 'schedule' && <ScheduleWidget slots={slots} setSlots={setSlots} fullscreen={Boolean(fs)} onFullscreen={toggleFullscreen} />}
            {tab === 'study' && (
              <StudyWidget
                log={studyLog}
                history={studyHistory}
                onClearHistory={clearStudyHistory}
                onStartSolo={startSolo}
                now={now}
                session={study}
                signedIn={Boolean(meId) || DEMO_SOCIAL}
                friends={social.friends}
                board={studyBoard}
                groups={(DEMO_SOCIAL ? demo.groups : groupChats).groups}
                rooms={rooms}
                share={settings.shareStudy}
                setShare={(shareStudy) => update({ shareStudy })}
                onStartRoom={startRoom}
                onJoinRoom={joinRoom}
                onLeave={stopTimer}
              />
            )}
            {CAMPUS && (tab === 'deadlines' || tab === 'classes' || tab === 'inbox') && student.student?.fasilkom && (
              <SceleWidget page={tab} scele={scele} now={now} username={student.student.username} own={{ deadlines, setDeadlines }} />
            )}
            {tab === 'weather' && <WeatherWidget settings={settings} update={update} />}
            {CAMPUS && tab === 'lumi' && <LumiWidget settings={settings} update={update} />}
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
                call={DEMO_SOCIAL ? demo.call : call}
                voice={DEMO_SOCIAL ? demo.voice : voice}
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
            {tab === 'profile' && (
              <ProfileWidget
                auth={auth}
                settings={settings}
                update={update}
                onHold={setHoldOpen}
                student={student}
                spotlight={spotlight}
                kept={CAMPUS ? { scele: scele.account ? scele.account.username : null, slcm: scele.slcm ? { at: scele.slcm.at, classes: scele.slcm.classes.length } : null } : undefined}
                onDisconnect={CAMPUS ? disconnectCampus : undefined}
              />
            )}
            {tab === 'settings' && <SettingsWidget settings={settings} update={update} updater={updater} fullscreen={Boolean(fs)} onFullscreen={toggleFullscreen} unavailable={campus ? [] : CAMPUS_PAGES} />}
            </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="xrail">
            <Rail
              astraColor={mascotColor}
              groups={groups}
              tab={tab}
              onPage={setTab}
              onGroup={(id) => {
                const g = groups.find((x) => x.id === id)!
                setTab(g.pages.includes(lastInGroup.current[id]) ? lastInGroup.current[id] : g.pages[0])
              }}
              dots={[...(updater.state.s === 'available' ? ['settings'] : [])]}
              counts={pageCounts}
            />
        </div>
        {astraIntro && (
          <AstraWelcome
            name={settings.mascotName || 'Astra'}
            color={mascotColor}
            accessories={settings.mascotAccessories}
            accessoryColors={settings.mascotAccessoryColors}
            shortcut={settings.assistantKey}
            talk={settings.assistantTalk}
            listenModel={settings.assistantListenModel}
            simulate={!IS_TAURI}
            onChoose={(use) => {
              markAstraIntro(use)
              update({ assistant: use })
              setAstraIntro(false)
              if (afterIntro.current) setNotes(afterIntro.current)
              afterIntro.current = null
            }}
          />
        )}
        {lumiIntro && (
          <LumiIntro
            suggest={niceName(student.student?.name ?? '')}
            onDone={(name, nudges) => {
              try {
                localStorage.setItem(LUMI_INTRO_KEY, '1')
              } catch {
                /* ignore */
              }
              setLumiMet(true)
              setLumiIntro(false)
              update({ callMe: name, lumiNudges: nudges })
              if (afterIntro.current) setNotes(afterIntro.current)
              else {
                setExpanded(false)
                const s = say('hello', name)
                setTimeout(() => pushAlert({ icon: '👋', text: name ? `Nice to meet you, ${name}!` : s.title, sub: "I'll be right here. Tap me whenever you like.", lumi: 'delight', ms: 6500 }, 'ready'), 700)
              }
              afterIntro.current = null
            }}
          />
        )}
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
        {catchUp.digest && !welcome && (
          <CatchUpCard
            digest={catchUp.digest}
            name={firstName}
            now={now}
            unread={unreadFrom}
            meetings={CAMPUS && campus && scele.upcoming ? scele.upcoming(now, 2) : []}
            sceleDue={CAMPUS && campus ? scele.deadlines : []}
            ownDue={deadlines}
            todos={todos}
            onGo={(t) => {
              catchUp.dismiss()
              setTab(t)
            }}
            onChat={(id) => {
              catchUp.dismiss()
              setPendingChat(id)
            }}
            onClose={catchUp.dismiss}
            onHeight={setCatchUpH}
            mascot={lumiOn ? <LumiFace mood={catchUp.digest.kind === 'hello' ? 'goodMorning' : 'welcomeBack'} height={58} body still roam={6} /> : undefined}
            onToday={
              CAMPUS
                ? () => {
                    catchUp.dismiss()
                    setTab('today')
                  }
                : undefined
            }
          />
        )}
        {CAMPUS && welcome && (
          <Welcome
            name={student.student?.name || student.student?.username || ''}
            sceleConnected={Boolean(scele.account)}
            onGo={(t) => {
              setWelcome(false)
              setTab(t)
            }}
            onClose={() => setWelcome(false)}
          />
        )}
        {dragging && (
          <div className="drop-overlay">
            {tab === 'apps' ? 'Release to pin' : tab === 'todo' && todoOpen.current !== null ? 'Release to attach to this task' : 'Release to add to Shelf'}
          </div>
        )}
      </div>
    )
  } else if (mode === 'alert' && updating) {
    contentKey = 'updating'
    const installing = updating.stage === 'installing'
    content = (
      <div className="alert2" style={{ ['--c' as string]: 'var(--info)' }}>
        <span className="al-ic">
          <AlertIcon icon="⬇️" />
        </span>
        <span className="al-tx">
          <b>{installing ? 'Installing' : 'Updating'}</b>
          <small>{installing ? 'Restarting…' : 'Downloading the new version'}</small>
        </span>
        {!installing && <span className="al-val">{updating.percent}%</span>}
        <span className="edge" style={{ ['--v' as string]: `${installing ? 100 : updating.percent}%` }} />
      </div>
    )
  } else if (mode === 'alert' && updatePill && !modelPill && !alert) {
    contentKey = 'update-pill'
    content = (
      <div className="alert2">
        <span className="al-ic">
          <AlertIcon icon="⬆️" />
        </span>
        <span className="al-tx">
          <b>Update available</b>
          <small>{`v${updateVersion} · open Settings to install`}</small>
        </span>
      </div>
    )
  } else if (mode === 'alert' && modelPill && !alert) {
    contentKey = 'model-download'
    const pct = Math.round(stt.progress * 100)
    content = (
      <div className="alert2" style={{ ['--c' as string]: 'var(--info)' }}>
        <span className="al-ic">
          <AlertIcon icon="⬇️" />
        </span>
        <span className="al-tx">
          <b>Getting {settings.mascotName || 'Astra'} ready</b>
          <small>Downloading speech recognition</small>
        </span>
        <span className="al-val">{pct}%</span>
        <span className="edge" style={{ ['--v' as string]: `${pct}%` }} />
      </div>
    )
  } else if (mode === 'alert' && alert?.kind) {
    // held volume/brightness keys keep one mounted alert so the meter moves instead of fading out and in
    contentKey = `alert-${alert.kind}`
    const lit = Math.round(((alert.value ?? 0) / 100) * 16)
    content = (
      <div className="alert2 hud">
        <span className="hud-ic">
          <AlertIcon icon={alert.icon} size={16} />
        </span>
        <span className="hud-ticks" aria-label={`${alert.text} ${alert.value ?? 0}%`}>
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} className={i < lit ? 'on' : ''} />
          ))}
        </span>
        <span className="hud-val">{alert.value ?? 0}</span>
      </div>
    )
  } else if (mode === 'alert' && alert?.lumi) {
    // Lumi says it: her face doing the mood, the words typed out, and buttons when she asks
    contentKey = `alert-${alert.id}`
    content = <LumiCard mood={alert.lumi} title={alert.text} sub={alert.sub} actions={alert.actions} ms={alert.ms ?? (alert.actions?.length ? 12000 : 5200)} />
  } else if (mode === 'alert' && alert?.nowPlaying && track) {
    contentKey = `alert-${alert.id}`
    content = (
      <div className="alert2 np-alert">
        <Art track={track} size={36} />
        <span className="al-tx">
          <small>Now playing</small>
          <b>
            {track.title} · {track.artist}
          </b>
        </span>
        {settings.idleBars && <Bars active={playing} hue={track.hue} />}
      </div>
    )
  } else if (mode === 'call' && caller) {
    contentKey = 'incoming-call'
    content = (
      <IncomingCall
        profile={caller.profile}
        name={caller.profile.display_name || `@${caller.profile.username}`}
        sub="Incoming voice call"
        onDecline={activeCall.decline}
        onAnswer={activeCall.accept}
      />
    )
  } else if (mode === 'call' && groupCaller) {
    contentKey = 'incoming-call'
    content = (
      <IncomingCall
        group={groupCaller}
        name={groupCaller.name}
        sub="Incoming group voice chat"
        onDecline={declineGroupRing}
        onAnswer={answerGroupRing}
      />
    )
  } else if (mode === 'incall' && (friendInCall || voiceGroup)) {
    contentKey = 'in-call'
    const live = friendInCall ? callPhase === 'active' : !activeVoice.state.joining
    const since = friendInCall ? activeCall.state.since : activeVoice.state.since
    const st = friendInCall ? activeCall.state : activeVoice.state
    content = (
      <InCallPill
        profile={friendInCall?.profile}
        group={voiceGroup}
        label={live && since ? <Timer since={since} /> : friendInCall && callPhase === 'calling' ? 'Calling…' : friendInCall ? 'Connecting…' : 'Joining…'}
        controls={live}
        muted={st.muted}
        deafened={st.deafened}
        micStream={friendInCall ? activeCall.micStream : activeVoice.micStream}
        onMute={friendInCall ? activeCall.toggleMute : activeVoice.toggleMute}
        onDeafen={friendInCall ? activeCall.toggleDeafen : activeVoice.toggleDeafen}
        onEnd={friendInCall ? activeCall.hangUp : activeVoice.leave}
        people={showVoicePeople ? voicePeople : undefined}
        me={auth.profile?.id}
      />
    )
  } else if (mode === 'alert' && alert) {
    contentKey = `alert-${alert.id}`
    const value = alert.value
    // the percentage is drawn on the right, so a sub line that only repeats it is left out
    const sub = value !== undefined && alert.sub === `${value}%` ? undefined : alert.sub
    content = (
      <div className={`alert2 ${alert.avatar ? 'msg-alert' : ''}`} style={{ ['--c' as string]: alertTone(alert.icon) }}>
        {alert.avatar ? (
          <Avatar profile={alert.avatar} size={34} />
        ) : (
          <span className="al-ic">
            <AlertIcon icon={alert.icon} />
          </span>
        )}
        <span className="al-tx">
          <b>{alert.text}</b>
          {sub && <small>{sub}</small>}
        </span>
        {value !== undefined && <span className="al-val">{value}%</span>}
        {alert.chatWith && <span className="al-reply">Reply</span>}
        {value !== undefined && <span className="edge" style={{ ['--v' as string]: `${value}%` }} />}
      </div>
    )
  } else if (mode === 'peek') {
    if (dlRows) {
      contentKey = 'peek-deadlines'
      content = (
        <ul className="dl-peek">
          {dlShown.map((x) => (
            <li key={x.id} className={`u-${urgency(x.due, now)}`}>
              <i />
              <span>{x.title}</span>
              <small>{dueLabel(x.due, now)}</small>
            </li>
          ))}
          {openDeadlines.length > dlShown.length && <li className="more">+{openDeadlines.length - dlShown.length} more</li>}
        </ul>
      )
    } else if (peekText && track) {
      contentKey = 'peek-live'
      content = (
        <div className="live peek-live">
          <Art track={track} size={22} />
          <LiveText text={peekText} k={lyricText ? lyricIdx : 'title'} />
          {settings.idleBars && <Bars active hue={track.hue} />}
        </div>
      )
    } else {
      contentKey = 'peek-clock'
      content = (
        <div className="peek center">
          <span className="peek-text">
            {[clock, d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), battery !== null ? `${battery}%` : null, dueToday ? `${dueToday} due today` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      )
    }
  } else if (live && track) {
    contentKey = 'idle-live'
    content = (
      <div className="live">
        <Art track={track} size={22} />
        {weatherGlyph}
        {lumiOn && !idleText && (
          // she bobs to the beat, so the pill needs no equalizer bars
          <span className={playing ? 'lumi-vibe' : ''}>
            <LumiFace mood={lumiRest} height={26} roam={5} />
          </span>
        )}
        {(!lumiOn || idleText || settings.lumiClock) && <LiveText text={live} k={studyStatus ? studyStatus.key : idleLyric ? lyricIdx : live} />}
        {/* no count badge in the pill with Lumi: due dates reach you as reminders, on Today and on hover */}
        {(unreadCount > 0 || privacy.camera || privacy.mic || (!lumiOn && dueToday > 0)) && (
          <span className="live-dots">
            {!lumiOn && dueBadge}
            {unreadCount > 0 && <span className="dot unread-dot" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`} />}
            {privacy.camera && <span className="dot cam" title={`Camera: ${privacy.camera}`} />}
            {privacy.mic && <span className="dot mic" title={`Microphone: ${privacy.mic}`} />}
          </span>
        )}
        {settings.idleBars && !lumiOn && <Bars active hue={track.hue} />}
      </div>
    )
  } else {
    contentKey = idleExtra ? 'idle-extra' : 'idle'
    content = (
      <div className={`idle ${idleText ? 'lyric-idle' : 'idle-grid'}`}>
        {idleText ? (
          <>
            {playing && track && settings.idleBars && !idleLyric && <Bars active hue={track.hue} />}
            {weatherGlyph}
            <span className={`idle-lyric ${studyStatus ? `st-${studyStatus.kind}` : ''}`}>{idleText}</span>
            {dueBadge}
            {unreadCount > 0 && <span className="dot unread-dot" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`} />}
            {privacy.camera && <span className="dot cam" title={`Camera: ${privacy.camera}`} />}
            {privacy.mic && <span className="dot mic" title={`Microphone: ${privacy.mic}`} />}
          </>
        ) : lumiOn ? (
          // the resting pill: Lumi's eyes, and the time beside them (turn the time off in Settings)
          <span className="idle-lumi">
            <LumiFace mood={lumiRest} height={30} roam={settings.lumiClock ? 6 : 26} />
            {settings.lumiClock && <span className="idle-time">{clock}</span>}
            {unreadCount > 0 && <span className="dot unread-dot" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`} />}
            {privacy.camera && <span className="dot cam" title={`Camera: ${privacy.camera}`} />}
            {privacy.mic && <span className="dot mic" title={`Microphone: ${privacy.mic}`} />}
          </span>
        ) : settings.assistant && settings.mascotInPill && settings.mascotEyesOnly ? (
          <span className="idle-eyes" style={{ gridColumn: '1 / -1', justifySelf: 'center', display: 'flex' }}>
            <MascotEyes height={15} accessories={settings.mascotAccessories} accessoryColors={settings.mascotAccessoryColors} />
          </span>
        ) : (
          <>
            {/* the clock stays in the exact middle; bars hang off its left, dots off its right */}
            <span className="idle-side left">
              {playing && track && settings.idleBars ? (
                <Bars active hue={track.hue} />
              ) : (
                settings.assistant && settings.mascotInPill && <MascotEyes height={15} accessories={settings.mascotAccessories} accessoryColors={settings.mascotAccessoryColors} />
              )}
            </span>
            <span>{clock}</span>
            <span className="idle-side right">
              {dueBadge}
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
    <EqContext.Provider value={eqLook}>
    <LumiCalmContext.Provider value={settings.lumiCalm}>
    <div
      className={`root ${IS_TAURI ? 'native' : 'demo'} ${hidden ? 'hidden' : ''} ${tucked ? 'tucked' : ''} ${theme} ${theme === 'glass' ? `tint-${settings.glassTint}` : ''} ${moving ? 'dragging' : ''} ${fs || fsWin ? 'fullchat' : ''}`}
      style={{
        ['--accent' as string]: accent,
        ['--on-accent' as string]: onAcc,
        ['--scale' as string]: settings.scale,
        ['--clock-size' as string]: `${settings.clockSize}px`,
        // a fixed-height card gives the lyrics whatever room the header and timeline leave
        ...(settings.cardFit ? {} : { ['--ly-h' as string]: `${Math.max(96, Math.min(CARD_MAX, settings.cardH) - CARD_TOP - CARD_PAD - 108)}px` }),
      }}
      onClick={() => !IS_TAURI && setExpanded(false)}
      onDragOver={(e) => {
        if (IS_TAURI) return
        e.preventDefault()
        if (!dragging) {
          setDragging(true)
          setExpanded(true)
          setTab((t) => (t === 'apps' ? 'apps' : t === 'todo' && todoOpen.current !== null ? 'todo' : 'shelf'))
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
        floating={!docked && pos.y > 2}
        offset={shown}
        dock={dockAt}
        centered={Boolean(fs)}
        dragHandlers={dragHandlers}
        onClick={(e) => {
          e.stopPropagation()
          if (justDragged.current) return
          if (mode === 'assistant') return assistant.cancel()
          if (mode === 'alert' && alert?.nowPlaying) {
            setTab('media')
            setAlert(null)
          }
          if (mode === 'alert' && alert?.openTab) {
            setTab(alert.openTab)
            setAlert(null)
          }
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
        ringing={incomingCall}
        glow={glowFor}
        glowLevel={assistant.level}
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
          <div className="demo-row">
            <span>Power</span>
            <button onClick={() => pushAlert({ icon: '⚡', text: 'Charging', sub: '78%', value: 78 }, 'toggle', { emphasis: 'subtle', direction: 'forward' })}>Plug in charger</button>
            <button onClick={() => pushAlert({ icon: '🔋', text: 'On battery', sub: '78%', value: 78 }, 'toggle', { emphasis: 'subtle', direction: 'back' })}>Unplug charger</button>
            <button onClick={() => pushAlert({ icon: '🪫', text: 'Low battery', sub: '15%', value: 15 }, 'warning')}>Low battery</button>
          </div>
          <div className="demo-row">
            <span>Keys</span>
            <button onClick={() => pushAlert({ kind: 'volume', icon: '🔊', text: 'Volume', value: Math.round(Math.random() * 100) })}>Volume change</button>
            <button onClick={() => pushAlert({ kind: 'volume', icon: '🔇', text: 'Muted', value: 0 })}>Mute</button>
            <button onClick={() => pushAlert({ kind: 'brightness', icon: '🔆', text: 'Brightness', value: Math.round(Math.random() * 100) })}>Brightness change</button>
            <button
              onClick={() => {
                const caps = !demoLocks.current.caps
                demoLocks.current.caps = caps
                pushAlert({ icon: caps ? '🔠' : '🔡', text: caps ? 'Caps Lock on' : 'Caps Lock off' }, 'toggle', { emphasis: 'subtle', direction: caps ? 'forward' : 'back' })
              }}
            >
              Caps Lock
            </button>
            <button
              onClick={() => {
                const num = !demoLocks.current.num
                demoLocks.current.num = num
                pushAlert({ icon: '🔢', text: num ? 'Num Lock on' : 'Num Lock off' }, 'toggle', { emphasis: 'subtle', direction: num ? 'forward' : 'back' })
              }}
            >
              Num Lock
            </button>
          </div>
          <div className="demo-row">
            <span>Media</span>
            <button onClick={toggle}>{playing ? 'Pause' : 'Play'} music</button>
            <button onClick={() => onSkip(1)}>Next song</button>
            <button onClick={() => startTimer(0.25)}>15 s timer</button>
            <button onClick={() => advancePomo(pomo ?? { phase: 'break', done: 0 })}>Pomodoro phase</button>
          </div>
          <div className="demo-row">
            <span>Privacy</span>
            <button
              onClick={() => {
                const on = !privacy.mic
                setPrivacy((p) => ({ ...p, mic: on ? 'Zoom' : null }))
                if (on) pushAlert({ icon: '🎙️', text: 'Microphone in use', sub: 'Zoom' }, 'warning', { emphasis: 'subtle' })
              }}
            >
              Mic {privacy.mic ? 'off' : 'on'}
            </button>
            <button
              onClick={() => {
                const on = !privacy.camera
                setPrivacy((p) => ({ ...p, camera: on ? 'Zoom' : null }))
                if (on) pushAlert({ icon: '📷', text: 'Camera in use', sub: 'Zoom' }, 'warning', { emphasis: 'subtle' })
              }}
            >
              Camera {privacy.camera ? 'off' : 'on'}
            </button>
            <button onClick={() => pushAlert({ icon: '📋', text: 'Copied' }, 'success', { emphasis: 'subtle' })}>Copied</button>
          </div>
          <div className="demo-row">
            <span>Buddy</span>
            <button onClick={() => (assistant.state.phase === 'listening' ? assistant.stop() : void assistant.start())}>{assistant.state.phase === 'listening' ? 'Stop' : `Talk (${settings.assistantKey})`}</button>
            <button onClick={() => assistant.preview('thinking')}>Thinking</button>
            <button onClick={() => assistant.preview('speaking')}>Speaking</button>
            <button onClick={() => assistant.preview('error')}>Error</button>
            <button onClick={() => assistant.preview('confirm')}>Confirm</button>
            <button onClick={assistant.cancel}>Cancel</button>
          </div>
          <div className="demo-row">
            <span>Social</span>
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
            <button
              onClick={() => {
                playMessageSound()
                pushAlert({ icon: '👥', text: 'Weekend squad', sub: 'Mira: who is up for tonight?' })
              }}
            >
              Group message
            </button>
            {/* rings like a real call: the island glows, and hovering it shows the caller with answer and decline */}
            {DEMO_SOCIAL && <button onClick={demo.ringCall}>Incoming call</button>}
            {DEMO_SOCIAL && (
              <button
                onClick={() => {
                  const group = demo.groups.groups[0]
                  const from = group?.members.find((p) => p.id !== demo.auth.profile?.id)
                  demo.ringGroupCall()
                  // the same alert a real group ring brings
                  if (group && auth.profile?.presence !== 'dnd')
                    pushAlert({ icon: '📞', text: group.name, sub: `${from?.display_name || from?.username || 'Someone'} started a voice chat`, avatar: from }, 'attention')
                }}
              >
                Incoming group call
              </button>
            )}
            {DEMO_SOCIAL && <button onClick={demoStudyTogether}>Study together</button>}
            <button onClick={playJoin}>Join sound</button>
            <button onClick={playLeave}>Leave sound</button>
          </div>
          {CAMPUS && campus && <div className="demo-row">
            <span>SCELE</span>
            <button onClick={() => pushAlert({ icon: '📅', text: 'PBD: Lab 8: Todo app', sub: 'Due in 2h 30m · still a draft', openTab: 'deadlines' }, 'attention')}>Deadline</button>
            <button onClick={() => pushAlert({ icon: '🎓', text: 'PPW in 30m · 2.2304', sub: 'Week 9: React Hooks & State', openTab: 'classes' }, 'attention')}>Class soon</button>
            <button onClick={() => pushAlert({ icon: '📣', text: 'PPW: Perubahan deadline Lab 8', sub: 'Deadline Lab 8 diundur ke Jumat 23.55.', openTab: 'inbox' }, 'ready')}>Announcement</button>
            <button onClick={() => pushAlert({ icon: '📄', text: 'New in SDA', sub: 'Slide AVL Tree', openTab: 'inbox' }, 'ready')}>New material</button>
          </div>}
          {CAMPUS && <div className="demo-row">
            <span>SSO UI</span>
            {/* the onboarding: unverified (Today points to Profile, the daily alert), then verified (the welcome) */}
            <button
              onClick={() => {
                // like a fresh install: nothing connected, the setup from the start
                disconnectCampus()
                try {
                  localStorage.removeItem(VERIFY_NUDGE_KEY)
                } catch {
                  /* ignore */
                }
                setTab('today')
                setExpanded(true)
                pushAlert({ icon: '🎓', text: 'Verify your SSO UI', sub: 'Unlock your classes and SCELE deadlines', openTab: 'profile' }, 'ready')
              }}
            >
              Start unverified
            </button>
            <button onClick={goVerify}>Go to Verify Student</button>
            {/* UI's login session running out: reading SLCM again asks for the password */}
            <button onClick={() => demoForgetSlcmSession()}>Expire UI sign-in</button>
            <button
              onClick={() => {
                setExpanded(true)
                student.verify().then(() => play('success'))
              }}
            >
              Verify (succeeds)
            </button>
          </div>}
          {CAMPUS && <div className="demo-row">
            <span>Lumi</span>
            {/* her first hello, and one example of each kind of moment; every one of them is on the gallery at /?lumi */}
            <button
              onClick={() => {
                setNotes(null)
                setLumiIntro(true)
                setExpanded(true)
              }}
            >
              First hello
            </button>
            {(
              [
                ['Good morning', 'goodMorning'],
                ['Class in 1h', 'class1h'],
                ['Class in 10m', 'class10m'],
                ['Due in 3 days', 'due3d'],
                ['Due in 1h', 'due1h'],
                ['Overdue', 'overdue'],
                ['Submitted', 'submitted'],
                ['Grade', 'graded'],
                ['Exam tomorrow', 'examTomorrow'],
                ['Good luck', 'examLuck'],
                ['Water', 'hydrate'],
                ['Stretch', 'stretch'],
                ['Late night', 'lateNight'],
                ['All to-dos done', 'allTodosDone'],
                ['Error', 'error'],
              ] as [string, LumiMood][]
            ).map(([label, mood]) => (
              <button key={mood} onClick={() => lumiDemo(mood)}>
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                const s = say('examDone', firstName || 'Zhillan')
                pushAlert(
                  {
                    icon: '🎉',
                    text: s.title,
                    sub: 'Algoritma. How did it go?',
                    lumi: 'examDone',
                    ms: 14000,
                    actions: [
                      { label: 'It went well', primary: true, run: () => lumiDemo('allTodosDone', { text: 'I knew it!', sub: 'Proud of you. Enjoy the rest of your day.' }) },
                      { label: 'A tough one', run: () => lumiDemo('classDone', { text: "It's over now", sub: 'You did what you could. Rest, then eat something.' }) },
                    ],
                  },
                  'success',
                )
              }}
            >
              Exam finished
            </button>
            <button
              onClick={() => {
                const s = say('confirm', firstName)
                pushAlert({ icon: '❓', text: s.title, sub: s.sub, lumi: 'confirm', actions: [{ label: 'Yes, remove it', primary: true, run: () => lumiDemo('todoDone', { text: 'Removed', sub: 'Done.' }) }, { label: 'Keep it', run: () => setAlert(null) }] }, 'attention')
              }}
            >
              Ask something
            </button>
            <button onClick={() => window.open('/?lumi', '_blank')}>Gallery</button>
          </div>}
          <div className="demo-row">
            <span>Away</span>
            {/* as if the user left and is back now; what would have popped up meanwhile is held for the catch-up */}
            <button
              onClick={() =>
                catchUp.simulate('back', 40, [
                  { icon: '📅', text: 'PBD: Lab 8: Todo app', sub: 'Due in 2h 30m · still a draft', openTab: 'deadlines' },
                  { icon: '📣', text: 'OS: Lab moved to Lab 2', sub: 'The 1 Nov lab is in Lab 2 instead', openTab: 'inbox' },
                  { icon: '🏅', text: 'New grade in OS', sub: 'Quiz 2 · open Due to see it', openTab: 'deadlines' },
                ])
              }
            >
              Back from AFK (40 min)
            </button>
            <button
              onClick={() =>
                catchUp.simulate('hello', 9 * 60, [
                  { icon: '📄', text: 'New in SP', sub: 'Week 9 · Hypothesis testing.pdf', openTab: 'inbox' },
                  { icon: '📅', text: 'SP: Tugas Pemrograman 2', sub: 'Due in 2 days', openTab: 'deadlines' },
                ])
              }
            >
              Laptop turned on (overnight)
            </button>
          </div>
          {CAMPUS && campus && <div className="demo-row">
            <span>SCELE work</span>
            {/* these change the demo's SCELE data and sync, so the Due page and alerts react as they would to the real thing */}
            <button
              onClick={() => {
                demoSubmitLab()
                scele.refresh()
              }}
            >
              Submit Lab 8
            </button>
            <button
              onClick={() => {
                demoPostGrade()
                scele.refresh()
              }}
            >
              Post a grade
            </button>
            <button
              onClick={() => {
                demoResetScele()
                scele.refresh()
              }}
            >
              Reset
            </button>
          </div>}
          <div className="demo-row">
            <span>App</span>
            <button
              onClick={() => {
                markUpdateSeen('')
                setSeenUpdate('')
                cuedUpdate.current = ''
                setFakeUpdate('9.9.9')
                setExpanded(false)
              }}
            >
              Update alert
            </button>
            <button onClick={runDemoUpdate}>Update download</button>
            <button onClick={() => pushAlert({ icon: '⚠️', text: 'Update failed', sub: 'Try again from Settings' }, 'error')}>Update failed</button>
            <button
              onClick={() => {
                setAstraIntro(false)
                setNotes(CHANGELOG[0])
                setExpanded(true)
              }}
            >
              What's new
            </button>
            <button onClick={() => setIntro((n) => n + 1)}>Replay intro</button>
            {!CAMPUS && (
<button
              onClick={() => {
                setNotes(null)
                demoStt('reset')
                setAstraIntro(true)
                setExpanded(true)
              }}
            >
              Astra welcome
            </button>
)}
          </div>
        </div>
      )}
    </div>
    </LumiCalmContext.Provider>
    </EqContext.Provider>
  )
}
