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

export const shownPresence = (p: Pick<Profile, 'presence'>): Shown => {
  const v = presenceOf(p)
  return v === 'invisible' ? 'offline' : v
}

export const SHOWN_LABEL: Record<Shown, string> = { online: 'Available', idle: 'Away', dnd: 'Focus', invisible: 'Hidden', offline: 'Offline' }
