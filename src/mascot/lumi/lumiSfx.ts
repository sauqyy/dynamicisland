import type { LumiMood } from './moods'

/**
 * Lumi's sounds, made in the browser's audio engine instead of recorded, so they weigh nothing and can be timed to
 * the frame. Each one is a few notes or a burst of noise with a short envelope: soft, round, a little playful, and
 * never harsh. They follow the app's sound switch and volume, and calm mode takes the loud ones out.
 */
export type SfxId =
  | 'blip'
  | 'hatch'
  | 'gasp'
  | 'hello'
  | 'boop1'
  | 'boop2'
  | 'boop3'
  | 'whoosh'
  | 'impact'
  | 'clap'
  | 'chime'
  | 'fanfare'
  | 'rocket'
  | 'burst'
  | 'boom'
  | 'gulp'
  | 'tick'
  | 'ding'
  | 'alarm'
  | 'drip'
  | 'sip'
  | 'zap'
  | 'pop'
  | 'sad'
  | 'bonk'
  | 'yawn'
  | 'sparkle'
  | 'drumroll'
  | 'reveal'

interface Config {
  on: boolean
  volume: number
  calm: boolean
}

let cfg: Config = { on: true, volume: 1, calm: false }
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

/** the app's sound switch, volume and calm mode */
export function configureLumiSound(c: Partial<Config>) {
  cfg = { ...cfg, ...c }
}

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    // a gentle compressor, so several sounds at once never clip
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 6
    master = ctx.createGain()
    master.connect(comp)
    comp.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

const noise = (a: AudioContext) => {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

interface Tone {
  at?: number
  to?: number
  type?: OscillatorType
  vol?: number
}

/** one note: it starts at `f`, may glide to `to`, and fades out over `dur` */
function tone(f: number, dur: number, o: Tone = {}) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime + (o.at ?? 0)
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(f, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur)
  const v = (o.vol ?? 0.2) * cfg.volume * (cfg.calm ? 0.6 : 1)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

interface Hiss {
  at?: number
  type?: BiquadFilterType
  f0: number
  f1?: number
  q?: number
  vol?: number
}

/** a burst of filtered noise: breath, wind, a clap */
function hiss(dur: number, o: Hiss) {
  const a = audio()
  if (!a || !master) return
  const t = a.currentTime + (o.at ?? 0)
  const src = a.createBufferSource()
  src.buffer = noise(a)
  const flt = a.createBiquadFilter()
  flt.type = o.type ?? 'bandpass'
  flt.Q.value = o.q ?? 1
  flt.frequency.setValueAtTime(o.f0, t)
  if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + dur)
  const g = a.createGain()
  const v = (o.vol ?? 0.15) * cfg.volume * (cfg.calm ? 0.6 : 1)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t + Math.min(0.02, dur / 3))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(flt)
  flt.connect(g)
  g.connect(master)
  src.start(t)
  src.stop(t + dur + 0.05)
}

const sparkle = (n = 5, at = 0, vol = 0.07) => {
  const notes = [1568, 1976, 2349, 2637, 3136]
  for (let i = 0; i < n; i++) tone(notes[(i * 2) % notes.length], 0.16, { at: at + i * 0.045, vol })
}

