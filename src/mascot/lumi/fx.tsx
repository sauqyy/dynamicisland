import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Bell, BatteryLow, Calendar, Check as CheckIcon, Clover as CloverIcon, Coffee, Droplet, FileText, Lightbulb, Mail, Trophy as TrophyIcon, Zap as ZapIcon, type LucideIcon } from 'lucide-react'
import { BOX } from '../MascotEyes'

/**
 * The little graphics that play around Lumi's eyes. All of them are drawn in the face's own coordinates
 * (see FACE_VIEW in LumiFace): the eyes sit at (17, 14) and (47, 14), the middle of the face is (32, 14),
 * and there is room for effects out to x -28..92 and y -18..46.
 */
export type FxId =
  | 'confetti'
  | 'confettiSmall'
  | 'sparks'
  | 'hearts'
  | 'alarm'
  | 'zzz'
  | 'sweat'
  | 'qmark'
  | 'exclaim'
  | 'check'
  | 'orbit'
  | 'ripple'
  | 'notes'
  | 'drop'
  | 'mug'
  | 'moon'
  | 'sun'
  | 'envelope'
  | 'zap'
  | 'rain'
  | 'clock'
  | 'battery'
  | 'shine'
  | 'stars'
  | 'doc'
  | 'bell'
  | 'calendar'
  | 'glitch'
  | 'lock'
  | 'clover'
  | 'wave'
  | 'burst'
  | 'impact'
  | 'stamp'
  | 'firework'
  | 'trophy'
  | 'bubble'
  | 'bulb'
  | 'glasses'
  | 'focusLines'
  | 'blast'
  | 'handChin'
  | 'anger'
  | 'tear'
  | 'handWave'
  | 'handsUp'
  | 'firefly'

const CX = 32
const CY = 14
const PALETTE = ['#ffd166', '#ff6fd8', '#6f7bff', '#3be0c3', '#fff', '#ff8a5c']

/** the same "random" every time, so a burst looks the same on every replay and never flickers on re-render */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const star4 = (x: number, y: number, r: number) =>
  `M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z`

/**
 * Every prop is the same kind of thing: a small enamel badge, a dark disc with a coloured rim and a white glyph
 * from the app's own icon set. They sit beside her, never on her face, and only the badge moves.
 */
const BX = 80
const BY = 4

function Badge({ Icon, c, x = BX, y = BY, kind = 'bob', children }: { Icon?: LucideIcon; c: string; x?: number; y?: number; kind?: 'bob' | 'sway' | 'still'; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g initial={{ scale: 0, rotate: -24 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }} style={BOX}>
        <g className={kind === 'bob' ? 'lm-bob' : kind === 'sway' ? 'lm-sway' : undefined}>
          <circle r={11.5} fill="#15172b" />
          <circle r={11.5} fill={c} fillOpacity={0.16} />
          <circle r={11.5} fill="none" stroke={c} strokeWidth={1.8} />
          {Icon && <Icon x={-7} y={-7} width={14} height={14} color="#fff" strokeWidth={2.2} />}
          {children}
        </g>
      </motion.g>
    </g>
  )
}

function Spark({ x, y, r = 4, d = 0, c = '#fff', loop = false }: { x: number; y: number; r?: number; d?: number; c?: string; loop?: boolean }) {
  if (loop) return <path className="lm-spark" d={star4(x, y, r)} fill={c} style={{ animationDelay: `${d}s` }} />
  return <motion.path d={star4(x, y, r)} fill={c} initial={{ opacity: 0, scale: 0, rotate: -40 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.25, 0], rotate: [-40, 0, 50] }} transition={{ duration: 1.1, delay: d, ease: 'easeOut' }} style={BOX} />
}

