import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

const KEY = 'di.audio'

export interface AudioPrefs {
  /** microphone device id; '' is the system default */
  micId: string
  /** speaker device id; '' is the system default */
  speakerId: string
}

function load(): AudioPrefs {
  try {
    return { micId: '', speakerId: '', ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AudioPrefs>) }
  } catch {
    return { micId: '', speakerId: '' }
  }
}

let prefs = load()
const subs = new Set<() => void>()
const subscribe = (fn: () => void) => {
  subs.add(fn)
  return () => void subs.delete(fn)
}

export function setAudioPrefs(next: Partial<AudioPrefs>) {
  prefs = { ...prefs, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}

export const useAudioPrefs = () => useSyncExternalStore(subscribe, () => prefs)

/** The chosen microphone, or the system default when none is chosen or it has been unplugged. */
export async function openMic(): Promise<MediaStream> {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  if (prefs.micId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: prefs.micId } } })
    } catch {
      /* gone or refused: use the default one */
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base })
}

type Sinkable = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
const outputs = new Set<WeakRef<HTMLAudioElement>>()

const route = (el: HTMLAudioElement) => void (el as Sinkable).setSinkId?.(prefs.speakerId).catch(() => {})

/** Plays this element through the chosen speaker, and follows it when the choice changes. */
export function trackOutput(el: HTMLAudioElement) {
  outputs.add(new WeakRef(el))
  route(el)
}

subscribe(() => {
  for (const ref of outputs) {
    const el = ref.deref()
    if (el) route(el)
    else outputs.delete(ref)
  }
})

export interface Devices {
  mics: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
  /** the browser only shows device names once microphone access has been allowed */
  named: boolean
  /** asks for microphone access so the names show up */
  allow: () => Promise<void>
}

/** The microphones and speakers on this computer, kept up to date as they are plugged in. */
export function useAudioDevices(): Devices {
  const [list, setList] = useState<MediaDeviceInfo[]>([])
  const refresh = useCallback(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then(setList)
      .catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh)
  }, [refresh])

  const allow = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* declined */
    }
    refresh()
  }, [refresh])

  const mics = list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
  const speakers = list.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
  return { mics, speakers, named: list.some((d) => d.kind === 'audioinput' && d.label !== ''), allow }
}