const SFX: Record<SfxId, () => void> = {
  blip: () => {
    tone(660, 0.09, { vol: 0.14 })
    tone(990, 0.13, { at: 0.07, vol: 0.12 })
  },
  hatch: () => {
    tone(300, 0.14, { to: 900, vol: 0.2 })
    sparkle(3, 0.1, 0.06)
  },
  gasp: () => {
    hiss(0.16, { f0: 700, f1: 2400, q: 0.8, vol: 0.09 })
    tone(500, 0.14, { to: 800, vol: 0.08 })
  },
  hello: () => {
    ;[523, 659, 784].forEach((f, i) => tone(f, 0.18, { at: i * 0.09, type: 'triangle', vol: 0.15 }))
    tone(1047, 0.45, { at: 0.28, type: 'triangle', vol: 0.12 })
  },
  boop1: () => tone(440, 0.16, { to: 480, vol: 0.2 }),
  boop2: () => tone(523, 0.16, { to: 560, vol: 0.2 }),
  boop3: () => tone(659, 0.2, { to: 700, vol: 0.2 }),
  whoosh: () => hiss(0.36, { f0: 300, f1: 3200, q: 0.9, vol: 0.12 }),
  impact: () => {
    tone(140, 0.26, { to: 45, vol: 0.4 })
    hiss(0.12, { type: 'lowpass', f0: 900, vol: 0.18 })
  },
  clap: () => {
    hiss(0.07, { type: 'highpass', f0: 1500, vol: 0.2 })
    hiss(0.09, { type: 'highpass', f0: 1800, at: 0.05, vol: 0.14 })
  },
  chime: () => {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.34, { at: i * 0.08, vol: 0.13 }))
  },
  fanfare: () => {
    ;[523, 659, 784].forEach((f) => tone(f, 0.7, { type: 'triangle', vol: 0.12 }))
    tone(1047, 0.8, { at: 0.12, type: 'triangle', vol: 0.12 })
    sparkle(6, 0.2)
  },
  rocket: () => {
    hiss(0.45, { f0: 400, f1: 2800, q: 1.2, vol: 0.1 })
    tone(300, 0.45, { to: 1400, vol: 0.06 })
  },
  burst: () => {
    hiss(0.26, { type: 'highpass', f0: 2000, vol: 0.14 })
    sparkle(5, 0.04)
  },
  boom: () => {
    tone(95, 0.95, { to: 32, vol: 0.55 })
    hiss(0.7, { type: 'lowpass', f0: 700, f1: 120, vol: 0.28 })
  },
  gulp: () => {
    tone(260, 0.12, { to: 110, vol: 0.3 })
    tone(180, 0.1, { to: 90, at: 0.08, vol: 0.2 })
  },
  tick: () => tone(1800, 0.025, { type: 'square', vol: 0.05 }),
  ding: () => {
    tone(1320, 0.8, { vol: 0.16 })
    tone(1980, 0.5, { vol: 0.07 })
  },
  alarm: () => {
    ;[0, 0.16, 0.32].forEach((t) => tone(880, 0.09, { at: t, type: 'square', vol: 0.06 }))
  },
  drip: () => {
    tone(1100, 0.09, { to: 520, vol: 0.18 })
    tone(1500, 0.18, { at: 0.1, vol: 0.05 })
  },
  sip: () => hiss(0.32, { type: 'lowpass', f0: 900, f1: 280, vol: 0.07 }),
  zap: () => tone(900, 0.22, { to: 200, type: 'sawtooth', vol: 0.07 }),
  pop: () => tone(700, 0.08, { to: 250, vol: 0.22 }),
  sad: () => {
    tone(440, 0.28, { vol: 0.12 })
    tone(370, 0.4, { at: 0.22, vol: 0.12 })
  },
  bonk: () => {
    tone(180, 0.1, { type: 'square', vol: 0.09 })
    tone(150, 0.16, { at: 0.08, type: 'square', vol: 0.08 })
  },
  yawn: () => tone(420, 0.75, { to: 210, vol: 0.1 }),
  sparkle: () => sparkle(6),
  drumroll: () => {
    for (let i = 0; i < 16; i++) hiss(0.04, { type: 'highpass', f0: 1200, at: i * 0.055, vol: 0.05 + i * 0.004 })
  },
  reveal: () => {
    tone(1320, 0.9, { vol: 0.16 })
    tone(1760, 0.7, { at: 0.04, vol: 0.08 })
    sparkle(6, 0.06)
  },
}

/** in calm mode, the loud ones are swapped for something soft */
const CALM: Partial<Record<SfxId, SfxId | null>> = {
  boom: 'ding',
  impact: 'pop',
  rocket: null,
  alarm: 'tick',
  fanfare: 'chime',
  burst: 'sparkle',
  zap: 'pop',
  clap: 'pop',
  drumroll: null,
  bonk: 'sad',
}

export function lumiSfx(id: SfxId) {
  if (!cfg.on || cfg.volume <= 0) return
  const use = cfg.calm && id in CALM ? CALM[id] : id
  if (!use) return
  try {
    SFX[use]()
  } catch {
    /* no audio here: carry on silently */
  }
}

