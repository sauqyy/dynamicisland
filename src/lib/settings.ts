import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

export type Anim = 'bouncy' | 'smooth' | 'snappy'

export interface Settings {
  /** 0 = primary monitor, n = n-th monitor */
  monitor: number
  hideInFullscreen: boolean
  anim: Anim
  clock24: boolean
  accent: string
  /** city for the weather page */
  city: string
  fahrenheit: boolean
}

export const ACCENTS = ['#4ade80', '#60a5fa', '#c084fc', '#f472b6', '#fb923c']

export const SPRINGS: Record<Anim, { stiffness: number; damping: number; mass: number }> = {
  bouncy: { stiffness: 380, damping: 28, mass: 0.9 },
  smooth: { stiffness: 220, damping: 30, mass: 1 },
  snappy: { stiffness: 620, damping: 42, mass: 0.8 },
}

const DEFAULTS: Settings = {
  monitor: 0,
  hideInFullscreen: true,
  anim: 'bouncy',
  clock24: true,
  accent: ACCENTS[0],
  city: '',
  fahrenheit: false,
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

  return { settings, update }
}
