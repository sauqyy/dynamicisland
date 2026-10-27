export interface Release {
  version: string
  title: string
  items: string[]
}

/** Newest first. Add an entry here when you bump the version; it shows once in the island after the update installs. */
export const CHANGELOG: Release[] = [
  {
    version: '0.4.0',
    title: 'Group chats, voice calls',
    items: [
      'Create group chats with your friends from the new Groups page.',
      'Call a friend with the button next to Send in their chat. Audio goes straight between your apps.',
      'Sound volume slider and a keyboard sounds switch in Settings.',
      'Opening the app a second time no longer starts a second island.',
    ],
  },
  {
    version: '0.3.12',
    title: 'Sound effects',
    items: [
      'The island now makes small sounds as you use it: a tap when it opens, a soft close when it shuts, and a cue for each alert.',
      'Pick a sound pack in Settings (Mech, Basic, Bubble or Press), or mute it.',
    ],
  },
  {
    version: '0.3.11',
    title: 'Offline status, brightness',
    items: [
      'Friends now show as offline once your app has been closed for a few minutes, instead of staying Available.',
      'Changing the screen brightness shows an alert in the island.',
      'Chats group messages by day (Today, Yesterday, weekday or date).',
    ],
  },
  {
    version: '0.3.10',
    title: 'Smoother fullscreen',
    items: ['Fixed the island jumping for a moment when entering or leaving fullscreen chat.'],
  },
  {
    version: '0.3.9',
    title: 'Fullscreen chat',
    items: [
      'Chats have a fullscreen button: the island grows to fill the screen and shrinks back smoothly.',
      'In fullscreen your contacts sit on the left, so you can switch chats without leaving.',
      'Esc leaves fullscreen.',
    ],
  },
]

const SEEN_KEY = 'di.seenVersion'

/**
 * The release to announce for this launch, or null. A first install just records the version,
 * so the card only appears after an update, and only when the changelog has an entry for it.
 */
export function releaseToShow(current: string): Release | null {
  try {
    const seen = localStorage.getItem(SEEN_KEY)
    localStorage.setItem(SEEN_KEY, current)
    if (!seen || seen === current) return null
  } catch {
    return null
  }
  return CHANGELOG.find((r) => r.version === current) ?? null
}
