import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform } from 'motion/react'

/** Flat top (the island hangs from the screen edge), rounded bottom; docked on the taskbar, the other way up. */
function radii(r: number, floating = false, docked = false) {
  return {
    borderTopLeftRadius: floating || docked ? r : 0,
    borderTopRightRadius: floating || docked ? r : 0,
    borderBottomLeftRadius: docked ? 0 : r,
    borderBottomRightRadius: docked ? 0 : r,
  }
}

export interface Shape {
  w: number
  h: number
  r: number
}

interface Props {
  shape: Shape
  /** changes whenever the content should cross-fade */
  contentKey: string
  children: ReactNode
  /** timer bubble that splits off to the right of the pill */
  bubble: { split: boolean; content: ReactNode } | null
  onClick: (e: React.MouseEvent) => void
  onHover: (hovering: boolean) => void
  spring: { stiffness: number; damping: number; mass: number }
  /** bump to replay the drop-in entrance (used by the browser demo) */
  intro?: number
  /** moved away from the screen edge: drawn as a free-floating rounded pill */
  floating?: boolean
  /** pointer handlers used to drag the island around */
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>
  /** how far the island has been dragged from the top centre (the window itself never moves) */
  offset?: { x: number; y: number }
  /** fullscreen: the offset eases away so the island grows from where it was to fill the screen */
  centered?: boolean
  /** someone is calling: the pill glows until it is answered */
  ringing?: boolean
  /**
   * docked on the taskbar: `line` is the top of the taskbar in px from the top of the window, and
   * the island rests its lower edge there and grows upwards; `scale` is the island's size setting
   */
  dock?: { line: number; scale: number } | null
}

const BUBBLE = 34
const TOP = 0
/** The shape extends this far above the screen edge so its top corners never show. */
const HIDDEN_TOP = 40
/** Radius of the concave "ears" where the sides curve out into the screen edge. */
const EAR = 14
/** Must match .stage width in App.css. */
const STAGE_W = 520
/** How far above its resting place the island starts when the app opens. */
const ENTER_FROM = 220

/**
 * The island outline as a crisp SVG path: concave ears at the top, straight sides,
 * rounded bottom corners. Drawn without the goo filter so the curves stay smooth.
 */
function notchPath(w: number, h: number, r: number, floating: boolean, docked = false) {
  const x0 = STAGE_W / 2 - w / 2
  const x1 = STAGE_W / 2 + w / 2
  const rr = Math.max(0, Math.min(r, h / 2, w / 2))
  if (docked) {
    // the notch upside down, rising out of the taskbar: ears along the bottom edge, rounded top
    const e = Math.min(EAR, Math.max(0, h - rr))
    return [
      `M ${x0 - e} ${h}`,
      `A ${e} ${e} 0 0 0 ${x0} ${h - e}`,
      `L ${x0} ${rr}`,
      `A ${rr} ${rr} 0 0 1 ${x0 + rr} 0`,
      `L ${x1 - rr} 0`,
      `A ${rr} ${rr} 0 0 1 ${x1} ${rr}`,
      `L ${x1} ${h - e}`,
      `A ${e} ${e} 0 0 0 ${x1 + e} ${h}`,
      'Z',
    ].join(' ')
  }
  if (floating) {
    return [
      `M ${x0 + rr} 0`,
      `L ${x1 - rr} 0`,
      `A ${rr} ${rr} 0 0 1 ${x1} ${rr}`,
      `L ${x1} ${h - rr}`,
      `A ${rr} ${rr} 0 0 1 ${x1 - rr} ${h}`,
      `L ${x0 + rr} ${h}`,
      `A ${rr} ${rr} 0 0 1 ${x0} ${h - rr}`,
      `L ${x0} ${rr}`,
      `A ${rr} ${rr} 0 0 1 ${x0 + rr} 0`,
      'Z',
    ].join(' ')
  }
  const e = Math.min(EAR, Math.max(0, h - rr))
  const t = -HIDDEN_TOP
  return [
    `M ${x0 - e} ${t}`,
    `L ${x0 - e} 0`,
    `A ${e} ${e} 0 0 1 ${x0} ${e}`,
    `L ${x0} ${h - rr}`,
    `A ${rr} ${rr} 0 0 0 ${x0 + rr} ${h}`,
    `L ${x1 - rr} ${h}`,
    `A ${rr} ${rr} 0 0 0 ${x1} ${h - rr}`,
    `L ${x1} ${e}`,
    `A ${e} ${e} 0 0 1 ${x1 + e} 0`,
    `L ${x1 + e} ${t}`,
    'Z',
  ].join(' ')
}

/**
 * Three layers: the goo layer holds plain black blobs run through the SVG goo filter
 * (so the pill and the timer bubble melt into each other), the outline layer redraws the
 * pill crisply on top with proper curves, and the content layer sits above, unfiltered,
 * so text stays sharp.
 */
