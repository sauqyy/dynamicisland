import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { BOX, FADE, GLIDE, REST, useIdleActs, type EyeAct } from '../MascotEyes'
import { useBlink } from '../Mascot'
import { BACK_FX, Fx } from './fx'
import { LumiBody, LumiMouth } from './LumiBody'
import { CALM_HIDES, calmLoop, useCalm } from './calm'
import { playTrack } from './lumiSfx'
import { useRoam } from './useRoam'
import type { LumiEyeShape, LumiLook } from '../../lib/settings'
import { useLumiLook } from './lumiLook'
import { IDLE_STORY_IDS, beatTimes, lookAt, storyLength, type EyeShape, type LumiMood, type LumiPose, type Mouth } from './moods'

/** Where the face is drawn: the eyes in the middle, and room around them for the effects. */
const VIEW = '-28 -18 120 64'
const VW = 120
const VH = 64
/** with a body there is more to draw, so the box is a little taller and the eyes a little smaller within it */
const BODY_VIEW = '-20 -26 124 90'
const BVW = 124
const BVH = 90
const CY = 14
/** the pair sits at x 17 and 47, so the middle is at 32 */
const MID = 32
/** how calm she is when nothing is happening: small acts every 10 to 25 seconds, a longer story about once a minute */
const IDLE_PACE = 3.2
/** how much longer (or shorter) she waits between things she does on her own, by how lively she is */
const LIVELY = { chill: 1.8, normal: 1, playful: 0.45 } as const
/** the pose with nothing asked of either eye */
const LREST: LumiPose = { ...REST, lx: 0, ly: 0, rx: 0, ry: 0, lo: 1, ro: 1, lrot: 0, rrot: 0, brot: 0, by: 0, bsy: 1 }

/** A softly rounded four-point sparkle: Lumi's eye. */
const star = (cx: number) => {
  const a = 10.5
  const b = 3.3
  return `M${cx} ${CY - a} L${cx + b} ${CY - b} L${cx + a} ${CY} L${cx + b} ${CY + b} L${cx} ${CY + a} L${cx - b} ${CY + b} L${cx - a} ${CY} L${cx - b} ${CY - b} Z`
}
const star5 = (cx: number) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 4.6 : 11.5
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return `${(cx + Math.cos(a) * r).toFixed(2)} ${(CY + Math.sin(a) * r).toFixed(2)}`
  })
  return `M${pts.join(' L')} Z`
}
/**
 * The default eye: a sliver of light with a sharp point at each end, like the glowing eyes of a small spirit. The
 * edges are almost straight (only a little curve, so it is sharp, not oval), the outer tip is longer, and a lid
 * thins it. `s` is 1 for the left eye, -1 for the right.
 */
const blade = (cx: number, s: number, lid: number) => {
  const outer = cx - s * 9
  const inner = cx + s * 7.2
  const top = CY - 4.8 + lid * 4.2
  return `M${outer} ${CY - 0.4} Q${cx - s * 1.6} ${top} ${inner} ${CY + 1.2} Q${cx + s * 0.8} ${CY + 3.4} ${outer} ${CY - 0.4} Z`
}
/** a soft, round drop of light (a choice on the Lumi page); a drowsy lid flattens the top */
const drop = (cx: number, r: number, lid: number) => {
  const top = CY - r * 1.27 + lid * r
  const bot = CY + r - lid * 0.3 * r
  return `M${cx - r} ${CY} C${cx - r} ${top} ${cx + r} ${top} ${cx + r} ${CY} C${cx + r} ${bot} ${cx - r} ${bot} ${cx - r} ${CY} Z`
}
/** the resting eye in the shape chosen on the Lumi page */
const restEye = (shape: LumiEyeShape, cx: number, s: number, lid: number) =>
  shape === 'soft' ? drop(cx, 6.6, lid) : shape === 'round' ? drop(cx, 5.2, lid) : shape === 'dot' ? drop(cx, 3.4, lid) : shape === 'star' ? star(cx) : blade(cx, s, lid)
const heart = (cx: number) => `M${cx} ${CY + 9} C${cx - 14} ${CY - 1} ${cx - 8} ${CY - 11} ${cx} ${CY - 4} C${cx + 8} ${CY - 11} ${cx + 14} ${CY - 1} ${cx} ${CY + 9} Z`
const arc = (cx: number) => `M${cx - 7.5} ${CY + 3} L${cx} ${CY - 4.5} L${cx + 7.5} ${CY + 3}`

