import { useCallback, useEffect, useState } from 'react'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { IS_TAURI } from './useMedia'

const MAX_ITEMS = 10
const MAX_LEN = 600

const DEMO = ['https://example.com/article', 'Meeting notes: send the report by Friday']

/**
 * Recent copied text. Kept in memory only (never saved to disk) because clipboards
 * often hold passwords and other private things.
 */
export function useClipboard() {
  const [items, setItems] = useState<string[]>(IS_TAURI ? [] : DEMO)

  useEffect(() => {
    if (!IS_TAURI) return
    let stopped = false
    const poll = async () => {
      try {
        const text = (await readText())?.trim()
        if (!stopped && text) {
          const clipped = text.slice(0, MAX_LEN)
          setItems((cur) => (cur[0] === clipped ? cur : [clipped, ...cur.filter((c) => c !== clipped)].slice(0, MAX_ITEMS)))
        }
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
  }, [])

  const copy = useCallback((text: string) => {
    if (IS_TAURI) writeText(text).catch(() => {})
    else navigator.clipboard?.writeText(text).catch(() => {})
  }, [])

  const clear = useCallback(() => setItems([]), [])

  return { items, copy, clear }
}
