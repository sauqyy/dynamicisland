import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, motionValue } from 'motion/react'
import { Mascot, type MascotState } from '../mascot/Mascot'
import type { AccessoryColors, MascotAccessory, TalkMode } from '../lib/settings'
import { deferStt, demoStt, loadStt, setSttModel, STT_SIZES, useSttStatus } from '../lib/speechToText'

interface Props {
  name: string
  color: string
  accessories: MascotAccessory[]
  accessoryColors: AccessoryColors
  /** the shortcut as Tauri writes it, like "Control+Shift+Space" */
  shortcut: string
  talk: TalkMode
  /** which listening model they use, so the download can say how big it is */
  listenModel: string
  /** the browser demo: act out the download instead of fetching the model */
  simulate?: boolean
  /** true when they want Astra, false for "not now" */
  onChoose: (use: boolean) => void
}

/** One drawing language for all of them: 24px grid, rounded line, a single accent dot or spark. */
const ICONS: Record<string, React.ReactNode> = {
  apps: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" />
      <path d="M14.5 17h5M17.5 14.2l2.8 2.8-2.8 2.8" />
    </>
  ),
  music: (
    <>
      <path d="M9 17.5V5.5l10-2v12" />
      <circle cx="6.5" cy="17.5" r="2.6" />
      <circle cx="16.5" cy="15.5" r="2.6" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      <path d="M15.5 9.2a4.2 4.2 0 0 1 0 5.6M18.2 6.6a8 8 0 0 1 0 10.8" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4.2l2.6 1.6M9.5 3h5M12 3v3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20.5 20.5" />
      <path d="M10.5 7.6v5.8M7.6 10.5h5.8" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 11.5a7.5 7 0 0 1-11 6.2L4 19l1.4-4.3A7 7 0 0 1 4 11.5C4 7.4 7.6 4.5 12.2 4.5s8.3 2.9 8.3 7z" />
      <path d="M9 11.5h.01M12.2 11.5h.01M15.4 11.5h.01" strokeWidth="2.6" />
    </>
  ),
}

function SkillIcon({ id }: { id: string }) {
  return (
    <span className="astra-icon">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[id]}
      </svg>
    </span>
  )
}

const SKILLS: { icon: string; title: string; say: string }[] = [
  { icon: 'apps', title: 'Open apps, sites', say: 'Open Spotify' },
  { icon: 'music', title: 'Control your music', say: 'Pause the music' },
  { icon: 'volume', title: 'Change the volume', say: 'Turn it down' },
  { icon: 'timer', title: 'Timers and to-dos', say: 'Timer 25 minutes' },
  { icon: 'search', title: 'Search the web', say: 'Search for ramen' },
  { icon: 'chat', title: 'Chat and answer', say: 'What is a comet?' },
]

const STEPS = 4
const keyName = (k: string) => (k === 'Control' ? 'Ctrl' : k)

/** Floating sparkles behind the mascot on the first screen. */
const SPARKS = [
  { x: -92, y: -34, s: 9, d: 0 },
  { x: 88, y: -52, s: 12, d: 0.6 },
  { x: -64, y: 44, s: 7, d: 1.1 },
  { x: 100, y: 30, s: 8, d: 0.3 },
  { x: -10, y: -78, s: 6, d: 1.5 },
]

function Sparkle({ x, y, s, d }: { x: number; y: number; s: number; d: number }) {
  return (
    <motion.svg
      viewBox="0 0 20 20"
      width={s * 2}
      height={s * 2}
      style={{ position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, marginLeft: -s, marginTop: -s }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], rotate: [0, 90, 180] }}
      transition={{ duration: 2.8, repeat: Infinity, delay: d, ease: 'easeInOut' }}
      aria-hidden
    >
      <path d="M10 0 L12.2 7.8 L20 10 L12.2 12.2 L10 20 L7.8 12.2 L0 10 L7.8 7.8 Z" fill="#fff" />
    </motion.svg>
  )
}

