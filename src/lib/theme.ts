import { useEffect, useState } from 'react'
import type { Theme } from './settings'

const query = () => window.matchMedia('(prefers-color-scheme: light)')

/** `auto` follows the Windows light/dark setting. */
export function useResolvedTheme(theme: Theme): 'dark' | 'light' | 'glass' {
  const [systemLight, setSystemLight] = useState(() => query().matches)
  useEffect(() => {
    const q = query()
    const on = () => setSystemLight(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return theme === 'auto' ? (systemLight ? 'light' : 'dark') : theme
}

/** Black or white text, whichever reads better on the accent colour. */
export function onAccent(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#000'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return lum > 0.35 ? '#000' : '#fff'
}
