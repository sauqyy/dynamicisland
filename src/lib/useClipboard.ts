import { useCallback, useEffect, useRef, useState } from 'react'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { IS_TAURI } from './useMedia'

const MAX_ITEMS = 10
const MAX_LEN = 600

const DEMO = ['https://example.com/article', 'Meeting notes: send the report by Friday']

export interface ClipOptions {
  /** stop recording new entries */
  paused: boolean
  /** drop entries older than this many minutes, 0 = keep until cleared */
  autoClearMin: number
  /** don't record text that looks like a password, key or token */
  skipSecrets: boolean
}

export interface ClipItem {
  text: string
  at: number
}

/** A single "word" mixing at least three of lower/upper/digit/symbol, or a well-known token shape. */
export function looksSecret(text: string) {
  if (/\s/.test(text) || text.length < 8 || text.length > 200) return false
  if (/^(sk-|ghp_|gho_|github_pat_|xox[bap]-|AKIA|eyJ|AIza)/.test(text)) return true
  if (/^https?:\/\//i.test(text)) return false
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(text)).length
  return classes >= 3
}

/**
 * Recent copied text. Kept in memory only (never saved to disk) because clipboards
 * often hold passwords and other private things. Can be paused, filtered and auto-cleared.
 */
export function useClipboard({ paused, autoClearMin, skipSecrets }: ClipOptions) {
  const [items, setItems] = useState<ClipItem[]>(IS_TAURI ? [] : DEMO.map((text) => ({ text, at: Date.now() })))
  const skipRef = useRef(skipSecrets)
  skipRef.current = skipSecrets

  useEffect(() => {
    if (!IS_TAURI || paused) return
    let stopped = false
    const poll = async () => {
      try {
        const text = (await readText())?.trim()
        if (stopped || !text) return
        if (skipRef.current && looksSecret(text)) return
        const clipped = text.slice(0, MAX_LEN)
        setItems((cur) =>
          cur[0]?.text === clipped
            ? cur
            : [{ text: clipped, at: Date.now() }, ...cur.filter((c) => c.text !== clipped)].slice(0, MAX_ITEMS),
        )
      } catch {
        /* clipboard holds something that is not text */
      }
    }
    poll()
    const id = setInterval(poll, 1000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [paused])

  useEffect(() => {
    if (!autoClearMin) return
    const sweep = () => {
      const cutoff = Date.now() - autoClearMin * 60_000
      setItems((cur) => (cur.some((c) => c.at < cutoff) ? cur.filter((c) => c.at >= cutoff) : cur))
    }
    sweep()
    const id = setInterval(sweep, 10_000)
    return () => clearInterval(id)
  }, [autoClearMin])

  const copy = useCallback((text: string) => {
    if (IS_TAURI) writeText(text).catch(() => {})
    else navigator.clipboard?.writeText(text).catch(() => {})
  }, [])

  const clear = useCallback(() => setItems([]), [])
  const remove = useCallback((text: string) => setItems((cur) => cur.filter((c) => c.text !== text)), [])

  return { items, copy, clear, remove }
}
