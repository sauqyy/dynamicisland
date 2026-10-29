import { motion, useTransform, type MotionValue } from 'motion/react'
import { Mascot, type MascotState } from '../mascot/Mascot'
import type { AssistantState } from '../lib/useAssistant'
import { useSttStatus } from '../lib/speechToText'
import type { AccessoryColors, MascotAccessory, TalkMode } from '../lib/settings'

interface Props {
  state: AssistantState
  level: MotionValue<number>
  /** the voice by pitch, low to high; drives the bar meter while listening */
  bands: MotionValue<number>[]
  name: string
  color: string
  accessories: MascotAccessory[]
  accessoryColors: AccessoryColors
  talk: TalkMode
  onConfirm: (yes: boolean) => void
}

export function mascotFor(phase: AssistantState['phase']): MascotState {
  switch (phase) {
    case 'listening':
      return 'listening'
    case 'thinking':
      return 'thinking'
    case 'confirm':
      return 'listening'
    case 'speaking':
      return 'speaking'
    case 'done':
      return 'happy'
    case 'error':
      return 'confused'
    default:
      return 'idle'
  }
}

/** Island size for each phase: a slim bar while listening, a roomier card once there is an answer. */
export function assistantShape(phase: AssistantState['phase'], heard = '', replyLen = 0, hasActions = false) {
  if (phase === 'confirm') return { w: 400, h: 112, r: 30 }
  if (phase === 'speaking' || phase === 'done') {
    // the card is sized for the whole answer from the start, so it does not keep growing while it is typed
    const lines = Math.min(7, Math.max(3, Math.ceil(replyLen / 44)))
    return { w: 400, h: 52 + lines * 19 + (hasActions ? 30 : 0), r: 32 }
  }
  // once there are words to show, the bar grows into a card that fits them
  if ((phase === 'listening' || phase === 'thinking') && heard.trim()) return { w: 400, h: 96, r: 30 }
  if (phase === 'error') return { w: 400, h: 84, r: 30 }
  return { w: 320, h: 76, r: 30 }
}

/** A long sentence shows its latest words, so the card follows what is being said right now. */
const tail = (t: string, max = 96) => (t.length > max ? `…${t.slice(-max).replace(/^\S*\s/, '')}` : t)

/** One bar of the mic meter: grows with its band of the voice and never quite disappears, so a live mic always shows. */
function Bar({ band }: { band: MotionValue<number> }) {
  const scaleY = useTransform(band, (v) => 0.14 + 0.86 * v)
  const opacity = useTransform(band, (v) => 0.45 + 0.55 * v)
  return <motion.i style={{ scaleY, opacity }} />
}

/** The mascot on the left, what it is doing or saying on the right. */
export function AssistantCard({ state, level, bands, name, color, accessories, accessoryColors, talk, onConfirm }: Props) {
  const { phase } = state
  // the mic meter shows once it is really recording
  const live = phase === 'listening' && state.armed
  const stt = useSttStatus()
  let title: string
  let body: React.ReactNode
  if (phase === 'listening') {
    title = state.armed ? 'Listening' : 'One moment'
    body = state.heard ? (
      <span className="as-text as-heard">{tail(state.heard)}</span>
    ) : (
      <span className="as-hint">
        {!state.armed
          ? 'Getting the microphone ready. Start talking at the sound'
          : stt.state !== 'ready'
          ? stt.state === 'error'
            ? stt.error
            : stt.progress > 0 && stt.progress < 1
              ? `Downloading speech recognition (${Math.round(stt.progress * 100)}%), first time only`
              : 'Waking up speech recognition...'
          : talk === 'hold'
            ? 'Hold the keys while you talk, or tap once and just talk'
            : 'Go ahead, press again or just stop talking'}
      </span>
    )
  } else if (phase === 'thinking') {
    title = 'Thinking'
    body = state.heard ? (
      <span className="as-text as-heard">{tail(state.heard)}</span>
    ) : (
      <span className="as-dots" aria-label="thinking">
        <i />
        <i />
        <i />
      </span>
    )
  } else if (phase === 'confirm') {
    title = 'Quick check'
    body = (
      <>
        <span className="as-text">{state.confirmText}</span>
        <span className="as-confirm">
          <button className="as-yes" onClick={(e) => (e.stopPropagation(), onConfirm(true))}>
            Yes
          </button>
          <button className="as-no" onClick={(e) => (e.stopPropagation(), onConfirm(false))}>
            No
          </button>
        </span>
      </>
    )
  } else if (phase === 'error') {
    title = 'Oops'
    body = <span className="as-text as-error">{state.error}</span>
  } else {
    title = name
    body = (
      <>
        <span className="as-text">{state.reply}</span>
        {state.actions.length > 0 && (
          <span className="as-chips">
            {state.actions.map((a, i) => (
              <span key={i} className="as-chip">
                ✓ {a}
              </span>
            ))}
          </span>
        )}
      </>
    )
  }
  return (
    <div className={`assistant as-${phase}${live ? ' as-live' : ''}`}>
      <div className="as-mascot">
        <Mascot state={mascotFor(phase)} level={level} size={phase === 'speaking' || phase === 'done' ? 64 : 52} color={color} accessories={accessories} accessoryColors={accessoryColors} />
      </div>
      <div className="as-body">
        <b className="as-title">{title}</b>
        {body}
      </div>
      {live && (
        <span className="as-meter" aria-label="microphone level">
          {bands.map((b, i) => (
            <Bar key={i} band={b} />
          ))}
        </span>
      )}
    </div>
  )
}
