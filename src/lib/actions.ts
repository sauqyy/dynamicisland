import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import { toolOn, TOOLS, type Alias, type Routine, type Settings, type ToolId } from './settings'
import { parseIntent } from './intents'

export type Action =
  | { type: 'open_app'; name: string }
  | { type: 'open_url'; url: string }
  | { type: 'search'; query: string }
  | { type: 'open_path'; path: string }
  | { type: 'media'; op: 'play' | 'pause' | 'next' | 'previous' }
  | { type: 'volume'; op: 'up' | 'down' | 'set' | 'mute' | 'unmute'; value?: number }
  | { type: 'timer'; minutes: number }
  | { type: 'todo'; text: string }
  | { type: 'routine'; name: string }
  | { type: 'power'; op: 'lock' | 'sleep' | 'shutdown' | 'restart' }

export type ActionSettings = Pick<Settings, 'assistantTools' | 'assistantAliases' | 'assistantRoutines'>

/** What the actions need from the rest of the app. */
export interface ActionApi {
  /** read fresh each time, so a change in Settings applies to the very next command */
  settings: () => ActionSettings
  startTimer: (minutes: number) => void
  addTodo: (text: string) => void
  isPlaying: () => boolean
  /** shows a yes / no question on the island; resolves false on "no", Esc or no answer */
  confirm: (question: string) => Promise<boolean>
}

interface AppEntry {
  name: string
  id: string
}

