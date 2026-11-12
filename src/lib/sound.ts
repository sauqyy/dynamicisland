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
  useEffect(() => setChimeSettings(enabled, volume), [enabled, volume])
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

/*
 * Timer chimes. A Pomodoro round needs sounds you can tell apart without looking: a soft falling one when
 * it is time to rest, a fuller one for the long break, a bright rising one for back to focus, and double
 * beeps when a plain timer runs out. They are synthesized here, so there is nothing to download, and they
 * follow the Interface sounds switch and volume.
 */
export type Chime = 'rest' | 'long' | 'focus' | 'done'

let chimeEnabled = true
let chimeVolume = 0.7
let chimeCtx: AudioContext | null = null

/** Kept in step with Settings by useSoundSetup. */
export function setChimeSettings(enabled: boolean, volume: number) {
  chimeEnabled = enabled
  chimeVolume = Math.min(1, Math.max(0, volume))
}

function tone(ctx: AudioContext, freq: number, at: number, length: number, type: OscillatorType, gain: number) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + length + 0.05)
}

export function playChime(kind: Chime) {
  if (!chimeEnabled || chimeVolume <= 0) return
  try {
    chimeCtx = chimeCtx ?? new AudioContext()
    if (chimeCtx.state === 'suspended') void chimeCtx.resume()
    const ctx = chimeCtx
    const t = ctx.currentTime + 0.03
    const v = 0.25 * chimeVolume
    const bell = (f: number, at: number, len: number, gain: number) => {
      tone(ctx, f, t + at, len, 'sine', gain)
      tone(ctx, f * 2.01, t + at, len * 0.6, 'sine', gain * 0.25)
    }
    if (kind === 'rest') [1046.5, 783.99, 659.25, 523.25].forEach((f, i) => bell(f, i * 0.22, 1.1, v * 0.8))
    else if (kind === 'long') [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, i * 0.28, 1.6, v * 0.7))
    else if (kind === 'focus') {
      ;[659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.3, 'triangle', v))
      tone(ctx, 1318.5, t + 0.42, 0.8, 'triangle', v * 0.9)
    } else [0, 0.24, 0.48, 0.9, 1.14, 1.38].forEach((at) => tone(ctx, 880, t + at, 0.15, 'triangle', v))
  } catch {
    /* no audio available */
  }
}
