const KEY = 'di.astraIntro'

/** Whether the Astra (beta) welcome has been answered on this computer; it shows once, whatever the answer. */
export function astraIntroSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}

export function markAstraIntro(use: boolean) {
  try {
    localStorage.setItem(KEY, use ? 'yes' : 'no')
  } catch {
    /* the card just shows again next launch */
  }
}
