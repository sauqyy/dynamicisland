import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

export interface FileItem {
  id: string
  path: string
  name: string
  size: number
  isDir: boolean
  /** Explorer's icon as a PNG data URL */
  icon?: string
}

/** Mirrors `FileInfo` in src-tauri/src/files.rs */
interface NativeFileInfo {
  path: string
  name: string
  size: number
  is_dir: boolean
  icon: string | null
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(name)
}

export async function describePaths(paths: string[]): Promise<FileItem[]> {
  const infos = await invoke<NativeFileInfo[]>('file_info', { paths })
  return infos.map((i) => ({
    id: `${i.path}#${Date.now()}`,
    path: i.path,
    name: i.name,
    size: i.size,
    isDir: i.is_dir,
    icon: i.icon ?? undefined,
  }))
}

export function openPath(path: string) {
  if (IS_TAURI) invoke('open_path', { path }).catch(() => {})
}

/** A list persisted in localStorage. */
export function useStoredList(key: string, seed: FileItem[]) {
  const [items, setItems] = useState<FileItem[]>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as FileItem[]
    } catch {
      /* ignore */
    }
    return seed
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [key, items])

  /** Add items, skipping paths that are already in the list. */
  const add = useCallback((added: FileItem[]) => {
    setItems((cur) => [...cur, ...added.filter((a) => !cur.some((c) => c.path === a.path))])
  }, [])

  const remove = useCallback((id: string) => setItems((cur) => cur.filter((i) => i.id !== id)), [])
  const clear = useCallback(() => setItems([]), [])

  return { items, add, remove, clear, setItems }
}

const SYSTEM = 'C:\\Windows\\System32\\'

/** Apps pinned on first run. */
export const DEFAULT_APPS = [
  `${SYSTEM}notepad.exe`,
  `${SYSTEM}calc.exe`,
  `${SYSTEM}taskmgr.exe`,
]

export const DEMO_SHELF: FileItem[] = [
  { id: 'd1', path: 'beach.jpg', name: 'beach.jpg', size: 2.4 * 1024 ** 2, isDir: false },
  { id: 'd2', path: 'Project files', name: 'Project files', size: 0, isDir: true },
]

export const DEMO_APPS: FileItem[] = ['Notepad', 'Calculator', 'Task Manager'].map((n, i) => ({
  id: `a${i}`,
  path: n,
  name: n,
  size: 0,
  isDir: false,
}))
