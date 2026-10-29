import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // the natural voice runs in a module worker that loads its model with dynamic imports
  worker: { format: 'es' },
  server: {
    port: 5173,
    strictPort: true,
    // cargo's build output churns constantly and locks files on Windows
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
