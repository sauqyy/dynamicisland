import { useEffect, useState } from 'react'
import { play } from 'cuelume'
import { RotateCcw } from 'lucide-react'
import { LumiFace } from '../mascot/lumi/LumiFace'
import type { LumiMood } from '../mascot/lumi/moods'
import { LUMI_LOOK_DEFAULT, type LumiEyeShape, type LumiFollow, type LumiLively, type LumiLook, type Settings } from '../lib/settings'
import { Segmented, Slider, Toggle } from './SettingsWidget'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

type Section = 'style' | 'behaviour' | 'pill'

/** whole looks in one tap; they leave where she sits and how she behaves alone */
const PRESETS: { id: string; label: string; look: Partial<LumiLook> }[] = [
  { id: 'classic', label: 'Classic', look: { shape: 'spirit', color: '#ffffff', body: '#262843', size: 1, gap: 0, tilt: 14, glow: 1 } },
  { id: 'friendly', label: 'Friendly', look: { shape: 'soft', color: '#ffffff', body: '#262843', size: 1.05, gap: 0, tilt: 0, glow: 1 } },
  { id: 'sparkly', label: 'Sparkly', look: { shape: 'star', color: '#ffe08a', body: '#1f3a44', size: 1, gap: 1, tilt: 0, glow: 1.6 } },
  { id: 'sweet', label: 'Sweet', look: { shape: 'round', color: '#ffb3d1', body: '#43263a', size: 1, gap: 0, tilt: 0, glow: 1.2 } },
  { id: 'sleepy', label: 'Sleepy', look: { shape: 'dot', color: '#9ad7ff', body: '#2e2e33', size: 0.95, gap: 2, tilt: -6, glow: 0.6 } },
]
const SHAPES: [LumiEyeShape, string][] = [
  ['spirit', 'Spirit'],
  ['soft', 'Soft'],
  ['round', 'Round'],
  ['dot', 'Dot'],
  ['star', 'Star'],
]
const EYE_COLORS = ['#ffffff', '#ffe08a', '#9ad7ff', '#ffb3d1', '#b8f5c8']
const BODY_COLORS = ['#262843', '#1f3a44', '#2b3a2e', '#43263a', '#3a3226', '#2e2e33']
const LIVELY: [LumiLively, string][] = [
  ['chill', 'Chill'],
  ['normal', 'Usual'],
  ['playful', 'Playful'],
]
const FOLLOWS: [LumiFollow, string][] = [
  ['glance', 'Glance'],
  ['stare', 'Watch'],
  ['off', 'Ignore'],
]
/** her moments, played in the preview on a tap so a change can be seen in action */
const SHOW: LumiMood[] = ['hello', 'delight', 'laughing', 'sleepy']

