import { useSyncExternalStore } from 'react'

/**
 * A natural voice that runs on this computer (Kokoro, an 82M-parameter speech model), so it needs no key,
 * no account and does not use the voices Windows ships. The model downloads once (about 330 MB on a graphics card, 90 MB without) and is cached.
 * On a graphics card it makes a sentence in about half a second; without one it falls back to the processor,
 * which is several times slower. All of it runs in a background worker so the island never stutters.
 */
export const NEURAL_VOICES: [string, string][] = [
  ['af_heart', 'Heart (warm, female)'],
  ['af_bella', 'Bella (bright, female)'],
  ['af_nicole', 'Nicole (soft, female)'],
  ['af_sky', 'Sky (airy, female)'],
  ['af_sarah', 'Sarah (calm, female)'],
  ['bf_emma', 'Emma (British, female)'],
  ['am_michael', 'Michael (male)'],
  ['am_fenrir', 'Fenrir (deep, male)'],
  ['bm_george', 'George (British, male)'],
]
export const DEFAULT_NEURAL_VOICE = 'af_heart'
/** a saved voice that is not one of these (an old Windows voice, say) means the default */
export const neuralVoice = (id: string) => (NEURAL_VOICES.some(([v]) => v === id) ? id : DEFAULT_NEURAL_VOICE)

export interface NeuralStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** 0-1 while the model downloads */
  progress: number
  error: string
  /** where it runs, once loaded */
  device: 'gpu' | 'cpu' | ''
}

let status: NeuralStatus = { state: 'idle', progress: 0, error: '', device: '' }
const subs = new Set<() => void>()
const set = (s: Partial<NeuralStatus>) => {
  status = { ...status, ...s }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
export const useNeuralStatus = () => useSyncExternalStore(subscribe, () => status)
export const neuralReady = () => status.state === 'ready'

let worker: Worker | null = null
let loading: Promise<void> | null = null
let nextId = 1
const pending = new Map<number, { ok: (b: Blob) => void; fail: (e: Error) => void }>()

/** Starts loading the voice (downloading it the first time). Safe to call again. */
export function loadNeural(): Promise<void> {
  if (loading) return loading
  set({ state: 'loading', progress: 0, error: '' })
  loading = new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL('./neuralWorker.ts', import.meta.url), { type: 'module' })
    worker = w
    const fail = (message: string) => {
      console.warn('voice model failed', message)
      w.terminate()
      worker = null
      loading = null
      pending.forEach((p) => p.fail(new Error(message)))
      pending.clear()
      set({ state: 'error', error: 'Could not load the voice. Check your internet connection and try again' })
      reject(new Error(message))
    }
    w.onerror = (e) => fail(e.message || 'worker error')
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; value?: number; device?: 'gpu' | 'cpu'; message?: string; id?: number; buf?: ArrayBuffer }
      if (m.type === 'progress') set({ progress: m.value ?? 0 })
      else if (m.type === 'ready') {
        set({ state: 'ready', progress: 1, device: m.device ?? 'cpu' })
        resolve()
      } else if (m.type === 'error') fail(m.message ?? 'load failed')
      else if (m.type === 'audio' && m.id !== undefined) {
        pending.get(m.id)?.ok(new Blob([m.buf!], { type: 'audio/wav' }))
        pending.delete(m.id)
      } else if (m.type === 'audio-error' && m.id !== undefined) {
        pending.get(m.id)?.fail(new Error(m.message))
        pending.delete(m.id)
      }
    }
    w.postMessage({ type: 'load' })
  })
  // nobody may be waiting on it (a background preload), so a failure must not become an unhandled rejection
  loading.catch(() => {})
  return loading
}

/** Whole sentences, so the first one can be spoken while the next is still being made. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
  // a very short piece ("Hi.") sounds clipped on its own, so it joins the next one
  const out: string[] = []
  for (const p of parts) {
    if (out.length && out[out.length - 1].length < 14) out[out.length - 1] += ` ${p}`
    else out.push(p)
  }
  return out
}

/** One sentence as a playable wav. */
export async function synth(text: string, voice: string, speed: number): Promise<Blob> {
  await loadNeural()
  return new Promise<Blob>((ok, fail) => {
    const id = nextId++
    pending.set(id, { ok, fail })
    worker!.postMessage({ type: 'synth', id, text, voice: neuralVoice(voice), speed })
  })
}
