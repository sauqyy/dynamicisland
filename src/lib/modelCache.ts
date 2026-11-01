import { env } from '@huggingface/transformers'

/**
 * Where the downloaded models are kept. The browser's own cache refuses big files (the voice and the brain are
 * hundreds of megabytes), so they would download again on every start. The origin-private file system holds them
 * on disk instead: written once, then read straight from there.
 */
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

/** a file name that is unique per address and short enough for any file system */
const fileName = (url: string) => `${url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)}.${hash(url)}`

const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('models', { create: true })

/**
 * The ONNX runtime's script and wasm come with the app (see vite.config.ts), not from a CDN: nothing from
 * outside the app may run in it (the Content-Security-Policy in tauri.conf.json enforces that too).
 */
export const ORT_PATH = new URL('/ort/', self.location.href).href

/** Call once at the top of each worker that loads a model. */
export function useDiskCache() {
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = ORT_PATH
  env.useCustomCache = true
  env.customCache = {
    async match(request: string) {
      try {
        const file = await (await (await folder()).getFileHandle(fileName(request))).getFile()
        return new Response(file, { headers: { 'content-length': String(file.size) } })
      } catch {
        return undefined
      }
    },
    async put(request: string, response: Response) {
      const handle = await (await folder()).getFileHandle(fileName(request), { create: true })
      // the file only replaces the old one when the writing is finished, so an interrupted download leaves nothing broken
      const out = await handle.createWritable()
      try {
        if (response.body) await response.body.pipeTo(out)
        else {
          await out.write(await response.arrayBuffer())
          await out.close()
        }
      } catch (e) {
        await out.abort().catch(() => {})
        throw e
      }
    },
  }
}
