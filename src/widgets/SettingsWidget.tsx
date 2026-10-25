import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { ACCENTS, type Anim, type Settings } from '../lib/settings'
import { IS_TAURI } from '../lib/useMedia'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span />
    </button>
  )
}

export function SettingsWidget({ settings, update }: Props) {
  const [autostart, setAutostart] = useState(false)
  const [monitors, setMonitors] = useState(1)

  useEffect(() => {
    if (!IS_TAURI) return
    isEnabled().then(setAutostart).catch(() => {})
    invoke<number>('monitor_count').then(setMonitors).catch(() => {})
  }, [])

  const toggleAutostart = async (v: boolean) => {
    setAutostart(v)
    try {
      await (v ? enable() : disable())
    } catch {
      setAutostart(!v)
    }
  }

  return (
    <div className="settings" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <span>Start with Windows</span>
        <Toggle on={autostart} onChange={toggleAutostart} />
      </div>
      <div className="row">
        <span>Hide in fullscreen apps</span>
        <Toggle on={settings.hideInFullscreen} onChange={(v) => update({ hideInFullscreen: v })} />
      </div>
      <div className="row">
        <span>24-hour clock</span>
        <Toggle on={settings.clock24} onChange={(v) => update({ clock24: v })} />
      </div>
      <div className="row">
        <span>Fahrenheit</span>
        <Toggle on={settings.fahrenheit} onChange={(v) => update({ fahrenheit: v })} />
      </div>
      <div className="row">
        <span>Display</span>
        <div className="segmented small">
          {Array.from({ length: monitors + 1 }, (_, i) => (
            <button key={i} className={settings.monitor === i ? 'active' : ''} onClick={() => update({ monitor: i })}>
              {i === 0 ? 'Main' : i}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span>Animation</span>
        <div className="segmented small">
          {(['bouncy', 'smooth', 'snappy'] as Anim[]).map((a) => (
            <button key={a} className={settings.anim === a ? 'active' : ''} onClick={() => update({ anim: a })}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span>Accent</span>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              aria-label={c}
              className={settings.accent === c ? 'active' : ''}
              style={{ background: c }}
              onClick={() => update({ accent: c })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
