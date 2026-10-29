import { useEffect, useId, useState } from 'react'
import { motion, motionValue, useTransform, type MotionValue } from 'motion/react'
import type { AccessoryColors, MascotAccessory } from '../lib/settings'

/** What the little character is doing; the assistant state machine picks one. */
export type MascotState = 'sleep' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'confused'

interface Props {
  state: MascotState
  /** 0-1 loudness (your voice while listening, its voice while talking); drives the glow, bobbing and mouth */
  level?: MotionValue<number>
  size?: number
  /** the aurora's main colour (the other two stops are fixed indigo and pink) */
  color: string
  accessories?: MascotAccessory[]
  /** a hex colour per accessory; one that is missing keeps its own colour */
  accessoryColors?: AccessoryColors
}

const BOX = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const WHITE = '#fff'
/** the centre of the face, which the orbiting sparks circle */
const CX = 70
const CY = 71

/** Closes both eyes for a moment at random, like a real blink. */
export function useBlink(active: boolean) {
  const [shut, setShut] = useState(false)
  useEffect(() => {
    if (!active) return
    let t: number
    const next = () => {
      t = window.setTimeout(() => {
        setShut(true)
        t = window.setTimeout(() => {
          setShut(false)
          next()
        }, 140)
      }, 1800 + Math.random() * 3200)
    }
    next()
    return () => window.clearTimeout(t)
  }, [active])
  return shut
}

/** While idle it glances left and right now and then, which makes it feel awake. */
export function useGlance(active: boolean) {
  const [x, setX] = useState(0)
  useEffect(() => {
    if (!active) return
    let t: number
    const next = () => {
      t = window.setTimeout(() => {
        const r = Math.random()
        setX(r < 0.35 ? -4 : r < 0.7 ? 4 : 0)
        next()
      }, 2200 + Math.random() * 3000)
    }
    next()
    return () => {
      window.clearTimeout(t)
      setX(0)
    }
  }, [active])
  return x
}

/** stands in when nobody passes a level, so the hooks below always have a value to read */
const FLAT = motionValue(0)

/** A softly rounded four-point sparkle centred on (cx, CY), the shape the eyes are drawn with. */
const star = (cx: number, k = 1) => {
  const a = 12 * k
  const b = 3.6 * k
  return `M${cx} ${CY - 2 - a} L${cx + b} ${CY - 2 - b} L${cx + a} ${CY - 2} L${cx + b} ${CY - 2 + b} L${cx} ${CY - 2 + a} L${cx - b} ${CY - 2 + b} L${cx - a} ${CY - 2} L${cx - b} ${CY - 2 - b} Z`
}

const CONFETTI = [
  { dx: -48, dy: -40, c: '#ffd166' },
  { dx: 44, dy: -46, c: '#ff6fd8' },
  { dx: -60, dy: 6, c: '#6f7bff' },
  { dx: 58, dy: 2, c: '#3be0c3' },
  { dx: 4, dy: -62, c: '#fff' },
]

/**
 * Aurora: a dark glass squircle with a soft, slow-moving colour glow inside and sparkle eyes. The glow is the
 * character's mood: it swells with your voice, spins while it thinks and turns red when something is wrong.
 */