let apps: Promise<AppEntry[]> | null = null
/** The apps in the Start menu. Read once (it takes a moment) and kept. */
export function loadApps(refresh = false): Promise<AppEntry[]> {
  if (!IS_TAURI) return Promise.resolve([])
  if (!apps || refresh) apps = invoke<AppEntry[]>('app_list', { refresh }).catch(() => [])
  return apps
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const bare = (s: string) => squash(s).replace(/^(?:my|the) /, '')

/** What people call apps out loud, mapped to the name Windows lists them under. */
const NICKNAMES: Record<string, string> = {
  'vs code': 'visual studio code',
  vscode: 'visual studio code',
  'ms word': 'word',
  'ms excel': 'excel',
  'ms powerpoint': 'powerpoint',
  calc: 'calculator',
  cmd: 'command prompt',
  'file explorer': 'file explorer',
  explorer: 'file explorer',
  browser: 'edge',
  'task manager': 'task manager',
}

/** The best installed app for what was said ("spotify", "vs code", "chrome"), or null if nothing is close. */
export function matchApp(query: string, list: AppEntry[]): AppEntry | null {
  const q = NICKNAMES[bare(query)] ?? bare(query)
  if (!q) return null
  let best: AppEntry | null = null
  let bestScore = 0
  for (const a of list) {
    const n = squash(a.name)
    let score = 0
    if (n === q) score = 100
    else if (n.startsWith(`${q} `) || n.startsWith(q)) score = 85
    else if (n.split(' ').includes(q)) score = 70
    else if (n.includes(q)) score = 55
    else if (q.includes(n) && n.length >= 4) score = 50
    // a shorter name is the more likely one: "Word" before "Word Count Tool"
    score -= Math.min(10, Math.floor(n.length / 8))
    if (score > bestScore) [best, bestScore] = [a, score]
  }
  return bestScore >= 50 ? best : null
}

export function findAlias(aliases: Alias[], name: string): Alias | undefined {
  const q = bare(name)
  return aliases.find((a) => a.name.trim() && (bare(a.name) === q || squash(a.name) === squash(name)))
}

const looksLikePath = (s: string) => /^[a-z]:[\\/]/i.test(s) || s.startsWith('\\\\') || s.startsWith('/') || s.startsWith('~')

const call = <T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> => (IS_TAURI ? invoke<T>(cmd, args) : Promise.resolve(undefined as T))

function need(s: ActionSettings, id: ToolId) {
  if (!toolOn(s, id)) throw `"${TOOLS.find((t) => t.id === id)?.label}" is turned off in Settings`
}

const nice = (m: number) => {
  if (m < 1) return `${Math.round(m * 60)} seconds`
  if (m % 60 === 0 && m >= 60) return `${m / 60} hour${m === 60 ? '' : 's'}`
  const r = Math.round(m * 10) / 10
  return `${r} minute${r === 1 ? '' : 's'}`
}

async function openUrl(raw: string): Promise<string> {
  let url = raw.trim().replace(/\s+/g, '')
  if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`
  url = url.replace(/^http:\/\//i, 'https://')
  if (!url.startsWith('https://')) throw 'I can only open https links'
  try {
    await call('open_url', { url })
  } catch {
    throw "I couldn't open that link"
  }
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* keep the whole url */
  }
  return `Opening ${host}`
}

/** Runs one action and returns a short past-tense line for the island ("Opening Spotify"). Throws a sentence when it cannot. */
export async function runAction(a: Action, api: ActionApi, depth = 0): Promise<string> {
  const s = api.settings()
  switch (a.type) {
    case 'open_app': {
      need(s, 'open_app')
      // your own nicknames win: "my notes" can be a folder, a website or an app
      let name = a.name
      const alias = findAlias(s.assistantAliases, name)
      if (alias) {
        const t = alias.target.trim()
        if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return openUrl(t)
        if (looksLikePath(t)) {
          await call('open_path', { path: t })
          return `Opening ${alias.name}`
        }
        name = t
      }
      const app = matchApp(name, await loadApps())
      if (!app) throw `I couldn't find an app called ${name}`
      try {
        await call('app_launch', { id: app.id })
      } catch {
        throw `I couldn't start ${app.name}`
      }
      return `Opening ${app.name}`
    }
    case 'open_url':
      need(s, 'open_url')
      return openUrl(a.url)
    case 'search':
      need(s, 'web_search')
      return (await openUrl(`https://www.google.com/search?q=${encodeURIComponent(a.query)}`), `Searching for ${a.query}`)
    case 'open_path': {
      need(s, 'open_path')
      const trusted = s.assistantAliases.some((x) => x.target.trim().toLowerCase() === a.path.trim().toLowerCase())
      // a path can be a program, so anything that is not one of your own shortcuts has to be approved
      if (!trusted && !(await api.confirm(`Open ${a.path}?`))) throw 'Okay, I will leave it'
      await call('open_path', { path: a.path })
      return `Opening ${a.path.split(/[\\/]/).filter(Boolean).pop() ?? a.path}`
    }
    case 'media': {
      need(s, 'media')
      const playing = api.isPlaying()
      if (a.op === 'next') return (await call('media_next'), 'Next song')
      if (a.op === 'previous') return (await call('media_prev'), 'Previous song')
      if (a.op === 'play') {
        if (playing) return 'Already playing'
        await call('media_toggle')
        return 'Playing'
      }
      if (!playing) return 'Already paused'
      await call('media_toggle')
      return 'Paused'
    }
    case 'volume': {
      need(s, 'volume')
      if (a.op === 'mute') return (await call('volume_mute', { mute: true }), 'Muted')
      if (a.op === 'unmute') return (await call('volume_mute', { mute: false }), 'Unmuted')
      const level = a.op === 'set' ? await call<number>('volume_set', { level: Math.max(0, Math.min(100, Math.round(a.value ?? 50))) }) : await call<number>('volume_adjust', { delta: a.op === 'up' ? 10 : -10 })
      return `Volume ${level ?? (a.op === 'set' ? a.value : '')}%`.replace(' %', '')
    }
    case 'timer': {
      need(s, 'timer')
      if (!(a.minutes > 0) || a.minutes > 600) throw 'I can set timers from a few seconds up to ten hours'
      api.startTimer(a.minutes)
      return `Timer set for ${nice(a.minutes)}`
    }
    case 'todo': {
      need(s, 'todo')
      const text = a.text.trim()
      if (!text) throw 'What should I add?'
      api.addTodo(text)
      return `Added "${text}" to your to-dos`
    }
    case 'routine': {
      need(s, 'routine')
      if (depth > 0) throw 'A routine cannot start another routine'
      const r = s.assistantRoutines.find((x) => squash(x.name) === squash(a.name))
      if (!r) throw `I don't have a routine called ${a.name}`
      const lines = r.steps.split('\n').map((l) => l.trim()).filter(Boolean)
      if (!lines.length) throw `${r.name} has no steps yet`
      for (const line of lines) {
        const step = parseIntent(line, [])
        if (!step) throw `I don't understand "${line}" in ${r.name}`
        // a routine never locks or shuts the computer down on its own
        if (step.type === 'power' || step.type === 'routine') throw `${r.name} can't ${step.type === 'power' ? 'power the computer off' : 'start routines'}`
        await runAction(step, api, depth + 1)
      }
      return `Started ${r.name}`
    }
    case 'power': {
      need(s, 'power')
      const q = { lock: 'Lock the computer?', sleep: 'Put the computer to sleep?', shutdown: 'Shut the computer down?', restart: 'Restart the computer?' }[a.op]
      if (!(await api.confirm(q))) throw 'Okay, cancelled'
      await call('power_action', { action: a.op })
      return { lock: 'Locking', sleep: 'Going to sleep', shutdown: 'Shutting down in 20 seconds', restart: 'Restarting in 20 seconds' }[a.op]
    }
  }
}

