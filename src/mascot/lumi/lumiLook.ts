import { useSyncExternalStore } from 'react'
import { LUMI_LOOK_DEFAULT, type LumiLook } from '../../lib/settings'

/**
 * How the user has made Lumi look (the Lumi page), shared with every place she is drawn: the pill, her cards,
 * the intro, Lock-in. App sets it from the settings; a face given its own `look` (the page's preview) uses that.
 */
let current: LumiLook = LUMI_LOOK_DEFAULT
const listeners = new Set<() => void>()

export function setLumiLook(look: LumiLook) {
  if (look === current) return
  current = look
  listeners.forEach((l) => l())
}

export function useLumiLook(): LumiLook {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
