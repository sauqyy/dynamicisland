import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useBlink } from './Mascot'
import type { AccessoryColors, MascotAccessory } from '../lib/settings'

/**
 * Everything the eyes can do while the island is just sitting there. Each one is a short sequence of poses; the
 * eyes glide between poses on springs and the shapes (star, squint, heart) cross-fade, so nothing ever snaps.
 */
export type EyeAct =
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown'
  | 'lookAround'
  | 'lookClock'
  | 'squint'
  | 'wink'
  | 'heart'
  | 'heartWink'
  | 'wide'
  | 'sleepy'
  | 'yawn'
  | 'spin'
  | 'doubleBlink'
  | 'dizzy'
  | 'sparkle'
  | 'shy'
  | 'bounce'
  | 'stretch'
  | 'suspicious'
  | 'excited'
  | 'popIn'
  | 'wobble'
  | 'crossEyed'
  | 'drift'
  | 'sad'

/** Short descriptions, for the demo page. */
export const EYE_LABELS: Record<EyeAct, string> = {
  lookLeft: 'Glances left',
  lookRight: 'Glances right',
  lookUp: 'Looks up, thinking',
  lookDown: 'Looks down',
  lookAround: 'Looks all around',
  lookClock: 'Checks the clock and blinks',
  squint: 'Happy squint',
  wink: 'Winks',
  heart: 'Heart eyes',
  heartWink: 'Heart and a wink',
  wide: 'Surprised, eyes wide',
  sleepy: 'Dozes off, with a z',
  yawn: 'Yawns: shuts, then opens wide',
  spin: 'Spins the sparkles',
  doubleBlink: 'Blinks twice',
  dizzy: 'Dizzy circles',
  sparkle: 'Sparkle burst',
  shy: 'Shy: looks away, peeks back',
  bounce: 'Hops up and down',
  stretch: 'Stretches wide, then tall',
  suspicious: 'Suspicious sideways stare',
  excited: 'Excited pulses and sparks',
  popIn: 'Pops back in',
  wobble: 'Wobbles',
  crossEyed: 'Goes cross-eyed',
  drift: 'Floats dreamily',
  sad: 'Sad droop',
}
export const EYE_ACTS = Object.keys(EYE_LABELS) as EyeAct[]

/** Where the eyes are, at one moment. */
interface Pose {
  /** the pair's position */
  x: number
  y: number
  /** size of each eye, and stretch across and up/down */
  scale: number
  sx: number
  sy: number
  rot: number
  /** how far apart the two eyes are (negative: pulled together) */
  apart: number
  /** 0-1: how much each eye is a squint arc or a heart instead of a star */
  closedL: number
  closedR: number
  heartL: number
  heartR: number
  /** the next move happens at once, with no gliding (used to reset a turn that looks the same as where it began) */
  jump: boolean
}

const REST: Pose = { x: 0, y: 0, scale: 1, sx: 1, sy: 1, rot: 0, apart: 0, closedL: 0, closedR: 0, heartL: 0, heartR: 0, jump: false }

type Step = [at: number, pose: Partial<Pose>]
interface Act {
  duration: number
  steps: Step[]
  sparks?: boolean
  z?: boolean
}

