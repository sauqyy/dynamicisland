import { useEffect } from 'react'
import { bind, play, setEnabled, setTheme, setVolume, unlock, type ThemeName } from 'cuelume'
import type { SoundPack } from './settings'

/*
 * Interface sounds (cuelume). Most controls are marked in the markup with data-cuelume-* attributes,
 * which one bind() at the root wires up; what is not a click on one control (the card opening, page
 * changes, alerts, keyboard picks) plays from code. Settings can turn them off and pick the pack.
 */

/** Our pack names to cuelume's themes: what cuelume calls 'default' is 'basic' here. */
export const soundTheme = (pack: SoundPack): ThemeName => (pack === 'basic' ? 'default' : pack)

/** Wires every marked control and follows the Interface sounds settings. Mounted once, in App. */
export function useSoundSetup(enabled: boolean, pack: SoundPack, volume: number, typing: boolean) {
  useEffect(() => bind(), [])
  useEffect(() => setEnabled(enabled), [enabled])
  useEffect(() => setTheme(soundTheme(pack)), [pack])
  useEffect(() => setVolume(volume), [volume])
  useEffect(() => {
    if (typing) return
    // cuelume reads data-cuelume-type while it handles the keydown, so the mark is lifted for that one
    // event (our capture listener runs first) and put back right after
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target.closest('[data-cuelume-type]') : null
      if (!el) return
      const value = el.getAttribute('data-cuelume-type') ?? ''
      el.removeAttribute('data-cuelume-type')
      setTimeout(() => el.setAttribute('data-cuelume-type', value), 0)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [typing])
}

/**
 * Picking a pack: sounds come on at once (this may be the click that unmutes, and the one that has to
 * start audio), with a preview in the new pack rather than the old one the setting still holds.
 */
export function previewPack(pack: SoundPack) {
  setEnabled(true)
  void unlock()
  play('select', { theme: soundTheme(pack) })
}

/** The cue for a control that opens and closes something: open while it is closed, close while open. */
export const disclosureCue = (open: boolean) => (open ? { 'data-cuelume-close': '' } : { 'data-cuelume-open': '' })
