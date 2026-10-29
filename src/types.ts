import type { LyricLine } from './lib/lyrics'

export type Tab =
  | 'astra'
  | 'media'
  | 'weather'
  | 'timer'
  | 'todo'
  | 'notes'
  | 'prompter'
  | 'deadlines'
  | 'schedule'
  | 'study'
  | 'clipboard'
  | 'shelf'
  | 'apps'
  | 'friends'
  | 'groups'
  | 'profile'
  | 'settings'

export const PAGES: { id: Tab; title: string }[] = [
  { id: 'astra', title: 'Chat with Astra' },
  { id: 'media', title: 'Now Playing' },
  { id: 'weather', title: 'Weather' },
  { id: 'timer', title: 'Timer' },
  { id: 'todo', title: 'To-do' },
  { id: 'notes', title: 'Notes' },
  { id: 'prompter', title: 'Prompter' },
  { id: 'deadlines', title: 'Deadlines' },
  { id: 'schedule', title: 'Schedule' },
  { id: 'study', title: 'Study' },
  { id: 'clipboard', title: 'Clipboard' },
  { id: 'shelf', title: 'Shelf' },
  { id: 'apps', title: 'Apps' },
  { id: 'friends', title: 'Friends' },
  { id: 'groups', title: 'Groups' },
  { id: 'profile', title: 'Profile' },
  { id: 'settings', title: 'Settings' },
]

/** Pages are grouped so the card has 5 places to go instead of 11 pages in a row. */
export const GROUPS: { id: string; title: string; icon: string; pages: Tab[] }[] = [
  { id: 'astra', title: 'Astra', icon: '✨', pages: ['astra'] },
  { id: 'home', title: 'Home', icon: '🎵', pages: ['media', 'weather', 'timer'] },
  { id: 'tools', title: 'Tools', icon: '🛠️', pages: ['todo', 'notes', 'prompter'] },
  { id: 'plan', title: 'Plan', icon: '📅', pages: ['deadlines', 'schedule', 'study'] },
  { id: 'files', title: 'Files', icon: '🗂️', pages: ['shelf', 'apps', 'clipboard'] },
  { id: 'social', title: 'Social', icon: '👥', pages: ['friends', 'groups', 'profile'] },
  { id: 'settings', title: 'Settings', icon: '⚙️', pages: ['settings'] },
]

/** Short names for the tabs inside a group. */
export const SHORT: Record<Tab, string> = {
  astra: 'Astra',
  media: 'Playing',
  weather: 'Weather',
  timer: 'Timer',
  todo: 'To-do',
  notes: 'Notes',
  prompter: 'Prompter',
  deadlines: 'Deadlines',
  schedule: 'Schedule',
  study: 'Study',
  clipboard: 'Clipboard',
  shelf: 'Shelf',
  apps: 'Apps',
  friends: 'Friends',
  groups: 'Groups',
  profile: 'Profile',
  settings: 'Settings',
}

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
  /** alerts of one kind (volume, brightness) update in place instead of re-fading on every change */
  kind?: string
  /** 0–100, renders a liquid bar */
  value?: number
  /** shown instead of the icon, e.g. the friend who wrote */
  avatar?: { avatar_emoji: string; avatar_color: string; avatar_url?: string | null }
  /** clicking the alert opens the chat with this friend */
  chatWith?: string
  /** a new song started: drawn with the current track's art, opens Playing when clicked */
  nowPlaying?: boolean
  /** clicking the alert opens this page */
  openTab?: Tab
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