const ACTS: Record<EyeAct, (side: 'l' | 'r') => Act> = {
  lookLeft: () => ({ duration: 1700, steps: [[0, { x: -7 }], [1100, { x: 0 }]] }),
  lookRight: () => ({ duration: 1700, steps: [[0, { x: 7 }], [1100, { x: 0 }]] }),
  lookUp: () => ({ duration: 1600, steps: [[0, { y: -4.5 }], [1000, { y: 0 }]] }),
  lookDown: () => ({ duration: 1600, steps: [[0, { y: 4.5 }], [1000, { y: 0 }]] }),
  lookAround: () => ({ duration: 2600, steps: [[0, { x: 7, y: -2 }], [550, { x: 0, y: -4.5 }], [1100, { x: -7, y: -2 }], [1650, { x: 0, y: 3 }], [2150, { x: 0, y: 0 }]] }),
  lookClock: () => ({ duration: 2300, steps: [[0, { x: 9 }], [900, { x: 9, sy: 0.12 }], [1010, { x: 9, sy: 1 }], [1700, { x: 0 }]] }),
  squint: () => ({ duration: 1700, steps: [[0, { closedL: 1, closedR: 1 }], [1200, { closedL: 0, closedR: 0 }]] }),
  wink: (side) => ({ duration: 1200, steps: [[0, side === 'l' ? { closedL: 1 } : { closedR: 1 }], [750, { closedL: 0, closedR: 0 }]] }),
  heart: () => ({ duration: 2000, steps: [[0, { heartL: 1, heartR: 1, scale: 1.12 }], [350, { scale: 0.95 }], [700, { scale: 1.1 }], [1050, { scale: 1 }], [1450, { heartL: 0, heartR: 0 }]] }),
  heartWink: (side) => ({ duration: 1800, steps: [[0, side === 'l' ? { heartL: 1, closedR: 1 } : { heartR: 1, closedL: 1 }], [1200, { heartL: 0, heartR: 0, closedL: 0, closedR: 0 }]] }),
  wide: () => ({ duration: 1500, steps: [[0, { scale: 1.45 }], [950, { scale: 1 }]] }),
  sleepy: () => ({ duration: 3000, z: true, steps: [[0, { sy: 0.55, y: 1.5 }], [700, { sy: 0.2, y: 2.5 }], [1400, { sy: 0.55, y: 1.5 }], [1900, { sy: 0.15, y: 2.5 }], [2500, { sy: 1, y: 0 }]] }),
  yawn: () => ({ duration: 2600, steps: [[0, { closedL: 1, closedR: 1 }], [1200, { closedL: 0, closedR: 0, scale: 1.4 }], [2000, { scale: 1 }]] }),
  spin: () => ({ duration: 1500, steps: [[0, { rot: 90 }], [950, { rot: 0, jump: true }]] }),
  doubleBlink: () => ({ duration: 900, steps: [[0, { sy: 0.1 }], [120, { sy: 1 }], [270, { sy: 0.1 }], [390, { sy: 1 }]] }),
  dizzy: () => ({ duration: 2300, steps: [[0, { x: 5, y: 0 }], [180, { x: 0, y: 4 }], [360, { x: -5, y: 0 }], [540, { x: 0, y: -4 }], [720, { x: 5, y: 0 }], [900, { x: 0, y: 4 }], [1080, { x: -5, y: 0 }], [1260, { x: 0, y: -4 }], [1440, { x: 0, y: 0 }]] }),
  sparkle: () => ({ duration: 1900, sparks: true, steps: [[0, { scale: 1.35 }], [350, { scale: 0.9 }], [700, { scale: 1.25 }], [1050, { scale: 1 }]] }),
  shy: () => ({ duration: 2500, steps: [[0, { x: -6, y: 4, scale: 0.85 }], [1000, { x: 6, y: 4 }], [1700, { x: 0, y: 0, scale: 1 }]] }),
  bounce: () => ({ duration: 1200, steps: [[0, { y: -4.5 }], [200, { y: 2 }], [400, { y: -3 }], [600, { y: 1 }], [800, { y: 0 }]] }),
  stretch: () => ({ duration: 1500, steps: [[0, { sx: 1.45, sy: 0.7 }], [550, { sx: 0.75, sy: 1.35 }], [1100, { sx: 1, sy: 1 }]] }),
  suspicious: () => ({ duration: 2200, steps: [[0, { x: 6, sy: 0.55 }], [1500, { x: 0, sy: 1 }]] }),
  excited: () => ({ duration: 1700, sparks: true, steps: [[0, { scale: 1.3 }], [220, { scale: 0.9 }], [440, { scale: 1.3 }], [660, { scale: 0.9 }], [880, { scale: 1.25 }], [1100, { scale: 1 }]] }),
  popIn: () => ({ duration: 1200, steps: [[0, { scale: 0.01, jump: true }], [60, { scale: 1.3 }], [450, { scale: 1 }]] }),
  wobble: () => ({ duration: 1500, steps: [[0, { rot: 14 }], [260, { rot: -14 }], [520, { rot: 9 }], [780, { rot: -6 }], [1040, { rot: 0 }]] }),
  crossEyed: () => ({ duration: 1900, steps: [[0, { apart: -5.5 }], [1300, { apart: 0 }]] }),
  drift: () => ({ duration: 3000, steps: [[0, { x: 3, y: -2.5 }], [1000, { x: -3, y: 2 }], [2000, { x: 3, y: -1.5 }], [2600, { x: 0, y: 0 }]] }),
  sad: () => ({ duration: 2600, steps: [[0, { y: 3.5, sy: 0.72 }], [1900, { y: 0, sy: 1 }]] }),
}

