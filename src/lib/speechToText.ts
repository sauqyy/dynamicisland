import { useSyncExternalStore } from 'react'

/**
 * Speech recognition that runs on this computer (Whisper), so it needs no key, no account and none of the
 * Windows speech settings. The model downloads once (about 150 MB) and is cached. It understands many languages
 * and works out which one is being spoken. It runs in a background worker so the island never stutters.
 */
export interface SttStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** 0-1 while the model downloads */
  progress: number
  error: string
  /** where it runs, once loaded */
  device: 'gpu' | 'cpu' | ''
}

let status: SttStatus = { state: 'idle', progress: 0, error: '', device: '' }
const subs = new Set<() => void>()
const set = (s: Partial<SttStatus>) => {
  status = { ...status, ...s }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
export const useSttStatus = () => useSyncExternalStore(subscribe, () => status)
export const sttReady = () => status.state === 'ready'

/** The listening models on offer: the bigger one mishears fewer words, and downloads more. */
export const STT_MODELS: [string, string, string][] = [
  ['small', 'Better', 'Recommended. About 600 MB, once'],
  ['base', 'Faster', 'Hears less well, but a small 200 MB download and quicker answers'],
]
export const DEFAULT_STT_MODEL = 'small'
/** roughly what each size downloads, for telling people before it starts */
export const STT_SIZES: Record<string, string> = { small: '600 MB', base: '200 MB', turbo: '760 MB' }

const DEFER_KEY = 'di.sttDeferred'
/** They chose to download the listening model later, so nothing should fetch it in the background until they ask. */
export function deferStt() {
  try {
    localStorage.setItem(DEFER_KEY, '1')
  } catch {
    /* it just downloads on first use */
  }
}
export function sttDeferred(): boolean {
  try {
    return localStorage.getItem(DEFER_KEY) === '1'
  } catch {
    return false
  }
}

/** Switches to another size; the one in use is dropped and the new one loads next time it is needed. */
export function setSttModel(model: string) {
  if (model === wanted) return
  wanted = model
  if (worker || loading) {
    abortLoad?.()
    worker?.terminate()
    worker = null
    loading = null
    abortLoad = null
    pending.forEach((p) => p.fail(new Error('the listening model changed')))
    pending.clear()
    set({ state: 'idle', progress: 0, error: '', device: '' })
  }
}

let worker: Worker | null = null
let loading: Promise<void> | null = null
/** which Whisper size to use, and how to give up on one that is still loading when the choice changes */
let wanted = 'small'
let abortLoad: (() => void) | null = null
let nextId = 1
const pending = new Map<number, { ok: (t: string) => void; fail: (e: Error) => void }>()

let demoTimer = 0
/** For the browser demo: back to "not downloaded", or a pretend download so the welcome can be shown without fetching 600 MB. */
export function demoStt(action: 'reset' | 'download') {
  clearInterval(demoTimer)
  if (action === 'reset') return set({ state: 'idle', progress: 0, error: '', device: '' })
  set({ state: 'loading', progress: 0, error: '' })
  demoTimer = window.setInterval(() => {
    const next = Math.min(1, status.progress + 0.02 + Math.random() * 0.05)
    if (next >= 1) {
      clearInterval(demoTimer)
      set({ state: 'ready', progress: 1, device: 'gpu' })
    } else set({ progress: next })
  }, 220)
}

/** Starts loading the model (downloading it the first time). Safe to call again. */
export function loadStt(): Promise<void> {
  if (loading) return loading
  try {
    localStorage.removeItem(DEFER_KEY)
  } catch {
    /* ignore */
  }
  set({ state: 'loading', progress: 0, error: '' })
  loading = new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL('./sttWorker.ts', import.meta.url), { type: 'module' })
    worker = w
    abortLoad = () => {
      w.terminate()
      reject(new Error('the listening model changed'))
    }
    const fail = (message: string) => {
      console.warn('speech model failed', message)
      w.terminate()
      worker = null
      loading = null
      pending.forEach((p) => p.fail(new Error(message)))
      pending.clear()
      set({ state: 'error', error: 'Could not load speech recognition. Check your internet connection and try again' })
      reject(new Error(message))
    }
    w.onerror = (e) => fail(e.message || 'worker error')
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; value?: number; device?: 'gpu' | 'cpu'; message?: string; id?: number; text?: string }
      if (m.type === 'progress') set({ progress: m.value ?? 0 })
      else if (m.type === 'ready') {
        set({ state: 'ready', progress: 1, device: m.device ?? 'cpu' })
        resolve()
      } else if (m.type === 'error') fail(m.message ?? 'load failed')
      else if (m.type === 'text' && m.id !== undefined) {
        pending.get(m.id)?.ok(m.text ?? '')
        pending.delete(m.id)
      } else if (m.type === 'text-error' && m.id !== undefined) {
        pending.get(m.id)?.fail(new Error(m.message))
        pending.delete(m.id)
      }
    }
    w.postMessage({ type: 'load', model: wanted })
  })
  // nobody may be waiting on it (a background preload), so a failure must not become an unhandled rejection
  loading.catch(() => {})
  return loading
}

/** The words in 16 kHz mono audio. */
export async function transcribe(audio: Float32Array, language = ''): Promise<string> {
  await loadStt()
  return new Promise<string>((ok, fail) => {
    const id = nextId++
    pending.set(id, { ok, fail })
    // a copy is sent, so the recording can keep growing while this is being worked on
    const copy = audio.slice()
    worker!.postMessage({ type: 'transcribe', id, audio: copy, language }, [copy.buffer])
  })
}

/** Is there any speech in this audio at all? Whisper invents words ("Thank you.") out of silence, so silence is not sent. */
export function hasSpeech(audio: Float32Array, rate = 16000): boolean {
  const win = Math.round(rate * 0.1)
  for (let i = 0; i + win <= audio.length; i += win) {
    let sum = 0
    for (let j = i; j < i + win; j++) sum += audio[j] * audio[j]
    if (Math.sqrt(sum / win) > 0.012) return true
  }
  return false
}

/** Linear resampling, for the case where the browser would not give a 16 kHz audio context. */
function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio
    const a = Math.floor(pos)
    const b = Math.min(a + 1, input.length - 1)
    out[i] = input[a] + (input[b] - input[a]) * (pos - a)
  }
  return out
}

/** Collects what the microphone hears, as 16 kHz mono samples, until stopped. */
export function createRecorder(ctx: AudioContext, source: MediaStreamAudioSourceNode) {
  const chunks: Float32Array[] = []
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  // the processor only runs when connected onward; the gain of zero keeps it from playing the mic back
  const silent = ctx.createGain()
  silent.gain.value = 0
  source.connect(proc)
  proc.connect(silent)
  silent.connect(ctx.destination)
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  return {
    /** everything recorded so far */
    samples(): Float32Array {
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const all = new Float32Array(total)
      let at = 0
      for (const c of chunks) (all.set(c, at), (at += c.length))
      return resample(all, ctx.sampleRate)
    },
    stop() {
      proc.onaudioprocess = null
      proc.disconnect()
      silent.disconnect()
    },
  }
}
