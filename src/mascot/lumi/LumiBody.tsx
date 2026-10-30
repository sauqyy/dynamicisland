import type { Mouth } from './moods'

/** the body's outline, in the face's own coordinates: the eyes sit at y 14 and the middle is x 32 */
export const BODY = { x: 0, y: -17, w: 64, h: 64, r: 32 }

/**
 * Lumi's body: a dark glass circle with a slow aurora moving inside it and a gloss that sweeps across now and then.
 * Everything soft is a gradient and everything that moves is a CSS animation: nothing here is a blur over moving
 * things, which is what makes an animated SVG slow. The glow is kept low on purpose: it is a mood, not a halo.
 */
export function LumiBody({ uid, tint, glow, asleep }: { uid: string; tint: string; glow: number; asleep: boolean }) {
  const { x, y, w, h, r } = BODY
  const soft = (id: string, c: string) => (
    <radialGradient id={`${uid}${id}`}>
      <stop offset="0" stopColor={c} stopOpacity="1" />
      <stop offset="0.6" stopColor={c} stopOpacity="0.55" />
      <stop offset="1" stopColor={c} stopOpacity="0" />
    </radialGradient>
  )
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262843" />
          <stop offset="1" stopColor="#0d0e1c" />
        </linearGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.08" />
        </linearGradient>
        {soft('h', tint)}
        {soft('b', '#6f8cff')}
        {soft('t', '#3be0c3')}
        {soft('m', tint === '#ffffff' ? '#7f9bff' : tint)}
        <clipPath id={`${uid}bc`}>
          <circle cx={32} cy={15} r={32} />
        </clipPath>
      </defs>
      {/* only the faintest light behind her: the mood in her colour, not a halo */}
      <circle cx={32} cy={15} r={40} fill={`url(#${uid}h)`} style={{ opacity: asleep ? 0.03 : 0.05 + glow * 0.2, transition: 'opacity 0.5s' }} />
      <circle cx={32} cy={15} r={32} fill={`url(#${uid}g)`} />
      <g clipPath={`url(#${uid}bc)`} style={{ opacity: asleep ? 0.4 : 1, transition: 'opacity 0.5s' }}>
        {/* the aurora: soft glows along the bottom, drifting side to side */}
        <ellipse className="lm-d1" cx={32} cy={46} rx={44} ry={19} fill={`url(#${uid}b)`} style={{ opacity: 0.45 + glow * 0.3 }} />
        <ellipse className="lm-d2" cx={52} cy={46} rx={22} ry={13} fill={`url(#${uid}t)`} style={{ opacity: 0.8 }} />
        <ellipse className="lm-d3" cx={12} cy={46} rx={20} ry={13} fill={`url(#${uid}m)`} style={{ opacity: 0.8 }} />
      </g>
      <circle cx={32} cy={15} r={31.5} fill="none" stroke={`url(#${uid}r)`} strokeOpacity={0.55} />
      <path d={`M${x + 11} ${y + 14} Q${x + 22} ${y + 5} ${x + 40} ${y + 6}`} stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.16} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" />
    </g>
  )
}