/** The mascot with a slow aurora ring around it. */
function Hero({ color, accessories, accessoryColors, state, size }: { color: string; accessories: MascotAccessory[]; accessoryColors: AccessoryColors; state: MascotState; size: number }) {
  const level = useMemo(() => motionValue(0), [])
  return (
    <div className="astra-hero" style={{ width: size * 1.7, height: size * 1.7 }}>
      <motion.div className="astra-ring" style={{ background: `conic-gradient(from 0deg, transparent, ${color}, #8fa8ff, transparent 70%)` }} animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="astra-halo" style={{ background: `radial-gradient(circle, ${color}55, transparent 68%)` }} animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }} />
      {SPARKS.map((p) => (
        <Sparkle key={`${p.x}-${p.y}`} {...p} />
      ))}
      <motion.div initial={{ scale: 0.3, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 15, delay: 0.1 }} style={{ position: 'relative' }}>
        <Mascot state={state} level={level} size={size} color={color} accessories={accessories} accessoryColors={accessoryColors} />
      </motion.div>
    </div>
  )
}

function Keycaps({ shortcut }: { shortcut: string }) {
  return (
    <span className="astra-keys">
      {shortcut.split('+').map((k, i) => (
        <kbd key={`${k}-${i}`}>{keyName(k)}</kbd>
      ))}
    </span>
  )
}

/**
 * The first-run card for Astra (beta): meet her, see what she can do, learn how to talk to her, then choose
 * whether to turn her on. It fills the expanded island, so it is also what the browser demo's button shows.
 */
