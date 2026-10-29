import { useEffect, useMemo, useState } from 'react'
import { motionValue } from 'motion/react'
import { Mascot, type MascotState } from './Mascot'
import { MascotEyes, EYE_ACTS, EYE_LABELS } from './MascotEyes'
import type { MascotAccessory } from '../lib/settings'

const STATES: [MascotState, string][] = [
  ['sleep', 'Sleep (resting pill)'],
  ['idle', 'Idle (breathing, blinking)'],
  ['listening', 'Listening (follows your voice)'],
  ['thinking', 'Thinking (glow spins, looks away)'],
  ['speaking', 'Speaking (mouth follows voice)'],
  ['happy', 'Happy (after a reply)'],
  ['confused', 'Confused (error, red glow)'],
]
const ACCESSORIES: MascotAccessory[] = ['headphones', 'glasses', 'shades', 'bow', 'hat', 'crown', 'catEars', 'halo', 'topHat', 'scarf', 'bowtie']
const COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fb923c']

/** Dev-only page (open /?mascots): every mascot state moving, so the animations can be reviewed side by side. */
export function Showcase() {
  const level = useMemo(() => motionValue(0), [])
  useEffect(() => {
    // a fake voice: bursts of loudness with gaps, like speech
    const t = setInterval(() => level.set(Math.random() < 0.25 ? 0.05 : 0.3 + Math.random() * 0.7), 110)
    return () => clearInterval(t)
  }, [level])
  // happy and confused play once in the app; remounting them every few seconds lets them be watched again
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [])

  const box = { background: 'linear-gradient(180deg,#16161f,#101017)', border: '1px solid #23232f', borderRadius: 22, padding: '16px 12px', textAlign: 'center' as const }
  return (
    <div style={{ minHeight: '100vh', background: '#0b0b10', color: '#e9e9f2', font: '14px system-ui, sans-serif', padding: '24px 20px 40px' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Aurora: all animations</h1>
      <p style={{ margin: '0 0 18px', color: '#8b8ba0' }}>The voice level is simulated. In the app it comes from the microphone and the reply audio.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, maxWidth: 1000 }}>
        {STATES.map(([s, label]) => (
          <div key={s} style={box}>
            <div style={{ display: 'grid', placeItems: 'center', height: 150 }}>
              <Mascot key={`${s}${tick}`} state={s} level={level} size={140} color="#4ade80" />
            </div>
            <div style={{ fontWeight: 600, marginTop: 6 }}>{s}</div>
            <div style={{ color: '#8b8ba0', fontSize: 12 }}>{label}</div>
            <div style={{ background: '#000', borderRadius: '0 0 14px 14px', margin: '10px 20px 0', height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Mascot state={s} level={level} size={24} color="#4ade80" />
              <span style={{ fontSize: 12, color: '#fff' }}>10:19</span>
            </div>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 15, margin: '26px 0 10px' }}>Accessories and colours</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, maxWidth: 1000 }}>
        {ACCESSORIES.map((a, i) => (
          <div key={a} style={{ ...box, width: 140 }}>
            <Mascot state="idle" level={level} size={100} color={COLORS[i % COLORS.length]} accessories={[a]} />
            <div style={{ fontSize: 12, color: '#8b8ba0' }}>{a}</div>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 15, margin: '30px 0 6px' }}>Resting pill: the live thing</h2>
      <p style={{ margin: '0 0 12px', color: '#8b8ba0' }}>This is how it behaves in the app: every few seconds it does something different, never the same one twice in a row. Watch it for a minute.</p>
      <div style={{ background: '#000', borderRadius: '0 0 28px 28px', width: 260, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '0 0 8px', boxShadow: '0 0 0 1px #23232f' }}>
        <MascotEyes height={28} />
        <span style={{ fontSize: 26, fontWeight: 600, color: '#fff' }}>10:19</span>
      </div>
      <h2 style={{ fontSize: 15, margin: '30px 0 6px' }}>All {EYE_ACTS.length} idle moods</h2>
      <p style={{ margin: '0 0 12px', color: '#8b8ba0' }}>Each one loops here so it can be watched. At real size they sit in the pill beside the clock.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, maxWidth: 1000 }}>
        {EYE_ACTS.map((a, i) => (
          <div key={a} style={{ ...box, padding: '12px 10px' }}>
            <div style={{ background: '#000', borderRadius: '0 0 18px 18px', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <MascotEyes height={22} force={a} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>10:19</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>
              {i + 1}. {a}
            </div>
            <div style={{ fontSize: 12, color: '#8b8ba0' }}>{EYE_LABELS[a]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
