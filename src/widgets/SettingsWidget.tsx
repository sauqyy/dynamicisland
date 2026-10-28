import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { PAGE_VARIANTS } from '../lib/pageAnim'
import { ColorPicker } from './ColorPicker'
import { invoke } from '@tauri-apps/api/core'
import { useUpdater } from '../lib/useUpdater'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { ACCENTS, EQ_STYLES, SIZE_DEFAULTS, SIZE_LIMITS, SOUND_PACKS, TAB_ANIMS, type Anim, type IdleDisplay, type GlassTint, type Settings, type Theme } from '../lib/settings'
import { IS_TAURI } from '../lib/useMedia'
import { IS_MAC } from '../lib/files'
import { PAGES, type Tab } from '../types'
import { play } from 'cuelume'
import { disclosureCue, previewPack } from '../lib/sound'
import { Bars } from './Equalizer'

import { setAudioPrefs, useAudioDevices, useAudioPrefs } from '../lib/audioDevices'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  updater: ReturnType<typeof useUpdater>
  /** pages that are not available right now (Campus before Verify Student), left out of the list */
  unavailable: Tab[]
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} data-cuelume-toggle>
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
        data-cuelume-select
        data-cuelume-emphasis="subtle"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">{format(value)}</span>
    </div>
  )
}