export function Island({ shape, contentKey, children, bubble, onClick, onHover, spring, floating = false, dragHandlers, intro = 0, offset = { x: 0, y: 0 }, centered = false, ringing = false, dock = null }: Props) {
  const SPRING = { type: 'spring', ...spring } as const
  const bubbleX = bubble?.split ? shape.w / 2 + BUBBLE / 2 + 4 : 0

  const w = useSpring(shape.w, spring)
  const h = useSpring(shape.h, spring)
  const r = useSpring(shape.r, spring)
  useEffect(() => {
    w.set(shape.w)
    h.set(shape.h)
    r.set(shape.r)
  }, [shape.w, shape.h, shape.r, w, h, r])
  const docked = Boolean(dock)
  // 0 hanging from the top edge, 1 floating free, 2 resting on the taskbar
  const fl = useMotionValue(docked ? 2 : floating ? 1 : 0)
  useEffect(() => fl.set(docked ? 2 : floating ? 1 : 0), [floating, docked, fl])
  const d = useTransform([w, h, r, fl], ([wv, hv, rv, fv]: number[]) => notchPath(wv, hv, rv, fv === 1, fv === 2))

  // when the app opens the island drops in from above the screen, using the Animation setting's spring
  // (`translate` is its own CSS property, so it composes with the stage's centring/scale transform)
  // (docked on the taskbar it rises from below instead)
  const enterY = useMotionValue(-ENTER_FROM)
  const springRef = useRef(spring)
  springRef.current = spring
  const dockedRef = useRef(docked)
  dockedRef.current = docked
  useEffect(() => {
    enterY.jump(dockedRef.current ? ENTER_FROM : -ENTER_FROM)
    const c = animate(enterY, 0, { type: 'spring', ...springRef.current })
    return () => c.stop()
  }, [enterY, intro])
  // the drag offset follows the pointer directly; going fullscreen eases it to zero on the Animation spring
  const offX = useMotionValue(offset.x)
  const offY = useMotionValue(offset.y)
  useLayoutEffect(() => {
    offX.set(offset.x)
    offY.set(offset.y)
  }, [offset.x, offset.y, offX, offY])
  const away = useSpring(centered ? 1 : 0, spring)
  useEffect(() => away.set(centered ? 1 : 0), [centered, away])
  // docked, the island's top follows its height so the lower edge stays on the taskbar as it grows
  const line = useMotionValue(dock ? dock.line : -1)
  const dockScale = useMotionValue(dock?.scale ?? 1)
  useLayoutEffect(() => {
    line.set(dock ? dock.line : -1)
    dockScale.set(dock?.scale ?? 1)
  }, [dock, line, dockScale])
  // whole pixels only: the glass filters redraw jagged on fractional offsets while the island is moving
  const enterT = useTransform(
    [enterY, offX, offY, away, h, line, dockScale],
    ([ey, ox, oy, aw, hv, ln, sc]: number[]) => {
      const y = ln >= 0 ? ln - hv * sc : oy
      return `${Math.round(ox * (1 - aw))}px ${Math.round(ey + y * (1 - aw))}px`
    },
  )

  return (
    <motion.div className={`stage ${ringing ? 'ringing' : ''}`} style={{ translate: enterT }}>
      <div className="goo-layer">
        {/* Only needed to melt the timer bubble into the pill. Inset a little so the crisp
            outline above is the only thing that defines the visible edge. */}
        {bubble && (
          <>
            <motion.div
              className="blob"
              initial={false}
              style={{ marginTop: floating || docked ? 0 : -HIDDEN_TOP }}
              animate={{
                width: shape.w - 4,
                height: shape.h - 2 + (floating || docked ? 0 : HIDDEN_TOP),
                ...radii(Math.max(0, shape.r - 2), floating, docked),
              }}
              transition={SPRING}
            />
            <motion.div
              className="blob bubble"
              initial={false}
              animate={{ x: bubbleX, scale: bubble.split ? 1 : 0.4 }}
              transition={SPRING}
            />
          </>
        )}
      </div>

      <svg className="outline-layer" aria-hidden>
        <defs>
          <linearGradient id="glass-tint" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--glass-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--glass-b)' }} />
          </linearGradient>
          <linearGradient id="glass-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.4" />
          </linearGradient>
          <filter id="glass-soft" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <clipPath id="glass-clip">
            <motion.path d={d} />
          </clipPath>
          <linearGradient id="glass-sheen" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <motion.path d={d} style={{ fill: 'var(--island-bg)' }} />
        <motion.path className="glass-tint" d={d} fill="url(#glass-tint)" />
        <motion.path className="glass-sheen" d={d} fill="url(#glass-sheen)" />
        <g className="glass-fx" clipPath="url(#glass-clip)">
          {/* light caught along the inside of the edge, like the thick rim of a lens */}
          <motion.path d={d} fill="none" stroke="#fff" strokeWidth="12" strokeOpacity="0.34" filter="url(#glass-soft)" />
        </g>
        <motion.path className="glass-fx glass-rim" d={d} fill="none" stroke="url(#glass-rim)" strokeWidth="1.5" />
        {/* a hairline edge in every theme, so the island reads the same on light and dark wallpapers */}
        <motion.path className="island-rim" d={d} fill="none" strokeWidth="1" />
      </svg>

      <div className="content-layer">
        <motion.div
          className="content-clip"
          initial={false}
          animate={{ width: shape.w, height: shape.h, ...radii(shape.r, floating, docked) }}
          transition={SPRING}
          onClick={onClick}
          onHoverStart={() => onHover(true)}
          onHoverEnd={() => onHover(false)}
          {...(dragHandlers as object)}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={contentKey}
              className="content"
              initial={{ opacity: 0, filter: 'blur(6px)', scale: 0.96 }}
              animate={{
                opacity: 1,
                filter: 'blur(0px)',
                scale: 1,
                transition: { delay: 0.1, duration: 0.22 },
              }}
              exit={{ opacity: 0, filter: 'blur(6px)', pointerEvents: 'none', zIndex: 0, transition: { duration: 0.08 } }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {bubble && (
          <motion.div
            className="bubble-content"
            initial={false}
            animate={{ x: bubbleX, opacity: bubble.split ? 1 : 0 }}
            transition={bubble.split ? { ...SPRING, opacity: { delay: 0.15 } } : { duration: 0.1 }}
            style={{ width: BUBBLE, height: BUBBLE, top: TOP }}
          >
            {bubble.content}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

export function GooFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <filter id="goo" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -6"
          />
        </filter>
      </defs>
    </svg>
  )
}

export const ISLAND_TOP = TOP
export const BUBBLE_SIZE = BUBBLE
