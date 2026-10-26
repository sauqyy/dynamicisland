import type { Variants } from 'motion/react'
import type { TabAnim } from './settings'

/** How a page enters and leaves; `custom` is the direction (1 = coming from the right). */
export const PAGE_VARIANTS: Record<TabAnim, Variants> = {
  fade: {
    enter: { opacity: 0, filter: 'blur(8px)' },
    center: { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.22 } },
    exit: { opacity: 0, filter: 'blur(8px)', transition: { duration: 0.12 } },
  },
  slide: {
    enter: (d: number) => ({ x: d * 70, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 380, damping: 34 } },
    exit: (d: number) => ({ x: -d * 70, opacity: 0, transition: { duration: 0.16 } }),
  },
  // stretches like a drop of liquid as it slides in, then settles with a wobble
  liquid: {
    enter: (d: number) => ({ x: d * 56, scaleX: 1.32, scaleY: 0.88, opacity: 0, filter: 'blur(12px)' }),
    center: {
      x: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      filter: 'blur(0px)',
      transition: { type: 'spring', stiffness: 220, damping: 13, mass: 0.9 },
    },
    exit: (d: number) => ({ x: -d * 56, scaleX: 0.78, scaleY: 1.06, opacity: 0, filter: 'blur(12px)', transition: { duration: 0.2 } }),
  },
  // grows out of the middle, like the card is opening
  zoom: {
    enter: { scale: 0.88, opacity: 0, filter: 'blur(6px)' },
    center: { scale: 1, opacity: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 320, damping: 26 } },
    exit: { scale: 1.08, opacity: 0, filter: 'blur(6px)', transition: { duration: 0.16 } },
  },
  // the new page lands on top while the old one shrinks and dims behind it
  stack: {
    enter: (d: number) => ({ x: d * 130, opacity: 1, scale: 1, zIndex: 2, filter: 'brightness(1)' }),
    center: { x: 0, opacity: 1, scale: 1, zIndex: 2, filter: 'brightness(1)', transition: { type: 'spring', stiffness: 300, damping: 30 } },
    exit: (d: number) => ({ x: -d * 28, opacity: 0.35, scale: 0.9, zIndex: 1, filter: 'brightness(0.55)', transition: { duration: 0.28 } }),
  },
  // turns like a card
  flip: {
    enter: (d: number) => ({ rotateY: d * -75, opacity: 0, scale: 0.94 }),
    center: { rotateY: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
    exit: (d: number) => ({ rotateY: d * 75, opacity: 0, scale: 0.94, transition: { duration: 0.18 } }),
  },
  // a slide with motion blur that sharpens as it settles, like a camera pan
  blur: {
    enter: (d: number) => ({ x: d * 90, opacity: 0, filter: 'blur(16px)' }),
    center: { x: 0, opacity: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 260, damping: 30 } },
    exit: (d: number) => ({ x: -d * 90, opacity: 0, filter: 'blur(16px)', transition: { duration: 0.2 } }),
  },
  // floats up (or down) instead of sideways
  rise: {
    enter: (d: number) => ({ y: d * 44, opacity: 0 }),
    center: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 340, damping: 28 } },
    exit: (d: number) => ({ y: -d * 44, opacity: 0, transition: { duration: 0.16 } }),
  },
  // opens like an iris from a thin line, with the island's own bounce
  morph: {
    enter: { scaleY: 0.18, scaleX: 0.9, opacity: 0, filter: 'blur(8px)' },
    center: { scaleY: 1, scaleX: 1, opacity: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 380, damping: 17, mass: 0.9 } },
    exit: { scaleY: 0.18, scaleX: 0.9, opacity: 0, filter: 'blur(8px)', transition: { duration: 0.16 } },
  },
  // springs in from the side and can be dragged: pull it far enough and it snaps to the next page
  elastic: {
    enter: (d: number) => ({ x: d * 150, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 11, mass: 0.9 } },
    exit: (d: number) => ({ x: -d * 150, opacity: 0, transition: { duration: 0.18 } }),
  },
}
