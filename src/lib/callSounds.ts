// Short synthesized cues for voice calls, so no audio assets have to ship.
let ctx: AudioContext | null = null

function tones(notes: [freq: number, at: number][], len = 0.14, gain = 0.08) {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const t0 = ctx.currentTime
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0 + at)
      g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len)
      osc.connect(g).connect(ctx.destination)
      osc.start(t0 + at)
      osc.stop(t0 + at + len + 0.02)
    }
  } catch {
    /* audio unavailable */
  }
}

/** You (or someone else) came into the call: rising two-note chirp. */
export const playJoin = () => tones([[660, 0], [880, 0.1]])

/** You (or someone else) left the call: falling two-note chirp. */
export const playLeave = () => tones([[880, 0], [587, 0.1]])
