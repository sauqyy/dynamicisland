import type { Profile } from './supabase'

export type Presence = 'online' | 'idle' | 'dnd' | 'invisible'

/** What others see: someone who is invisible looks offline. */
export type Shown = Presence | 'offline'

export const PRESENCES: { id: Presence; label: string; hint: string }[] = [
  { id: 'online', label: 'Available', hint: 'Friends see you are around' },
  { id: 'idle', label: 'Away', hint: 'Switches on by itself after 5 minutes' },
  { id: 'dnd', label: 'Focus', hint: 'Message alerts are muted' },
  { id: 'invisible', label: 'Hidden', hint: 'Friends see you as offline' },
]

export const presenceOf = (p: Pick<Profile, 'presence'>): Presence => p.presence ?? 'online'

/** The app reports in this often (ms)... */
export const HEARTBEAT_EVERY = 60_000
/** ...and someone silent for this long (ms) has closed it. */
export const OFFLINE_AFTER = 3 * 60_000

export const shownPresence = (p: Pick<Profile, 'presence' | 'last_seen'>): Shown => {
  const v = presenceOf(p)
  if (v === 'invisible') return 'offline'
  // rows from before last_seen existed have no heartbeat to judge by
  if (p.last_seen && Date.now() - Date.parse(p.last_seen) > OFFLINE_AFTER) return 'offline'
  return v
}

export const SHOWN_LABEL: Record<Shown, string> = { online: 'Available', idle: 'Away', dnd: 'Focus', invisible: 'Hidden', offline: 'Offline' }