function Confetti({ n, power, dur = 1.5 }: { n: number; power: number; dur?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = rnd(i + 1) * Math.PI * 2
        const dist = (22 + rnd(i + 40) * 30) * power
        const ex = Math.cos(a) * dist * 1.55
        const ey = Math.sin(a) * dist * 0.62 - 8
        const c = PALETTE[i % PALETTE.length]
        const d = rnd(i + 90) * 0.18
        const spin = (rnd(i + 7) - 0.5) * 900
        const common = {
          initial: { x: CX, y: CY, opacity: 1, scale: 0.4 },
          animate: { x: [CX, CX + ex, CX + ex * 1.12], y: [CY, CY + ey, CY + ey + 18 * power], opacity: [1, 1, 0], scale: [0.4, 1, 0.8], rotate: [0, spin] },
          transition: { duration: dur, delay: d, ease: 'easeOut' as const, times: [0, 0.45, 1] },
          style: BOX,
        }
        return i % 3 === 0 ? <motion.circle key={i} r={1.7} fill={c} {...common} /> : <motion.rect key={i} width={3.4} height={1.9} rx={0.5} fill={c} {...common} />
      })}
    </g>
  )
}

function Hearts({ c }: { c: string }) {
  return (
    <g>
      {[
        { x: 8, d: 0, s: 1 },
        { x: 56, d: 0.35, s: 0.85 },
        { x: 32, d: 0.7, s: 1.15 },
        { x: -6, d: 1.05, s: 0.7 },
        { x: 70, d: 1.3, s: 0.75 },
      ].map((h, i) => (
        <motion.path
          key={i}
          d="M0 4 C-7 -2 -4 -8 0 -4 C4 -8 7 -2 0 4 Z"
          fill={c}
          initial={{ opacity: 0 }}
          animate={{ x: [h.x, h.x + (i % 2 ? 5 : -5), h.x], y: [22, -6, -20], opacity: [0, 1, 0], scale: [0.3, h.s, h.s * 0.8] }}
          transition={{ duration: 2.2, delay: h.d, repeat: Infinity, repeatDelay: 0.3, ease: 'easeOut' }}
          style={{ ...BOX }}
        />
      ))}
    </g>
  )
}

function Alarm({ c }: { c: string }) {
  return (
    <g>
      {[0, 0.35, 0.7].map((d) => (
        <motion.circle key={d} cx={CX} cy={CY + 1} r={33} fill="none" stroke={c} strokeWidth={1.8} initial={{ opacity: 0 }} animate={{ scale: [1, 1.7], opacity: [0.85, 0] }} transition={{ duration: 1.1, delay: d, repeat: Infinity, ease: 'easeOut' }} style={BOX} />
      ))}
    </g>
  )
}

function Zzz() {
  return (
    <g fill="#fff" fontWeight={800} fontFamily="system-ui, sans-serif">
      {[
        { s: 9, x: 62, d: 0 },
        { s: 12, x: 70, d: 0.9 },
        { s: 15, x: 78, d: 1.8 },
      ].map((z, i) => (
        <motion.text key={i} x={z.x} y={4} fontSize={z.s} animate={{ y: [12, -2, -14], x: [z.x, z.x + 4, z.x + 8], opacity: [0, 0.9, 0] }} transition={{ duration: 2.7, delay: z.d, repeat: Infinity, ease: 'easeOut' }}>
          z
        </motion.text>
      ))}
    </g>
  )
}

function Sweat() {
  return (
    <g transform="translate(70 0)">
      <motion.path d="M0 -5 Q4.2 1 0 4.5 Q-4.2 1 0 -5 Z" fill="#7dd3fc" initial={{ opacity: 0 }} animate={{ y: [-4, 16, 28], opacity: [0, 1, 0] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.3, ease: 'easeIn' }}  />
    </g>
  )
}

