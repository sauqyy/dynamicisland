import { type ComponentType, createContext, useContext, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Maximize2, Palette, ShieldCheck, SlidersHorizontal, LayoutGrid, Volume2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { AstraStar } from './AstraStar'
import { AnimatePresence, motion } from 'motion/react'
import { PAGE_VARIANTS } from '../lib/pageAnim'
import { ColorPicker } from './ColorPicker'
import { invoke } from '@tauri-apps/api/core'
import { useUpdater } from '../lib/useUpdater'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { ACCENTS, ASSISTANT_MODELS, CLOUD_MODEL, LOCAL_MODELS, CLOUD_VOICES, EQ_STYLES, ACCESSORY_SLOTS, toggleAccessory, type MascotAccessory, PERSONAS, TOOLS, SIZE_DEFAULTS, SIZE_LIMITS, SOUND_PACKS, TAB_ANIMS, toolOn, type Anim, type ChatAnim, type IdleDisplay, type GlassTint, type AssistantModel, type Persona, type Settings, type ToolId, type TalkMode, type Theme } from '../lib/settings'
import { IS_TAURI } from '../lib/useMedia'
import { IS_MAC } from '../lib/files'
import { PAGES, type Tab } from '../types'
import { play } from 'cuelume'
import { disclosureCue, previewPack } from '../lib/sound'
import { Bars } from './Equalizer'
import { Mascot } from '../mascot/Mascot'

import { clearKey, hasKey, setKey } from '../lib/assistantBrain'
import { sampleVoice } from '../lib/voice'
import { loadNeural, NEURAL_VOICES, neuralVoice, useNeuralStatus } from '../lib/neuralVoice'
import { parseIntent } from '../lib/intents'
import { useHotkeyStatus } from '../lib/useAssistant'
import { loadStt, setSttModel, STT_MODELS, useSttStatus } from '../lib/speechToText'
import { loadLlm, useLlmStatus } from '../lib/localBrain'
import { refreshClaude, signInClaude, signOutClaude, useClaudeAccount } from '../lib/claudeAccount'
import { setAudioPrefs, useAudioDevices, useAudioPrefs } from '../lib/audioDevices'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  updater: ReturnType<typeof useUpdater>
  /** the settings can fill the screen as a sidebar-and-pane window, like the system settings of a Mac */
  fullscreen?: boolean
  onFullscreen?: (on: boolean) => void
  /** pages that are not available right now (Campus before Verify Student), left out of the list */
  unavailable: Tab[]
}

/** The sidebar of the full-screen settings, and which titled card belongs to which entry. */
const SYS_CATS: { id: string; label: string; color: string; Icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>; titles: string[] }[] = [
  { id: 'general', label: 'General', color: '#8e8e93', Icon: SlidersHorizontal, titles: ['General', 'Updates'] },
  { id: 'appearance', label: 'Appearance', color: '#0a84ff', Icon: Palette, titles: ['Appearance', 'Pill', 'Motion'] },
  { id: 'sound', label: 'Sound', color: '#ff453a', Icon: Volume2, titles: ['Sound'] },
  { id: 'astra', label: 'Astra', color: '#bf5af2', Icon: AstraStar, titles: ['Buddy', 'Buddy brain and voice', 'Buddy actions'] },
  { id: 'pages', label: 'Pages', color: '#ff9f0a', Icon: LayoutGrid, titles: ['Pages'] },
  { id: 'privacy', label: 'Study & privacy', color: '#30d158', Icon: ShieldCheck, titles: ['Study', 'Clipboard privacy'] },
]
/** the entry being shown in full-screen settings; null shows every card in one list */
const SysCat = createContext<string | null>(null)

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
  const cat = useContext(SysCat)
  if (cat && !SYS_CATS.find((c) => c.id === cat)?.titles.includes(title)) return null
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


type KeyLike = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

