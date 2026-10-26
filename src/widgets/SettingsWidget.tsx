import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { ACCENTS, SIZE_DEFAULTS, SIZE_LIMITS, type Anim, type IdleDisplay, type Settings } from '../lib/settings'
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

function Slider({
  label,
  value,
  format,
  limits,
  onChange,
}: {
  label: string
  value: number
  format: (v: number) => string
  limits: { min: number; max: number; step: number }
  onChange: (v: number) => void
}) {
  return (
    <div className="row slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">{format(value)}</span>
    </div>
  )
}

const RELEASES = 'https://api.github.com/repos/sauqyy/dynamicisland/releases/latest'

type UpdateState =
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

export function SettingsWidget({ settings, update }: Props) {
  const [autostart, setAutostart] = useState(false)
  const [monitors, setMonitors] = useState(1)
  const [version, setVersion] = useState('')
  const [update_, setUpdate] = useState<UpdateState>({ s: 'idle' })

  useEffect(() => {
    if (!IS_TAURI) return
    isEnabled().then(setAutostart).catch(() => {})
    getVersion().then(setVersion).catch(() => {})
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

  const checkUpdate = async () => {
    setUpdate({ s: 'checking' })
    try {
      const res = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
      if (res.status === 404) return setUpdate({ s: 'current' })
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
      const rel = (await res.json()) as {
        tag_name: string
        assets: { name: string; browser_download_url: string }[]
      }
      if (!newer(rel.tag_name, version)) return setUpdate({ s: 'current' })
      const asset = rel.assets.find((a) => /\.exe$/i.test(a.name))
      if (!asset) throw new Error('No installer in release')
      setUpdate({ s: 'available', version: rel.tag_name.replace(/^v/, ''), url: asset.browser_download_url })
    } catch (e) {
      setUpdate({ s: 'error', msg: e instanceof Error ? e.message : 'Check failed' })
    }
  }

  const downloadUpdate = async (url: string) => {
    setUpdate({ s: 'downloading' })
    try {
      await invoke('install_update', { url })
    } catch (e) {
      setUpdate({ s: 'error', msg: String(e) })
    }
  }

  const status =
    update_.s === 'checking'
      ? 'Checking…'
      : update_.s === 'current'
        ? "You're up to date"
        : update_.s === 'available'
          ? `v${update_.version} available`
          : update_.s === 'downloading'
            ? 'Downloading…'
            : update_.s === 'error'
              ? update_.msg
              : version && `v${version}`

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
        <span>Idle display</span>
        <div className="segmented small">
          {(['clock', 'lyrics'] as IdleDisplay[]).map((v) => (
            <button key={v} className={settings.idle === v ? 'active' : ''} onClick={() => update({ idle: v })}>
              {v}
            </button>
          ))}
        </div>
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
      <div className="size-box">
        <div className="row">
          <b>Island size</b>
          <button className="chip" onClick={() => update({ ...SIZE_DEFAULTS })}>
            Reset
          </button>
        </div>
        <Slider
          label="Scale"
          value={settings.scale}
          limits={SIZE_LIMITS.scale}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(scale) => update({ scale })}
        />
        <Slider
          label="Card width"
          value={settings.cardW}
          limits={SIZE_LIMITS.cardW}
          format={(v) => `${v}`}
          onChange={(cardW) => update({ cardW })}
        />
        <Slider
          label="Card height"
          value={settings.cardH}
          limits={SIZE_LIMITS.cardH}
          format={(v) => `${v}`}
          onChange={(cardH) => update({ cardH })}
        />
      </div>
      <div className="row">
        <span>Updates</span>
        <span className="update-status">{status}</span>
        {update_.s === 'available' ? (
          <button className="chip" onClick={() => downloadUpdate(update_.url)}>
            Download
          </button>
        ) : (
          <button className="chip" disabled={update_.s === 'checking' || update_.s === 'downloading'} onClick={checkUpdate}>
            Check
          </button>
        )}
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
