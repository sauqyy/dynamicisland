import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { IS_TAURI } from './useMedia'
import { IS_MAC } from './files'

const RELEASES = 'https://api.github.com/repos/sauqyy/dynamicisland/releases/latest'
const FIRST_CHECK_MS = 8_000
const CHECK_EVERY_MS = 6 * 60 * 60_000

export type UpdateState =
  | { s: 'idle' }
  | { s: 'checking' }
  | { s: 'current' }
  | { s: 'available'; version: string; url: string }
  | { s: 'downloading' }
  | { s: 'error'; msg: string }

function newer(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

/** Checks GitHub releases shortly after launch and then every few hours; Settings can also check on demand. */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ s: 'idle' })
  const [version, setVersion] = useState('')
  const busy = useRef(false)

  const check = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setState((cur) => (cur.s === 'available' ? cur : { s: 'checking' }))
    try {
      if (!IS_TAURI) {
        // the browser demo has no installed version to compare with
        await new Promise((r) => setTimeout(r, 400))
        setState({ s: 'available', version: '9.9.9', url: '' })
        return
      }
      const current = version || (await getVersion())
      setVersion(current)
      const res = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
      if (res.status === 404) return setState({ s: 'current' })
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
      const rel = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] }
      if (!newer(rel.tag_name, current)) return setState({ s: 'current' })
      // the silent updater needs the regular installer, not the friendly first-time Setup.exe
      const asset = IS_MAC
        ? rel.assets.find((a) => /\.dmg$/i.test(a.name))
        : (rel.assets.find((a) => /x64-setup\.exe$/i.test(a.name)) ?? rel.assets.find((a) => /\.exe$/i.test(a.name)))
      if (!asset) throw new Error('No installer in release')
      setState({ s: 'available', version: rel.tag_name.replace(/^v/, ''), url: asset.browser_download_url })
    } catch (e) {
      setState({ s: 'error', msg: e instanceof Error ? e.message : 'Check failed' })
    } finally {
      busy.current = false
    }
  }, [version])

  const install = useCallback(async (url: string) => {
    setState({ s: 'downloading' })
    try {
      await invoke('install_update', { url })
    } catch (e) {
      setState({ s: 'error', msg: String(e) })
    }
  }, [])

  // the installed version is shown in Settings right away, not only after the first check
  useEffect(() => {
    if (IS_TAURI) getVersion().then(setVersion).catch(() => {})
  }, [])

  useEffect(() => {
    const first = setTimeout(check, FIRST_CHECK_MS)
    const every = setInterval(check, CHECK_EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, version, check, install }
}
