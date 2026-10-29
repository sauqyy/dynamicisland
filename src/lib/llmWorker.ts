/// The assistant's local brain (a small open language model) off the main thread, so thinking never freezes the island.
import { pipeline } from '@huggingface/transformers'
import { useDiskCache } from './modelCache'

useDiskCache()

const out = self as unknown as Worker

interface Msg {
  role: string
  content: string
}
type Generator = (messages: Msg[], options: Record<string, unknown>) => Promise<{ generated_text: Msg[] }[]>
let gen: Generator | null = null

/** Does this computer have a graphics card the model can use? */
async function hasGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    return Boolean(await gpu?.requestAdapter())
  } catch {
    return false
  }
}

async function load(model: string, dtype: string) {
  const files = new Map<string, number>()
  const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file && p.total) {
      files.set(p.file, (p.loaded ?? 0) / p.total)
      // the weights dominate the download, so the biggest file's progress is the overall progress
      out.postMessage({ type: 'progress', value: Math.max(...files.values()) })
    }
  }
  const make = (device: 'webgpu' | 'wasm') => pipeline('text-generation', model, { device, dtype: dtype as 'q4', progress_callback }) as unknown as Promise<Generator>
  const gpu = await hasGpu()
  let device: 'gpu' | 'cpu' = gpu ? 'gpu' : 'cpu'
  try {
    gen = await make(gpu ? 'webgpu' : 'wasm')
  } catch (e) {
    if (!gpu) throw e
    // the graphics path failed (driver trouble); the processor still works, only much slower
    files.clear()
    gen = await make('wasm')
    device = 'cpu'
  }
  // the first run compiles the graphics shaders, which takes a while; do that before anyone is waiting
  try {
    await gen([{ role: 'user', content: 'Hi' }], { max_new_tokens: 4, do_sample: false })
  } catch {
    /* real questions will report any problem */
  }
  out.postMessage({ type: 'ready', device })
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { type: 'load'; model: string; dtype: string } | { type: 'chat'; id: number; messages: Msg[]; maxTokens: number }
  if (m.type === 'load') {
    try {
      await load(m.model, m.dtype)
    } catch (err) {
      out.postMessage({ type: 'error', message: String(err) })
    }
    return
  }
  try {
    if (!gen) throw new Error('the model is not loaded')
    const r = await gen(m.messages, { max_new_tokens: m.maxTokens, do_sample: true, temperature: 0.7, top_p: 0.9, repetition_penalty: 1.1 })
    const text = String(r[0].generated_text.at(-1)?.content ?? '').trim()
    out.postMessage({ type: 'reply', id: m.id, text })
  } catch (err) {
    out.postMessage({ type: 'reply-error', id: m.id, message: String(err) })
  }
}