/** [when in ms, which sound, and optionally how often to repeat it] */
type Cue = [at: number, id: SfxId, every?: number]

/**
 * What she sounds like, moment by moment: the cues sit on the beats of each story, so a sound lands with the
 * thing that makes it (the whoosh with the launch, the impact with the clap, the gulp with the squash).
 */
export const SFX_TRACK: Partial<Record<LumiMood, Cue[]>> = {
  hello: [[250, 'blip'], [700, 'hatch'], [2350, 'gasp'], [3950, 'hello']],
  delight: [[300, 'boop1'], [900, 'boop2'], [1500, 'chime']],
  goodMorning: [[1200, 'yawn'], [2100, 'chime']],
  goodNight: [[1000, 'yawn']],
  welcomeBack: [[2500, 'yawn'], [3200, 'chime']],
  updated: [[600, 'sparkle']],
  wake: [[0, 'gasp']],
  class1h: [[400, 'tick'], [1700, 'blip']],
  class10m: [[1000, 'alarm'], [1900, 'alarm']],
  classNow: [[300, 'ding']],
  classDone: [[800, 'chime']],
  examTomorrow: [[300, 'tick'], [800, 'gulp']],
  examLuck: [[500, 'blip'], [1500, 'sparkle']],
  examDone: [[900, 'yawn'], [1500, 'gasp'], [1800, 'rocket'], [2250, 'burst'], [2700, 'fanfare']],
  due3d: [[300, 'tick'], [800, 'blip']],
  due2d: [[300, 'tick'], [800, 'blip']],
  due24h: [[650, 'ding']],
  due12h: [[650, 'pop']],
  due6h: [[900, 'pop'], [2400, 'pop', 3400]],
  due3h: [[500, 'gulp', 2400]],
  due1h: [[200, 'boom'], [500, 'gulp', 2400]],
  overdue: [[600, 'sad']],
  submitted: [[550, 'whoosh'], [850, 'impact'], [1100, 'chime']],
  graded: [[500, 'drumroll'], [1750, 'reveal']],
  allClear: [[1900, 'chime']],
  announcement: [[300, 'blip'], [1100, 'ding']],
  newMaterial: [[300, 'blip'], [1100, 'ding']],
  message: [[300, 'blip'], [1000, 'ding']],
  focusStart: [[1000, 'tick']],
  focusDone: [[600, 'whoosh'], [850, 'burst'], [1100, 'chime']],
  breakTime: [[800, 'sip']],
  hydrate: [[300, 'drip']],
  eyeRest: [[400, 'blip']],
  stretch: [[300, 'yawn']],
  lowBattery: [[300, 'sad']],
  charging: [[600, 'zap']],
  lateNight: [[900, 'yawn']],
  todoDone: [[330, 'pop']],
  allTodosDone: [[450, 'pop'], [750, 'pop'], [1050, 'pop'], [1350, 'burst'], [1650, 'chime']],
  happy: [[0, 'blip']],
  veryHappy: [[0, 'chime']],
  bigGrin: [[0, 'pop']],
  laughing: [[0, 'pop', 420]],
  worried: [[0, 'tick']],
  veryWorried: [[0, 'gulp', 900]],
  sad: [[0, 'sad']],
  angry: [[0, 'bonk']],
  playful: [[0, 'boop2']],
  awkward: [[0, 'tick', 700]],
  sleepy: [[0, 'yawn']],
  thinking: [[0, 'blip']],
  confirm: [[0, 'blip']],
  error: [[400, 'bonk']],
}

/** does she have a voice for this moment? (if so, the app's generic alert sound stays out of her way) */
export const hasSfx = (mood: LumiMood) => Boolean(SFX_TRACK[mood])

/** plays a moment's cues on their beats; returns what stops them */
export function playTrack(mood: LumiMood): () => void {
  const cues = SFX_TRACK[mood]
  if (!cues) return () => {}
  const timers: number[] = []
  for (const [at, id, every] of cues) {
    timers.push(
      window.setTimeout(() => {
        lumiSfx(id)
        if (every) timers.push(window.setInterval(() => lumiSfx(id), every))
      }, at),
    )
  }
  return () => timers.forEach((t) => (clearTimeout(t), clearInterval(t)))
}
