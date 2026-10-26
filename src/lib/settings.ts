import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

export type Anim = 'bouncy' | 'smooth' | 'snappy'
export type IdleDisplay = 'clock' | 'lyrics'

export interface Settings {
  /** 0 = primary monitor, n = n-th monitor */
  monitor: number
  hideInFullscreen: boolean
  anim: Anim
  clock24: boolean
  accent: string
  /** what the small pill shows: the clock, or the current lyric line when there is one */
  idle: IdleDisplay
  /** city for the weather page */
  city: string
  fahrenheit: boolean
  /** overall size of the island, 1 = default */
  scale: number
  /** size of the opened card in design px (before scale) */
  cardW: number
  cardH: number
}

export const ACCENTS = ['#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#fb923c']

export const SPRINGS: Record<Anim, { stiffness: number; damping: number; mass: number }> = {
  bouncy: { stiffness: 380, damping: 28, mass: 0.9 },
  smooth: { stiffness: 220, damping: 30, mass: 1 },
  snappy: { stiffness: 620, damping: 42, mass: 0.8 },
}

/** Design-space size of the stage the island is drawn in (must match .stage in App.css). */
export const STAGE = { w: 520, h: 340 }

export const SIZE_LIMITS = {
  scale: { min: 0.8, max: 1.4, step: 0.05 },
  cardW: { min: 400, max: 490, step: 10 },
  cardH: { min: 280, max: 330, step: 2 },
}

export const SIZE_DEFAULTS = { scale: 1, cardW: 460, cardH: 308 }

const DEFAULTS: Settings = {
  monitor: 0,
  hideInFullscreen: true,
  anim: 'bouncy',
  clock24: true,
  accent: ACCENTS[0],
  idle: 'clock',
  city: '',
  fahrenheit: false,
  ...SIZE_DEFAULTS,
}

const KEY = 'di.settings'

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }
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

  // the window has to grow and shrink with the island
  useEffect(() => {
    if (!IS_TAURI) return
    invoke('set_window_size', { w: STAGE.w * settings.scale, h: STAGE.h * settings.scale }).catch(() => {})
  }, [settings.scale])

  return { settings, update }
}
