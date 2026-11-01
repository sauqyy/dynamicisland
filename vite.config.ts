import { copyFileSync, mkdirSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The ONNX runtime the local voice and brain models run on, shipped with the app instead of being
 * imported from a CDN at run time: no code from outside the app runs in the webview, and the
 * Content-Security-Policy (tauri.conf.json) can allow scripts from the app itself only.
 * transformers and kokoro-js both use onnxruntime-web 1.22.0-dev.20250409, so one copy serves both.
 */
function selfHostedOrt(): Plugin {
  return {
    name: 'self-hosted-ort',
    buildStart() {
      const from = 'node_modules/@huggingface/transformers/dist'
      mkdirSync('public/ort', { recursive: true })
      for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) copyFileSync(`${from}/${f}`, `public/ort/${f}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), selfHostedOrt()],
  clearScreen: false,
  // the natural voice runs in a module worker that loads its model with dynamic imports
  worker: { format: 'es' },
  server: {
    port: 5173,
    strictPort: true,
    // cargo's build output churns constantly and locks files on Windows
    watch: { ignored: ['**/src-tauri/**'] },
    // the browser demo's way to BMKG and wilayah.id, which the app reaches from Rust (public_data.rs): neither
    // answers a page from another site, so the dev server asks for it, as a plain request with no Origin
    proxy: Object.fromEntries(
      [['/__bmkg', 'https://api.bmkg.go.id'], ['/__wilayah', 'https://wilayah.id']].map(([from, to]) => [
        from,
        {
          target: to,
          changeOrigin: true,
          rewrite: (p: string) => p.slice(from.length),
          configure: (proxy: { on: (e: 'proxyReq', f: (req: { removeHeader: (h: string) => void }) => void) => void }) =>
            proxy.on('proxyReq', (req) => (req.removeHeader('origin'), req.removeHeader('referer'))),
        },
      ]),
    ),
  },
})
