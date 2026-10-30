import { memo } from 'react'
import { motion } from 'motion/react'
import { LumiFace } from './LumiFace'
import type { LumiMood } from './moods'

/** the card is the meme: a fireball behind her, "time to lock in." over it, and her gulping, low and to the right */
export const LOCKIN_SHAPE = { w: 420, h: 156, r: 30 }

/** the cloud: flat lobes in three oranges and a yellow core, drawn the way the rest of her world is drawn */
const LOBES = [
  { x: 92, y: 62, r: 30, c: '#ff7a45', d: 0 },
  { x: 140, y: 40, r: 38, c: '#ff8f45', d: 0.5 },
  { x: 198, y: 30, r: 44, c: '#ffa94d', d: 1 },
  { x: 256, y: 40, r: 38, c: '#ff8f45', d: 0.3 },
  { x: 304, y: 62, r: 30, c: '#ff7a45', d: 0.8 },
  { x: 150, y: 72, r: 30, c: '#ffc15e', d: 0.6 },
  { x: 246, y: 72, r: 30, c: '#ffc15e', d: 0.2 },
  { x: 198, y: 58, r: 40, c: '#ffe08a', d: 1.2 },
]

const EMBERS = Array.from({ length: 9 }, (_, i) => ({ x: 70 + ((i * 71) % 290), d: (i % 5) * 0.7 }))

function Explosion() {
  return (
    <svg className="lk-bg" viewBox="0 0 420 156" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="lk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15172b" />
          <stop offset="1" stopColor="#3a2250" />
        </linearGradient>
      </defs>
      <rect width="420" height="156" fill="url(#lk-sky)" />
      {/* the flash on the horizon */}
      <rect y={92} width="420" height="22" fill="#ff7a45" opacity={0.28} />

      {/* the cloud rises from the horizon once, then keeps rolling over on itself (in CSS: nothing to redraw) */}
      <motion.g initial={{ scale: 0.15, y: 70, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} style={{ transformBox: 'view-box', transformOrigin: '198px 110px' }}>
        <path d="M172 112 Q182 90 178 70 L220 70 Q216 90 226 112 Z" fill="#ff8f45" />
        {LOBES.map((l, i) => (
          <circle key={i} className="lk-lobe" cx={l.x} cy={l.y} r={l.r} fill={l.c} style={{ animationDelay: `${l.d}s` }} />
        ))}
      </motion.g>

      {/* the ground, flat, with a few lines in it */}
      <rect y={110} width="420" height="46" fill="#1d1f3b" />
      {[121, 132, 144].map((y) => (
        <path key={y} d={`M0 ${y} H420`} stroke="#fff" strokeOpacity={0.06} strokeWidth={1.2} />
      ))}

      {/* the blast wave rolls out along the ground, and embers rise */}
      {[0, 1.3].map((d) => (
        <ellipse key={d} className="lk-ring" cx={198} cy={112} rx={40} ry={5} fill="none" stroke="#ffd9a0" strokeWidth={2} style={{ animationDelay: `${0.3 + d}s` }} />
      ))}
      {EMBERS.map((e, i) => (
        <circle key={i} className="lk-ember" cx={e.x} cy={114} r={1.6} fill="#ffe08a" style={{ animationDelay: `${e.d}s` }} />
      ))}
    </svg>
  )
}

/**
 * "time to lock in.": the whole card, for the deadline reminders at three hours and one. The explosion goes off,
 * the words slam in, and Lumi, low and to the right of the middle, gulps. The real reminder is the caption.
 */
function LumiLockInBase({ mood, title, sub, ms }: { mood: LumiMood; title: string; sub?: string; ms?: number }) {
  return (
    <motion.div className="lk-card" animate={{ x: [0, -4, 4, -3, 3, -1, 0] }} transition={{ duration: 0.5, delay: 0.35 }}>
      <Explosion />
      <motion.div className="lk-title" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.55 }}>
        time to lock in.
      </motion.div>
      <div className="lk-lumi">
        <LumiFace mood={mood} height={101} body still sound roam={6} />
      </div>
      <div className="lk-cap">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {ms !== undefined && <i className="lc-life lk-life" style={{ animationDuration: `${ms}ms` }} />}
    </motion.div>
  )
}

export const LumiLockIn = memo(LumiLockInBase)
