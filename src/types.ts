import type { LyricLine } from './lib/lyrics'
import { CAMPUS } from './lib/campus'

export type Tab =
  | 'astra'
  | 'today'
  | 'media'
  | 'weather'
  | 'timer'
  | 'todo'
  | 'notes'
  | 'prompter'
  | 'deadlist'
  | 'schedule'
  | 'study'
  | 'clipboard'
  | 'deadlines'
  | 'classes'
  | 'inbox'
  | 'shelf'
  | 'apps'
  | 'friends'
  | 'groups'
  | 'profile'
  | 'settings'

type Group = { id: string; title: string; icon: string; pages: Tab[] }

/**
 * The Universitas Indonesia build, grouped by what you're doing rather than where things come from:
 * your day at a glance, your courses, getting something done, and people. Your own deadlines are on
 * Due with SCELE's (Deadlines is only there before Campus unlocks), and the pages most students
 * don't need start hidden (see settings.ts).
 */
const CAMPUS_GROUPS: Group[] = [
  { id: 'home', title: 'Today', icon: '🏠', pages: ['today', 'media', 'weather'] },
  { id: 'campus', title: 'Campus', icon: '🎓', pages: ['classes', 'deadlines', 'inbox'] },
  { id: 'focus', title: 'Focus', icon: '🎯', pages: ['todo', 'timer', 'notes', 'clipboard', 'deadlist', 'schedule', 'prompter'] },
  { id: 'social', title: 'People', icon: '👥', pages: ['friends', 'groups', 'profile'] },
  { id: 'files', title: 'Files', icon: '🗂️', pages: ['shelf', 'apps'] },
  { id: 'settings', title: 'Settings', icon: '⚙️', pages: ['settings'] },
]

/** Pages are grouped so the card has 5 places to go instead of 11 pages in a row. */
const REGULAR_GROUPS: Group[] = [
  { id: 'astra', title: 'Astra', icon: '✨', pages: ['astra'] },
  { id: 'home', title: 'Home', icon: '🎵', pages: ['media', 'weather', 'timer'] },
  { id: 'tools', title: 'Tools', icon: '🛠️', pages: ['todo', 'notes', 'prompter'] },
  { id: 'plan', title: 'Plan', icon: '📅', pages: ['deadlist', 'schedule', 'study'] },
  { id: 'campus', title: 'Campus', icon: '🎓', pages: ['deadlines', 'classes', 'inbox'] },
  { id: 'files', title: 'Files', icon: '🗂️', pages: ['shelf', 'apps', 'clipboard'] },
  { id: 'social', title: 'Social', icon: '👥', pages: ['friends', 'groups', 'profile'] },
  { id: 'settings', title: 'Settings', icon: '⚙️', pages: ['settings'] },
]

export const GROUPS: Group[] = CAMPUS ? CAMPUS_GROUPS : REGULAR_GROUPS

const TITLES: Record<Tab, string> = {
  astra: 'Chat with Astra',
  today: 'Today',
  media: 'Now Playing',
  weather: 'Weather',
  timer: 'Timer',
  todo: 'To-do',
  notes: 'Notes',
  prompter: 'Prompter',
  deadlist: 'Deadlines',
  schedule: 'Schedule',
  study: 'Study',
  clipboard: 'Clipboard',
  deadlines: 'SCELE Deadlines',
  classes: 'SCELE Classes',
  inbox: 'SCELE Inbox',
  shelf: 'Shelf',
  apps: 'Apps',
  friends: 'Friends',
  groups: 'Groups',
  profile: 'Profile',
  settings: 'Settings',
}

/** Every page, in the order the bar shows them, which is also the order the arrow keys step through. */
export const PAGES: { id: Tab; title: string }[] = GROUPS.flatMap((g) => g.pages).map((id) => ({ id, title: TITLES[id] }))

/** Short names for the tabs inside a group. */
export const SHORT: Record<Tab, string> = {
  astra: 'Astra',
  today: 'Today',
  media: 'Playing',
  weather: 'Weather',
  timer: 'Timer',
  todo: 'To-do',
  notes: 'Notes',
  prompter: 'Prompter',
  deadlist: 'Deadlines',
  schedule: 'Schedule',
  study: 'Study',
  clipboard: 'Clipboard',
  deadlines: 'Due',
  classes: 'Classes',
  inbox: 'Inbox',
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
  /** clicking the alert opens the card on this page */
  openTab?: Tab
  /** Lumi's mood for it (Universitas Indonesia build); the app works it out from the icon when this is left out */
  lumi?: import('./mascot/lumi/moods').LumiMood
  /** buttons on the card (Lumi asks something) */
  actions?: { label: string; primary?: boolean; run: () => void }[]
  /** how long it stays, in ms */
  ms?: number
}

export interface TimerState {
  endsAt: number
  total: number
  /** what the timer is for, written when it was set: "Finish the OS report" */
  goal?: string
}

export interface StopwatchState {
  running: boolean
  startedAt: number
  /** ms accumulated before the current run */
  base: number
  laps: number[]
}

/** Something attached to a to-do: a file on this computer, or a web address. */
export interface TodoAttachment {
  id: string
  name: string
  /** a file or folder dropped on the island */
  path?: string
  /** a link added by hand */
  url?: string
  size?: number
  isDir?: boolean
}

export interface Todo {
  id: number
  text: string
  done: boolean
  /** a longer description, written in the to-do's details */
  note?: string  /** when it's due, ms; none for most to-dos */
  due?: number
  attachments?: TodoAttachment[]
}

export type PomoPhase = 'focus' | 'break' | 'long'

export interface PomodoroState {
  phase: PomoPhase
  /** focus sessions completed */
  done: number
}
