import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

/**
 * Keeps a list in a file next to the app's other data as well as in localStorage, which an update or
 * a cleanup of the webview can empty. Starting with nothing, it brings back what the file holds; once
 * that has been looked at, every change is written to the file too.
 */
export function useKept<T>(name: 'todos' | 'todoGroups', list: T[], set: (list: T[]) => void) {
  const ready = useRef(false)
  const latest = useRef(list)
  latest.current = list

  useEffect(() => {
    if (!IS_TAURI) return
    let live = true
    const done = () => {
      if (live) ready.current = true
    }
    // anything the user already changed this session wins over the file
    if (latest.current.length) return done()
    invoke<string | null>('keep_load', { name })
      .then((text) => {
        const saved = text ? JSON.parse(text) : null
        if (live && Array.isArray(saved) && saved.length && !latest.current.length) set(saved as T[])
      })
      .catch(() => {})
      .finally(done)
    return () => {
      live = false
    }
    // runs once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (IS_TAURI && ready.current) invoke('keep_save', { name, json: JSON.stringify(list) }).catch(() => {})
  }, [name, list])
}
