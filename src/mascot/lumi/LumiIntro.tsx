import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { LumiFace } from './LumiFace'
import type { LumiMood } from './moods'

interface Props {
  /** a name to offer, from SSO UI: they can change it */
  suggest: string
  /** the name they chose (maybe empty, if they skipped), and whether Lumi may speak up on her own */
  onDone: (name: string, nudges: boolean) => void
}

const WHAT: { mood: LumiMood; title: string; text: string }[] = [
  { mood: 'class1h', title: 'Before class', text: "A heads-up an hour ahead, and again when it's close." },
  { mood: 'due6h', title: 'Deadlines', text: 'Reminders as they close in, and a cheer when you submit.' },
  { mood: 'examDone', title: 'Big moments', text: 'Exams, grades and finished lists get a small celebration.' },
  { mood: 'hydrate', title: 'Looking after you', text: 'Water, eye breaks and a word when it gets late.' },
]

/**
 * Lumi's first hello, once per install or update. She says who she is and what she does, asks what to call
 * the user, then shows what she will do and lets them turn her on-her-own nudges off.
 */
export function LumiIntro({ suggest, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(suggest)
  const [nudges, setNudges] = useState(true)
  // the SSO name can arrive a moment after the card opens
  useEffect(() => {
    setName((n) => n || suggest)
  }, [suggest])
  // she waves hello, then settles into watching the field
  // her hello plays through first (hatch, look around, find you, shy, greet); after it her eyes rest on the
  // name field and follow the text as it is typed
  const [typing, setTyping] = useState(false)
  const [met, setMet] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMet(true), 5400)
    return () => clearTimeout(t)
  }, [])
  const clean = name.trim().slice(0, 24)
  const next = () => setStep(1)

  const pages = [
    <div key="hello" className="astra-page lumi-page">
      <div className="lumi-hero">
        <LumiFace mood={met ? 'idle' : 'hello'} height={94} body sound roam={46} gaze={met ? { x: typing ? Math.max(-6, Math.min(6, (name.length - 7) * 1.1)) : 0, y: 4 } : undefined} />
      </div>
      <h2>Hello! I'm Lumi</h2>
      <p>I keep your classes, deadlines and to-dos in view, and nudge you before they sneak up on you.</p>
      <label className="lumi-ask">
        What should I call you?
        <input
          className="lumi-name"
          autoFocus
          value={name}
          maxLength={24}
          placeholder="Your name"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && clean) next()
          }}
        />
      </label>
    </div>,

    <div key="what" className="astra-page lumi-page">
      <div className="lumi-hero small">
        <LumiFace mood="delight" height={71} body sound />
      </div>
      <h2>Nice to meet you, {clean || 'friend'}!</h2>
      <div className="astra-grid lumi-grid">
        {WHAT.map((w, i) => (
          <motion.div key={w.title} className="astra-skill lumi-skill" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.07 }}>
            <span className="lumi-skill-face">
              <LumiFace mood={w.mood} height={26} still />
            </span>
            <div>
              <b>{w.title}</b>
              <em>{w.text}</em>
            </div>
          </motion.div>
        ))}
      </div>
      <label className="lumi-switch">
        <input type="checkbox" checked={nudges} onChange={(e) => setNudges(e.target.checked)} />
        <span>Let me speak up on my own</span>
        <small>You can change this in Settings any time.</small>
      </label>
    </div>,
  ]

  return (
    <div className="astra lumi-intro" onClick={(e) => e.stopPropagation()}>
      <div className="astra-stage">
        {/* a CSS slide-in, not a spring: whatever happens, the page is never left invisible */}
        <div key={step} className="astra-slide lumi-slide">
          {pages[step]}
        </div>
      </div>
      <div className="astra-nav">
        {step === 0 ? (
          <button className="astra-back lumi-skip" style={{ visibility: 'visible', fontSize: 12.5 }} data-cuelume-close onClick={() => onDone(clean || suggest, true)}>
            Skip
          </button>
        ) : (
          <button className="astra-back" onClick={() => setStep(0)} aria-label="Back">
            ‹
          </button>
        )}
        <div className="astra-dots" aria-hidden>
          {[0, 1].map((i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        {step === 0 ? (
          <button className="astra-next" disabled={!clean} data-cuelume-tap onClick={next}>
            Continue
          </button>
        ) : (
          <button className="astra-next lumi-go" data-cuelume-tap onClick={() => onDone(clean, nudges)}>
            Let's go
          </button>
        )}
      </div>
    </div>
  )
}