const LINE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Where the mouth is, and what it can be. Each shape is its own layer and they cross-fade, so it never snaps. */
const MOUTHS: Record<Mouth, (c: string) => React.ReactNode> = {
  smile: (c) => <path d="M26 29.5 Q32 35.5 38 29.5" stroke={c} strokeWidth={2.6} {...LINE} />,
  grin: (c) => <path d="M24 28.5 Q32 41 40 28.5 Z" fill={c} stroke={c} strokeWidth={1.4} strokeLinejoin="round" />,
  talk: (c) => <path d="M26.5 28.5 Q32 38 37.5 28.5 Z" fill={c} stroke={c} strokeWidth={1.4} strokeLinejoin="round" />,
  o: (c) => <ellipse cx={32} cy={31.5} rx={3.2} ry={4} stroke={c} strokeWidth={2.3} fill="none" />,
  flat: (c) => <path d="M28 30.5 H36" stroke={c} strokeWidth={2.6} {...LINE} />,
  tiny: (c) => <path d="M29.5 30 Q32 32 34.5 30" stroke={c} strokeWidth={2} {...LINE} />,
  frown: (c) => <path d="M26 34 Q32 27.5 38 34" stroke={c} strokeWidth={2.6} {...LINE} />,
  wavy: (c) => <path d="M25 31.5 Q28.5 27 32 31.5 T39 31.5" stroke={c} strokeWidth={2.4} {...LINE} />,
  smirk: (c) => <path d="M27 31 Q33 34 38.5 27.5" stroke={c} strokeWidth={2.6} {...LINE} />,
  yawn: (c) => <ellipse cx={32} cy={33} rx={5.4} ry={7} fill={c} fillOpacity={0.92} />,
  // the resting mouth: a tiny dot, which is what keeps sharp eyes cute instead of stern
  dot: (c) => <circle cx={32} cy={31} r={2.4} fill={c} />,
  // a big grin: a solid white D, flat like the rest of her mouths
  teeth: (c) => <path d="M24 28.6 Q32 41.5 40 28.6 Z" fill={c} stroke={c} strokeWidth={1.4} strokeLinejoin="round" />,
  // laughing: the same, wider, with a flat pink tongue held inside it
  laugh: (c) => (
    <g>
      <defs>
        <clipPath id="lm-laugh-clip">
          <path d="M22.8 28.2 Q32 44.5 41.2 28.2 Z" />
        </clipPath>
      </defs>
      <path d="M22.8 28.2 Q32 44.5 41.2 28.2 Z" fill={c} stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
      <ellipse cx={32} cy={36.4} rx={5.8} ry={3.8} fill="#ff8fb8" clipPath="url(#lm-laugh-clip)" />
    </g>
  ),
  // playful: a smile, and a small tongue that hangs from it on one side
  tongue: (c) => (
    <g>
      <path d="M33.4 30.4 H38.6 V34.8 Q38.6 38.2 36 38.2 Q33.4 38.2 33.4 34.8 Z" fill="#ff8fb8" />
      <path d="M36 32.6 V35.4" stroke="#d96a97" strokeWidth={1.1} strokeLinecap="round" />
      <path d="M26 29.5 Q32 35.5 38 29.5" stroke={c} strokeWidth={2.6} {...LINE} />
    </g>
  ),
  // awkward: the line with a dot in the middle
  awkward: (c) => (
    <g stroke={c} strokeWidth={2.4} strokeLinecap="round">
      <path d="M24.5 31 H29" />
      <path d="M35 31 H39.5" />
      <circle cx={32} cy={31} r={1.3} fill={c} stroke="none" />
    </g>
  ),
  // the cat mouth: smug, sweet and a little cheeky
  w: (c) => <path d="M24.5 29.5 Q28.2 35 32 29.5 Q35.8 35 39.5 29.5" stroke={c} strokeWidth={2.3} {...LINE} />,
}

const ALL = Object.keys(MOUTHS) as Mouth[]

/**
 * The mouth and the cheeks. Only the mouth that is showing is drawn at full strength; the others sit at zero
 * opacity, so changing mouth is a CSS cross-fade and not a re-render of eleven animated layers.
 */
export function LumiMouth({ mouth, blush, color = '#fff' }: { mouth: Mouth; blush: boolean; color?: string }) {
  return (
    <g>
      <g style={{ opacity: blush ? 0.2 : 0, transition: 'opacity 0.22s' }}>
        <ellipse cx={11} cy={28} rx={4.4} ry={2.8} fill="#ff9d8a" />
        <ellipse cx={53} cy={28} rx={4.4} ry={2.8} fill="#ff9d8a" />
      </g>
      {ALL.map((m) => (
        <g key={m} style={{ opacity: m === mouth ? 1 : 0, transition: 'opacity 0.18s' }}>
          {m === 'talk' ? <g className={m === mouth ? 'lm-talk' : undefined}>{MOUTHS[m](color)}</g> : MOUTHS[m](color)}
        </g>
      ))}
    </g>
  )
}