function Mark({ ch, c, x = 74, y = 0 }: { ch: string; c: string; x?: number; y?: number }) {
  return (
    <motion.text x={x} y={y + 10} fontSize={24} fontWeight={800} fontFamily="system-ui, sans-serif" fill={c} initial={{ scale: 0, rotate: -25, opacity: 0 }} animate={{ scale: [0, 1.4, 1], rotate: [-25, 12, 8], opacity: 1 }} transition={{ duration: 0.5 }} style={{ ...BOX }}>
      {ch}
    </motion.text>
  )
}

/** a big tick drawn in one stroke, with a ring that pops around it */
function Check({ c }: { c: string }) {
  return <Badge Icon={CheckIcon} c={c} />
}

function Orbit({ c }: { c: string }) {
  const N = 16
  const pts = Array.from({ length: N + 1 }, (_, i) => (i / N) * Math.PI * 2)
  return (
    <g>
      {[0, 1, 2].map((k) => (
        <motion.circle
          key={k}
          r={2.2 - k * 0.4}
          fill={c}
          animate={{ cx: pts.map((a) => CX + Math.cos(a + (k * Math.PI * 2) / 3) * 36), cy: pts.map((a) => CY - 6 + Math.sin(a + (k * Math.PI * 2) / 3) * 12) }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
          
        />
      ))}
    </g>
  )
}

/** voice arcs breathing out of both sides: it is saying something */
function Ripple({ c }: { c: string }) {
  return (
    <g fill="none" stroke={c} strokeWidth={2} strokeLinecap="round">
      {[0, 0.28].map((d) => (
        <g key={d}>
          <motion.path d="M-9 4 Q-15 14 -9 24" animate={{ x: [0, -7], opacity: [0.9, 0] }} transition={{ duration: 0.9, delay: d, repeat: Infinity, ease: 'easeOut' }} />
          <motion.path d="M73 4 Q79 14 73 24" animate={{ x: [0, 7], opacity: [0.9, 0] }} transition={{ duration: 0.9, delay: d, repeat: Infinity, ease: 'easeOut' }} />
        </g>
      ))}
    </g>
  )
}

function Notes({ c }: { c: string }) {
  return (
    <g fill={c} fontFamily="system-ui, sans-serif" fontWeight={700}>
      {[
        { g: '♪', x: 66, d: 0, s: 13 },
        { g: '♫', x: -14, d: 1.1, s: 15 },
        { g: '♪', x: 78, d: 2, s: 11 },
      ].map((n, i) => (
        <motion.text key={i} x={n.x} fontSize={n.s} animate={{ y: [26, 4, -12], x: [n.x, n.x + (i % 2 ? -5 : 5), n.x], opacity: [0, 1, 0], rotate: [-12, 12, -8] }} transition={{ duration: 2.6, delay: n.d, repeat: Infinity, ease: 'easeOut' }} style={BOX}>
          {n.g}
        </motion.text>
      ))}
    </g>
  )
}

function Drop({ c }: { c: string }) {
  return <Badge Icon={Droplet} c={c} />
}

function Mug({ c }: { c: string }) {
  return <Badge Icon={Coffee} c={c} />
}

function Moon() {
  return (
    <g>
      <motion.path d="M76 -10 A11 11 0 1 0 90 8 A9 9 0 1 1 76 -10 Z" fill="#fde68a" animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} style={{ ...BOX }} />
      <Spark x={62} y={-8} r={3} d={0.2} c="#fde68a" loop />
      <Spark x={-14} y={-2} r={2.6} d={0.9} c="#fff" loop />
      <Spark x={86} y={26} r={2.4} d={1.5} c="#fff" loop />
    </g>
  )
}

function Sun({ c }: { c: string }) {
  return (
    <g>
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }} style={BOX}>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={75.2} y={-13} width={1.8} height={5} rx={0.9} fill={c} transform={`rotate(${i * 36} 76 4)`} />
        ))}
      </motion.g>
      <motion.circle cx={76} cy={4} r={5.5} fill={c} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 12 }}  />
    </g>
  )
}

function Envelope({ c }: { c: string }) {
  return <Badge Icon={Mail} c={c} />
}