/** the other eyes, drawn at (cx, 14); `side` mirrors the ones that slant */
function shapeEl(shape: EyeShape, cx: number, side: 'l' | 'r', fill: string): ReactNode {
  const line = { stroke: fill, strokeWidth: 3.6, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const
  switch (shape) {
    case 'check':
      return <path d={`M${cx - 8} ${CY + 1} L${cx - 2.5} ${CY + 6.5} L${cx + 8} ${CY - 6}`} {...line} />
    case 'dash':
      return <path d={`M${cx - 7} ${CY} H${cx + 7}`} {...line} />
    case 'x':
      return <path d={`M${cx - 6} ${CY - 6} L${cx + 6} ${CY + 6} M${cx + 6} ${CY - 6} L${cx - 6} ${CY + 6}`} {...line} />
    case 'round':
      return (
        <g>
          <circle cx={cx} cy={CY} r={8.5} fill="#fff" />
          <circle cx={cx} cy={CY} r={4.2} fill="#14141c" />
        </g>
      )
    case 'sad': {
      const s = side === 'l' ? 1 : -1
      return <path d={`M${cx - 7 * s} ${CY - 3} Q${cx} ${CY - 1} ${cx + 7 * s} ${CY + 6}`} {...line} />
    }
    case 'sleepy':
      // a peaceful, drooping curve: eyes shut and relaxed, as opposed to a happy squint
      return <path d={`M${cx - 7.5} ${CY - 2} L${cx} ${CY + 2.2} L${cx + 7.5} ${CY - 2}`} {...line} strokeLinecap="butt" strokeLinejoin="miter" />
    case 'star4':
      return <path d={star(cx)} fill={fill} stroke={fill} strokeWidth={1.8} strokeLinejoin="round" />
    case 'star5':
      return <path d={star5(cx)} fill={fill} stroke={fill} strokeWidth={1.6} strokeLinejoin="round" />
  }
}

/**
 * The cursor, as a nudge of the eyes: a few pixels towards it, so it looks at you. Also notices a long stay.
 * It looks at most once a frame and only answers when the eyes would move by a visible amount, so a mouse
 * moving across the screen does not make her redraw for every pixel of it.
 */
function usePointerLook(ref: React.RefObject<SVGSVGElement | null>, enabled: boolean, glance: boolean) {
  const [look, setLook] = useState({ x: 0, y: 0 })
  const [love, setLove] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let stay = 0
    let drift = 0
    let lovedUntil = 0
    let wasNear = false
    let raf = 0
    let last: PointerEvent | null = null
    let at = { x: 0, y: 0 }
    const apply = () => {
      raf = 0
      const e = last
      const r = ref.current?.getBoundingClientRect()
      if (!e || !r) return
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const reach = Math.max(120, r.width * 3)
      const nx = Math.round(Math.max(-1, Math.min(1, dx / reach)) * 4.5 * 2) / 2
      const ny = Math.round(Math.max(-1, Math.min(1, dy / (reach * 0.6))) * 2.5 * 2) / 2
      if (nx !== at.x || ny !== at.y) {
        at = { x: nx, y: ny }
        setLook(at)
      }
      // she glances at the cursor when it moves, then goes back to her own business: a fixed stare on a
      // still cursor felt like being watched
      window.clearTimeout(drift)
      if (glance)
        drift = window.setTimeout(() => {
        at = { x: 0, y: 0 }
        setLook(at)
      }, 1600)
      const near = Math.abs(dx) < r.width * 0.75 && Math.abs(dy) < r.height * 1.6
      if (near && !wasNear) {
        window.clearTimeout(stay)
        // a long stay on her turns into a soft moment, once per visit
        stay = window.setTimeout(() => {
          if (Date.now() < lovedUntil) return
          lovedUntil = Date.now() + 2600
          setLove(true)
          window.setTimeout(() => setLove(false), 2400)
        }, 3800)
      }
      if (!near) window.clearTimeout(stay)
      wasNear = near
    }
    const onMove = (e: PointerEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      window.clearTimeout(stay)
      wasNear = false
      at = { x: 0, y: 0 }
      setLook(at)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.clearTimeout(stay)
      window.clearTimeout(drift)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref, enabled, glance])
  return { look, love }
}

