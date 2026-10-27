import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import type { Tab } from '../types'

export type Anim = 'bouncy' | 'smooth' | 'snappy'
export type GlassTint = 'dark' | 'light' | 'gradient'
export type TabAnim = 'fade' | 'slide' | 'liquid' | 'zoom' | 'stack' | 'flip' | 'blur' | 'rise' | 'morph' | 'elastic'

export const TAB_ANIMS: TabAnim[] = ['fade', 'slide', 'liquid', 'zoom', 'stack', 'flip', 'blur', 'rise', 'morph', 'elastic']
export type Theme = 'dark' | 'light' | 'glass' | 'auto'
export type IdleDisplay = 'clock' | 'lyrics' | 'weather'
/** cuelume's themes; 'basic' is the one cuelume calls 'default' */
export type SoundPack = 'mech' | 'basic' | 'bubble' | 'press'

export const SOUND_PACKS: SoundPack[] = ['mech', 'basic', 'bubble', 'press']

export interface Settings {
  /** 0 = primary monitor, n = n-th monitor */
  monitor: number
  hideInFullscreen: boolean
  anim: Anim
  clock24: boolean
  accent: string
  /** tint the UI with the colour of the track that is playing instead of `accent` */
  accentFromMusic: boolean
  theme: Theme
  /** how pages change inside the open card */
  tabAnim: TabAnim
  /** colour of the glass: only used by the glass theme */
  glassTint: GlassTint
  /** share what you are doing with friends (listening, timer) */
  shareActivity: boolean
  /** what the small pill shows: the clock, or the current lyric line when there is one */
  idle: IdleDisplay
  /** equalizer bars next to the idle text while music plays */
  idleBars: boolean
  /** play a sound when a chat message arrives */
  messageSound: boolean
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
}

export const ACCENTS = ['#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#fb923c', '#facc15', '#f87171', '#2dd4bf']

export const SPRINGS: Record<Anim, { stiffness: number; damping: number; mass: number }> = {
  bouncy: { stiffness: 380, damping: 28, mass: 0.9 },
  smooth: { stiffness: 220, damping: 30, mass: 1 },
  snappy: { stiffness: 620, damping: 42, mass: 0.8 },
}

/** Design-space size of the stage the island is drawn in (must match .stage in App.css). */
export const STAGE = { w: 520, h: 364 }

export const SIZE_LIMITS = {
  scale: { min: 0.8, max: 1.4, step: 0.05 },
  cardW: { min: 400, max: 490, step: 10 },
  cardH: { min: 300, max: 352, step: 2 },
  clockSize: { min: 12, max: 22, step: 1 },
  lyricOffset: { min: -1.5, max: 1.5, step: 0.05 },
  soundVolume: { min: 0, max: 1, step: 0.05 },
}

export const SIZE_DEFAULTS = { scale: 1, cardW: 460, cardH: 344 }

const DEFAULTS: Settings = {
  monitor: 0,
  hideInFullscreen: true,
  anim: 'bouncy',
  clock24: true,
  accent: ACCENTS[0],
  accentFromMusic: false,
  theme: 'dark',
  tabAnim: 'slide',
  glassTint: 'dark',
  shareActivity: false,
  idle: 'lyrics',
  idleBars: true,
  messageSound: true,
  uiSounds: true,
  soundPack: 'mech',
  soundVolume: 1,
  typingSounds: true,
  clockSize: 15,
  lyricOffset: 0.35,
  hiddenPages: [],
  clipPaused: false,
  clipMask: false,
  clipAutoClear: 5,
  clipSkipSecrets: true,
  posX: 0,
  posY: 0,
  city: '',
  cityLat: null,
  cityLon: null,
  fahrenheit: false,
  ...SIZE_DEFAULTS,
}

const KEY = 'di.settings'

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    // the old default card height was too short for the new tabs and dock
    if (saved.cardH === 308 || saved.cardH === 330) saved.cardH = SIZE_DEFAULTS.cardH
    return { ...DEFAULTS, ...saved }
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
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

  // the window has to grow and shrink with the island
  useEffect(() => {
    if (!IS_TAURI) return
    invoke('set_window_size', { w: STAGE.w * settings.scale, h: STAGE.h * settings.scale }).catch(() => {})
  }, [settings.scale])

  return { settings, update }
}