const modifiersOf = (e: KeyLike) => [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[]

/** Turns a key press into Tauri's accelerator text ("Control+Shift+Space"), or null while it is not a full shortcut yet. */
function accelerator(e: KeyLike): string | null {
  const c = e.code
  let key: string | null = null
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3)
  else if (/^Digit\d$/.test(c)) key = c.slice(5)
  else if (/^F\d{1,2}$/.test(c) || ['Space', 'Enter', 'Tab'].includes(c)) key = c
  if (!key) return null
  const mods = modifiersOf(e)
  // a bare letter would hijack typing everywhere; function keys are the only exception
  if (!mods.length && !/^F\d/.test(key)) return null
  return [...mods, key].join('+')
}

/** Ready-made shortcuts, for when pressing your own keys is not possible or not wanted. */
const PRESET_KEYS = ['Control+Shift+Space', 'Control+Alt+Space', 'Control+Shift+A', 'Control+Shift+J', 'Control+Alt+J', 'Alt+Shift+Space', 'F9', 'F10']

const prettyKey = (v: string) => v.replace('Control', 'Ctrl').replace('Super', IS_MAC ? 'Cmd' : 'Win').replaceAll('+', ' + ')

/** Press the keys you want (or pick a ready-made one). It listens on the whole window, so it does not depend on focus. */
function HotkeyPicker({ value, onPick }: { value: string; onPick: (k: string) => void }) {
  const [rec, setRec] = useState(false)
  const [held, setHeld] = useState('')
  const status = useHotkeyStatus()
  // the parent makes a new function every render; the listeners must not be rebuilt because of that
  const pick = useRef(onPick)
  pick.current = onPick
  useEffect(() => {
    if (!rec) return
    const down = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRec(false)
      setHeld(modifiersOf(e).join(' + '))
      const k = accelerator(e)
      if (k) {
        pick.current(k)
        setRec(false)
      }
    }
    const up = () => setHeld('')
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    // it gives up by itself, so it can never get stuck waiting
    const t = setTimeout(() => setRec(false), 10000)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      clearTimeout(t)
      setHeld('')
    }
  }, [rec])
  return (
    <span className="hk">
      <span className="key-row">
        <button className={`chip hotkey ${rec ? 'rec' : ''}`} data-cuelume-select onClick={() => setRec((r) => !r)}>
          {rec ? (held ? `${held} + …` : 'Press the keys…') : prettyKey(value)}
        </button>
        <select className="set-input set-select hk-preset" value={PRESET_KEYS.includes(value) ? value : ''} onChange={(e) => e.target.value && onPick(e.target.value)} aria-label="Ready-made shortcuts">
          <option value="" disabled>
            Presets
          </option>
          {PRESET_KEYS.map((k) => (
            <option key={k} value={k}>
              {prettyKey(k)}
            </option>
          ))}
        </select>
      </span>
      {rec && <small className="set-note">Hold Ctrl, Alt or Shift, then press a key. Esc to cancel</small>}
      {!rec && !status.ok && <small className="set-note bad">{status.error}</small>}
    </span>
  )
}

