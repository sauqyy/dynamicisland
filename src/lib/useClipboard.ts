import { useCallback, useEffect, useRef, useState } from 'react'
import { readImage, readText, writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Image } from '@tauri-apps/api/image'
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
  /** the copied text, or a unique key (`image:<hash>`) for a picture */
  text: string
  at: number
  /** PNG data URL when a picture was copied */
  image?: string
}

/** Cheap fingerprint of a bitmap: size plus ~4k sampled bytes. */
function hashPixels(rgba: Uint8Array, w: number, h: number) {
  let x = 2166136261
  const step = Math.max(1, Math.floor(rgba.length / 4096))
  for (let i = 0; i < rgba.length; i += step) x = Math.imul(x ^ rgba[i], 16777619)
  return `image:${w}x${h}:${(x >>> 0).toString(36)}`
}

function toDataUrl(rgba: Uint8Array, w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  return canvas.toDataURL('image/png')
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
 * Recent copied text and pictures. Kept in memory only (never saved to disk) because clipboards
 * often hold passwords and other private things. Can be paused, filtered and auto-cleared.
 */
export function useClipboard({ paused, autoClearMin, skipSecrets }: ClipOptions) {
  const [items, setItems] = useState<ClipItem[]>(IS_TAURI ? [] : DEMO.map((text) => ({ text, at: Date.now() })))
  const skipRef = useRef(skipSecrets)
  const lastImage = useRef('')
  skipRef.current = skipSecrets

  useEffect(() => {
    if (!IS_TAURI || paused) return
    let stopped = false
    const push = (item: ClipItem) =>
      setItems((cur) =>
        cur[0]?.text === item.text
          ? cur
          : [item, ...cur.filter((c) => c.text !== item.text)].slice(0, MAX_ITEMS),
      )
    const poll = async () => {
      let text: string | undefined
      try {
        text = (await readText())?.trim()
      } catch {
        /* clipboard holds something that is not text */
      }
      if (stopped) return
      if (text) {
        if (skipRef.current && looksSecret(text)) return
        push({ text: text.slice(0, MAX_LEN), at: Date.now() })
        return
      }
      try {
        const img = await readImage()
        const { width, height } = await img.size()
        const rgba = await img.rgba()
        img.close().catch(() => {})
        if (stopped) return
        const key = hashPixels(rgba, width, height)
        if (lastImage.current === key) return
        lastImage.current = key
        push({ text: key, at: Date.now(), image: toDataUrl(rgba, width, height) })
      } catch {
        /* nothing copied, or not an image */
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

  const copy = useCallback(async ({ text, image }: ClipItem) => {
    if (image) {
      if (!IS_TAURI) return
      const bytes = new Uint8Array(await (await fetch(image)).arrayBuffer())
      writeImage(await Image.fromBytes(bytes)).catch(() => {})
    } else if (IS_TAURI) writeText(text).catch(() => {})
    else navigator.clipboard?.writeText(text).catch(() => {})
  }, [])

  const clear = useCallback(() => setItems([]), [])
  const remove = useCallback((text: string) => setItems((cur) => cur.filter((c) => c.text !== text)), [])

  return { items, copy, clear, remove }
}