function Zap({ c }: { c: string }) {
  return <Badge Icon={ZapIcon} c={c} />
}

function Rain() {
  return (
    <g>
      {[
        { x: 12, d: 0 },
        { x: 52, d: 0.5 },
        { x: 30, d: 1.0 },
      ].map((r) => (
        <g key={r.x} transform={`translate(${r.x} 0)`}>
          <motion.path d="M0 -4 Q3.4 1 0 4 Q-3.4 1 0 -4 Z" fill="#7dd3fc" initial={{ opacity: 0 }} animate={{ y: [-2, 18, 30], opacity: [0, 0.9, 0] }} transition={{ duration: 1.8, delay: r.d, repeat: Infinity, ease: 'easeIn' }} />
        </g>
      ))}
    </g>
  )
}

/** a small clock whose hands race, for "something is coming up" */
function Clock({ c }: { c: string }) {
  return (
    <Badge c={c} kind="still">
      <g strokeLinecap="round" fill="none">
        <path className="lm-minute" d="M0 0 V-6.4" stroke="#fff" strokeWidth={1.8} />
        <path className="lm-hour" d="M0 0 V-4.2" stroke={c} strokeWidth={2.2} />
      </g>
      <circle r={1.3} fill="#fff" />
    </Badge>
  )
}

function Battery({ c }: { c: string }) {
  return <Badge Icon={BatteryLow} c={c} />
}

/** a bright streak that sweeps across the eyes, like light passing over glass */
function Shine({ uid }: { uid: string }) {
  return (
    <g clipPath={`url(#${uid}c)`}>
      <motion.rect y={-18} width={14} height={64} fill={`url(#${uid}s)`} transform="rotate(18 32 14)" initial={{ x: -34 }} animate={{ x: [-20, 66] }} transition={{ duration: 1.1, delay: 0.25, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }} />
    </g>
  )
}

function Stars({ c }: { c: string }) {
  return (
    <g>
      <Spark x={-6} y={-6} r={5} d={0} c={c} loop />
      <Spark x={70} y={-8} r={6.5} d={0.3} c={c} loop />
      <Spark x={82} y={22} r={4} d={0.7} c="#fff" loop />
      <Spark x={-12} y={26} r={4.4} d={1} c="#fff" loop />
      <Spark x={32} y={-14} r={3.4} d={0.55} c={c} loop />
    </g>
  )
}

function Doc({ c }: { c: string }) {
  return <Badge Icon={FileText} c={c} />
}

function Bell2({ c }: { c: string }) {
  return <Badge Icon={Bell} c={c} kind="sway" />
}

function CalendarFx({ c }: { c: string }) {
  return <Badge Icon={Calendar} c={c} />
}

/** scan lines flickering over the eyes: something went wrong */
function Glitch() {
  return (
    <g>
      {[3, 12, 21].map((y, i) => (
        <motion.rect key={y} y={y} height={2.2} fill="#ff5d6c" initial={{ opacity: 0 }} animate={{ x: [-20, 20, -6, 40, -30], width: [16, 40, 22, 12, 30], opacity: [0, 0.8, 0, 0.7, 0] }} transition={{ duration: 0.9, delay: i * 0.13, repeat: Infinity, repeatDelay: 0.9 }} />
      ))}
    </g>
  )
}

/** a ring closing in on the eyes: locking on */
function Lock({ c }: { c: string }) {
  return (
    <g>
      {[0, 0.5].map((d) => (
        <motion.circle key={d} cx={CX} cy={CY + 1} r={36} fill="none" stroke={c} strokeWidth={1.6} strokeDasharray="5 5" initial={{ opacity: 0 }} animate={{ scale: [1.35, 1], opacity: [0, 0.8, 0.25] }} transition={{ duration: 1.1, delay: d, repeat: Infinity, ease: 'easeOut' }} style={BOX} />
      ))}
    </g>
  )
}

