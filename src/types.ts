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
  | 'friends'
  | 'profile'
  | 'settings'

export const PAGES: { id: Tab; title: string }[] = [
  { id: 'media', title: 'Now Playing' },
  { id: 'weather', title: 'Weather' },
  { id: 'timer', title: 'Timer' },
  { id: 'todo', title: 'To-do' },
  { id: 'notes', title: 'Notes' },
  { id: 'clipboard', title: 'Clipboard' },
  { id: 'shelf', title: 'Shelf' },
  { id: 'apps', title: 'Apps' },
  { id: 'friends', title: 'Friends' },
  { id: 'profile', title: 'Profile' },
  { id: 'settings', title: 'Settings' },
]

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
  /** shown instead of the icon, e.g. the friend who wrote */
  avatar?: { avatar_emoji: string; avatar_color: string; avatar_url?: string | null }
  /** clicking the alert opens the chat with this friend */
  chatWith?: string
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
