import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { PAGE_VARIANTS } from '../lib/pageAnim'
import { ColorPicker } from './ColorPicker'
import { invoke } from '@tauri-apps/api/core'
import { useUpdater } from '../lib/useUpdater'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { ACCENTS, SIZE_DEFAULTS, SIZE_LIMITS, TAB_ANIMS, type Anim, type IdleDisplay, type GlassTint, type Settings, type Theme } from '../lib/settings'
import { IS_TAURI } from '../lib/useMedia'
import { IS_MAC } from '../lib/files'
import { PAGES } from '../types'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  updater: ReturnType<typeof useUpdater>
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

const CLEAR_OPTIONS: [number, string][] = [
  [0, 'off'],
  [1, '1m'],
  [5, '5m'],
  [15, '15m'],
  [60, '1h'],
]

export function SettingsWidget({ settings, update, updater }: Props) {
  const { state: update_, version, check: checkUpdate, install: downloadUpdate } = updater
  const [autostart, setAutostart] = useState(false)
  const [monitors, setMonitors] = useState(1)
  // page-animation preview: two sample cards that swap, replayed on every click
  const [swap, setSwap] = useState({ n: 0, dir: 1 as 1 | -1 })
  const [customOpen, setCustomOpen] = useState(false)
  const customBtn = useRef<HTMLButtonElement>(null)
  // the popup lives on the whole expanded island, so it isn't clipped by the scrolling settings list
  const host = customBtn.current?.closest('.expanded') ?? null
  const flip = () => setSwap((s) => ({ n: s.n + 1, dir: s.dir === 1 ? -1 : 1 }))

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

  const status =
    update_.s === 'checking'
      ? 'Checking…'
      : update_.s === 'current'
        ? "You're up to date"
        : update_.s === 'available'
          ? `v${update_.version} available`
          : update_.s === 'downloading'
            ? 'Updating…'
            : update_.s === 'error'
              ? update_.msg
              : version && `v${version}`

  return (
    <div className="settings" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <span>{IS_MAC ? 'Start at login' : 'Start with Windows'}</span>
        <Toggle on={autostart} onChange={toggleAutostart} />
      </div>
      <div className="row">
        <span>Hide in fullscreen apps</span>
        <Toggle on={settings.hideInFullscreen} onChange={(v) => update({ hideInFullscreen: v })} />
      </div>
      <div className="group-title">Island</div>
      <div className="row">
        <span>Show in pill</span>
        <div className="segmented small">
          {(['clock', 'lyrics', 'weather'] as IdleDisplay[]).map((v) => (
            <button key={v} className={settings.idle === v ? 'active' : ''} onClick={() => update({ idle: v })}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span>Equalizer while playing</span>
        <Toggle on={settings.idleBars} onChange={(v) => update({ idleBars: v })} />
      </div>
      <div className="row">
        <span>Message sound</span>
        <Toggle on={settings.messageSound} onChange={(v) => update({ messageSound: v })} />
      </div>
      <Slider
        label="Text size"
        value={settings.clockSize}
        limits={SIZE_LIMITS.clockSize}
        format={(v) => `${v}px`}
        onChange={(clockSize) => update({ clockSize })}
      />
      <Slider
        label="Lyrics timing"
        value={settings.lyricOffset}
        limits={SIZE_LIMITS.lyricOffset}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}s`}
        onChange={(lyricOffset) => update({ lyricOffset })}
      />
      <div className="row">
        <span>Position (drag the pill)</span>
        <button
          className="chip"
          disabled={!settings.posX && !settings.posY}
          onClick={() => update({ posX: 0, posY: 0 })}
        >
          Reset
        </button>
      </div>
      <div className="group-title">Pages</div>
      <div className="page-toggles">
        {PAGES.filter((p) => p.id !== 'settings').map((p) => {
          const on = !settings.hiddenPages.includes(p.id)
          return (
            <button
              key={p.id}
              className={`chip ${on ? 'on' : ''}`}
              aria-pressed={on}
              onClick={() =>
                update({ hiddenPages: on ? [...settings.hiddenPages, p.id] : settings.hiddenPages.filter((h) => h !== p.id) })
              }
            >
              {p.title}
            </button>
          )
        })}
      </div>
      <div className="group-title">Clipboard privacy</div>
      <div className="row">
        <span>Pause history</span>
        <Toggle on={settings.clipPaused} onChange={(v) => update({ clipPaused: v })} />
      </div>
      <div className="row">
        <span>Hide entries until hovered</span>
        <Toggle on={settings.clipMask} onChange={(v) => update({ clipMask: v })} />
      </div>
      <div className="row">
        <span>Skip passwords and tokens</span>
        <Toggle on={settings.clipSkipSecrets} onChange={(v) => update({ clipSkipSecrets: v })} />
      </div>
      <div className="row">
        <span>Auto-clear after</span>
        <div className="segmented small">
          {CLEAR_OPTIONS.map(([min, label]) => (
            <button
              key={min}
              className={settings.clipAutoClear === min ? 'active' : ''}
              onClick={() => update({ clipAutoClear: min })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="group-title">General</div>
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
      <div className="group-title">Page animation</div>
      <div className="page-toggles">
        {TAB_ANIMS.map((a) => (
          <button
            key={a}
            className={`chip ${settings.tabAnim === a ? 'on' : ''}`}
            style={{ opacity: settings.tabAnim === a ? 1 : 0.6, textTransform: 'capitalize' }}
            onClick={() => {
              update({ tabAnim: a })
              flip()
            }}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="anim-preview" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false} custom={swap.dir}>
          <motion.div
            key={swap.n}
            className={`anim-card ${swap.n % 2 ? 'b' : 'a'}`}
            custom={swap.dir}
            variants={PAGE_VARIANTS[settings.tabAnim]}
            initial="enter"
            animate="center"
            exit="exit"
            style={{ transformPerspective: 900 }}
          >
            <span className="ac-title" />
            <span className="ac-line" />
            <span className="ac-line short" />
          </motion.div>
        </AnimatePresence>
        <button className="chip" onClick={flip}>
          Replay
        </button>
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
            Update
          </button>
        ) : (
          <button className="chip" disabled={update_.s === 'checking' || update_.s === 'downloading'} onClick={checkUpdate}>
            Check
          </button>
        )}
      </div>
      <div className="row">
        <span>Theme</span>
        <div className="segmented small">
          {(['dark', 'light', 'glass', 'auto'] as Theme[]).map((t) => (
            <button key={t} className={settings.theme === t ? 'active' : ''} onClick={() => update({ theme: t })}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {settings.theme === 'glass' && (
        <div className="row">
          <span>Glass style</span>
          <div className="segmented small">
            {(['dark', 'light', 'gradient'] as GlassTint[]).map((t) => (
              <button key={t} className={settings.glassTint === t ? 'active' : ''} onClick={() => update({ glassTint: t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <span>Accent</span>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              aria-label={c}
              className={!settings.accentFromMusic && settings.accent === c ? 'active' : ''}
              style={{ background: c }}
              onClick={() => update({ accent: c, accentFromMusic: false })}
            />
          ))}
          <button
            ref={customBtn}
            className={`swatch-custom ${ACCENTS.includes(settings.accent) ? '' : 'filled active'} ${customOpen ? 'open' : ''}`}
            title="Custom colour"
            aria-label="Custom colour"
            style={ACCENTS.includes(settings.accent) ? undefined : ({ '--swatch': settings.accent } as React.CSSProperties)}
            onClick={() => setCustomOpen((o) => !o)}
          />
        </div>
      </div>
      {customOpen &&
        host &&
        createPortal(
          <div className="cp-pop" onClick={(e) => { e.stopPropagation(); setCustomOpen(false) }}>
            <ColorPicker
              value={settings.accent}
              onAdd={(c) => {
                update({ accent: c, accentFromMusic: false })
                setCustomOpen(false)
              }}
            />
          </div>,
          host,
        )}
      <div className="row">
        <span>Match accent to music</span>
        <Toggle on={settings.accentFromMusic} onChange={(v) => update({ accentFromMusic: v })} />
      </div>
    </div>
  )
}