export function AstraWelcome({ name, color, accessories, accessoryColors, shortcut, talk, listenModel, simulate, onChoose }: Props) {
  const [step, setStep] = useState(0)
  // after "Yes", the listening model still has to come down; they are told how big it is first
  const [dl, setDl] = useState(false)
  const stt = useSttStatus()
  const size = STT_SIZES[listenModel] ?? STT_SIZES.small
  useEffect(() => {
    if (!dl || stt.state !== 'ready') return
    const t = setTimeout(() => onChoose(true), 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dl, stt.state])
  const start = () => {
    if (simulate) return demoStt('download')
    setSttModel(listenModel)
    void loadStt().catch(() => {})
  }
  const [dir, setDir] = useState(1)
  // she waves hello, then settles
  const [wave, setWave] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setWave(false), 1700)
    return () => clearTimeout(t)
  }, [])
  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  const hold = talk === 'hold'

  const pages = [
    <div key="hello" className="astra-page">
      <Hero color={color} accessories={accessories} accessoryColors={accessoryColors} state={wave ? 'happy' : 'idle'} size={84} />
      <span className="astra-badge">Beta</span>
      <h2>Meet {name}</h2>
      <p>Your little voice assistant, living right here in the island.</p>
    </div>,

    <div key="can" className="astra-page">
      <h2>What {name} can do</h2>
      <p className="astra-sub">Just say it out loud. A few things to try:</p>
      <div className="astra-grid">
        {SKILLS.map((s, i) => (
          <motion.div key={s.title} className="astra-skill" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06 }}>
            <SkillIcon id={s.icon} />
            <div>
              <b>{s.title}</b>
              <em>“{s.say}”</em>
            </div>
          </motion.div>
        ))}
      </div>
    </div>,

    <div key="how" className="astra-page">
      <h2>How to talk to {name}</h2>
      <ol className="astra-steps">
        <li>
          <span className="astra-num">1</span>
          <div>
            <b>{hold ? 'Hold' : 'Press'} <Keycaps shortcut={shortcut} /></b>
            <small>{name} wakes up and starts listening.</small>
          </div>
        </li>
        <li>
          <span className="astra-num">2</span>
          <div>
            <b>Say what you need</b>
            <small>Talk like you would to a friend.</small>
          </div>
        </li>
        <li>
          <span className="astra-num">3</span>
          <div>
            <b>{hold ? 'Let go of the keys' : 'Press the keys again'}</b>
            <small>{name} answers, and does it for you.</small>
          </div>
        </li>
      </ol>
    </div>,

    <div key="choose" className="astra-page">
      <Hero color={color} accessories={accessories} accessoryColors={accessoryColors} state="idle" size={52} />
      <h2>Would you like to use {name}?</h2>
      <div className="astra-beta">
        <span className="astra-badge">Beta</span>
        <p>
          {name} is still being tested. She can mishear you or get things wrong, and she will keep getting better. Anything risky always asks you first.
        </p>
      </div>
      <div className="astra-choose">
        <button className="astra-yes" data-cuelume-tap onClick={() => (stt.state === 'ready' ? onChoose(true) : setDl(true))}>
          Yes, use {name}
        </button>
        <button className="astra-no" data-cuelume-close onClick={() => onChoose(false)}>
          Not now
        </button>
      </div>
      <small className="astra-foot">You can change this any time in Settings.</small>
    </div>,
  ]

  const downloadPage = (
    <div key="download" className="astra-page">
      <Hero color={color} accessories={accessories} accessoryColors={accessoryColors} state={stt.state === 'ready' ? 'happy' : 'idle'} size={52} />
      <h2>{stt.state === 'ready' ? `${name} is ready` : stt.state === 'loading' ? `Getting ${name} ready` : 'One quick download'}</h2>
      {stt.state === 'idle' || stt.state === 'error' ? (
        <>
          <div className="astra-beta">
            <p>
              To hear you, {name} needs a speech model that runs on your PC. It is about <b>{size}</b>, downloads once, and then works offline.
            </p>
            <small className="astra-foot">Best on Wi-Fi if your data is limited.</small>
          </div>
          {stt.state === 'error' && <small className="astra-err">{stt.error}</small>}
          <div className="astra-choose">
            <button className="astra-yes" data-cuelume-tap onClick={start}>
              {stt.state === 'error' ? 'Try again' : `Download ${size}`}
            </button>
            <button
              className="astra-no"
              data-cuelume-close
              onClick={() => {
                deferStt()
                onChoose(true)
              }}
            >
              Later
            </button>
          </div>
          <small className="astra-foot">You can also do this any time in Settings.</small>
        </>
      ) : stt.state === 'loading' ? (
        <>
          <div className="astra-bar" role="progressbar" aria-valuenow={Math.round(stt.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.max(3, Math.round(stt.progress * 100))}%` }} />
          </div>
          <small className="astra-foot">{stt.progress > 0 ? `Downloading ${Math.round(stt.progress * 100)}% of ${size}` : 'Starting...'}</small>
          <button className="astra-no" data-cuelume-close onClick={() => onChoose(true)}>
            Keep going in the background
          </button>
        </>
      ) : (
        <p>All set. Say hi whenever you like.</p>
      )}
    </div>
  )

  const last = step === STEPS - 1
  return (
    <div className="astra" onClick={(e) => e.stopPropagation()}>
      <div className="astra-stage">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={dl ? 'dl' : step}
            className="astra-slide"
            custom={dir}
            variants={{ in: (d: number) => ({ opacity: 0, x: 36 * d }), show: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: -36 * d }) }}
            initial="in"
            animate="show"
            exit="out"
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {dl ? downloadPage : pages[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="astra-nav" style={dl ? { visibility: 'hidden' } : undefined}>
        <button className="astra-back" disabled={step === 0} onClick={() => go(step - 1)} aria-label="Back">
          ‹
        </button>
        <div className="astra-dots" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        {last ? (
          <span className="astra-gap" />
        ) : (
          <button className="astra-next" onClick={() => go(step + 1)}>
            {step === 0 ? 'Show me' : 'Next'}
          </button>
        )}
      </div>
    </div>
  )
}