/** A row of mutually exclusive choices. */
function Segmented<T extends string | number>({ options, value, onPick }: { options: [T, string][]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="segmented small">
      {options.map(([v, label]) => (
        <button key={String(v)} className={value === v ? 'active' : ''} data-cuelume-select onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** One titled card of settings. */
function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="set-group">
      <h4>
        <span>{title}</span>
        {action}
      </h4>
      <div className="set-card">{children}</div>
    </section>
  )
}

const CLEAR_OPTIONS: [number, string][] = [
  [0, 'Off'],
  [1, '1m'],
  [5, '5m'],
  [15, '15m'],
  [60, '1h'],
]

const capital = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Album hue the equalizer previews use when their colour follows the music. */
const PREVIEW_HUE = 265

/** A short list of devices to pick from: the system default first, then each one that is plugged in. */
function DevicePick({ label, devices, value, named, onPick }: { label: string; devices: MediaDeviceInfo[]; value: string; named: boolean; onPick: (id: string) => void }) {
  const gone = value !== '' && !devices.some((d) => d.deviceId === value)
  return (
    <div className="device-pick">
      <span>{label}</span>
      <div className="device-list" role="radiogroup" aria-label={label}>
        <button role="radio" aria-checked={value === ''} className={value === '' ? 'active' : ''} data-cuelume-select onClick={() => onPick('')}>
          System default
        </button>
        {devices.map((d, i) => (
          <button key={d.deviceId} role="radio" aria-checked={value === d.deviceId} className={value === d.deviceId ? 'active' : ''} data-cuelume-select onClick={() => onPick(d.deviceId)}>
            {d.label || (named ? `Device ${i + 1}` : `${label} ${i + 1}`)}
          </button>
        ))}
        {gone && (
          <button role="radio" aria-checked className="active" disabled>
            Chosen device not found
          </button>
        )}
      </div>
    </div>
  )
}

function CallAudio() {
  const prefs = useAudioPrefs()
  const { mics, speakers, named, allow } = useAudioDevices()
  return (
    <Group
      title="Calls"
      action={
        !named && (
          <button className="chip" onClick={allow} title="Allow microphone access so your devices show their names">
            Show device names
          </button>
        )
      }
    >
      <DevicePick label="Microphone" devices={mics} value={prefs.micId} named={named} onPick={(micId) => setAudioPrefs({ micId })} />
      <DevicePick label="Speaker" devices={speakers} value={prefs.speakerId} named={named} onPick={(speakerId) => setAudioPrefs({ speakerId })} />
      <small className="set-note">A new microphone applies from your next call.</small>
    </Group>
  )
}

export function SettingsWidget({ settings, update, updater, unavailable }: Props) {
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
    <div className="settings settings2" onClick={(e) => e.stopPropagation()}>
      <Group title="Appearance">
        <div className="row">
          <span>Theme</span>
          <Segmented<Theme> options={[['dark', 'Dark'], ['light', 'Light'], ['glass', 'Glass'], ['auto', 'Auto']]} value={settings.theme} onPick={(theme) => update({ theme })} />
        </div>
        {settings.theme === 'glass' && (
          <div className="row">
            <span>Glass style</span>
            <Segmented<GlassTint> options={[['dark', 'Dark'], ['light', 'Light'], ['gradient', 'Gradient']]} value={settings.glassTint} onPick={(glassTint) => update({ glassTint })} />
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
                data-cuelume-select
                style={{ background: c }}
                onClick={() => update({ accent: c, accentFromMusic: false })}
              />
            ))}
            <button
              ref={customBtn}
              className={`swatch-custom ${ACCENTS.includes(settings.accent) ? '' : 'filled active'} ${customOpen ? 'open' : ''}`}
              title="Custom colour"
              aria-label="Custom colour"
              {...disclosureCue(customOpen)}
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
      </Group>

      <Group title="Pill">
        <div className="row">
          <span>Show in pill</span>
          <Segmented<IdleDisplay> options={[['clock', 'Clock'], ['lyrics', 'Lyrics'], ['weather', 'Weather'], ['deadline', 'Deadline']]} value={settings.idle} onPick={(idle) => update({ idle })} />
        </div>
        <div className="row">
          <span>Equalizer while playing</span>
          <Toggle on={settings.idleBars} onChange={(v) => update({ idleBars: v })} />
        </div>
        <div className="row">
          <span>Equalizer style</span>
          <div className="eq-picks" role="radiogroup" aria-label="Equalizer style">
            {EQ_STYLES.map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={settings.eqStyle === v}
                className={`eq-pick ${settings.eqStyle === v ? 'active' : ''}`}
                data-cuelume-select
                onClick={() => update({ eqStyle: v })}
              >
                <Bars active hue={PREVIEW_HUE} variant={v} />
                <small>{capital(v)}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span>Equalizer colour</span>
          <Segmented<'art' | 'accent' | 'custom'>
            options={[['art', 'Album'], ['accent', 'Accent'], ['custom', 'Custom']]}
            value={settings.eqColor === 'art' || settings.eqColor === 'accent' ? settings.eqColor : 'custom'}
            onPick={(v) => update({ eqColor: v === 'custom' ? (settings.eqColor.startsWith('#') ? settings.eqColor : ACCENTS[0]) : v })}
          />
        </div>
        {settings.eqColor.startsWith('#') && (
          <div className="row">
            <span />
            <div className="swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  aria-label={c}
                  className={settings.eqColor === c ? 'active' : ''}
                  data-cuelume-select
                  style={{ background: c }}
                  onClick={() => update({ eqColor: c })}
                />
              ))}
            </div>
          </div>
        )}
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
            data-cuelume-tap
            data-cuelume-emphasis="subtle"
            onClick={() => update({ posX: 0, posY: 0 })}
          >
            Reset
          </button>
        </div>
      </Group>

      <Group
        title="Size"
        action={
          <button className="chip" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={() => update({ ...SIZE_DEFAULTS })}>
            Reset
          </button>
        }
      >
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
        <div className="row">
          <span>Card height</span>
          <Segmented<'fit' | 'fixed'>
            options={[['fit', 'Fits the page'], ['fixed', 'Fixed']]}
            value={settings.cardFit ? 'fit' : 'fixed'}
            onPick={(v) => update({ cardFit: v === 'fit' })}
          />
        </div>
        {!settings.cardFit && (
          <Slider
            label="Height"
            value={settings.cardH}
            limits={SIZE_LIMITS.cardH}
            format={(v) => `${v}`}
            onChange={(cardH) => update({ cardH })}
          />
        )}
      </Group>

      <Group title="Motion">
        <div className="row">
          <span>Animation</span>
          <Segmented<Anim> options={[['bouncy', 'Bouncy'], ['smooth', 'Smooth'], ['snappy', 'Snappy']]} value={settings.anim} onPick={(anim) => update({ anim })} />
        </div>
        <div className="row stack">
          <span>Page animation</span>
          <div className="page-toggles">
            {TAB_ANIMS.map((a) => (
              <button
                key={a}
                className={`chip ${settings.tabAnim === a ? 'on' : ''}`}
                data-cuelume-select
                onClick={() => {
                  update({ tabAnim: a })
                  flip()
                }}
              >
                {capital(a)}
              </button>
            ))}
          </div>
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
          <button className="chip" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={flip}>
            Replay
          </button>
        </div>
      </Group>

      <Group title="Sound">
        <div className="row">
          <span>Sound effects</span>
          {/* these play their own cue: a preview in the pack just picked, or a last one on the way to mute */}
          <div className="segmented small">
            <button
              className={settings.uiSounds ? '' : 'active'}
              onClick={() => {
                if (settings.uiSounds) play('close', { emphasis: 'subtle' })
                update({ uiSounds: false })
              }}
            >
              Mute
            </button>
            {SOUND_PACKS.map((p) => (
              <button
                key={p}
                className={settings.uiSounds && settings.soundPack === p ? 'active' : ''}
                onClick={() => {
                  update({ uiSounds: true, soundPack: p })
                  previewPack(p)
                }}
              >
                {capital(p)}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Sound volume"
          value={settings.soundVolume}
          limits={SIZE_LIMITS.soundVolume}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(soundVolume) => update({ soundVolume })}
        />
        <div className="row">
          <span>Keyboard sounds</span>
          <Toggle on={settings.typingSounds} onChange={(v) => update({ typingSounds: v })} />
        </div>
        <div className="row">
          <span>Message sound</span>
          <Toggle on={settings.messageSound} onChange={(v) => update({ messageSound: v })} />
        </div>
      </Group>

      <CallAudio />

      <Group title="Pages">
        <div className="page-toggles">
          {PAGES.filter((p) => p.id !== 'settings' && !unavailable.includes(p.id)).map((p) => {
            const on = !settings.hiddenPages.includes(p.id)
            return (
              <button
                key={p.id}
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                data-cuelume-toggle
                onClick={() =>
                  update({ hiddenPages: on ? [...settings.hiddenPages, p.id] : settings.hiddenPages.filter((h) => h !== p.id) })
                }
              >
                {p.title}
              </button>
            )
          })}
        </div>
      </Group>

      <Group title="Clipboard privacy">
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
          <Segmented<number> options={CLEAR_OPTIONS} value={settings.clipAutoClear} onPick={(clipAutoClear) => update({ clipAutoClear })} />
        </div>
      </Group>

      <Group title="General">
        <div className="row">
          <span>{IS_MAC ? 'Start at login' : 'Start with Windows'}</span>
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
          <Segmented<number>
            options={Array.from({ length: monitors + 1 }, (_, i): [number, string] => [i, i === 0 ? 'Main' : String(i)])}
            value={settings.monitor}
            onPick={(monitor) => update({ monitor })}
          />
        </div>
      </Group>

      <Group title="Updates">
        <div className="row">
          <span>Version</span>
          <span className="update-status">{status}</span>
          {update_.s === 'available' ? (
            <button className="chip" data-cuelume-tap onClick={() => downloadUpdate(update_.url)}>
              Update
            </button>
          ) : (
            <button className="chip" disabled={update_.s === 'checking' || update_.s === 'downloading'} data-cuelume-tap onClick={checkUpdate}>
              Check
            </button>
          )}
        </div>
      </Group>
    </div>
  )
}
