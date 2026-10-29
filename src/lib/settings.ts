import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { BACKEND_READY, supabase } from './supabase'
import { IS_TAURI } from './useMedia'
import { CAMPUS } from './campus'
import type { Tab } from '../types'

export type Anim = 'bouncy' | 'smooth' | 'snappy'
export type GlassTint = 'dark' | 'light' | 'gradient'
export type TabAnim = 'fade' | 'slide' | 'liquid' | 'zoom' | 'stack' | 'flip' | 'blur' | 'rise' | 'morph' | 'elastic'

export type ChatAnim = 'slide' | 'pop' | 'rise'
export const CHAT_ANIMS: ChatAnim[] = ['slide', 'pop', 'rise']
export const TAB_ANIMS: TabAnim[] = ['fade', 'slide', 'liquid', 'zoom', 'stack', 'flip', 'blur', 'rise', 'morph', 'elastic']
export type Theme = 'dark' | 'light' | 'glass' | 'auto'
export type IdleDisplay = 'clock' | 'lyrics' | 'weather' | 'deadline'
/** cuelume's themes; 'basic' is the one cuelume calls 'default' */
/** how the music-is-playing mark moves */
export type EqStyle = 'bars' | 'wave' | 'pulse'
export const EQ_STYLES: EqStyle[] = ['bars', 'wave', 'pulse']
export type SoundPack = 'mech' | 'basic' | 'bubble' | 'press'

export const SOUND_PACKS: SoundPack[] = ['mech', 'basic', 'bubble', 'press']

