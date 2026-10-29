const KEY = 'di.updateSeen'

/** The update version whose pill they have already hovered; a newer version brings the pill back. */
export function updateSeen(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function markUpdateSeen(version: string) {
  try {
    if (version) localStorage.setItem(KEY, version)
    else localStorage.removeItem(KEY)
  } catch {
    /* the pill just shows again next launch */
  }
}
