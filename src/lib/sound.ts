import { useEffect } from 'react'
import { bind, play, setEnabled, unlock } from 'cuelume'

/*
 * Interface sounds (cuelume). Most controls are marked in the markup with data-cuelume-* attributes,
 * which one bind() at the root wires up; what is not a click on one control (the card opening, page
 * changes, alerts, keyboard picks) plays from code. Settings can turn them off.
 */

/** Wires every marked control and follows the Interface sounds setting. Mounted once, in App. */
export function useSoundSetup(enabled: boolean) {
  useEffect(() => bind(), [])
  useEffect(() => setEnabled(enabled), [enabled])
}

/**
 * Turning sound off is heard through the switch's own binding (it plays before the setting changes);
 * turning it on was silent there, so it sounds here, from the click that may need to start audio.
 */
export function soundTurnedOn() {
  setEnabled(true)
  void unlock()
  play('toggle')
}

/** The cue for a control that opens and closes something: open while it is closed, close while open. */
export const disclosureCue = (open: boolean) => (open ? { 'data-cuelume-close': '' } : { 'data-cuelume-open': '' })