export interface Settings {
  /** 0 = primary monitor, n = n-th monitor */
  monitor: number
  hideInFullscreen: boolean
  /** keep the island out of sight until the cursor reaches the top middle of the screen */
  smartMode: boolean
  anim: Anim
  clock24: boolean
  accent: string
  /** tint the UI with the colour of the track that is playing instead of `accent` */
  accentFromMusic: boolean
  theme: Theme
  /** how pages change inside the open card */
  tabAnim: TabAnim
  /** how a chat opens and closes */
  chatAnim: ChatAnim
  /** colour of the glass: only used by the glass theme */
  glassTint: GlassTint
  /** share what you are doing with friends (listening, timer) */
  shareActivity: boolean
  /** what the small pill shows: the clock, or the current lyric line when there is one */
  idle: IdleDisplay
  /** equalizer bars next to the idle text while music plays */
  idleBars: boolean
  /** mute message and call alerts while a focus session runs */
  focusMute: boolean
  /** count down to the next class in the pill, and go quiet while it is on */
  classPill: boolean
  classMode: boolean
  /** a deadline closer than a few hours takes over the pill */
  deadlineAlert: boolean
  /** eye-rest and stretch reminders during long study stretches */
  wellbeing: boolean
  /** push your study time to friends for the leaderboard */
  shareStudy: boolean
  /** look of the equalizer: bouncing bars, a flowing wave or pulsing dots */
  eqStyle: EqStyle
  /** its colour: 'art' (the album), 'accent', or a hex colour */
  eqColor: string
  /** play a sound when a chat message arrives */
  messageSound: boolean
  /** coming back to the computer: a greeting or welcome back with what happened meanwhile */
  catchUp: boolean
  /** small sounds for clicks, typing, pages and alerts; off = muted */
  uiSounds: boolean
  /** which material the interface sounds are made of */
  soundPack: SoundPack
  /** loudness of the interface sounds, 0-1 */
  soundVolume: number
  /** the keystroke sound in text fields */
  typingSounds: boolean
  /** font size of the idle pill text in px */
  clockSize: number
  /** seconds the lyrics run ahead of the player; the fade-in and Windows' position lag make them feel late */
  lyricOffset: number
  /** pages left out of the carousel (Settings can never be hidden) */
  hiddenPages: Tab[]
  /** clipboard history: stop recording, hide entries until hovered, wipe after N minutes (0 = never) */
  clipPaused: boolean
  clipMask: boolean
  clipAutoClear: number
  /** skip things that look like passwords or tokens */
  clipSkipSecrets: boolean
  /** island offset from its default spot (centre top), in px */
  posX: number
  posY: number
  /** docked on the taskbar at the bottom of the screen, growing upwards (posY is then unused) */
  posBottom: boolean
  /** city for the weather page */
  city: string
  /** exact spot picked from the search suggestions */
  cityLat: number | null
  cityLon: number | null
  fahrenheit: boolean
  /** overall size of the island, 1 = default */
  scale: number
  /** size of the opened card in design px (before scale) */
  cardW: number
  cardH: number
  /** the card's height follows the page it shows; off (the default) = always cardH */
  cardFit: boolean
  /** the little mascot you wake with a hotkey */
  assistant: boolean
  /** global shortcut in Tauri's accelerator format, e.g. 'Control+Shift+Space' */
  assistantKey: string
  /** hold the keys while talking, or press once to start and again to stop */
  assistantTalk: TalkMode
  /** show the sleeping mascot at the left of the resting pill */
  mascotInPill: boolean
  /** in the resting pill, show only the eyes: no clock or other idle content */
  mascotEyesOnly: boolean
  mascotName: string
  /** 'accent' follows the accent colour, otherwise a hex colour */
  mascotColor: string
  /** worn by the mascot: at most one thing per slot (see ACCESSORY_SLOTS) */
  mascotAccessories: MascotAccessory[]
  /** a hex colour per accessory; one that is missing keeps its own colour */
  mascotAccessoryColors: AccessoryColors
  /** retired: one colour for every accessory, folded into mascotAccessoryColors on load */
  mascotAccessoryColor?: string
  /** 'local' = a small free model built in; 'claude' = Claude, signed in with your Claude account */
  assistantEngine: 'local' | 'claude'
  /** which small model answers when the engine is local */
  assistantLocalModel: string
  /** which Claude answers: Haiku is the quick one, Sonnet and Opus think harder */
  assistantModel: AssistantModel
  assistantPersona: Persona
  /** how long the answers are */
  assistantLength: 'short' | 'normal'
  /** what it should call you (empty = nothing) */
  assistantUserName: string
  /** extra instructions in your own words, added to the personality */
  assistantStyle: string
  /** say the answer out loud */
  assistantSpeak: boolean
  /** the chosen neural voice, e.g. 'af_heart' */
  assistantVoice: string
  assistantRate: number
  /** 'neural' = a natural voice that runs on this PC, 'openai' = an even more natural paid cloud voice (needs an OpenAI key) */
  assistantVoiceEngine: 'neural' | 'openai'
  assistantCloudVoice: string
  assistantTools: Partial<Record<ToolId, boolean>>
  /** how well it listens: 'base' is quicker, 'small' (the default) mishears fewer words */
  assistantListenModel: string
  assistantAliases: Alias[]
  assistantRoutines: Routine[]
}

/** The built-in brains: id, name, and a note. "auto" picks by how much memory the PC has. */
export const LOCAL_MODELS: [string, string, string][] = [
  ['auto', 'Automatic', 'The 3B model on PCs with 8 GB of memory or more, otherwise the 1.5B one'],
  ['qwen2.5-3b', 'Qwen2.5 3B', 'Smarter. A 2.1 GB download, once'],
  ['qwen2.5-1.5b', 'Qwen2.5 1.5B', 'Faster on weaker PCs. A 1.1 GB download, once'],
]
export const DEFAULT_LOCAL_MODEL = 'auto'

export type AssistantModel = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'
export const ASSISTANT_MODELS: [AssistantModel, string][] = [
  ['claude-haiku-5-5', 'Haiku (fast)'],
  ['claude-sonnet-5-5', 'Sonnet'],
  ['claude-opus-5-5', 'Opus'],
]
export type Persona = 'cheerful' | 'calm' | 'sassy' | 'pro'
export const PERSONAS: [Persona, string][] = [
  ['cheerful', 'Cheerful'],
  ['calm', 'Calm'],
  ['sassy', 'Sassy'],
  ['pro', 'Professional'],
]

export const CLOUD_VOICES = ['coral', 'nova', 'shimmer', 'alloy', 'sage', 'ash', 'ballad', 'echo', 'fable', 'onyx']
export const CLOUD_MODEL = 'gpt-4o-mini-tts'

