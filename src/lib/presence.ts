import type { Profile } from './supabase'

export type Presence = 'online' | 'idle' | 'dnd' | 'invisible'

/** What others see: someone who is invisible looks offline. */
export type Shown = Presence | 'offline'

export const PRESENCES: { id: Presence; label: string; hint: string }[] = [
  { id: 'online', label: 'Online', hint: '' },
  { id: 'idle', label: 'Idle', hint: '' },
  { id: 'dnd', label: 'Do Not Disturb', hint: 'You will not get message alerts' },
  { id: 'invisible', label: 'Invisible', hint: 'You will appear offline' },
]

export const presenceOf = (p: Pick<Profile, 'presence'>): Presence => p.presence ?? 'online'

export const shownPresence = (p: Pick<Profile, 'presence'>): Shown => {
  const v = presenceOf(p)
  return v === 'invisible' ? 'offline' : v
}

export const SHOWN_LABEL: Record<Shown, string> = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' }
