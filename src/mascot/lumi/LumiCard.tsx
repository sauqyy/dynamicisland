import { memo, useEffect, useState } from 'react'
import { LumiFace } from './LumiFace'
import { LOCKIN_MOODS, MOODS, type LumiMood } from './moods'
import { CALM_MOOD, useCalm } from './calm'
import { LOCKIN_SHAPE, LumiLockIn } from './LumiLockIn'
import { LumiThink } from './LumiThink'

export interface LumiAction {
  label: string
  primary?: boolean
  run: () => void
}

interface Props {
  mood: LumiMood
  title: string
  sub?: string
  actions?: LumiAction[]
  /** how long it stays, for the thin bar along the bottom that runs down */
  ms?: number
  /** play her sounds (default: yes) */
  sound?: boolean
}

/** Island size for a moment: one line of title and one of detail, or a taller card when there are buttons. */
export const lumiShape = (actions: number, mood?: LumiMood, calm = false) => (mood && !calm && LOCKIN_MOODS.includes(mood) ? LOCKIN_SHAPE : actions ? { w: 400, h: 106, r: 30 } : { w: 392, h: 80, r: 28 })

/** Text that is typed out, a little quicker than speech, so a line seems to be said and not just shown. */
function useTyped(text: string, ms = 22, wait = 0) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    if (!text) return
    let id = 0
    const start = window.setTimeout(() => {
      id = window.setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), ms)
    }, wait)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [text, ms, wait])
  return text.slice(0, n)
}

/**
 * The line under the title, typed out. It is a component of its own because it changes every few milliseconds:
 * if the card held it, her face would be redrawn with every letter.
 */
function Typed({ text, wait }: { text: string; wait: number }) {
  const typed = useTyped(text, 22, wait)
  return (
    <span className="lc-sub" aria-label={text}>
      {typed}
      {typed.length < text.length && <i className="lc-caret" />}
    </span>
  )
}

/**
 * What Lumi says in the island: her face on the left doing the mood, what she says on the right, typed out,
 * and (when she is asking something) the buttons. A thin line along the bottom shows how long she'll stay.
 */
function LumiCardBase({ mood: moodIn, title, sub, actions = [], ms, sound = true }: Props) {
  // in calm mode the full-card pictures (the explosion, the thinking cat) become her working quietly
  const calm = useCalm()
  const mood = calm ? (CALM_MOOD[moodIn] ?? moodIn) : moodIn
  const tone = MOODS[mood].tint
  // the three-, one- and six-hour deadline reminders are pictures of their own
  if (mood === 'due6h') return <LumiThink mood={mood} title={title} sub={sub} ms={ms} />
  if (LOCKIN_MOODS.includes(mood)) return <LumiLockIn mood={mood} title={title} sub={sub} ms={ms} />
  return (
    <div className={`lumi-card ${actions.length ? 'asks' : ''}`} style={{ ['--lc' as string]: tone }}>
      <div className="lc-face">
        <LumiFace mood={mood} height={74} body still sound={sound} roam={8} />
      </div>
      <div className="lc-body">
        <b className="lc-title">{title}</b>
        {/* she says it when she turns to you, not before */}
        {sub && <Typed text={sub} wait={Math.min(1200, MOODS[mood].speakAt ?? 0)} />}
        {actions.length > 0 && (
          <span className="lc-acts">
            {actions.map((a) => (
              <button
                key={a.label}
                className={`lc-btn ${a.primary ? 'primary' : ''}`}
                data-cuelume-tap
                onClick={(e) => {
                  e.stopPropagation()
                  a.run()
                }}
              >
                {a.label}
              </button>
            ))}
          </span>
        )}
      </div>
      {ms !== undefined && <i className="lc-life" style={{ animationDuration: `${ms}ms` }} />}
    </div>
  )
}

export const LumiCard = memo(LumiCardBase)