export type TalkMode = 'hold' | 'toggle'
export type MascotAccessory = 'bow' | 'headphones' | 'glasses' | 'shades' | 'hat' | 'crown' | 'catEars' | 'halo' | 'topHat' | 'scarf' | 'bowtie'
/** a missing entry keeps the accessory's own colour */
export type AccessoryColors = Partial<Record<MascotAccessory, string>>
export type AccessorySlot = 'head' | 'face' | 'side' | 'neck'
/** Each slot holds one accessory at a time; the slots mix freely. `own` is the colour it comes in. */
export const ACCESSORY_SLOTS: { id: AccessorySlot; label: string; items: { id: MascotAccessory; label: string; own: string }[] }[] = [
  {
    id: 'head',
    label: 'Head',
    items: [
      { id: 'hat', label: 'Party hat', own: '#7c5cff' },
      { id: 'crown', label: 'Crown', own: '#ffd166' },
      { id: 'catEars', label: 'Cat ears', own: '#ff8fb1' },
      { id: 'halo', label: 'Halo', own: '#ffd166' },
      { id: 'topHat', label: 'Top hat', own: '#2f3144' },
    ],
  },
  {
    id: 'face',
    label: 'Face',
    items: [
      { id: 'glasses', label: 'Glasses', own: '#ffd166' },
      { id: 'shades', label: 'Shades', own: '#14151f' },
    ],
  },
  {
    id: 'side',
    label: 'Ears & hair',
    items: [
      { id: 'headphones', label: 'Headphones', own: '#3d3d4d' },
      { id: 'bow', label: 'Bow', own: '#ff5d8f' },
    ],
  },
  {
    id: 'neck',
    label: 'Neck',
    items: [
      { id: 'scarf', label: 'Scarf', own: '#ff6b6b' },
      { id: 'bowtie', label: 'Bow tie', own: '#6f7bff' },
    ],
  },
]
const SLOT_OF = new Map<MascotAccessory, AccessorySlot>(ACCESSORY_SLOTS.flatMap((s) => s.items.map((i) => [i.id, s.id] as const)))

/** Wear `id`, taking off whatever else sits in its slot; wearing it again takes it off. */
export function toggleAccessory(worn: MascotAccessory[], id: MascotAccessory): MascotAccessory[] {
  if (worn.includes(id)) return worn.filter((x) => x !== id)
  return [...worn.filter((x) => SLOT_OF.get(x) !== SLOT_OF.get(id)), id]
}

/** Clean up an outfit from an older version or another device: known items only, one per slot, one colour each. */
function normalizeOutfit(s: Settings) {
  const known = (Array.isArray(s.mascotAccessories) ? s.mascotAccessories : []).filter((a) => SLOT_OF.has(a))
  s.mascotAccessories = known.reduce<MascotAccessory[]>((worn, a) => toggleAccessory(worn, a), [])
  const colors: AccessoryColors = { ...(s.mascotAccessoryColors && typeof s.mascotAccessoryColors === 'object' ? s.mascotAccessoryColors : {}) }
  // before each accessory had its own colour, one colour was shared by all of them
  const legacy = s.mascotAccessoryColor
  if (legacy && legacy !== 'auto') for (const a of s.mascotAccessories) colors[a] ??= legacy
  s.mascotAccessoryColors = colors
  delete s.mascotAccessoryColor
}

