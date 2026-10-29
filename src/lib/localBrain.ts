import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { IS_TAURI } from './useMedia'

/**
 * The assistant's free, built-in brain. In the desktop app it is llama.cpp running a Qwen model as a background
 * program (both downloaded once, see src-tauri/src/llm.rs). In the browser demo, which cannot run programs, a tiny
 * model runs inside the page instead.
 */
export interface LlmStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** 0-1 while something downloads or starts */
  progress: number
  /** what is happening: the engine or the model downloading, or the brain starting */
  stage: 'engine' | 'model' | 'starting' | ''
  error: string
  /** where it runs, once loaded */
  device: 'gpu' | 'cpu' | ''
  /** the model setting this status is for */
  model: string
}

let status: LlmStatus = { state: 'idle', progress: 0, stage: '', error: '', device: '', model: '' }
const subs = new Set<() => void>()
const set = (s: Partial<LlmStatus>) => {
  status = { ...status, ...s }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
export const useLlmStatus = () => useSyncExternalStore(subscribe, () => status)
export const getLlmStatus = () => status
export const llmReady = (model: string) => status.state === 'ready' && status.model === model

export interface LlmMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ---------------- the desktop app: llama.cpp ----------------

let nativeLoading: Promise<void> | null = null
let nativeFor = ''

function loadNative(model: string): Promise<void> {
  if (nativeLoading && nativeFor === model) return nativeLoading
  nativeFor = model
  set({ state: 'loading', progress: 0, stage: 'engine', error: '', device: '', model })
  const mine = (nativeLoading = (async () => {
    const off = await listen<{ stage: 'engine' | 'model' | 'starting' | 'ready'; progress: number }>('llm-status', (e) => {
      if (e.payload.stage !== 'ready') set({ stage: e.payload.stage, progress: e.payload.progress })
    })
    try {
      const device = await invoke<string>('llm_prepare', { model })
      set({ state: 'ready', progress: 1, stage: '', device: device === 'gpu' ? 'gpu' : 'cpu' })
    } catch (e) {
      nativeLoading = null
      set({ state: 'error', error: typeof e === 'string' ? e : 'Could not start the brain' })
      throw e
    } finally {
      off()
    }
  })())
  // nobody may be waiting on it (a background preload), so a failure must not become an unhandled rejection
  mine.catch(() => {})
  return mine
}

// ---------------- the browser demo: a tiny model inside the page ----------------

/** how the weights are stored: 4-bit, with full-precision maths (the 16-bit variants give wrong answers on some graphics cards) */
const DTYPE = 'q4'
const DEMO_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct'

let worker: Worker | null = null
let loading: Promise<void> | null = null
let loadedModel = ''
let nextId = 1
const pending = new Map<number, { ok: (t: string) => void; fail: (e: Error) => void }>()

function loadInPage(model: string): Promise<void> {
  if (loading && loadedModel === model) return loading
  worker?.terminate()
  worker = null
  loadedModel = model
  set({ state: 'loading', progress: 0, stage: 'model', error: '', device: '', model })
  const mine = (loading = new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL('./llmWorker.ts', import.meta.url), { type: 'module' })
    worker = w
    const fail = (message: string) => {
      console.warn('built-in brain failed', message)
      w.terminate()
      if (worker === w) {
        worker = null
        loading = null
        loadedModel = ''
      }
      pending.forEach((p) => p.fail(new Error(message)))
      pending.clear()
      set({ state: 'error', error: 'Could not load the built-in brain. Check your internet connection and try again' })
      reject(new Error(message))
    }
    w.onerror = (e) => fail(e.message || 'worker error')
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; value?: number; device?: 'gpu' | 'cpu'; message?: string; id?: number; text?: string }
      if (m.type === 'progress') set({ progress: m.value ?? 0 })
      else if (m.type === 'ready') {
        set({ state: 'ready', progress: 1, stage: '', device: m.device ?? 'cpu' })
        resolve()
      } else if (m.type === 'error') fail(m.message ?? 'load failed')
      else if (m.type === 'reply' && m.id !== undefined) {
        pending.get(m.id)?.ok(m.text ?? '')
        pending.delete(m.id)
      } else if (m.type === 'reply-error' && m.id !== undefined) {
        pending.get(m.id)?.fail(new Error(m.message))
        pending.delete(m.id)
      }
    }
    w.postMessage({ type: 'load', model: DEMO_MODEL, dtype: DTYPE })
  }))
  mine.catch(() => {})
  return mine
}

// ---------------- what the rest of the app uses ----------------

/** Starts the built-in brain, downloading it the first time. `model` is the setting: "auto", "qwen2.5-3b" or "qwen2.5-1.5b". */
export function loadLlm(model: string): Promise<void> {
  return IS_TAURI ? loadNative(model) : loadInPage(model)
}

/** Asks the built-in brain. Resolves with its answer; a rejection is a sentence that is fine to show on the island. */
export async function chatLocal(model: string, messages: LlmMsg[], maxTokens = 160): Promise<string> {
  // the app starts the brain by itself if it has stopped (it frees its memory after a while without questions)
  if (IS_TAURI) return invoke<string>('llm_chat', { model, messages })
  await loadInPage(model)
  return new Promise<string>((ok, fail) => {
    const id = nextId++
    pending.set(id, { ok, fail })
    worker!.postMessage({ type: 'chat', id, messages, maxTokens })
  })
}

/** Is the brain already downloaded, so that starting it needs no download? */
export const llmInstalled = (model: string) => (IS_TAURI ? invoke<boolean>('llm_installed', { model }).catch(() => false) : Promise.resolve(false))