/** A command you can say in plain words runs right here, with no call to Claude. Null means "not a simple command". */
export async function fastPath(text: string, api: ActionApi): Promise<{ reply: string; actions: string[] } | null> {
  const s = api.settings()
  const a = parseIntent(text, s.assistantRoutines)
  if (!a) return null
  if (a.type === 'open_app') {
    // "open the pod bay doors" is a conversation, not an app: only act when something real matches
    const known = findAlias(s.assistantAliases, a.name) || matchApp(a.name, await loadApps())
    if (!known) return null
  }
  const tool: Record<Action['type'], ToolId> = { open_app: 'open_app', open_url: 'open_url', search: 'web_search', open_path: 'open_path', media: 'media', volume: 'volume', timer: 'timer', todo: 'todo', routine: 'routine', power: 'power' }
  if (!toolOn(s, tool[a.type])) return null
  const r = await runAction(a, api)
  // the reply already says what was done, so a chip repeating it would show the same words twice
  return { reply: `${r}.`, actions: [] }
}

// ---- what Claude is allowed to ask for ----

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

const str = (description: string) => ({ type: 'string', description })

/** The tool list sent to Claude: only what is switched on in Settings. */
export function toolDefs(s: ActionSettings): ToolDef[] {
  const defs: [ToolId, ToolDef][] = [
    ['open_app', { name: 'open_app', description: 'Open an installed app on the computer, e.g. Spotify, Chrome, Notepad. Also works for the user\'s own shortcut names.', input_schema: { type: 'object', properties: { name: str('The app or shortcut name') }, required: ['name'] } }],
    ['open_url', { name: 'open_url', description: 'Open a website in the default browser.', input_schema: { type: 'object', properties: { url: str('The https address, e.g. https://youtube.com') }, required: ['url'] } }],
    ['web_search', { name: 'web_search', description: 'Search Google in the browser. Use it when the user wants to look something up on the web.', input_schema: { type: 'object', properties: { query: str('What to search for') }, required: ['query'] } }],
    ['open_path', { name: 'open_path', description: 'Open a file or folder by its full path. The user is asked to approve it first.', input_schema: { type: 'object', properties: { path: str('Full path, e.g. C:\\Users\\me\\Documents') }, required: ['path'] } }],
    ['media', { name: 'control_music', description: 'Control the music that is playing.', input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'pause', 'next', 'previous'] } }, required: ['action'] } }],
    ['volume', { name: 'set_volume', description: 'Change the computer volume.', input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['up', 'down', 'set', 'mute', 'unmute'] }, level: { type: 'number', description: 'Percent 0-100, only for "set"' } }, required: ['action'] } }],
    ['timer', { name: 'start_timer', description: 'Start the island timer.', input_schema: { type: 'object', properties: { minutes: { type: 'number', description: 'Length in minutes; may be a fraction' } }, required: ['minutes'] } }],
    ['todo', { name: 'add_todo', description: 'Add an item to the user\'s to-do list.', input_schema: { type: 'object', properties: { text: str('The to-do text') }, required: ['text'] } }],
    ['routine', { name: 'run_routine', description: `Run one of the user's own routines. They have: ${s.assistantRoutines.map((r) => r.name).filter(Boolean).join(', ') || 'none'}.`, input_schema: { type: 'object', properties: { name: str('The routine name') }, required: ['name'] } }],
    ['power', { name: 'power_action', description: 'Lock, sleep, shut down or restart the computer. The user is asked to confirm.', input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['lock', 'sleep', 'shutdown', 'restart'] } }, required: ['action'] } }],
  ]
  return defs.filter(([id]) => toolOn(s, id) && (id !== 'routine' || s.assistantRoutines.length > 0)).map(([, d]) => d)
}

/** Claude's tool call, turned into one of our actions (or null if it makes no sense). */
export function toolToAction(name: string, input: Record<string, unknown>): Action | null {
  const text = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'open_app':
      return text('name') ? { type: 'open_app', name: text('name') } : null
    case 'open_url':
      return text('url') ? { type: 'open_url', url: text('url') } : null
    case 'web_search':
      return text('query') ? { type: 'search', query: text('query') } : null
    case 'open_path':
      return text('path') ? { type: 'open_path', path: text('path') } : null
    case 'control_music':
      return ['play', 'pause', 'next', 'previous'].includes(text('action')) ? { type: 'media', op: text('action') as 'play' } : null
    case 'set_volume':
      return ['up', 'down', 'set', 'mute', 'unmute'].includes(text('action')) ? { type: 'volume', op: text('action') as 'up', value: typeof input.level === 'number' ? input.level : undefined } : null
    case 'start_timer':
      return typeof input.minutes === 'number' ? { type: 'timer', minutes: input.minutes } : null
    case 'add_todo':
      return text('text') ? { type: 'todo', text: text('text') } : null
    case 'run_routine':
      return text('name') ? { type: 'routine', name: text('name') } : null
    case 'power_action':
      return ['lock', 'sleep', 'shutdown', 'restart'].includes(text('action')) ? { type: 'power', op: text('action') as 'lock' } : null
    default:
      return null
  }
}

export type { Alias, Routine }