/** What the assistant may do on this computer. Power actions are off until you turn them on. */
export type ToolId = 'open_app' | 'open_url' | 'web_search' | 'open_path' | 'media' | 'volume' | 'timer' | 'todo' | 'routine' | 'power'
export const TOOLS: { id: ToolId; label: string; hint: string; defaultOn: boolean }[] = [
  { id: 'open_app', label: 'Open apps', hint: 'Starts any app from your Start menu', defaultOn: true },
  { id: 'open_url', label: 'Open websites', hint: 'Opens https links in your browser', defaultOn: true },
  { id: 'web_search', label: 'Search the web', hint: 'Runs a Google search in your browser', defaultOn: true },
  { id: 'open_path', label: 'Open files and folders', hint: 'Always asks you first, unless it is one of your shortcuts', defaultOn: true },
  { id: 'media', label: 'Control music', hint: 'Play, pause, next and previous', defaultOn: true },
  { id: 'volume', label: 'Change volume', hint: 'Louder, quieter, set a level, mute', defaultOn: true },
  { id: 'timer', label: 'Start timers', hint: 'Uses the island timer', defaultOn: true },
  { id: 'todo', label: 'Add to-dos', hint: 'Adds to your to-do list', defaultOn: true },
  { id: 'routine', label: 'Run your routines', hint: 'The routines you write below', defaultOn: true },
  { id: 'power', label: 'Lock, sleep, shut down', hint: 'Always asks you first', defaultOn: false },
]
export const toolOn = (s: Pick<Settings, 'assistantTools'>, id: ToolId) => s.assistantTools[id] ?? TOOLS.find((t) => t.id === id)?.defaultOn ?? false

/** A nickname for something you open often: "my notes" -> a folder, a website or an app. */
export interface Alias {
  name: string
  /** an app name, a file or folder path, or an https link */
  target: string
}
/** A phrase that does several things: each line is a command like "open Notion" or "timer 25 minutes". */
export interface Routine {
  name: string
  steps: string
}

export const ACCENTS = ['#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#fb923c', '#facc15', '#f87171', '#2dd4bf']

export const SPRINGS: Record<Anim, { stiffness: number; damping: number; mass: number }> = {
  bouncy: { stiffness: 380, damping: 28, mass: 0.9 },
  smooth: { stiffness: 220, damping: 30, mass: 1 },
  snappy: { stiffness: 620, damping: 42, mass: 0.8 },
}

/** Design-space size of the stage the island is drawn in (must match .stage in App.css). */
export const STAGE = { w: 520, h: 444 }

export const SIZE_LIMITS = {
  scale: { min: 0.8, max: 1.4, step: 0.05 },
  cardW: { min: 400, max: 490, step: 10 },
  cardH: { min: 220, max: 430, step: 2 },
  clockSize: { min: 12, max: 22, step: 1 },
  lyricOffset: { min: -1.5, max: 1.5, step: 0.05 },
  soundVolume: { min: 0, max: 1, step: 0.05 },
  voiceRate: { min: 0.7, max: 1.4, step: 0.05 },
}

/**
 * Where the pill may sit, as an offset from the top centre. Must match `island_offset` in src-tauri/src/lib.rs
 * (80 px in from the sides, 120 px above the bottom), because Rust uses the same box to decide where the pill can
 * be clicked: a pill dragged lower than this is drawn out of reach.
 */
export function clampPos(x: number, y: number) {
  const maxX = Math.max(0, window.screen.width / 2 - 80)
  const maxY = Math.max(0, window.screen.height - 120)
  return { x: Math.round(Math.max(-maxX, Math.min(maxX, x))), y: Math.round(Math.max(0, Math.min(maxY, y))) }
}

export const SIZE_DEFAULTS = { scale: 1, cardW: 440, cardH: 344, cardFit: false }
/** the pill's standard text size (px), which Settings shows as Default */
export const TEXT_SIZE_DEFAULT = 15

