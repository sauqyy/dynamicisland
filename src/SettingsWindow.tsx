import { useEffect } from 'react'
import { SettingsWidget } from './widgets/SettingsWidget'
import { useSettings } from './lib/settings'
import { useUpdater } from './lib/useUpdater'
import { onAccent, useResolvedTheme } from './lib/theme'
import { IS_TAURI } from './lib/useMedia'
import { AstraStar } from './widgets/AstraStar'

/** A title bar in the app's colours: drag it to move, double-click to maximise. */
function TitleBar() {
  const act = async (what: 'minimize' | 'toggleMaximize' | 'close') => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const w = getCurrentWindow()
    if (what === 'minimize') await w.minimize()
    else if (what === 'close') await w.close()
    else await w.toggleMaximize()
  }
  return (
    <header className="sw-bar" data-tauri-drag-region onDoubleClick={() => void act('toggleMaximize')}>
      <span className="sw-bar-title" data-tauri-drag-region>
        <i><AstraStar size={13} /></i>
        Settings
      </span>
      <div className="sw-bar-btns">
        <button aria-label="Minimise" onClick={() => void act('minimize')}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" /></svg>
        </button>
        <button aria-label="Maximise" onClick={() => void act('toggleMaximize')}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" /></svg>
        </button>
        <button className="close" aria-label="Close" onClick={() => void act('close')}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
        </button>
      </div>
    </header>
  )
}


/** Settings in a window of its own. Changes reach the island through the shared saved settings. */
export function SettingsWindow() {
  const { settings, update } = useSettings()
  const updater = useUpdater()
  // the glass look needs the desktop behind it, which a normal window doesn't have
  const resolved = useResolvedTheme(settings.theme)
  const theme = resolved === 'glass' ? 'dark' : resolved
  useEffect(() => {
    document.title = 'Astra Isle Settings'
    document.documentElement.style.background = theme === 'light' ? '#f6f6f8' : '#000'
  }, [theme])
  return (
    <div
      className={`root native settings-window ${theme}`}
      style={{
        ['--accent' as string]: settings.accent,
        ['--on-accent' as string]: onAccent(settings.accent),
        ['--scale' as string]: 1,
        background: 'var(--island-bg)',
        color: 'var(--text-1)',
      }}
    >
      {IS_TAURI && <TitleBar />}
      <div className="expanded fs fixed sw-body">
        <SettingsWidget settings={settings} update={update} updater={updater} fullscreen />
      </div>
    </div>
  )
}
