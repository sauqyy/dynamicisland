import { useId } from 'react'

type Kind = 'orb' | 'drop' | 'bulb' | 'bean' | 'jacket' | 'puff' | 'pill'

const YELLOW = '#ffd34e'

/** The face every study shares: two short upturned line eyes, cheeks and a small smile. */
function Face({ y = 68, cx = 70 }: { y?: number; cx?: number }) {
  const dx = 21
  return (
    <g>
      {[1, -1].map((k) => {
        const ex = cx - k * dx
        return <path key={k} d={`M${ex - k * 16} ${y - 0.6} Q${ex - k * 2.5} ${y - 8.6} ${ex + k * 13} ${y + 1.8} Q${ex + k * 1.2} ${y + 6.2} ${ex - k * 16} ${y - 0.6} Z`} transform={`rotate(${k * 15} ${ex} ${y})`} fill="#fff" stroke="#fff" strokeWidth={0.8} strokeLinejoin="miter" />
      })}
      <ellipse cx={cx - 32} cy={y + 17} rx={6} ry={3.6} fill="#8ab4ff" opacity={0.32} />
      <ellipse cx={cx + 32} cy={y + 17} rx={6} ry={3.6} fill="#8ab4ff" opacity={0.32} />
      <circle cx={cx} cy={y + 17} r={3.2} fill="#fff" />
    </g>
  )
}

/** One candidate silhouette. `mono` draws only the outline as a solid shape, which is how a mascot is judged at 16px. */
export function Silhouette({ kind, size = 112, mono = false }: { kind: Kind; size?: number; mono?: boolean }) {
  const id = useId().replace(/:/g, '')
  const fill = mono ? '#fff' : `url(#${id}g)`
  const rim = mono ? 'none' : 'rgba(255,255,255,0.28)'
  const hand = mono ? '#fff' : '#e8edff'
  const eyesAt = kind === 'drop' ? 88 : kind === 'bulb' ? 62 : kind === 'pill' ? 72 : kind === 'bean' ? 76 : 68
  let body: React.ReactNode
  switch (kind) {
    case 'orb':
      body = <circle cx={70} cy={72} r={46} fill={fill} stroke={rim} strokeWidth={2} />
      break
    case 'drop':
      body = <path d="M70 12 C 70 12 114 58 114 90 A44 44 0 0 1 26 90 C 26 58 70 12 70 12 Z" fill={fill} stroke={rim} strokeWidth={2} />
      break
    case 'bulb':
      body = (
        <g fill={fill} stroke={rim} strokeWidth={2}>
          <circle cx={70} cy={62} r={44} />
          <path d="M50 96 Q52 112 56 118 H84 Q88 112 90 96 Z" />
          <rect x={55} y={118} width={30} height={11} rx={4} />
          <rect x={60} y={129} width={20} height={7} rx={3.5} />
        </g>
      )
      break
    case 'bean':
      body = (
        <g>
          <rect x={24} y={30} width={92} height={90} rx={42} fill={fill} stroke={rim} strokeWidth={2} />
          <circle cx={14} cy={88} r={11} fill={hand} />
          <circle cx={126} cy={88} r={11} fill={hand} />
        </g>
      )
      break
    case 'jacket':
      body = (
        <g>
          <circle cx={70} cy={64} r={44} fill={fill} stroke={rim} strokeWidth={2} />
          <path d="M32 96 L70 134 L50 98 Z" fill={YELLOW} />
          <path d="M108 96 L70 134 L90 98 Z" fill={YELLOW} />
          <path d="M44 92 Q70 118 96 92 L96 100 Q70 126 44 100 Z" fill={YELLOW} />
          <circle cx={70} cy={124} r={3.4} fill="#15172b" />
        </g>
      )
      break
    case 'puff':
      body = (
        <g fill={fill} stroke={rim} strokeWidth={2}>
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2
            return <circle key={i} cx={70 + Math.cos(a) * 34} cy={72 + Math.sin(a) * 34} r={20} />
          })}
          <circle cx={70} cy={72} r={38} stroke="none" />
        </g>
      )
      break
    case 'pill':
      body = (
        <g>
          <rect x={14} y={38} width={112} height={68} rx={34} fill={fill} stroke={rim} strokeWidth={2} />
          <circle cx={9} cy={96} r={9.5} fill={hand} />
          <circle cx={131} cy={96} r={9.5} fill={hand} />
        </g>
      )
      break
  }
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2d4d" />
          <stop offset="1" stopColor="#0e0f1f" />
        </linearGradient>
      </defs>
      {body}
      {!mono && <Face y={eyesAt} />}
    </svg>
  )
}

export const STUDIES: { kind: Kind; name: string; note: string; pick?: string }[] = [
  { kind: 'orb', name: 'Orb', note: 'What she is today. Friendly and simple, but it is the most generic shape there is, and it is a close cousin of Astra.' },
  { kind: 'pill', name: 'Pill with hands', pick: 'My pick', note: 'Her body is the island itself. The resting pill and the card are literally the same character, which settles the "two characters" worry. The round hands give the silhouette its ears at 16px.' },
  { kind: 'jacket', name: 'Almamater', pick: 'Runner-up', note: 'An orb in the yellow jacket: a one-glance tie to Universitas Indonesia, and the notch at the bottom survives at tiny sizes. Less tied to the island.' },
  { kind: 'bean', name: 'Bean with hands', note: 'Soft and huggable. The hands sit outside the body, so the silhouette is distinct, but it reads as a toy more than a tool.' },
  { kind: 'drop', name: 'Drop of light', note: 'A droplet pointing up: "lumi", light. Very ownable shape; hard to fit eyes and a mouth into at the bottom, and the point can read as a map pin.' },
  { kind: 'bulb', name: 'Bulb', note: 'Idea, light, students. Clear at any size, but it is the most common icon in productivity apps and the base makes her look like a lamp.' },
  { kind: 'puff', name: 'Puff', note: 'A scalloped cloud-orb. Warm and unusual, but the scallops turn to noise below 24px.' },
]