/** Brain, personality and voice for the talking buddy. */
function BuddyBrain({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const [hasO, setHasO] = useState(false)
  const [draftO, setDraftO] = useState('')
  const [errO, setErrO] = useState('')
  const ns = useNeuralStatus()
  const ss = useSttStatus()
  const ls = useLlmStatus()
  const acct = useClaudeAccount()
  const lsMine = ls.model === settings.assistantLocalModel ? ls : { ...ls, state: 'idle' as const, progress: 0 }
  useEffect(() => {
    void hasKey('openai').then(setHasO)
  }, [])
  // picking Claude looks up whether Claude Code is there and signed in
  useEffect(() => {
    if (settings.assistantEngine === 'claude') void refreshClaude()
  }, [settings.assistantEngine])
  const saveO = async () => {
    try {
      await setKey(draftO, 'openai')
      setDraftO('')
      setErrO('')
      setHasO(true)
    } catch (e) {
      setErrO(typeof e === 'string' ? e : 'Could not save the key')
    }
  }
  const prefs = { voice: settings.assistantVoice, rate: settings.assistantRate, cloud: settings.assistantVoiceEngine === 'openai' ? { voice: settings.assistantCloudVoice, model: CLOUD_MODEL } : null }
  const sample = `Hi, I'm ${settings.mascotName || 'Astra'}. This is how I sound.`
  return (
    <Group title="Buddy brain and voice">
      <div className="row">
        <span>
          Brain
          <small className="set-note block">{settings.assistantEngine === 'claude' ? 'Claude, signed in with your Claude account. No API key' : 'Free. A small model on this PC, no account needed'}</small>
        </span>
        <Segmented<'local' | 'claude'> options={[['local', 'Built-in'], ['claude', 'Claude']]} value={settings.assistantEngine} onPick={(assistantEngine) => update({ assistantEngine })} />
      </div>
      {settings.assistantEngine === 'claude' ? (
        <>
          <div className="row">
            <span>
              Claude account
              <small className="set-note block">
                {acct.state === 'checking'
                  ? 'Checking...'
                  : acct.state === 'missing'
                    ? 'This needs Claude Code, which comes with the Claude app. Install it, then check again'
                    : acct.state === 'out'
                      ? 'Not signed in. Sign in once, in your browser, with your Claude account'
                      : acct.state === 'signing'
                        ? 'Finish signing in in your browser...'
                        : 'Signed in. Uses your Claude plan. Answers take a few seconds longer than the built-in brain'}
              </small>
            </span>
            <span className="key-row">
              {acct.state === 'in' && (
                <button className="chip" onClick={() => void signOutClaude()}>
                  Sign out
                </button>
              )}
              {acct.state === 'out' && (
                <button className="chip" onClick={() => void signInClaude()}>
                  Sign in
                </button>
              )}
              {acct.state === 'signing' && (
                <button className="chip" disabled>
                  Waiting...
                </button>
              )}
              {(acct.state === 'missing' || acct.state === 'checking') && (
                <>
                  <button className="chip" disabled={acct.state === 'checking'} onClick={() => void refreshClaude()}>
                    Check again
                  </button>
                  {IS_TAURI && acct.state === 'missing' && (
                    <button className="chip" onClick={() => void invoke('open_url', { url: 'https://claude.com/product/claude-code' })}>
                      Get Claude Code
                    </button>
                  )}
                </>
              )}
            </span>
          </div>
          {acct.error && <span className="set-note bad">{acct.error}</span>}
          <div className="row">
            <span>Model</span>
            <Segmented<AssistantModel> options={ASSISTANT_MODELS} value={settings.assistantModel} onPick={(assistantModel) => update({ assistantModel })} />
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <span>
              Model
              <small className="set-note block">{LOCAL_MODELS.find(([id]) => id === settings.assistantLocalModel)?.[2]}</small>
            </span>
            <select className="set-input set-select" value={settings.assistantLocalModel} onChange={(e) => update({ assistantLocalModel: e.target.value })}>
              {LOCAL_MODELS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>
              Brain status
              <small className="set-note block">
                {lsMine.state === 'ready'
                  ? `Ready, running on your ${lsMine.device === 'gpu' ? 'graphics card' : 'processor (a bit slower)'}. Works offline`
                  : lsMine.state === 'loading'
                    ? lsMine.stage === 'engine'
                      ? 'Downloading the engine (about 40 MB), once'
                      : lsMine.stage === 'starting'
                        ? 'Starting the brain...'
                        : 'Downloading the model, once per model'
                    : lsMine.state === 'error'
                      ? lsMine.error
                      : 'Downloads once (the engine and the model), then works offline'}
              </small>
            </span>
            <button className="chip" disabled={lsMine.state === 'loading' || lsMine.state === 'ready'} onClick={() => void loadLlm(settings.assistantLocalModel).catch(() => {})}>
              {lsMine.state === 'ready' ? 'Ready' : lsMine.state === 'loading' ? (lsMine.stage === 'starting' ? '...' : `${Math.round(lsMine.progress * 100)}%`) : lsMine.state === 'error' ? 'Try again' : 'Download'}
            </button>
          </div>
        </>
      )}
      <div className="row">
        <span>Personality</span>
        <Segmented<Persona> options={PERSONAS} value={settings.assistantPersona} onPick={(assistantPersona) => update({ assistantPersona })} />
      </div>
      <div className="row">
        <span>Answers</span>
        <Segmented<'short' | 'normal'> options={[['short', 'Short'], ['normal', 'Longer']]} value={settings.assistantLength} onPick={(assistantLength) => update({ assistantLength })} />
      </div>
      <div className="row">
        <span>Call me</span>
        <input className="set-input" value={settings.assistantUserName} maxLength={24} placeholder="Your name" spellCheck={false} onChange={(e) => update({ assistantUserName: e.target.value })} />
      </div>
      <div className="row stack">
        <span>Your own instructions</span>
        <textarea
          className="set-input set-area"
          rows={3}
          maxLength={400}
          spellCheck={false}
          value={settings.assistantStyle}
          placeholder="e.g. Answer like a pirate. Always reply in Indonesian."
          onChange={(e) => update({ assistantStyle: e.target.value })}
        />
      </div>
      <div className="row">
        <span>
          Listening (speech recognition)
          <small className="set-note block">
            {ss.state === 'ready'
              ? `Ready, running on your ${ss.device === 'gpu' ? 'graphics card' : 'processor (slower)'}. Works offline, in many languages`
              : ss.state === 'loading'
                ? 'Downloading, this happens once'
                : ss.state === 'error'
                  ? ss.error
                  : 'Runs on this PC. Downloads once, then works offline'}
          </small>
        </span>
        <button className="chip" disabled={ss.state === 'loading' || ss.state === 'ready'} onClick={() => void loadStt().catch(() => {})}>
          {ss.state === 'ready' ? 'Ready' : ss.state === 'loading' ? `${Math.round(ss.progress * 100)}%` : ss.state === 'error' ? 'Try again' : 'Download'}
        </button>
      </div>
      <div className="row">
        <span>
          How well it listens
          <small className="set-note block">{STT_MODELS.find(([id]) => id === settings.assistantListenModel)?.[2]}</small>
        </span>
        <select
          className="set-input set-select"
          value={settings.assistantListenModel}
          onChange={(e) => {
            setSttModel(e.target.value)
            update({ assistantListenModel: e.target.value })
          }}
        >
          {STT_MODELS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <span>Speak answers aloud</span>
        <Toggle on={settings.assistantSpeak} onChange={(v) => update({ assistantSpeak: v })} />
      </div>
      {settings.assistantSpeak && (
        <>
          <div className="row">
            <span>Voice type</span>
            <Segmented<'neural' | 'openai'> options={[['neural', 'Natural (on this PC)'], ['openai', 'OpenAI (paid)']]} value={settings.assistantVoiceEngine === 'openai' ? 'openai' : 'neural'} onPick={(assistantVoiceEngine) => update({ assistantVoiceEngine })} />
          </div>
          {settings.assistantVoiceEngine === 'openai' ? (
            <>
              <div className="row stack">
                <span>
                  OpenAI API key {hasO && <em className="key-ok">saved in the system keychain</em>}
                </span>
                {IS_TAURI ? (
                  <div className="key-row">
                    <input
                      className="set-input key-input"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={draftO}
                      placeholder={hasO ? 'Paste a new key to replace it' : 'sk-...'}
                      onChange={(e) => setDraftO(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && draftO.trim() && void saveO()}
                    />
                    <button className="chip" disabled={!draftO.trim()} onClick={() => void saveO()}>
                      Save
                    </button>
                    {hasO && (
                      <button className="chip" onClick={() => void clearKey('openai').then(() => setHasO(false))}>
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="set-note">The key is only stored in the desktop app.</span>
                )}
                {errO && <span className="set-note bad">{errO}</span>}
                <span className="set-note">Costs a fraction of a cent per answer. If it cannot be reached, the natural voice on this PC speaks instead.</span>
              </div>
              <div className="row">
                <span>Voice</span>
                <select className="set-input set-select" value={settings.assistantCloudVoice} onChange={(e) => update({ assistantCloudVoice: e.target.value })}>
                  {CLOUD_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="row">
                <span>
                  Voice model
                  <small className="set-note block">
                    {ns.state === 'ready'
                      ? `Ready, running on your ${ns.device === 'gpu' ? 'graphics card' : 'processor (slower)'}`
                      : ns.state === 'loading'
                        ? 'Downloading, this happens once'
                        : ns.state === 'error'
                          ? ns.error
                          : 'Downloads once (about 330 MB on a graphics card), then works offline'}
                  </small>
                </span>
                <button className="chip" disabled={ns.state === 'loading' || ns.state === 'ready'} onClick={() => void loadNeural().catch(() => {})}>
                  {ns.state === 'ready' ? 'Ready' : ns.state === 'loading' ? `${Math.round(ns.progress * 100)}%` : ns.state === 'error' ? 'Try again' : 'Download'}
                </button>
              </div>
              <div className="row">
                <span>Voice</span>
                <select className="set-input set-select" value={neuralVoice(settings.assistantVoice)} onChange={(e) => update({ assistantVoice: e.target.value })}>
                  {NEURAL_VOICES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <Slider label="Speed" value={settings.assistantRate} format={(v) => `${v.toFixed(2)}x`} limits={SIZE_LIMITS.voiceRate} onChange={(assistantRate) => update({ assistantRate })} />
          <div className="row">
            <span>Hear it</span>
            <button
              className="chip"
              onClick={async () => {
                setErrO('')
                const bad = await sampleVoice(sample, prefs)
                if (bad) setErrO(bad)
              }}
            >
              Play a sample
            </button>
          </div>
          {errO && !prefs.cloud && <span className="set-note bad">{errO}</span>}
        </>
      )}
    </Group>
  )
}

/** What the buddy may do on the computer, plus your own shortcuts and routines. */
function BuddyActions({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const aliases = settings.assistantAliases
  const routines = settings.assistantRoutines
  const setTool = (id: ToolId, on: boolean) => update({ assistantTools: { ...settings.assistantTools, [id]: on } })
  return (
    <Group title="Buddy actions">
      {TOOLS.map((t) => (
        <div className="row" key={t.id}>
          <span>
            {t.label}
            <small className="set-note block">{t.hint}</small>
          </span>
          <Toggle on={toolOn(settings, t.id)} onChange={(v) => setTool(t.id, v)} />
        </div>
      ))}
      <div className="row stack">
        <span>
          Shortcuts <em className="key-ok">say "open my notes"</em>
        </span>
        {aliases.map((a, i) => (
          <div className="alias-row" key={i}>
            <input className="set-input" value={a.name} placeholder="my notes" maxLength={30} spellCheck={false} onChange={(e) => update({ assistantAliases: aliases.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input className="set-input" value={a.target} placeholder="App name, folder path, or https link" spellCheck={false} onChange={(e) => update({ assistantAliases: aliases.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })} />
            <button className="chip" aria-label="Remove shortcut" onClick={() => update({ assistantAliases: aliases.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="chip add" onClick={() => update({ assistantAliases: [...aliases, { name: '', target: '' }] })}>
          + Add a shortcut
        </button>
      </div>
      <div className="row stack">
        <span>
          Routines <em className="key-ok">say "study mode"</em>
        </span>
        {routines.map((r, i) => {
          const bad = r.steps.split('\n').map((l) => l.trim()).filter((l) => l && !parseIntent(l, []))
          return (
            <div className="routine" key={i}>
              <div className="alias-row">
                <input className="set-input" value={r.name} placeholder="study mode" maxLength={30} spellCheck={false} onChange={(e) => update({ assistantRoutines: routines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <button className="chip" aria-label="Remove routine" onClick={() => update({ assistantRoutines: routines.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
              <textarea
                className="set-input set-area"
                rows={3}
                spellCheck={false}
                value={r.steps}
                placeholder={'open Notion\nopen youtube.com\ntimer 25 minutes'}
                onChange={(e) => update({ assistantRoutines: routines.map((x, j) => (j === i ? { ...x, steps: e.target.value } : x)) })}
              />
              {bad.length > 0 && <span className="set-note bad">Not understood: {bad.join(' | ')}</span>}
            </div>
          )
        })}
        <button className="chip add" onClick={() => update({ assistantRoutines: [...routines, { name: '', steps: '' }] })}>
          + Add a routine
        </button>
        <span className="set-note">One step per line: open Spotify, open youtube.com, timer 25 minutes, volume 30, play music, add buy milk to my to-do list.</span>
      </div>
    </Group>
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

export function SettingsWidget({ settings, update, updater, fullscreen, onFullscreen, unavailable }: Props) {
  const [cat, setCat] = useState(SYS_CATS[0].id)
  const buddyColor = settings.mascotColor === 'accent' ? settings.accent : settings.mascotColor
  // a window that hot-reloaded from an older build can still hold settings without per-item colours
  const colors = settings.mascotAccessoryColors ?? {}
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
              : ''

  const body = (
    <div className="settings settings2" onClick={(e) => e.stopPropagation()}>
      {!fullscreen && onFullscreen && (
        <button className="set-open" data-cuelume-tap onClick={() => onFullscreen(true)}>
          <Maximize2 size={13} strokeWidth={2.2} aria-hidden />
          Open in full window
        </button>
      )}
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
            disabled={!settings.posX && !settings.posY && !settings.posBottom}
            data-cuelume-tap
            data-cuelume-emphasis="subtle"
            onClick={() => update({ posX: 0, posY: 0, posBottom: false })}
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
        <div className="row">
          <span>Chat animation</span>
          <Segmented<ChatAnim>
            options={[['slide', 'Slide'], ['pop', 'Pop'], ['rise', 'Rise']]}
            value={settings.chatAnim}
            onPick={(chatAnim) => update({ chatAnim })}
          />
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

      <Group title="Study">
        <div className="row">
          <span>Mute alerts while focusing</span>
          <Toggle on={settings.focusMute} onChange={(v) => update({ focusMute: v })} />
        </div>
        <div className="row">
          <span>Next class in the pill</span>
          <Toggle on={settings.classPill} onChange={(v) => update({ classPill: v })} />
        </div>
        <div className="row">
          <span>Class mode (mute during class)</span>
          <Toggle on={settings.classMode} onChange={(v) => update({ classMode: v })} />
        </div>
        <div className="row">
          <span>Urgent deadlines take over the pill</span>
          <Toggle on={settings.deadlineAlert} onChange={(v) => update({ deadlineAlert: v })} />
        </div>
        <div className="row">
          <span>Eye-rest and stretch reminders</span>
          <Toggle on={settings.wellbeing} onChange={(v) => update({ wellbeing: v })} />
        </div>
        <div className="row">
          <span>Share my study time with friends</span>
          <Toggle on={settings.shareStudy} onChange={(v) => update({ shareStudy: v })} />
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

      <Group title="Buddy">
        <div className="row">
          <span>Talk to the island</span>
          <Toggle on={settings.assistant} onChange={(v) => update({ assistant: v })} />
        </div>
        {settings.assistant && (
          <>
            <div className="buddy-preview">
              <Mascot state="idle" size={92} color={buddyColor} accessories={settings.mascotAccessories} accessoryColors={colors} />
              <b>{settings.mascotName || 'Astra'}</b>
            </div>
            <div className="row">
              <span>Shortcut</span>
              <HotkeyPicker value={settings.assistantKey} onPick={(assistantKey) => update({ assistantKey })} />
            </div>
            <div className="row">
              <span>How to talk</span>
              <Segmented<TalkMode> options={[['hold', 'Hold keys'], ['toggle', 'Press twice']]} value={settings.assistantTalk} onPick={(assistantTalk) => update({ assistantTalk })} />
            </div>
            <div className="row">
              <span>Name</span>
              <input
                className="set-input"
                value={settings.mascotName}
                maxLength={16}
                placeholder="Astra"
                spellCheck={false}
                onChange={(e) => update({ mascotName: e.target.value })}
              />
            </div>
            <div className="row">
              <span>Colour</span>
              <div className="swatches">
                <button className={`swatch-follow ${settings.mascotColor === 'accent' ? 'active' : ''}`} title="Follow the accent colour" aria-label="Follow the accent colour" data-cuelume-select onClick={() => update({ mascotColor: 'accent' })}>
                  A
                </button>
                {ACCENTS.map((c) => (
                  <button key={c} aria-label={c} className={settings.mascotColor === c ? 'active' : ''} data-cuelume-select style={{ background: c }} onClick={() => update({ mascotColor: c })} />
                ))}
              </div>
            </div>
            <div className="row stack">
              <span>
                Accessories <em className="key-ok">one per slot, mix the slots</em>
              </span>
              <div className="outfit">
                {ACCESSORY_SLOTS.map((slot) => {
                  const worn = slot.items.find((i) => settings.mascotAccessories.includes(i.id))
                  const wear = (id: MascotAccessory) => update({ mascotAccessories: toggleAccessory(settings.mascotAccessories, id) })
                  return (
                    <div key={slot.id} className="outfit-slot">
                      <div className="outfit-label">{slot.label}</div>
                      <div className="outfit-tiles">
                        <button className={`outfit-tile ${worn ? '' : 'active'}`} aria-pressed={!worn} data-cuelume-select onClick={() => worn && wear(worn.id)}>
                          <Mascot state="idle" size={46} color={buddyColor} />
                          <span>None</span>
                        </button>
                        {slot.items.map((i) => (
                          <button key={i.id} className={`outfit-tile ${worn?.id === i.id ? 'active' : ''}`} aria-pressed={worn?.id === i.id} data-cuelume-select onClick={() => wear(i.id)}>
                            <Mascot state="idle" size={46} color={buddyColor} accessories={[i.id]} accessoryColors={{ [i.id]: colors[i.id] }} />
                            <span>{i.label}</span>
                          </button>
                        ))}
                      </div>
                      {worn && (
                        <div className="outfit-color">
                          <span>{worn.label} colour</span>
                          <div className="swatches">
                            <button
                              className={`swatch-follow ${colors[worn.id] ? '' : 'active'}`}
                              title="Its own colour"
                              aria-label="Original colour"
                              data-cuelume-select
                              style={{ color: worn.own }}
                              onClick={() => {
                                const { [worn.id]: _gone, ...rest } = colors
                                update({ mascotAccessoryColors: rest })
                              }}
                            >
                              A
                            </button>
                            {ACCENTS.map((c) => (
                              <button key={c} aria-label={c} className={colors[worn.id] === c ? 'active' : ''} data-cuelume-select style={{ background: c }} onClick={() => update({ mascotAccessoryColors: { ...colors, [worn.id]: c } })} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {settings.mascotAccessories.length > 0 && (
                <button className="chip acc" data-cuelume-select onClick={() => update({ mascotAccessories: [], mascotAccessoryColors: {} })}>
                  Take everything off
                </button>
              )}
            </div>
            <div className="row">
              <span>Show eyes in the resting pill</span>
              <Toggle on={settings.mascotInPill} onChange={(v) => update({ mascotInPill: v })} />
            </div>
          </>
        )}
      </Group>

      {settings.assistant && <BuddyBrain settings={settings} update={update} />}
      {settings.assistant && <BuddyActions settings={settings} update={update} />}

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
          <span>Smart mode (show on hover)</span>
          <Toggle on={settings.smartMode} onChange={(v) => update({ smartMode: v })} />
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
          <span>
            Version {version && <span className="version-now">v{version}</span>}
          </span>
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

  if (!fullscreen) return body
  const current = SYS_CATS.find((c) => c.id === cat) ?? SYS_CATS[0]
  return (
    <div className="sysset" onClick={(e) => e.stopPropagation()}>
      <aside className="sys-side">
        <button className="sys-back" data-cuelume-close onClick={() => onFullscreen?.(false)}>
          <ChevronLeft size={15} strokeWidth={2.4} aria-hidden />
          Back
        </button>
        <b className="sys-title">Settings</b>
        <nav>
          {SYS_CATS.map(({ id, label, color, Icon }) => (
            <button key={id} className={`sys-item ${id === current.id ? 'on' : ''}`} aria-current={id === current.id ? 'page' : undefined} data-cuelume-select onClick={() => setCat(id)}>
              <span className="sys-ic" style={{ background: color }}>
                <Icon size={13} strokeWidth={2.3} aria-hidden />
              </span>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="sys-main">
        <div className="sys-page">
          <h2>{current.label}</h2>
          <SysCat.Provider value={current.id}>{body}</SysCat.Provider>
        </div>
      </main>
    </div>
  )
}
