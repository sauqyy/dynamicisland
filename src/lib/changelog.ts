export interface Release {
  version: string
  title: string
  items: string[]
}

/** Newest first. Add an entry here when you bump the version; it shows once in the island after the update installs. */
export const CHANGELOG: Release[] = [
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
