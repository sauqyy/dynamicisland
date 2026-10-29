/// Runs the natural voice off the main thread, so loading it and making speech never freezes the island.
import { KokoroTTS } from 'kokoro-js'
import { useDiskCache } from './modelCache'

useDiskCache()

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const out = self as unknown as Worker

let tts: KokoroTTS | null = null

/** Does this computer have a graphics card the voice can use (WebGPU)? */
async function hasGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    return Boolean(await gpu?.requestAdapter())
  } catch {
    return false
  }
}

/** Real speech has numbers in it; some graphics setups produce NaN, which plays as silence. */
const isClean = (samples: Float32Array) => {
  let loud = 0
  for (const v of samples) {
    if (Number.isNaN(v)) return false
    if (Math.abs(v) > 0.02) loud++
  }
  return loud > 100
}

/**
 * The first sentence compiles the graphics shaders, which takes seconds, so it is made now, before anyone is
 * waiting. It doubles as a check that the audio is real.
 */
async function warmUp(): Promise<boolean> {
  try {
    const a = await tts?.generate('Hello there, how are you today?', { voice: 'af_heart' })
    return a ? isClean(a.audio) : false
  } catch {
    return false
  }
}

async function load() {
  const files = new Map<string, number>()
  const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file && p.total) {
      files.set(p.file, (p.loaded ?? 0) / p.total)
      // the big model file dominates the download, so its progress is the overall progress
      out.postMessage({ type: 'progress', value: Math.max(...files.values()) })
    }
  }
  const gpu = await hasGpu()
  if (gpu) {
    try {
      // only full precision gives clean audio on the graphics card; the smaller variants return silence
      tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'webgpu', progress_callback })
      if (await warmUp()) return out.postMessage({ type: 'ready', device: 'gpu' })
    } catch (e) {
      console.warn('voice on the graphics card failed', e)
    }
    files.clear()
  }
  // the processor works everywhere, only slower
  tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback })
  await warmUp()
  out.postMessage({ type: 'ready', device: 'cpu' })
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { type: 'load' } | { type: 'synth'; id: number; text: string; voice: string; speed: number }
  if (m.type === 'load') {
    try {
      await load()
    } catch (err) {
      out.postMessage({ type: 'error', message: String(err) })
    }
    return
  }
  try {
    if (!tts) throw new Error('voice not loaded')
    const audio = await tts.generate(m.text, { voice: m.voice as 'af_heart', speed: m.speed })
    const buf = await audio.toBlob().arrayBuffer()
    out.postMessage({ type: 'audio', id: m.id, buf }, [buf])
  } catch (err) {
    out.postMessage({ type: 'audio-error', id: m.id, message: String(err) })
  }
}
