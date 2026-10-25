import type { LyricLine } from './lib/lyrics'

export type Tab =
  | 'media'
  | 'weather'
  | 'timer'
  | 'todo'
  | 'notes'
  | 'clipboard'
  | 'shelf'
  | 'apps'
  | 'settings'

export interface Track {
  id: string
  title: string
  artist: string
  /** seconds, 0 when unknown (live streams) */
  duration: number
  hue: number
  /** data: URL of the cover art, once Windows has provided it */
  art?: string
  lyrics: LyricLine[] | null
  lyricsLoading: boolean
}

export interface IslandAlert {
  id: number
  icon: string
  text: string
  sub?: string
  /** 0–100, renders a liquid bar */
  value?: number
}

export interface TimerState {
  endsAt: number
  total: number
}

export interface StopwatchState {
  running: boolean
  startedAt: number
  /** ms accumulated before the current run */
  base: number
  laps: number[]
}

export interface Todo {
  id: number
  text: string
  done: boolean
}

export type PomoPhase = 'focus' | 'break' | 'long'

export interface PomodoroState {
  phase: PomoPhase
  /** focus sessions completed */
  done: number
}