interface Props {
  mood?: LumiMood
  /** height in px; the face is about 1.9 times as wide */
  height?: number
  /** play one specific idle act on a loop, for the demo page */
  force?: EyeAct
  /** bump to play the mood again from the start */
  replay?: number
  /** while resting, the eyes follow the cursor */
  follow?: boolean
  /** no wandering about when resting: used where the face is only a picture */
  still?: boolean
  /** where the eyes are held while resting (e.g. on the text being typed), in place of the cursor */
  gaze?: { x: number; y: number }
  /** how far she wanders about her space on her own, in px (0: she stays where she is) */
  roam?: number
  /** play her sounds with this moment (cards and the hello; the resting pill is silent) */
  sound?: boolean
  /** give her the body and the mouth (cards, the first hello); without it she is just the eyes, as in the resting pill */
  body?: boolean
  /** how her eyes look (the Lumi page); the position only moves her when she is just the eyes */
  look?: LumiLook
}

/**
 * Lumi: two sparkle eyes and nothing else. Resting, they blink, glance around, follow the cursor and every
 * few seconds do something small. Any other mood redraws them (check marks, stars, hearts, crosses) and
 * plays its own graphics around them: confetti, an alarm, a coffee, the moon.
 */
function LumiFaceBase({ mood: moodProp = 'idle', height = 28, force, replay = 0, follow = true, still = false, gaze, body = false, sound = false, roam = 0, look: ownLook }: Props) {
  const uid = useId().replace(/:/g, '')
  const shared = useLumiLook()
  const look = ownLook ?? shared
  const gentle = useCalm()
  const born = useRef(true)
  useEffect(() => {
    born.current = false
  }, [])
  const ref = useRef<SVGSVGElement>(null)
  const resting = moodProp === 'idle'
  // while resting she also tells herself a story now and then (a hop-dance, a sneeze, a bubble to pop...);
  // `bit` is the one being told, and the small acts and the cursor wait until it is over
  const [bit, setBit] = useState<LumiMood | null>(null)
  // she moves about on her own; a face that is in the middle of telling a moment waits for it to settle first
  const { style: roamStyle } = useRoam({ roam: look.wander ? roam : 0, gentle, settle: resting ? 0 : 2600 })
  const mood = resting && bit ? bit : moodProp
  const calm = resting && !bit
  const lastBit = useRef<LumiMood | null>(null)
  useEffect(() => {
    if (!resting || still || force) return
    let t = 0
    const plan = (first: boolean) => {
      t = window.setTimeout(
        () => {
          const pool = IDLE_STORY_IDS.filter((i) => i !== lastBit.current)
          const id = pool[Math.floor(Math.random() * pool.length)]
          lastBit.current = id
          setBit(id)
          t = window.setTimeout(() => {
            setBit(null)
            plan(false)
          }, storyLength(id))
        },
        (first ? 16_000 + Math.random() * 10_000 : 32_000 + Math.random() * 30_000) * LIVELY[look.lively],
      )
    }
    plan(true)
    return () => {
      window.clearTimeout(t)
      setBit(null)
    }
  }, [resting, still, force, look.lively])
  // a mood is a short story: beat by beat, the face changes to what that beat says
  const [applied, setApplied] = useState(() => beatTimes(mood).filter((t) => t <= 0).length)
  useLayoutEffect(() => {
    const times = beatTimes(mood)
    setApplied(times.filter((t) => t <= 0).length)
    const ids = times.map((t, i) => (t > 0 ? window.setTimeout(() => setApplied(i + 1), t) : 0))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [mood, replay])
  const raw = lookAt(mood, applied)
  // calm mode: nothing loud, bright or sudden, and nothing that shakes
  const def = gentle ? { ...raw, fx: raw.fx.filter((id) => !CALM_HIDES.includes(id)), loop: calmLoop(raw.loop) } : raw
  useEffect(() => {
    if (!sound) return
    return playTrack(mood)
  }, [sound, mood, replay])
  const { pose: idlePose, fx: idleFx } = useIdleActs(force, resting && !still, Boolean(bit), IDLE_PACE * LIVELY[look.lively])
  const { look: pointer, love } = usePointerLook(ref, calm && follow && !gaze && look.follow !== 'off', look.follow === 'glance')
  const blink = useBlink(mood !== 'sleep' && !def.shape)

  const loving = calm && love
  const base: LumiPose = calm ? { ...LREST, ...idlePose, ...(loving ? { heartL: 1, heartR: 1, scale: 1.12 } : null), x: idlePose.x + (gaze ? gaze.x : pointer.x), y: idlePose.y + (gaze ? gaze.y : pointer.y) } : { ...LREST, ...def.pose }
  const spring = base.jump ? { duration: 0 } : GLIDE
  const tint = loving ? '#ff8fb8' : def.tint
  const paint = def.paint ? def.tint : look.color
  const glow = (loving ? 0.7 : (def.glow ?? 0.2)) * 0.5 * look.glow

  const eye = (cx: number, side: 'l' | 'r') => {
    const closed = side === 'l' ? base.closedL : base.closedR
    const hearts = side === 'l' ? base.heartL : base.heartR
    const dx = side === 'l' ? -base.apart - look.gap : base.apart + look.gap
    const other = def.shape ? 1 : 0
    const blinkY = blink && closed < 0.5 && hearts < 0.5 && !other ? 0.22 : 1
    // each eye can also go its own way: hop, tilt, fly off, vanish and come back
    const ox = side === 'l' ? base.lx : base.rx
    const oy = side === 'l' ? base.ly : base.ry
    const op = side === 'l' ? base.lo : base.ro
    const tilt = base.rot + (side === 'l' ? base.lrot : base.rrot)
    // the right eye follows the left a few frames late, so the pair moves like a face and not like a stamp
    const sp = side === 'r' && !base.jump ? { ...spring, delay: 0.05 } : spring
    return (
      <motion.g
        key={side}
        animate={{ x: dx + ox, y: oy, opacity: op, scale: base.scale * look.size, scaleX: base.sx, scaleY: base.sy * blinkY, rotate: tilt }}
        transition={{ x: sp, y: sp, scale: sp, scaleX: sp, rotate: sp, opacity: { duration: 0.1 }, scaleY: { duration: base.jump ? 0 : blinkY < 1 || base.sy === 1 ? 0.09 : 0.4, ease: 'easeOut' } }}
        style={BOX}
      >
        <motion.g animate={{ opacity: 1 - Math.max(closed, hearts, other) }} transition={FADE}>
          {/* the slow twinkle never stops, so there is always a little life in them */}
          <g className="lm-tw" style={{ animationDelay: side === 'l' ? '0s' : '0.5s' }}>
            {/* her resting eye, in the shape and tilt chosen on the Lumi page (by default a small angular shard, inner
                end lower). The brows change the slant (worried: flatter, determined: steeper) and a drowsy lid thins it */}
            <motion.g initial={false} animate={{ rotate: (side === 'l' ? 1 : -1) * Math.max(-32, Math.min(40, look.tilt - (def.brow ?? 0) * 2.1)) }} transition={{ duration: 0.3, ease: 'easeOut' }} style={{ transformOrigin: `${cx}px ${CY}px` }}>
              <motion.path
                initial={false}
                animate={{ d: restEye(look.shape, cx, side === 'l' ? 1 : -1, def.lid ?? 0) }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                fill={paint}
                stroke={paint}
                strokeWidth={0.5}
                strokeLinejoin={look.shape === 'spirit' ? 'miter' : 'round'}
              />
            </motion.g>
          </g>
        </motion.g>
        <motion.path d={arc(cx)} stroke={paint} strokeWidth="3.4" strokeLinecap="butt" strokeLinejoin="miter" fill="none" initial={false} animate={{ opacity: closed * (1 - hearts) * (1 - other) }} transition={FADE} />
        <motion.path d={heart(cx)} fill="#ff6fa8" initial={false} animate={{ opacity: hearts, scale: 0.55 + 0.45 * hearts }} transition={{ ...FADE, scale: spring }} style={BOX} />
        {def.shape && (
          <motion.g key={def.shape} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 15 }} style={BOX}>
            {shapeEl(def.shape, cx, side, paint)}
          </motion.g>
        )}
      </motion.g>
    )
  }

  const loop = def.loop
  const bodyLoop = loop ? { y: loop.y?.map((v) => v * 0.5), rotate: loop.rot?.map((v) => v * 0.5), scale: loop.scale } : undefined
  // her mouth follows her eyes unless the mood says otherwise
  const mouthNow: Mouth =
    def.mouth ??
    (def.shape === 'sad'
      ? 'frown'
      : def.shape === 'x'
        ? 'wavy'
        : def.shape === 'round'
          ? 'o'
          : def.shape === 'sleepy' || (def.lid ?? 0) > 0.2
            ? 'flat'
            : def.shape === 'check' || def.shape === 'star5' || base.heartL > 0.5 || (base.closedL > 0.5 && base.closedR > 0.5)
              ? 'grin'
              : base.scale >= 1.2
                ? 'o'
                : 'dot')
  const blush = def.shape !== 'sad' && def.shape !== 'x' && def.shape !== 'sleepy' && mood !== 'sleep' && (def.lid ?? 0) < 0.3
  const loopAnim = loop ? { x: loop.x, y: loop.y, rotate: loop.rot, scale: loop.scale } : undefined

  const svg = (
    <svg ref={ref} viewBox={body ? BODY_VIEW : VIEW} height={height} width={body ? (height * BVW) / BVH : (height * VW) / VH} aria-hidden style={{ display: 'block', overflow: 'visible', transform: body ? undefined : `translate(${look.x}px, ${look.y}px)` }}>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <rect x="-6" y="-4" width="76" height="36" rx="14" />
        </clipPath>
        <radialGradient id={`${uid}b`}>
          <stop offset="0" stopColor={tint} stopOpacity="1" />
          <stop offset="0.55" stopColor={tint} stopOpacity="0.45" />
          <stop offset="1" stopColor={tint} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* the light behind the eyes, in the mood's colour */}
      {!body && <ellipse className="lm-pulse" cx={MID} cy={CY} rx={44} ry={19} fill={`url(#${uid}b)`} style={{ opacity: glow * 1.6, transition: 'opacity 0.4s' }} />}
      {/* it pops in whenever the mood changes */}
      <motion.g key={`${mood}${replay}`} initial={{ scale: 0.82, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 12 }} style={BOX}>
        {/* explosions go off behind her */}
        {def.fx.filter((id) => BACK_FX.includes(id)).map((id) => (
          <Fx key={id} id={id} c={tint} uid={uid} />
        ))}
        {/* her posture: she sinks, sits tall and leans, all of her together */}
        <motion.g animate={{ rotate: base.brot, y: base.by, scaleY: base.bsy, scaleX: 1 / Math.sqrt(base.bsy) }} transition={spring} style={BOX}>
        {body && (
          // the body follows her at a distance: it squashes and leans a little with the eyes, and bounces with them.
          // The first time she appears it forms around the eyes, so the eyes in the pill and the face on the card are one
          // character: she is the eyes, and the body is what grows from them
          <motion.g initial={born.current ? { scale: 0.5, opacity: 0 } : false} animate={{ opacity: 1, scale: base.lo < 0.5 || base.ro < 0.5 ? 1 : base.scale < 1 ? 0.3 + 0.7 * base.scale : 1 + (base.scale - 1) * 0.25, scaleX: 1 + (base.sx - 1) * 0.3, scaleY: 1 + (base.sy - 1) * 0.3, y: base.y * 0.35, rotate: base.rot * 0.4 }} transition={spring} style={BOX}>
            <motion.g animate={bodyLoop} transition={loop ? { duration: loop.dur, repeat: Infinity, ease: 'easeInOut' } : undefined} style={BOX}>
              <LumiBody uid={uid} tint={tint} glow={glow * 2} asleep={mood === 'sleep'} color={look.body} />
            </motion.g>
          </motion.g>
        )}
        <motion.g animate={{ x: base.x, y: base.y }} transition={spring}>
          <motion.g animate={loopAnim} transition={loop ? { duration: loop.dur, repeat: Infinity, ease: 'easeInOut' } : undefined} style={BOX}>
            {body && <LumiMouth mouth={mouthNow} blush={blush} />}
            {eye(17, 'l')}
            {eye(47, 'r')}
          </motion.g>
        </motion.g>
        </motion.g>
        {def.fx.filter((id) => !BACK_FX.includes(id)).map((id) => (
          <Fx key={id} id={id} c={tint} uid={uid} />
        ))}
        {/* her own small bursts while resting */}
        {calm && idleFx.sparks > 0 &&
          [
            { x: -3, y: 0 },
            { x: 67, y: 1 },
            { x: 32, y: -5 },
            { x: 62, y: 30 },
            { x: 2, y: 29 },
          ].map((p, i) => (
            <motion.circle key={`${idleFx.sparks}-${i}`} cx={p.x} cy={p.y} r="1.8" fill="#fff" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0] }} transition={{ duration: 1, delay: i * 0.14 }} style={BOX} />
          ))}
        {calm && idleFx.z > 0 && (
          <motion.text key={idleFx.z} x="56" y="10" fontSize="12" fontWeight="800" fill="#fff" initial={{ opacity: 0, y: 14 }} animate={{ opacity: [0, 0.9, 0], y: [14, 4, -4] }} transition={{ duration: 2.4, ease: 'easeOut' }}>
            z
          </motion.text>
        )}
      </motion.g>
    </svg>
  )
  if (roam <= 0 || !look.wander) return svg
  return (
    <motion.div style={{ display: 'inline-block', transformOrigin: '50% 85%', ...roamStyle }}>
      {svg}
    </motion.div>
  )
}

export const LumiFace = memo(LumiFaceBase)