function Clover({ c }: { c: string }) {
  return <Badge Icon={CloverIcon} c={c} />
}

function Wave({ c }: { c: string }) {
  return (
    <motion.path d="M70 18 Q74 8 78 12 Q82 4 86 10" fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" animate={{ rotate: [0, 18, -8, 18, 0] }} transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 0.8 }} style={BOX} />
  )
}

/** rays and a ring thrown out from (x, y): the pop when something lands */
function Rays({ x = CX, y = CY, n = 10, r0 = 7, r1 = 17, c = '#fff', wide = 1.7, d = 0, w = 1.8 }: { x?: number; y?: number; n?: number; r0?: number; r1?: number; c?: string; wide?: number; d?: number; w?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${wide} 1)`}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.2
        return (
          <motion.path
            key={i}
            d={`M${Math.cos(a) * r0} ${Math.sin(a) * r0} L${Math.cos(a) * r1} ${Math.sin(a) * r1}`}
            stroke={i % 2 ? c : '#fff'}
            strokeWidth={w}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0, opacity: 1 }}
            animate={{ pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 0.55, delay: d, times: [0, 0.4, 1], ease: 'easeOut' }}
          />
        )
      })}
    </g>
  )
}

function Burst({ c }: { c: string }) {
  return (
    <g>
      <motion.ellipse cx={CX} cy={CY} rx={10} ry={6} fill="none" stroke={c} strokeWidth={2} initial={{ opacity: 0.9, scale: 0.4 }} animate={{ opacity: 0, scale: 3.4 }} transition={{ duration: 0.6, ease: 'easeOut' }} style={BOX} />
      <Rays c={c} />
    </g>
  )
}

/** a heavier landing: a flash, a shockwave and long rays */
function Impact({ c }: { c: string }) {
  return (
    <g>
      <motion.path d={star4(CX, CY, 20)} fill="#fff" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 1.8] }} transition={{ duration: 0.45, ease: 'easeOut' }} style={{ ...BOX }} />
      <motion.ellipse cx={CX} cy={CY} rx={10} ry={6} fill="none" stroke={c} strokeWidth={2.4} initial={{ opacity: 1, scale: 0.3 }} animate={{ opacity: 0, scale: 4.4 }} transition={{ duration: 0.65, ease: 'easeOut' }} style={BOX} />
      <Rays c={c} n={14} r0={8} r1={24} w={2.2} />
    </g>
  )
}

/** the tick, stamped down hard beside the eyes, with a shockwave when it lands */
function Stamp({ c }: { c: string }) {
  return (
    <g>
      <motion.g initial={{ scale: 2.6, opacity: 0, rotate: -22 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 560, damping: 15 }} style={BOX}>
        <Check c={c} />
      </motion.g>
      <motion.circle cx={BX} cy={BY} r={11.5} fill="none" stroke="#fff" strokeWidth={1.6} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 0.9, 0], scale: [0.8, 0.9, 2.4] }} transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }} style={BOX} />
    </g>
  )
}

/** a rocket from each eye, and a firework where it ends */
function Firework({ x, c, d = 0 }: { x: number; c: string; d?: number }) {
  const top = -5
  return (
    <g>
      <motion.path d={`M${x} 20 L${x} ${top}`} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" fill="none" initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: [0, 1, 1], opacity: [1, 1, 0] }} transition={{ duration: 0.45, delay: d, times: [0, 0.7, 1], ease: 'easeOut' }} />
      <Rays x={x} y={top} n={12} r0={2} r1={14} c={c} wide={1} d={d + 0.38} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.5
        return <motion.circle key={i} r={1.3} fill={PALETTE[i % PALETTE.length]} initial={{ opacity: 0, cx: x, cy: top }} animate={{ opacity: [0, 1, 0], cx: [x, x + Math.cos(a) * 18], cy: [top, top + Math.sin(a) * 12 + 6] }} transition={{ duration: 0.8, delay: d + 0.4, ease: 'easeOut' }} />
      })}
    </g>
  )
}

function Trophy({ c }: { c: string }) {
  return <Badge Icon={TrophyIcon} c={c} />
}

/** a soap bubble that drifts up beside her, and pops */
function Bubble() {
  return (
    <g>
      <motion.circle r={5} fill="rgba(255,255,255,0.08)" stroke="#fff" strokeWidth={1.2} initial={{ opacity: 0 }} animate={{ cx: [70, 78, 72, 75], cy: [36, 22, 8, 0], opacity: [0, 1, 1, 0], scale: [0.3, 1, 1.15, 1.4] }} transition={{ duration: 2, times: [0, 0.35, 0.8, 1], ease: 'easeOut' }} style={BOX} />
      <Rays x={75} y={0} n={8} r0={3} r1={11} wide={1} d={1.9} w={1.4} />
    </g>
  )
}

/** a glowing speck that wanders about, for the eyes to follow */
function Firefly() {
  return (
    <motion.circle r={2.2} fill="#fde68a" initial={{ opacity: 0 }} animate={{ cx: [-14, 14, 44, 70, 38, 4], cy: [34, 6, 24, -4, 22, 12], opacity: [0, 1, 1, 1, 1, 0] }} transition={{ duration: 3, ease: 'easeInOut' }}  />
  )
}

/** a lightbulb that pops on beside her: an idea */
function Bulb() {
  return <Badge Icon={Lightbulb} c="#ffd34e" />
}

/** glasses that drop onto her face, and catch the light */
function Glasses() {
  return (
    <motion.g initial={{ y: -26, opacity: 0, rotate: -6 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 11 }} style={BOX}>
      <g fill="rgba(255,255,255,0.07)" stroke="#dbe3ff" strokeWidth={2.2}>
        <circle cx={17} cy={14} r={12.8} />
        <circle cx={47} cy={14} r={12.8} />
      </g>
      <path d="M29.6 12 Q32 9 34.4 12" fill="none" stroke="#dbe3ff" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M4.4 11 L0 9 M59.6 11 L64 9" fill="none" stroke="#dbe3ff" strokeWidth={2.2} strokeLinecap="round" />
      <motion.path d="M9 6 L14 3" stroke="#fff" strokeWidth={2} strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0], x: [0, 16, 32] }} transition={{ duration: 0.6, delay: 0.6, repeat: Infinity, repeatDelay: 2.4 }} />
    </motion.g>
  )
}

/** speed lines closing in on her: all of the attention in one place */
function FocusLines({ c }: { c: string }) {
  return (
    <g transform="translate(32 14)">
      <motion.g animate={{ scale: [1.18, 0.86], opacity: [0, 0.85, 0] }} transition={{ duration: 0.7, repeat: Infinity, ease: 'easeIn' }} style={BOX}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + 0.13
          return <path key={i} d={`M${Math.cos(a) * 36} ${Math.sin(a) * 33} L${Math.cos(a) * 44} ${Math.sin(a) * 41}`} stroke={i % 2 ? c : '#fff'} strokeWidth={1.8} strokeLinecap="round" />
        })}
      </motion.g>
    </g>
  )
}

/** an explosion going off behind her: a fireball, flames and shock rings */
function Blast() {
  return (
    <g>
      <defs>
        <radialGradient id="lumi-blast">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.4" stopColor="#ffb347" />
          <stop offset="0.75" stopColor="#ff5a36" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ff5a36" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.circle cx={32} cy={15} r={50} fill="url(#lumi-blast)" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.1, 0.95, 1.05], opacity: [0, 1, 0.85, 0.95] }} transition={{ duration: 1.1, times: [0, 0.3, 0.6, 1] }} style={BOX} />
      {[
        { x: 2, y: -6, r: 12, c: '#ffb347' },
        { x: 62, y: -4, r: 11, c: '#ff7a45' },
        { x: 70, y: 28, r: 10, c: '#ffb347' },
        { x: -6, y: 30, r: 11, c: '#ff7a45' },
        { x: 32, y: -22, r: 12, c: '#ffd166' },
        { x: 32, y: 52, r: 11, c: '#ff7a45' },
      ].map((f, i) => (
        <motion.circle key={i} cx={f.x} cy={f.y} r={f.r} fill={f.c} initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.25, 0.9, 1.1, 0.95], opacity: [0, 0.9, 0.8, 0.9, 0.8] }} transition={{ duration: 1.6, delay: 0.08 * i, repeat: Infinity, repeatDelay: 0.1 }} style={{ ...BOX }} />
      ))}
      {[0, 0.25].map((d) => (
        <motion.ellipse key={d} cx={32} cy={15} rx={34} ry={34} fill="none" stroke="#ffd9a0" strokeWidth={2.4} initial={{ opacity: 0 }} animate={{ scale: [0.5, 2.2], opacity: [0.9, 0] }} transition={{ duration: 0.9, delay: d, ease: 'easeOut' }} style={BOX} />
      ))}
    </g>
  )
}

/** the effects that go behind the body */
export const BACK_FX: FxId[] = ['blast', 'alarm', 'lock', 'focusLines', 'burst', 'impact', 'ripple', 'orbit']

/** Her hands are circles: soft, round, and they come and go. */
function HandDisc({ x, y, r = 6.6 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="url(#lm-hand)" />
      <ellipse cx={x - r * 0.3} cy={y - r * 0.42} rx={r * 0.38} ry={r * 0.24} fill="#fff" fillOpacity={0.7} />
    </g>
  )
}

function HandDefs() {
  return (
    <defs>
      <radialGradient id="lm-hand" cx="0.38" cy="0.32" r="0.85">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#c9d3ff" />
      </radialGradient>
    </defs>
  )
}

/** a hand comes up to her chin, and taps it now and then while she thinks */
function HandChin() {
  return (
    <g>
      <HandDefs />
      <motion.g initial={{ y: 40, x: 14, opacity: 0 }} animate={{ y: 0, x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 130, damping: 14, delay: 0.6 }}>
        <motion.g animate={{ y: [0, -2.4, 0, -2.4, 0, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}>
          <HandDisc x={36} y={45} />
        </motion.g>
      </motion.g>
    </g>
  )
}

/** a hand waves beside her */
function HandWave() {
  return (
    <g>
      <HandDefs />
      <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} style={{ transformBox: 'view-box', transformOrigin: '72px 38px' }}>
        <motion.g animate={{ rotate: [0, 24, -14, 24, -14, 0] }} transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 0.9, ease: 'easeInOut' }} style={{ transformBox: 'view-box', transformOrigin: '72px 38px' }}>
          <HandDisc x={72} y={24} />
        </motion.g>
      </motion.g>
    </g>
  )
}

/** both hands up: a cheer */
function HandsUp() {
  return (
    <g>
      <HandDefs />
      {[
        { x: 2, d: 0 },
        { x: 62, d: 0.12 },
      ].map((h) => (
        <motion.g key={h.x} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12, delay: h.d }}>
          <motion.g animate={{ y: [0, -3.4, 0], rotate: [0, h.x < 30 ? -10 : 10, 0] }} transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut', delay: h.d }} style={BOX}>
            <HandDisc x={h.x} y={-8} />
          </motion.g>
        </motion.g>
      ))}
    </g>
  )
}

/** the little cross-shaped vein that pops beside the head when she is cross */
function Anger() {
  return (
    <g transform="translate(68 -8)">
      <motion.g initial={{ scale: 0, rotate: -30 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.35 }} style={BOX}>
        <g className="lm-bob" stroke="#ff5d6c" strokeWidth={2.4} strokeLinecap="round" fill="none">
          <path d="M-6 -2 Q-2.2 -2 -2.2 -6 M6 -2 Q2.2 -2 2.2 -6 M-6 2 Q-2.2 2 -2.2 6 M6 2 Q2.2 2 2.2 6" />
        </g>
      </motion.g>
    </g>
  )
}

/** a tear that gathers under one eye and runs down her cheek */
function Tear() {
  return (
    <g transform="translate(9 22)">
      <motion.path d="M0 -3.4 Q3 1 0 3.4 Q-3 1 0 -3.4 Z" fill="#9fd4ff" initial={{ opacity: 0 }} animate={{ y: [0, 0, 11, 17], opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.9] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeIn', times: [0, 0.3, 0.8, 1] }} style={BOX} />
    </g>
  )
}

/** One effect by name. `c` is the mood's colour and `uid` ties the shine to the face's own gradient. */
export function Fx({ id, c, uid }: { id: FxId; c: string; uid: string }): ReactNode {
  switch (id) {
    case 'confetti':
      return <Confetti n={34} power={1.25} />
    case 'confettiSmall':
      return <Confetti n={14} power={0.8} dur={1.2} />
    case 'sparks':
      return (
        <g>
          <Spark x={-4} y={-4} r={4.4} d={0} c="#fff" loop />
          <Spark x={70} y={-6} r={5.4} d={0.35} c={c} loop />
          <Spark x={80} y={24} r={3.4} d={0.7} c="#fff" loop />
          <Spark x={-10} y={26} r={3.6} d={1.05} c={c} loop />
        </g>
      )
    case 'hearts':
      return <Hearts c={c} />
    case 'alarm':
      return <Alarm c={c} />
    case 'zzz':
      return <Zzz />
    case 'sweat':
      return <Sweat />
    case 'qmark':
      return <Mark ch="?" c={c} />
    case 'exclaim':
      return <Mark ch="!" c={c} />
    case 'check':
      return <Check c={c} />
    case 'orbit':
      return <Orbit c={c} />
    case 'ripple':
      return <Ripple c={c} />
    case 'notes':
      return <Notes c={c} />
    case 'drop':
      return <Drop c={c} />
    case 'mug':
      return <Mug c={c} />
    case 'moon':
      return <Moon />
    case 'sun':
      return <Sun c={c} />
    case 'envelope':
      return <Envelope c={c} />
    case 'zap':
      return <Zap c={c} />
    case 'rain':
      return <Rain />
    case 'clock':
      return <Clock c={c} />
    case 'battery':
      return <Battery c={c} />
    case 'shine':
      return <Shine uid={uid} />
    case 'stars':
      return <Stars c={c} />
    case 'doc':
      return <Doc c={c} />
    case 'bell':
      return <Bell2 c={c} />
    case 'calendar':
      return <CalendarFx c={c} />
    case 'glitch':
      return <Glitch />
    case 'lock':
      return <Lock c={c} />
    case 'clover':
      return <Clover c={c} />
    case 'wave':
      return <Wave c={c} />
    case 'burst':
      return <Burst c={c} />
    case 'impact':
      return <Impact c={c} />
    case 'stamp':
      return <Stamp c={c} />
    case 'firework':
      return (
        <g>
          <Firework x={4} c="#ffd166" />
          <Firework x={60} c="#ff8fd0" d={0.12} />
        </g>
      )
    case 'trophy':
      return <Trophy c={c} />
    case 'bubble':
      return <Bubble />
    case 'bulb':
      return <Bulb />
    case 'glasses':
      return <Glasses />
    case 'focusLines':
      return <FocusLines c={c} />
    case 'blast':
      return <Blast />
    case 'handChin':
      return <HandChin />
    case 'anger':
      return <Anger />
    case 'tear':
      return <Tear />
    case 'handWave':
      return <HandWave />
    case 'handsUp':
      return <HandsUp />
    case 'firefly':
      return <Firefly />
  }
}