const DEFAULTS: Settings = {
  monitor: 0,
  hideInFullscreen: true,
  smartMode: false,
  anim: 'bouncy',
  clock24: true,
  accent: ACCENTS[0],
  accentFromMusic: true,
  theme: 'dark',
  tabAnim: 'slide',
  chatAnim: 'slide',
  glassTint: 'dark',
  shareActivity: false,
  idle: 'lyrics',
  idleBars: true,
  focusMute: true,
  classPill: true,
  classMode: true,
  deadlineAlert: true,
  wellbeing: true,
  shareStudy: false,
  eqStyle: 'bars',
  eqColor: 'art',
  messageSound: true,
  catchUp: true,
  uiSounds: true,
  soundPack: 'mech',
  soundVolume: 1,
  typingSounds: true,
  clockSize: TEXT_SIZE_DEFAULT,
  lyricOffset: 0.35,
  // the Universitas Indonesia build starts lean, around Campus: these can be turned back on in Settings
  hiddenPages: CAMPUS ? ['prompter', 'apps', 'shelf', 'schedule'] : [],
  clipPaused: false,
  clipMask: false,
  clipAutoClear: 5,
  clipSkipSecrets: true,
  posX: 0,
  posY: 0,
  posBottom: false,
  city: '',
  cityLat: null,
  cityLon: null,
  fahrenheit: false,
  assistant: false,
  assistantKey: 'Control+Shift+Space',
  assistantTalk: 'hold',
  mascotInPill: true,
  mascotEyesOnly: false,
  mascotName: 'Astra',
  mascotColor: 'accent',
  mascotAccessories: [],
  mascotAccessoryColors: {},
  assistantTools: {},
  assistantListenModel: 'small',
  assistantAliases: [],
  assistantRoutines: [],
  assistantEngine: 'local',
  assistantLocalModel: DEFAULT_LOCAL_MODEL,
  assistantModel: 'claude-haiku-5-5',
  assistantPersona: 'cheerful',
  assistantLength: 'short',
  assistantUserName: '',
  assistantStyle: '',
  assistantSpeak: true,
  assistantVoice: 'af_heart',
  assistantRate: 1,
  assistantVoiceEngine: 'neural',
  assistantCloudVoice: 'coral',
  ...SIZE_DEFAULTS,
}

const KEY = 'di.settings'
/** when a synced setting last changed on this device (ms); missing on a fresh install */
const AT_KEY = 'di.settings.at'

/** tied to this computer's screens, so they stay out of the account copy */
const LOCAL_ONLY: (keyof Settings)[] = ['monitor', 'posX', 'posY']

function synced(s: Settings): Partial<Settings> {
  const out: Partial<Settings> = { ...s }
  for (const k of LOCAL_ONLY) delete out[k]
  return out
}

function localAt(): number {
  try {
    return Number(localStorage.getItem(AT_KEY)) || 0
  } catch {
    return 0
  }
}

function setLocalAt(ms: number) {
  try {
    localStorage.setItem(AT_KEY, String(ms))
  } catch {
    /* ignore */
  }
}