const signed = (v: number) => (v === 0 ? 'Default' : `${v > 0 ? '+' : ''}${v}px`)
const percent = (v: number) => (v === 1 ? 'Default' : `${Math.round(v * 100)}%`)
const same = (look: LumiLook, p: Partial<LumiLook>) => (Object.keys(p) as (keyof LumiLook)[]).every((k) => look[k] === p[k])

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="lumi-swatches" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button key={c} role="radio" aria-checked={value.toLowerCase() === c} className={`lumi-swatch ${value.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} data-cuelume-select onClick={() => onPick(c)} />
      ))}
      <input type="color" className="lumi-swatch custom" value={value} aria-label={`Any ${label.toLowerCase()}`} onChange={(e) => onPick(e.target.value)} />
    </div>
  )
}

/** A small on/off chip, so several of her habits fit on one line. */
function Habit({ on, label, hint, onChange }: { on: boolean; label: string; hint: string; onChange: (v: boolean) => void }) {
  return (
    <button className={`lumi-habit ${on ? 'on' : ''}`} role="switch" aria-checked={on} title={hint} data-cuelume-toggle onClick={() => onChange(!on)}>
      {label}
    </button>
  )
}

/**
 * Lumi's own page. Her preview stays at the top; under it, one short section at a time: how she looks, how
 * she behaves, and where she sits in the pill. Nothing here needs scrolling.
 */
export function LumiWidget({ settings, update }: Props) {
  const look = settings.lumiLook
  const set = (patch: Partial<LumiLook>) => update({ lumiLook: { ...look, ...patch } })
  const [section, setSection] = useState<Section>('style')
  const [fine, setFine] = useState(false)
  const [demo, setDemo] = useState<{ mood: LumiMood; n: number } | null>(null)
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 15_000)
    return () => window.clearInterval(t)
  }, [])
  // a moment plays for a few seconds, then she rests again
  useEffect(() => {
    if (!demo) return
    const t = window.setTimeout(() => setDemo(null), 3200)
    return () => window.clearTimeout(t)
  }, [demo])
  const showOff = () => setDemo((d) => ({ mood: SHOW[((d ? SHOW.indexOf(d.mood) : -1) + 1) % SHOW.length], n: (d?.n ?? 0) + 1 }))

  return (
    <div className="settings settings2 lumi-page" onClick={(e) => e.stopPropagation()}>
      <div className="lumi-top">
        <div className="lumi-preview" aria-label="Preview of the resting pill">
          {settings.lumi ? (
            <span className="idle-lumi">
              <LumiFace mood="idle" height={26} look={look} />
              {settings.lumiClock && <span className="idle-time">{clock}</span>}
            </span>
          ) : (
            <span className="idle-time">{clock}</span>
          )}
        </div>
        {settings.lumi && (
          <button className="lumi-stage" title="Tap to see her in action" aria-label="Play one of her moments" data-cuelume-tap onClick={showOff}>
            <LumiFace mood={demo?.mood ?? 'idle'} replay={demo?.n} height={46} body still look={look} />
          </button>
        )}
        <div className="lumi-power" title={settings.lumi ? 'Turn Lumi off' : 'Turn Lumi on'}>
          <Toggle on={settings.lumi} onChange={(v) => update({ lumi: v })} />
        </div>
      </div>

      {!settings.lumi ? (
        <p className="lumi-off">Lumi is off. The pill shows the plain clock and alerts arrive without her.</p>
      ) : (
        <>
          <Segmented<Section>
            options={[
              ['style', 'Look'],
              ['behaviour', 'Behaviour'],
              ['pill', 'Pill'],
            ]}
            value={section}
            onPick={setSection}
          />

          <div className="lumi-section set-card">
            {section === 'style' && (
              <>
                <div className="row lumi-chips" role="group" aria-label="Presets">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      className={`todo-group-chip ${same(look, p.look) ? 'on' : ''}`}
                      data-cuelume-select
                      onClick={() => {
                        play('tap')
                        set(p.look)
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <span>Eyes</span>
                  <Segmented options={SHAPES} value={look.shape} onPick={(shape) => set({ shape })} />
                </div>
                <div className="row">
                  <span>Eye colour</span>
                  <Swatches colors={EYE_COLORS} value={look.color} label="Eye colour" onPick={(color) => set({ color })} />
                </div>
                <div className="row">
                  <span>Body</span>
                  <Swatches colors={BODY_COLORS} value={look.body} label="Body colour" onPick={(body) => set({ body })} />
                </div>
                {fine ? (
                  <>
                    <Slider label="Size" value={look.size} format={percent} limits={{ min: 0.6, max: 1.5, step: 0.05 }} onChange={(size) => set({ size })} />
                    <Slider label="Spacing" value={look.gap} format={(v) => (v === 0 ? 'Default' : `${v > 0 ? '+' : ''}${v}`)} limits={{ min: -6, max: 10, step: 1 }} onChange={(gap) => set({ gap })} />
                    <Slider label="Tilt" value={look.tilt} format={(v) => (v === LUMI_LOOK_DEFAULT.tilt ? 'Default' : `${v}°`)} limits={{ min: -20, max: 30, step: 1 }} onChange={(tilt) => set({ tilt })} />
                    <Slider label="Glow" value={look.glow} format={percent} limits={{ min: 0, max: 2, step: 0.1 }} onChange={(glow) => set({ glow })} />
                  </>
                ) : (
                  <div className="row">
                  <button className="lumi-more" data-cuelume-open data-cuelume-emphasis="subtle" onClick={() => setFine(true)}>
                    Fine-tune size, spacing, tilt and glow
                  </button>
                  </div>
                )}
              </>
            )}

            {section === 'behaviour' && (
              <>
                <div className="row">
                  <span title="How often she does something on her own">Energy</span>
                  <Segmented options={LIVELY} value={look.lively} onPick={(lively) => set({ lively })} />
                </div>
                <div className="row">
                  <span title="Glance: she looks over, then away. Watch: she follows it. Ignore: she doesn't">Your cursor</span>
                  <Segmented options={FOLLOWS} value={look.follow} onPick={(follow) => set({ follow })} />
                </div>
                <div className="row lumi-chips" role="group" aria-label="Habits">
                  <Habit on={settings.lumiNudges} label="Speaks up" hint="Good morning, a sip of water, a stretch, a word when it's late" onChange={(v) => update({ lumiNudges: v })} />
                  <Habit on={look.wander} label="Wanders" hint="She drifts about the pill on her own" onChange={(wander) => set({ wander })} />
                  <Habit on={look.sounds} label="Sounds" hint="Her little chirps with her moments" onChange={(sounds) => set({ sounds })} />
                  <Habit on={settings.lumiCalm} label="Calm" hint="No explosions, shaking or flashes, and quieter sounds" onChange={(v) => update({ lumiCalm: v })} />
                </div>
                <div className="row">
                  <span>She calls you</span>
                  <input className="set-input" value={settings.callMe} maxLength={24} placeholder="Your name" spellCheck={false} onChange={(e) => update({ callMe: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                </div>
              </>
            )}

            {section === 'pill' && (
              <>
                <Slider label="Left / right" value={look.x} format={signed} limits={{ min: -60, max: 60, step: 1 }} onChange={(x) => set({ x })} />
                <Slider label="Up / down" value={look.y} format={signed} limits={{ min: -6, max: 6, step: 1 }} onChange={(y) => set({ y })} />
                <div className="row">
                  <span>Time beside her</span>
                  <Toggle on={settings.lumiClock} onChange={(v) => update({ lumiClock: v })} />
                </div>
              </>
            )}
          </div>

          <button className="lumi-reset" data-cuelume-tap data-cuelume-emphasis="subtle" onClick={() => update({ lumiLook: LUMI_LOOK_DEFAULT })}>
            <RotateCcw size={11} aria-hidden /> Back to the original Lumi
          </button>
        </>
      )}
    </div>
  )
}
