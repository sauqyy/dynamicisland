import { IS_TAURI } from './useMedia'

/** Opens Settings in its own window (or brings it forward when it's already open). */
export async function openSettingsWindow() {
  if (!IS_TAURI) {
    // the browser demo has no second window: App shows Settings in a floating one
    window.dispatchEvent(new Event('open-settings-demo'))
    return
  }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const existing = await WebviewWindow.getByLabel('settings')
  if (existing) {
    await existing.unminimize().catch(() => {})
    await existing.show().catch(() => {})
    await existing.setFocus().catch(() => {})
    return
  }
  // centre it on the screen the island is on (the island's own window is a strip at the top, so "centre" can't come from it)
  const W = 980
  const H = 680
  let pos: { x?: number; y?: number; center?: boolean } = { center: true }
  try {
    const { currentMonitor } = await import('@tauri-apps/api/window')
    const mon = await currentMonitor()
    if (mon) {
      const k = mon.scaleFactor
      const w = Math.min(W, mon.size.width / k - 40)
      const h = Math.min(H, mon.size.height / k - 80)
      pos = { x: Math.round(mon.position.x / k + (mon.size.width / k - w) / 2), y: Math.round(mon.position.y / k + (mon.size.height / k - h) / 2) }
    }
  } catch {
    /* fall back to the system's own centring */
  }
  const win = new WebviewWindow('settings', {
    url: 'index.html#settings',
    title: 'Astra Isle Settings',
    width: W,
    height: H,
    minWidth: 720,
    minHeight: 480,
    ...pos,
    resizable: true,
    // the window draws its own title bar so it follows the app's theme
    decorations: false,
    shadow: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    focus: true,
  })
  win.once('tauri://error', (e) => console.error('settings window', e))
}
