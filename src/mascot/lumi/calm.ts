import { createContext, useContext, useMemo } from 'react'
import type { FxId } from './fx'
import type { Loop, LumiMood } from './moods'

/** Calm mode: gentler moments. Set by the user in Settings, and always on when the system asks for reduced motion. */
export const LumiCalmContext = createContext(false)

export function useCalm() {
  const asked = useContext(LumiCalmContext)
  const reduced = useMemo(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), [])
  return asked || reduced
}

/** the effects that are loud, bright or sudden: calm mode leaves them out */
export const CALM_HIDES: FxId[] = ['confetti', 'confettiSmall', 'burst', 'impact', 'blast', 'alarm', 'firework', 'focusLines', 'lock', 'glitch']

/** a loop that shakes (quick and small) is dropped in calm mode; slow ones stay */
export const calmLoop = (loop: Loop | null | undefined) => (loop && loop.dur >= 0.6 ? loop : undefined)

/** the full-card pictures (the explosion, the thinking cat) are replaced by her working quietly, with glasses on */
export const CALM_MOOD: Partial<Record<LumiMood, LumiMood>> = {
  due6h: 'due12h',
  due3h: 'due12h',
  due1h: 'due12h',
}