export function Mascot({ state, level, size = 48, color, accessories = [], accessoryColors = {} }: Props) {
  const uid = useId().replace(/:/g, '')
  const lvl = level ?? FLAT
  const asleep = state === 'sleep'
  const blink = useBlink(!asleep && state !== 'happy')
  const glance = useGlance(state === 'idle')
  const loud = state === 'listening' || state === 'speaking'
  const has = (a: MascotAccessory) => accessories.includes(a)
  const tint = (a: MascotAccessory, fallback: string) => accessoryColors[a] ?? fallback

  const bob = useTransform(lvl, [0, 1], [0, state === 'speaking' ? -4 : -3])
  const swell = useTransform(lvl, [0, 1], [1, state === 'listening' ? 1.07 : 1.03])
  const glowRise = useTransform(lvl, [0, 1], [0, loud ? -16 : -4])
  const mouthOpen = useTransform(lvl, [0, 1], [0.5, 1.5])
  // the halo behind the body brightens with the voice
  const halo = useTransform(lvl, [0, 1], [asleep ? 0.05 : 0.22, loud ? 0.7 : 0.34])

  const body =
    state === 'listening' || state === 'speaking'
      ? { y: 0, rotate: 0 }
      : state === 'thinking'
        ? { rotate: [-3, 3, -3], y: 0 }
        : state === 'happy'
          ? { y: [0, -10, 0, -6, 0], rotate: 0 }
          : state === 'confused'
            ? { rotate: [0, -6, 6, -4, 4, 0], y: 0 }
            : { y: [0, -1.5, 0], rotate: 0 }
  const bodyTransition =
    state === 'thinking'
      ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const }
      : state === 'happy'
        ? { duration: 0.8, ease: 'easeOut' as const }
        : state === 'confused'
          ? { duration: 0.7 }
          : state === 'idle' || asleep
            ? { duration: asleep ? 4.5 : 3.2, repeat: Infinity, ease: 'easeInOut' as const }
            : { duration: 0.2 }

  // the glow's drift: slow at rest, quicker while thinking, and it dims when asleep
  const driftSpeed = state === 'thinking' ? 2.2 : state === 'listening' ? 3.5 : 7
  const glowOpacity = asleep ? 0.3 : 0.85
  const g1 = state === 'confused' ? '#ff6b6b' : color
  const g2 = state === 'confused' ? '#ff9f6b' : '#6f7bff'
  const g3 = state === 'confused' ? '#ff6b9a' : '#ff6fd8'

  const look = state === 'thinking' ? { x: 5, y: -3 } : { x: glance, y: 0 }

  const eye = (cx: number, k: number) => (
    <motion.g key={cx} animate={{ scaleY: blink ? 0.12 : 1 }} transition={{ duration: 0.07 }} style={BOX}>
      <motion.path
        d={star(cx, k)}
        fill={WHITE}
        stroke={WHITE}
        strokeWidth={2.4}
        strokeLinejoin="round"
        animate={state === 'idle' || state === 'listening' ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: state === 'listening' ? 0.9 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={BOX}
      />
    </motion.g>
  )
  const arc = (cx: number, up: boolean) => (
    <path key={cx} d={up ? `M${cx - 8} 73 Q${cx} 60 ${cx + 8} 73` : `M${cx - 8} 66 Q${cx} 72 ${cx + 8} 66`} stroke={WHITE} strokeWidth={4} strokeLinecap="round" fill="none" opacity={asleep ? 0.6 : 1} />
  )

  let eyes: React.ReactNode
  if (asleep) eyes = [arc(50, false), arc(90, false)]
  else if (state === 'happy') eyes = [arc(50, true), arc(90, true)]
  else if (state === 'confused') eyes = [eye(50, 1), eye(90, 0.62)]
  else eyes = [eye(50, state === 'listening' ? 1.2 : 1), eye(90, state === 'listening' ? 1.2 : 1)]

  let mouth: React.ReactNode
  if (state === 'speaking') {
    mouth = <motion.path d="M62 94 Q70 106 78 94 Z" fill={WHITE} style={{ ...BOX, scaleY: mouthOpen }} />
  } else if (state === 'listening') {
    mouth = <path d="M65 94 Q70 101 75 94 Z" fill={WHITE} />
  } else if (state === 'happy') {
    mouth = <path d="M60 92 Q70 107 80 92 Z" fill={WHITE} />
  } else if (state === 'confused') {
    mouth = <path d="M62 99 Q66 94 70 99 T78 99" stroke={WHITE} strokeWidth={3} strokeLinecap="round" fill="none" />
  } else if (state === 'thinking') {
    mouth = <path d="M65 97 L75 97" stroke={WHITE} strokeWidth={3.2} strokeLinecap="round" />
  } else {
    mouth = <path d="M62 94 Q70 101 78 94" stroke={WHITE} strokeWidth={3.4} strokeLinecap="round" fill="none" opacity={asleep ? 0.5 : 1} />
  }

  return (
    <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#232438" />
          <stop offset="1" stopColor="#0c0c16" />
        </linearGradient>
        <linearGradient id={`${uid}a`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={g1} />
          <stop offset="0.5" stopColor={g2} />
          <stop offset="1" stopColor={g3} />
        </linearGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}f`} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${uid}h`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <clipPath id={`${uid}c`}>
          <rect x="14" y="20" width="112" height="102" rx="46" />
        </clipPath>
      </defs>
      <motion.g style={{ ...BOX, y: bob, scale: swell }}>
        <motion.g animate={body} transition={bodyTransition} style={BOX}>
          {/* a soft halo in the glow colour behind the whole body */}
          <motion.rect x="14" y="20" width="112" height="102" rx="46" fill={`url(#${uid}a)`} filter={`url(#${uid}h)`} style={{ opacity: halo }} />

          {/* ripples spreading out while it listens */}
          {state === 'listening' &&
            [0, 0.6].map((d) => (
              <motion.rect
                key={d}
                x="14"
                y="20"
                width="112"
                height="102"
                rx="46"
                fill="none"
                stroke={g1}
                strokeWidth="2.5"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: d }}
                style={BOX}
              />
            ))}

          {/* worn behind the body */}
          {has('headphones') && (
            <g fill={tint('headphones', '#3d3d4d')}>
              <rect x="6" y="58" width="12" height="34" rx="6" />
              <rect x="122" y="58" width="12" height="34" rx="6" />
            </g>
          )}
          {has('catEars') && (
            <g>
              <path d="M20 44 L24 6 Q25 3 28 5 L56 26 Z" fill="#2a2c40" />
              <path d="M120 44 L116 6 Q115 3 112 5 L84 26 Z" fill="#2a2c40" />
              <path d="M28 36 L30 16 L46 28 Z" fill={tint('catEars', '#ff8fb1')} />
              <path d="M112 36 L110 16 L94 28 Z" fill={tint('catEars', '#ff8fb1')} />
            </g>
          )}

          {/* the wake-up pop: it squashes and springs back whenever the state changes */}
          <motion.g key={state} initial={{ scaleX: 1.1, scaleY: 0.9 }} animate={{ scaleX: 1, scaleY: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 11 }} style={BOX}>
            <rect x="14" y="20" width="112" height="102" rx="46" fill={`url(#${uid}b)`} />
            <g clipPath={`url(#${uid}c)`}>
              {/* the aurora: blurred ellipses that drift side to side and rise with loudness */}
              <motion.g style={{ y: glowRise }} filter={`url(#${uid}f)`}>
                <motion.ellipse
                  cx={70}
                  cy={130}
                  rx={74}
                  ry={36}
                  fill={`url(#${uid}a)`}
                  opacity={glowOpacity}
                  animate={{ x: [-10, 10, -10], scaleX: [1, 1.12, 1] }}
                  transition={{ duration: driftSpeed, repeat: Infinity, ease: 'easeInOut' }}
                  style={BOX}
                />
                <motion.ellipse
                  cx={98}
                  cy={134}
                  rx={38}
                  ry={22}
                  fill={g3}
                  opacity={asleep ? 0.12 : 0.5}
                  animate={{ x: [10, -16, 10] }}
                  transition={{ duration: driftSpeed * 0.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={BOX}
                />
                <motion.ellipse
                  cx={40}
                  cy={132}
                  rx={30}
                  ry={20}
                  fill={g1}
                  opacity={asleep ? 0.1 : 0.45}
                  animate={{ x: [-8, 14, -8] }}
                  transition={{ duration: driftSpeed * 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={BOX}
                />
              </motion.g>
              {/* a gloss streak that sweeps across the glass every few seconds */}
              {!asleep && (
                <motion.rect
                  x="-20"
                  y="10"
                  width="26"
                  height="130"
                  fill={`url(#${uid}s)`}
                  transform="rotate(20 70 70)"
                  animate={{ x: [0, 0, 150, 150] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.6, 0.85, 1] }}
                />
              )}
            </g>
            <rect x="14.5" y="20.5" width="111" height="101" rx="45.5" fill="none" stroke={`url(#${uid}r)`} strokeOpacity="0.5" />
            <path d="M32 38 Q52 28 84 30" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.18" />

            <motion.g animate={look} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
              <g style={{ filter: asleep ? 'none' : 'drop-shadow(0 0 3px rgba(255,255,255,0.85))' }}>{eyes}</g>
            </motion.g>
            {state !== 'confused' && !asleep && (
              <>
                <ellipse cx="34" cy="90" rx="8" ry="4.6" fill={g3} opacity="0.32" />
                <ellipse cx="106" cy="90" rx="8" ry="4.6" fill={g3} opacity="0.32" />
              </>
            )}
            {mouth}
          </motion.g>

          {/* sparks circling the head while it thinks */}
          {state === 'thinking' && (
            <motion.g animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} style={{ transformBox: 'view-box', transformOrigin: `${CX}px ${CY}px` }}>
              {[
                { a: -90, c: g1 },
                { a: 30, c: g2 },
                { a: 150, c: g3 },
              ].map(({ a, c }) => (
                <circle key={a} cx={CX + 66 * Math.cos((a * Math.PI) / 180)} cy={CY + 66 * Math.sin((a * Math.PI) / 180)} r="4.5" fill={c} style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
              ))}
            </motion.g>
          )}

          {/* confetti bursting out when it is happy */}
          {state === 'happy' &&
            CONFETTI.map((p, i) => (
              <motion.circle
                key={i}
                cx={CX}
                cy={CY}
                r="4"
                fill={p.c}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.04 }}
              />
            ))}

          {/* a question mark pops up when something is wrong */}
          {state === 'confused' && (
            <motion.text x="104" y="30" fontSize="34" fontWeight="800" fill="#ffd166" initial={{ scale: 0, rotate: -20 }} animate={{ scale: [0, 1.3, 1], rotate: 14 }} transition={{ duration: 0.5 }} style={BOX}>
              ?
            </motion.text>
          )}

          {/* a z drifts up while it sleeps */}
          {asleep && (
            <motion.text x="104" y="40" fontSize="26" fontWeight="800" fill={g1} animate={{ y: [44, 24, 10], opacity: [0, 0.9, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeOut' }}>
              z
            </motion.text>
          )}

          {/* worn in front */}
          {has('headphones') && <path d="M16 66 C 8 4, 132 4, 124 66" stroke={tint('headphones', '#3d3d4d')} strokeWidth="6" strokeLinecap="round" fill="none" />}
          {has('scarf') && (
            <g>
              <path d="M30 112 Q70 130 110 112 L108 124 Q70 142 32 124 Z" fill={tint('scarf', '#ff6b6b')} />
              <path d="M92 124 L98 144 L110 140 L104 120 Z" fill={tint('scarf', '#ff6b6b')} stroke="rgba(0,0,0,0.22)" strokeWidth="1.2" strokeLinejoin="round" />
            </g>
          )}
          {has('bowtie') && (
            <g transform="translate(70 126)">
              <path d="M0 0 L-15 -9 L-15 9 Z M0 0 L15 -9 L15 9 Z" fill={tint('bowtie', '#6f7bff')} stroke="rgba(0,0,0,0.22)" strokeWidth="1.2" strokeLinejoin="round" />
              <circle r="4" fill={tint('bowtie', '#6f7bff')} stroke="rgba(0,0,0,0.22)" strokeWidth="1.2" />
            </g>
          )}
          {has('glasses') && (
            <g fill="rgba(255,255,255,0.07)" stroke={tint('glasses', '#ffd166')} strokeWidth="3.4">
              <circle cx="50" cy="69" r="19" />
              <circle cx="90" cy="69" r="19" />
              <path d="M69 66 Q70 63 71 66" fill="none" />
              <path d="M31 64 L20 60 M109 64 L120 60" fill="none" strokeLinecap="round" />
            </g>
          )}
          {has('shades') && (
            <g fill={tint('shades', '#14151f')} stroke="rgba(255,255,255,0.35)" strokeWidth="1.6">
              <path d="M28 58 H64 V70 Q64 84 46 84 Q30 84 28 70 Z" />
              <path d="M76 58 H112 V70 Q110 84 94 84 Q76 84 76 70 Z" />
              <path d="M64 61 H76" fill="none" strokeWidth="3" />
            </g>
          )}
          {has('bow') && (
            <g transform="translate(104 34) rotate(18)">
              <path d="M0 0 L-12 -8 L-12 8 Z M0 0 L12 -8 L12 8 Z" fill={tint('bow', '#ff5d8f')} />
              <circle r="3.6" fill="#fff" opacity="0.7" />
            </g>
          )}
          {has('hat') && (
            <g transform="translate(70 22)">
              <path d="M-14 0 L0 -26 L14 0 Z" fill={tint('hat', '#7c5cff')} />
              <circle cy="-27" r="4" fill="#ffd166" />
              <path d="M-14 0 L14 0" stroke="#ffd166" strokeWidth="3.4" strokeLinecap="round" />
            </g>
          )}
          {has('crown') && (
            <g transform="translate(70 24)">
              <path d="M-22 0 L-19 -20 L-9 -9 L0 -24 L9 -9 L19 -20 L22 0 Z" fill={tint('crown', '#ffd166')} stroke="#e0a93a" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="-19" cy="-21" r="3" fill="#ff6fd8" />
              <circle cy="-25" r="3.2" fill="#6f7bff" />
              <circle cx="19" cy="-21" r="3" fill="#3be0c3" />
            </g>
          )}
          {has('topHat') && (
            <g transform="translate(70 24)">
              <rect x="-30" y="-5" width="60" height="9" rx="4.5" fill={tint('topHat', '#2f3144')} stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
              <rect x="-18" y="-34" width="36" height="32" rx="4" fill={tint('topHat', '#2f3144')} stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
              <rect x="-18" y="-13" width="36" height="7" fill="#ff6fd8" opacity="0.85" />
            </g>
          )}
          {has('halo') && (
            <motion.ellipse cx="70" cy="8" rx="28" ry="7" fill="none" stroke={tint('halo', '#ffd166')} strokeWidth="5" animate={{ y: [0, -3, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} style={{ filter: 'drop-shadow(0 0 4px rgba(255,209,102,0.8))' }} />
          )}
        </motion.g>
      </motion.g>
    </svg>
  )
}