const BOX = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const CY = 14

/** A softly rounded four-point sparkle, the shape of the eyes. */
const star = (cx: number) => {
  const a = 10.5
  const b = 3.3
  return `M${cx} ${CY - a} L${cx + b} ${CY - b} L${cx + a} ${CY} L${cx + b} ${CY + b} L${cx} ${CY + a} L${cx - b} ${CY + b} L${cx - a} ${CY} L${cx - b} ${CY - b} Z`
}
const heart = (cx: number) => `M${cx} ${CY + 9} C${cx - 14} ${CY - 1} ${cx - 8} ${CY - 11} ${cx} ${CY - 4} C${cx + 8} ${CY - 11} ${cx + 14} ${CY - 1} ${cx} ${CY + 9} Z`
const arc = (cx: number) => `M${cx - 7} ${CY + 3} Q${cx} ${CY - 7} ${cx + 7} ${CY + 3}`

/** gliding: soft springs, a little bouncy; the blink is a quick tween instead, so it never overshoots */
const GLIDE = { type: 'spring', stiffness: 170, damping: 17, mass: 0.8 } as const
const FADE = { duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const

/** Runs one act after another, a few seconds apart, never the same one twice in a row. */
function useIdleActs(force?: EyeAct) {
  const [pose, setPose] = useState<Pose>(REST)
  const [fx, setFx] = useState({ sparks: 0, z: 0 })
  useEffect(() => {
    const timers: number[] = []
    let last: EyeAct | null = null
    const later = (fn: () => void, ms: number) => void timers.push(window.setTimeout(fn, ms))
    const run = (name: EyeAct) => {
      last = name
      const act = ACTS[name](Math.random() < 0.5 ? 'l' : 'r')
      for (const [at, patch] of act.steps) later(() => setPose((p) => ({ ...p, jump: false, ...patch })), at)
      if (act.sparks) setFx((f) => ({ ...f, sparks: f.sparks + 1 }))
      if (act.z) setFx((f) => ({ ...f, z: f.z + 1 }))
      later(() => setPose(REST), act.duration)
      later(next, act.duration + (force ? 900 : 3200 + Math.random() * 5000))
    }
    const next = () => {
      if (force) return run(force)
      const options = EYE_ACTS.filter((a) => a !== last)
      run(options[Math.floor(Math.random() * options.length)])
    }
    later(next, force ? 300 : 2500 + Math.random() * 3000)
    return () => timers.forEach(clearTimeout)
  }, [force])
  return { pose, fx }
}

interface Props {
  /** height in px; the eyes are about twice as wide as that */
  height?: number
  accessories?: MascotAccessory[]
  accessoryColors?: AccessoryColors
  /** show one specific act on a loop, for the demo page */
  force?: EyeAct
}

/**
 * Just the eyes: what sits in the resting pill instead of the whole character. They twinkle and blink on their
 * own, and every few seconds do something different (see EYE_LABELS).
 */
export function MascotEyes({ height = 15, accessories = [], accessoryColors = {}, force }: Props) {
  const blink = useBlink(true)
  const { pose, fx } = useIdleActs(force)
  const frame = accessoryColors.glasses ?? '#ffd166'
  const spring = pose.jump ? { duration: 0 } : GLIDE

  const eye = (cx: number, side: 'l' | 'r') => {
    const closed = side === 'l' ? pose.closedL : pose.closedR
    const love = side === 'l' ? pose.heartL : pose.heartR
    const dx = side === 'l' ? -pose.apart : pose.apart
    // a closing eye is closed for good, so a blink on top of it would only look like a twitch
    const blinkY = blink && closed < 0.5 && love < 0.5 ? 0.1 : 1
    return (
      <motion.g
        key={side}
        animate={{ x: dx, scale: pose.scale, scaleX: pose.sx, scaleY: pose.sy * blinkY, rotate: pose.rot }}
        transition={{ x: spring, scale: spring, scaleX: spring, rotate: spring, scaleY: { duration: pose.jump ? 0 : blinkY < 1 || pose.sy === 1 ? 0.09 : 0.4, ease: 'easeOut' } }}
        style={BOX}
      >
        <motion.g animate={{ opacity: 1 - Math.max(closed, love) }} transition={FADE}>
          {/* the slow twinkle never stops, so there is always a little life in them */}
          <motion.g animate={{ scale: [1, 1.12, 1], opacity: [0.92, 1, 0.92] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: side === 'l' ? 0 : 0.5 }} style={BOX}>
            <path d={star(cx)} fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          </motion.g>
        </motion.g>
        <motion.path d={arc(cx)} stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" initial={false} animate={{ opacity: closed * (1 - love) }} transition={FADE} />
        <motion.path d={heart(cx)} fill="#ff6fa8" initial={false} animate={{ opacity: love, scale: 0.55 + 0.45 * love }} transition={{ ...FADE, scale: spring }} style={{ ...BOX, filter: 'drop-shadow(0 0 3px #ff6fa8)' }} />
      </motion.g>
    )
  }

  return (
    <svg viewBox="0 0 64 28" height={height} width={(height * 64) / 28} aria-hidden style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.55))' }}>
      <motion.g animate={{ x: pose.x, y: pose.y }} transition={spring}>
        {eye(17, 'l')}
        {eye(47, 'r')}
      </motion.g>
      {/* little sparks around the eyes */}
      {fx.sparks > 0 &&
        [
          { x: 3, y: 3 },
          { x: 61, y: 4 },
          { x: 32, y: 1 },
          { x: 58, y: 25 },
          { x: 6, y: 24 },
        ].map((p, i) => (
          <motion.circle key={`${fx.sparks}-${i}`} cx={p.x} cy={p.y} r="1.8" fill="#fff" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0] }} transition={{ duration: 1, delay: i * 0.14 }} style={BOX} />
        ))}
      {/* a z that drifts up while it dozes */}
      {fx.z > 0 && (
        <motion.text key={fx.z} x="52" y="10" fontSize="12" fontWeight="800" fill="#fff" initial={{ opacity: 0, y: 14 }} animate={{ opacity: [0, 0.9, 0], y: [14, 4, -4] }} transition={{ duration: 2.4, ease: 'easeOut' }}>
          z
        </motion.text>
      )}
      {accessories.includes('shades') && (
        <g fill={accessoryColors.shades ?? '#14151f'} stroke="rgba(255,255,255,0.4)" strokeWidth="1.2">
          <rect x="3" y="3" width="28" height="19" rx="7" />
          <rect x="33" y="3" width="28" height="19" rx="7" />
        </g>
      )}
      {accessories.includes('glasses') && (
        <g fill="none" stroke={frame} strokeWidth="2.2">
          <circle cx="17" cy={CY} r="12.5" />
          <circle cx="47" cy={CY} r="12.5" />
          <path d="M29.5 12 Q32 9.5 34.5 12" />
        </g>
      )}
    </svg>
  )
}
