/// Speech recognition (Whisper) off the main thread, so listening never freezes the island.
import { pipeline } from '@huggingface/transformers'
import { useDiskCache } from './modelCache'

useDiskCache()

const out = self as unknown as Worker

/** The Whisper sizes on offer: the bigger, the fewer words it mishears, and the more it has to download. */
const MODELS: Record<string, { id: string; gpu: Record<string, string>; cpu: Record<string, string> }> = {
  base: { id: 'onnx-community/whisper-base', gpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, cpu: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
  small: { id: 'onnx-community/whisper-small', gpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, cpu: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
}

// the pipeline's own type is very large; all that is needed from it is "audio in, text out"
type Recognizer = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>
let asr: Recognizer | null = null

/** Does this computer have a graphics card the model can use? */
async function hasGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    return Boolean(await gpu?.requestAdapter())
  } catch {
    return false
  }
}

async function load(key: string) {
  const spec = MODELS[key] ?? MODELS.small
  const files = new Map<string, number>()
  const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file && p.total) {
      files.set(p.file, (p.loaded ?? 0) / p.total)
      // the sizes differ a lot per file, so the average of the files seen so far is a fair overall progress
      const v = [...files.values()]
      out.postMessage({ type: 'progress', value: v.reduce((a, b) => a + b, 0) / v.length })
    }
  }
  const gpu = await hasGpu()
  const make = (device: 'webgpu' | 'wasm') =>
    pipeline('automatic-speech-recognition', spec.id, {
      device,
      dtype: (device === 'webgpu' ? spec.gpu : spec.cpu) as Record<string, 'q4'>,
      progress_callback,
    }) as unknown as Promise<Recognizer>
  let device: 'gpu' | 'cpu' = gpu ? 'gpu' : 'cpu'
  try {
    asr = await make(gpu ? 'webgpu' : 'wasm')
  } catch (e) {
    if (!gpu) throw e
    // the graphics path failed (driver trouble); the processor still works, only slower
    files.clear()
    asr = await make('wasm')
    device = 'cpu'
  }
  // the first run compiles the graphics shaders, which takes a while; do that before anyone is waiting
  try {
    await asr(new Float32Array(16000), {})
  } catch {
    /* real audio will report any problem */
  }
  out.postMessage({ type: 'ready', device })
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { type: 'load'; model: string } | { type: 'transcribe'; id: number; audio: Float32Array; language: string }
  if (m.type === 'load') {
    try {
      await load(m.model)
    } catch (err) {
      out.postMessage({ type: 'error', message: String(err) })
    }
    return
  }
  try {
    if (!asr) throw new Error('speech model not loaded')
    const options: Record<string, unknown> = { task: 'transcribe', chunk_length_s: 30 }
    // an empty language lets the model work out which one is being spoken
    if (m.language) options.language = m.language
    const r = await asr(m.audio, options)
    const text = (Array.isArray(r) ? r.map((x) => x.text).join(' ') : r.text).trim()
    out.postMessage({ type: 'text', id: m.id, text })
  } catch (err) {
    out.postMessage({ type: 'text-error', id: m.id, message: String(err) })
  }
}