/** set once the one-time "Prompter off" change has been made to an older Universitas Indonesia install */
const PROMPTER_OFF_KEY = 'di.ui.prompterOff'

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    // the Universitas Indonesia build has Prompter off: installs from before that default get it
    // turned off once, and turning it back on in Settings sticks
    if (CAMPUS && !localStorage.getItem(PROMPTER_OFF_KEY)) {
      localStorage.setItem(PROMPTER_OFF_KEY, '1')
      if (saved.hiddenPages && !saved.hiddenPages.includes('prompter')) saved.hiddenPages = [...saved.hiddenPages, 'prompter']
    }
    const merged = { ...DEFAULTS, ...saved }
    // the Universitas Indonesia build has no Astra: whatever was saved, she stays off
    if (CAMPUS) merged.assistant = false
    // a model that is no longer offered (it did not load on every computer) falls back to the default
    if (!LOCAL_MODELS.some(([id]) => id === merged.assistantLocalModel)) merged.assistantLocalModel = DEFAULT_LOCAL_MODEL
    // brains that are no longer offered (Ollama) fall back to the built-in one
    if (merged.assistantEngine !== 'claude') merged.assistantEngine = 'local'
    if (!['base', 'small'].includes(merged.assistantListenModel)) merged.assistantListenModel = 'small'
    // "Pip" was the mascot's name before Astra, so anyone still on it never picked it
    if (merged.mascotName === 'Pip') merged.mascotName = DEFAULTS.mascotName
    normalizeOutfit(merged)
    return merged
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)

  const update = useCallback((patch: Partial<Settings>) => {
    if (Object.keys(patch).some((k) => !LOCAL_ONLY.includes(k as keyof Settings))) setLocalAt(Date.now())
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  /** take the account's copy without counting it as a change made here */
  const adopt = useCallback((remote: Partial<Settings>, at: number) => {
    setLocalAt(at)
    setSettings((s) => {
      const next = { ...s }
      for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        if (!LOCAL_ONLY.includes(k) && k in remote) (next as Record<string, unknown>)[k] = remote[k]
      }
      if (!LOCAL_MODELS.some(([id]) => id === next.assistantLocalModel)) next.assistantLocalModel = DEFAULT_LOCAL_MODEL
      if (next.assistantEngine !== 'claude') next.assistantEngine = 'local'
      // the account's copy may still hold the old default name
      if (next.mascotName === 'Pip') next.mascotName = DEFAULTS.mascotName
      // an older device may still send the single shared accessory colour
      if (remote.mascotAccessoryColor) next.mascotAccessoryColor = remote.mascotAccessoryColor
      normalizeOutfit(next)
      return next
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* ignore */
    }
  }, [settings])

  // push the settings Rust cares about
  useEffect(() => {
    if (!IS_TAURI) return
    invoke('set_monitor', { index: settings.monitor }).catch(() => {})
    invoke('set_hide_on_fullscreen', { enabled: settings.hideInFullscreen }).catch(() => {})
  }, [settings.monitor, settings.hideInFullscreen])

  useEffect(() => {
    if (!IS_TAURI) return
    invoke('set_offset', { x: settings.posX, y: settings.posY }).catch(() => {})
  }, [settings.posX, settings.posY])

  // a position saved on a bigger display (or by an older version that let the pill go lower) can lie outside the
  // screen; Rust keeps the hit area on screen, so the pill would be drawn where it cannot be clicked. Bring it back.
  useEffect(() => {
    if (!IS_TAURI) return
    const c = clampPos(settings.posX, settings.posY)
    if (c.x !== settings.posX || c.y !== settings.posY) update({ posX: c.x, posY: c.y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.posX, settings.posY])

  // the window has to grow and shrink with the island
  useEffect(() => {
    if (!IS_TAURI) return
    invoke('set_window_size', { w: STAGE.w * settings.scale, h: STAGE.h * settings.scale }).catch(() => {})
  }, [settings.scale])

  return { settings, update, adopt }
}

/**
 * Keeps the settings on the signed-in account (supabase/settings.sql), so an update or a reinstall
 * followed by a sign-in brings them back. Whichever side changed last wins when signing in;
 * after that every change here is uploaded.
 */
export function useSettingsSync(
  userId: string | null,
  settings: Settings,
  adopt: (remote: Partial<Settings>, at: number) => void,
) {
  // JSON of what the account holds; null until the first sync of this sign-in is done
  const sent = useRef<string | null>(null)
  const latest = useRef(settings)
  latest.current = settings

  useEffect(() => {
    sent.current = null
    if (!BACKEND_READY || !userId) return
    let live = true
    ;(async () => {
      const { data, error } = await supabase.from('user_settings').select('data, updated_at').eq('user_id', userId).maybeSingle()
      if (!live || error) return // table missing or offline: keep working locally
      const remoteAt = data ? Date.parse(data.updated_at as string) : 0
      if (data && remoteAt >= localAt()) {
        const remote = data.data as Partial<Settings>
        adopt(remote, remoteAt)
        sent.current = JSON.stringify(synced({ ...latest.current, ...remote }))
        return
      }
      const body = synced(latest.current)
      const { error: upErr } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, data: body, updated_at: new Date(localAt() || Date.now()).toISOString() }, { onConflict: 'user_id' })
      if (live && !upErr) sent.current = JSON.stringify(body)
    })()
    return () => {
      live = false
    }
  }, [userId, adopt])

  // upload changes, a moment after the last one so dragging a slider is one write
  useEffect(() => {
    if (!BACKEND_READY || !userId || sent.current === null) return
    const body = synced(settings)
    const json = JSON.stringify(body)
    if (json === sent.current) return
    const t = window.setTimeout(async () => {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, data: body, updated_at: new Date(localAt() || Date.now()).toISOString() }, { onConflict: 'user_id' })
      if (!error) sent.current = json
    }, 1500)
    return () => window.clearTimeout(t)
  }, [userId, settings])
}
