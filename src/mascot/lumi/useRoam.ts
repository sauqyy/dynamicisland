import { useEffect, useRef } from 'react'
import { animate, useMotionValue, useSpring } from 'motion/react'

interface Opts {
  /** how far she wanders from where she sits, in px; 0 keeps her put */
  roam: number
  /** calm mode: she stays where she is */
  gentle: boolean
  /** wait this long before the first move (a moment she is telling should finish first) */
  settle?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Lumi's body moves, but only because she wants to: it does not react to the pointer, a click or a drag.
 * Every few seconds she decides to do something: hop to a new spot, glide across her space, float for a moment,
 * bounce on the spot, shuffle sideways, or slide to an edge and peek back. It all runs on motion values and springs, so none of it
 * redraws her: it only moves her.
 */
export function useRoam({ roam, gentle, settle = 0 }: Opts) {
  const tx = useMotionValue(0)
  const ty = useMotionValue(0)
  const x = useSpring(tx, { stiffness: 170, damping: 15, mass: 0.8 })
  const y = useSpring(ty, { stiffness: 260, damping: 15, mass: 0.7 })
  const rot = useMotionValue(0)
  const rotS = useSpring(rot, { stiffness: 150, damping: 16 })
  const sx = useMotionValue(1)
  const sy = useMotionValue(1)
  const at = useRef(0)
  const last = useRef('')

  useEffect(() => {
    if (roam <= 0 || gentle) return
    let t = 0
    let alive = true
    const small = roam <= 14
    /** squash and stretch, the way a ball lands: down, then up, then settles */
    const squash = (k = 1) => {
      animate(sy, [1, 1 - 0.2 * k, 1 + 0.17 * k, 0.95, 1], { duration: 0.5, ease: 'easeOut' })
      animate(sx, [1, 1 + 0.22 * k, 1 - 0.13 * k, 1.04, 1], { duration: 0.5, ease: 'easeOut' })
    }
    const move = (to: number) => {
      at.current = clamp(to, -roam, roam)
      tx.set(at.current)
    }
    const hop = (k = 1) => {
      animate(ty, [0, -9 * k, 0], { duration: 0.46, ease: 'easeOut' })
      squash(k)
    }
    const pick = () => {
      const all = small ? ['bounce', 'shuffle'] : ['hop', 'hop', 'glide', 'float', 'bounce', 'shuffle', 'peek']
      const options = all.filter((m) => m !== last.current)
      return options[Math.floor(Math.random() * options.length)]
    }
    const somewhereNew = () => {
      let n = (Math.random() * 2 - 1) * roam
      if (Math.abs(n - at.current) < roam * 0.45) n = at.current > 0 ? -(Math.abs(n) + roam * 0.35) : Math.abs(n) + roam * 0.35
      return clamp(n, -roam, roam)
    }
    const later = (ms: number, fn: () => void) => {
      t = window.setTimeout(() => alive && fn(), ms)
    }
    const next = () => later(12_000 + Math.random() * 14_000, act)
    const act = () => {
      const m = pick()
      last.current = m
      const k = small ? 0.5 : 1
      if (m === 'hop') {
        const n = somewhereNew()
        const far = Math.abs(n - at.current) / (roam * 2)
        move(n)
        hop(0.7 + far * 0.9)
        next()
      } else if (m === 'glide') {
        // she slides across without hopping, leaning into the way she is going and stretched a little, like skating
        const n = somewhereNew()
        const dir = n >= at.current ? 1 : -1
        move(n)
        animate(rot, dir * 9, { duration: 0.35, ease: 'easeOut' })
        animate(sx, [1, 1.12, 1.12, 1], { duration: 1, ease: 'easeInOut' })
        animate(sy, [1, 0.94, 0.94, 1], { duration: 1, ease: 'easeInOut' })
        later(950, () => {
          animate(rot, 0, { duration: 0.45, ease: 'easeOut' })
          next()
        })
      } else if (m === 'float') {
        // she lifts off a little, sways in the air, and settles back down
        animate(ty, [0, -7, -5, -7, -5, 0], { duration: 2.2, ease: 'easeInOut' })
        animate(rot, [0, 4, -4, 3, 0], { duration: 2.2, ease: 'easeInOut' })
        later(2400, next)
      } else if (m === 'bounce') {
        // three little bounces on the spot, each lower than the last
        ;[1, 0.7, 0.4].forEach((p, i) => window.setTimeout(() => alive && hop(p * k), i * 380))
        later(1400, next)
      } else if (m === 'shuffle') {
        // a small sidestep and back, as if she is shifting her weight
        const d = (Math.random() < 0.5 ? -1 : 1) * Math.max(6, roam * 0.25)
        const from = at.current
        move(from + d)
        squash(0.5 * k)
        later(900, () => {
          move(from)
          squash(0.4 * k)
          next()
        })
      } else {
        // peek: she slides to an edge, leans out, holds it, and comes back
        const edge = Math.random() < 0.5 ? -roam : roam
        const from = at.current
        move(edge)
        animate(rot, edge > 0 ? 12 : -12, { duration: 0.5 })
        squash(0.5)
        later(1700, () => {
          animate(rot, 0, { duration: 0.5 })
          move(from)
          hop(0.5)
          next()
        })
      }
    }
    later(settle + 7000 + Math.random() * 6000, act)
    return () => {
      alive = false
      window.clearTimeout(t)
      at.current = 0
      tx.set(0)
      ty.set(0)
      rot.set(0)
      sx.set(1)
      sy.set(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roam, gentle, settle])

  return { style: { x, y, rotate: rotS, scaleX: sx, scaleY: sy } }
}
