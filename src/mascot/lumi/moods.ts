import type { Pose } from '../MascotEyes'
import type { FxId } from './fx'

/** Everything Lumi's face can be doing. Each is a short story: a few beats of expression, ending on how it resolves. */
export type LumiMood =
  | 'idle'
  | 'hello'
  | 'delight'
  | 'goodMorning'
  | 'goodNight'
  | 'welcomeBack'
  | 'updated'
  | 'wake'
  | 'sleep'
  | 'class1h'
  | 'class10m'
  | 'classNow'
  | 'classDone'
  | 'examTomorrow'
  | 'examLuck'
  | 'examDone'
  | 'due3d'
  | 'due2d'
  | 'due12h'
  | 'due3h'
  | 'due24h'
  | 'due6h'
  | 'due1h'
  | 'overdue'
  | 'submitted'
  | 'graded'
  | 'allClear'
  | 'announcement'
  | 'newMaterial'
  | 'focusStart'
  | 'focusDone'
  | 'breakTime'
  | 'hydrate'
  | 'eyeRest'
  | 'stretch'
  | 'lowBattery'
  | 'charging'
  | 'lateNight'
  | 'todoDone'
  | 'allTodosDone'
  | 'message'
  | 'speaking'
  | 'thinking'
  | 'confirm'
  | 'error'
  | 'happy'
  | 'veryHappy'
  | 'bigGrin'
  | 'laughing'
  | 'worried'
  | 'veryWorried'
  | 'sad'
  | 'angry'
  | 'playful'
  | 'awkward'
  | 'unemotional'
  | 'sleepy'
  | 'rainSoon'
  | 'rainNow'
  | 'rainEnds'
  | 'rainyDay'
  | 'storm'
  | 'hot'
  | 'strongSun'
  | 'idleHop'
  | 'idlePeek'
  | 'idleOrbit'
  | 'idleSwap'
  | 'idleSneeze'
  | 'idleHiccup'
  | 'idleShiver'
  | 'idleDaydream'
  | 'idleStargaze'
  | 'idleScan'
  | 'idleTake'
  | 'idleBubble'
  | 'idleFirefly'
  | 'idleNod'
  | 'idleGroove'
  | 'idleYawn'
  | 'idlePop'
  | 'idleStare'
  | 'idlePlayful'
  | 'idleAwkward'
  | 'idleDeadpan'

/** The shared pose, plus what each eye can do on its own: an offset, a tilt, and how visible it is. */
export interface LumiPose extends Pose {
  lx: number
  ly: number
  rx: number
  ry: number
  lo: number
  ro: number
  lrot: number
  rrot: number
  /** the whole of her, body and all: how far she leans, how far she sinks, how tall she sits */
  brot: number
  by: number
  bsy: number
}

/** what her mouth is doing, when she has a body (cards and the first hello; the resting pill is just eyes) */
export type Mouth = 'smile' | 'grin' | 'talk' | 'o' | 'flat' | 'tiny' | 'frown' | 'wavy' | 'smirk' | 'yawn' | 'w' | 'dot' | 'teeth' | 'laugh' | 'tongue' | 'awkward'

/** the eye drawn in place of the sparkle */
export type EyeShape = 'check' | 'dash' | 'x' | 'round' | 'sad' | 'star5' | 'sleepy' | 'star4'

/** a motion that repeats for as long as it is set, on top of the pose */
export interface Loop {
  x?: number[]
  y?: number[]
  rot?: number[]
  scale?: number[]
  dur: number
}

/** What can change from one beat of a story to the next. `pose` is merged into the last one; the rest replace it. */
export interface Look {
  /** the colour of its glow and effects */
  tint: string
  /** the eyes take the tint too */
  paint?: boolean
  shape?: EyeShape | null
  pose?: Partial<LumiPose>
  loop?: Loop | null
  /** 0-1: how far a lid has come down over each eye from the top (drowsy, wary), without squashing the star */
  lid?: number
  /** her brows, in degrees: up is worried (inner ends raised), down is determined (inner ends lowered) */
  brow?: number
  /** the mouth; left out, it follows the eyes (a grin when they smile, an O when they widen...) */
  mouth?: Mouth | null
  /** 0-1: how strongly the soft light behind the eyes shines */
  glow?: number
  fx: FxId[]
}

/** at what time (ms after it starts) the face changes to this */
export type Beat = [at: number, patch: Partial<Look>]

export interface MoodDef extends Look {
  label: string
  /** the heading it sits under on the demo page */
  group: string
  /** what happens next, in order; it stays on the last beat */
  story?: Beat[]
  /** when she turns to you and says it (ms): the words start then, not before */
  speakAt?: number
}

const C = { closedL: 1, closedR: 1 }
const O = { closedL: 0, closedR: 0 }
const BLUE = '#8ab4ff'
const GREEN = '#5eead4'
/** the pose before things happen to it: all the way back to neutral */
const REST0: Partial<LumiPose> = { ...O, x: 0, y: 0, scale: 1, sx: 1, sy: 1, rot: 0, apart: 0, heartL: 0, heartR: 0, lx: 0, ly: 0, rx: 0, ry: 0, lo: 1, ro: 1, lrot: 0, rrot: 0, brot: 0, by: 0, bsy: 1 }

/**
 * A moment with a cause. Something turns up (the prop), she senses it, her eyes snap to it (an eye-line),
 * she reacts, and then she turns to you, eye to eye, and tells you: that is when the words start.
 */
interface Scene {
  tint: string
  glow?: number
  /** what turns up beside her */
  prop: FxId[]
  /** where the eyes go to see it: x, y */
  look: [number, number]
  /** how she reacts to it, looking at it */
  react: Partial<LumiPose>
  reactFx?: FxId[]
  reactLoop?: Loop | null
  /** how she looks when she turns to you */
  settle: Partial<LumiPose>
  settleFx?: FxId[]
  settleLoop?: Loop | null
  lid?: number
  /** whatever else happens after she has said it */
  after?: Beat[]
}

const SENSE = 350
const NOTICE = 700
const REACT = 1000
const ADDRESS = 1650

function scene(s: Scene): Pick<MoodDef, 'tint' | 'glow' | 'pose' | 'fx' | 'story' | 'speakAt'> {
  const [lx, ly] = s.look
  const glow = s.glow ?? 0.4
  return {
    tint: s.tint,
    glow: 0.25,
    pose: REST0,
    fx: [],
    speakAt: ADDRESS,
    story: [
      // something turns up; she senses it before she sees it
      [SENSE, { fx: s.prop, pose: { ...REST0, y: -1 } }],
      // the eyes snap to it, stretching up to see
      [NOTICE, { pose: { ...REST0, x: lx, y: ly, sx: 0.92, sy: 1.15 } }],
      // and she reacts to what she sees
      [REACT, { pose: { ...REST0, x: lx, y: ly, ...s.react }, fx: [...s.prop, ...(s.reactFx ?? [])], loop: s.reactLoop ?? null, glow }],
      // then turns to you, eye contact, and says it
      [ADDRESS, { pose: { ...REST0, scale: 1.1, ...s.settle }, fx: [...s.prop, ...(s.settleFx ?? [])], loop: s.settleLoop ?? null, lid: s.lid ?? 0, glow: glow + 0.2 }],
      // follow-through: the little overshoot settles
      [ADDRESS + 260, { pose: { ...REST0, ...s.settle }, glow }],
      ...(s.after ?? []),
    ],
  }
}

/** both eyes rolling round a circle: `n` steps, `step` ms apart */
const roll = (n: number, start: number, step: number, r: number): Beat[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    return [start + i * step, { pose: { ...REST0, x: Math.cos(a) * r, y: Math.sin(a) * r } }] as Beat
  })

const IDLE_GROUP = 'Resting stories'
const rest = (label: string, story: Beat[], more: Partial<MoodDef> = {}): MoodDef => ({ label, group: IDLE_GROUP, tint: '#ffffff', glow: 0.18, fx: [], story, ...more })

/** Longer things she does when nothing is happening: a few seconds of story each, picked at random. */
const IDLE_STORIES: Record<Exclude<Extract<LumiMood, `idle${string}`>, 'idle'>, MoodDef> = {
  idleHop: rest('Hop-dance: the eyes take turns jumping', [
    [250, { pose: { ...REST0, ly: -7, lrot: -16, ry: 1, rrot: 5 }, fx: ['notes'] }],
    [550, { pose: { ...REST0, ry: -7, rrot: 16, ly: 1, lrot: -5 } }],
    [850, { pose: { ...REST0, ly: -7, lrot: -16, ry: 1, rrot: 5 } }],
    [1150, { pose: { ...REST0, ry: -7, rrot: 16, ly: 1, lrot: -5 } }],
    [1450, { pose: { ...REST0, ly: -5, ry: -5 } }],
    [1700, { pose: REST0 }],
  ]),
  idlePeek: rest('Peekaboo: slips out of sight, pops back with a gasp', [
    [300, { pose: { ...REST0, ly: 14, ry: 14, lo: 0, ro: 0, scale: 0.4 } }],
    [1100, { pose: { ...REST0, scale: 1.3, apart: 2 }, fx: ['exclaim', 'sparks'] }],
    [1700, { pose: REST0, fx: [] }],
  ]),
  idleOrbit: rest('Rolls its eyes all the way round, twice', [...roll(17, 200, 140, 5), [2700, { pose: REST0 }]]),
  idleSwap: rest('The eyes swap places, then swap back', [
    [250, { pose: { ...REST0, lx: 15, ly: -8, rx: -15, ry: 8 } }],
    [550, { pose: { ...REST0, lx: 30, rx: -30 } }],
    [1300, { pose: { ...REST0, lx: 30, rx: -30, closedL: 1 } }],
    [1700, { pose: { ...REST0, lx: 15, ly: 8, rx: -15, ry: -8 } }],
    [2000, { pose: REST0 }],
  ]),
  idleSneeze: rest('Ah... ah... achoo!', [
    [300, { pose: { ...REST0, sx: 0.85, sy: 1.25, y: -2, scale: 1.1 } }],
    [800, { pose: { ...REST0, sx: 0.8, sy: 1.35, y: -3, scale: 1.2 } }],
    [1100, { pose: { ...REST0, ...C, sx: 1.5, sy: 0.55, y: 3 }, fx: ['burst', 'sparks'] }],
    [1500, { pose: { ...REST0, ...C, x: -2 }, fx: [] }],
    [1900, { pose: REST0 }],
  ]),
  idleHiccup: rest('Hiccups three times', [
    [350, { pose: { ...REST0, sx: 0.9, sy: 1.2, y: -4 } }],
    [500, { pose: REST0 }],
    [1100, { pose: { ...REST0, sx: 0.9, sy: 1.2, y: -4 } }],
    [1250, { pose: REST0 }],
    [1900, { pose: { ...REST0, sx: 0.9, sy: 1.2, y: -5 }, fx: ['sparks'] }],
    [2050, { pose: REST0, fx: [] }],
  ]),
  idleShiver: rest(
    'Shivers from a draught',
    [
      [1900, { loop: null, pose: { ...REST0, y: 1 }, fx: [] }],
      [2300, { pose: REST0 }],
    ],
    { tint: '#9ad0ff', glow: 0.3, pose: { scale: 0.92, apart: -1, y: 1 }, loop: { x: [-1.3, 1.3, -1.3], dur: 0.06 }, fx: ['rain'] },
  ),
  idleDaydream: rest('Drifts off into a daydream', [
    [400, { pose: { ...REST0, x: 5, y: -4 }, fx: ['notes'], glow: 0.4 }],
    [1400, { pose: { ...REST0, x: 5, y: -4, ...C } }],
    [2800, { pose: { ...REST0, x: 0, y: 0, scale: 1.1 }, fx: [] }],
    [3200, { pose: REST0 }],
  ]),
  idleStargaze: rest('Gazes at the stars', [
    [300, { shape: 'star4', pose: { ...REST0, y: -4, scale: 1.1, apart: 1.5 }, fx: ['stars'], glow: 0.5 }],
    [2400, { shape: null, pose: REST0, fx: [] }],
  ]),
  idleScan: rest('Scans left and right like a radar', [
    [250, { pose: { ...REST0, x: -7 }, fx: ['lock'] }],
    [650, { pose: { ...REST0, x: 7 } }],
    [1050, { pose: { ...REST0, x: -7 } }],
    [1450, { pose: { ...REST0, x: 7 } }],
    [1850, { pose: { ...REST0, x: 0 }, fx: [] }],
  ]),
  idleTake: rest('Double take: looks away, looks back, then spots something', [
    [300, { pose: { ...REST0, x: 6 } }],
    [800, { pose: REST0 }],
    [1500, { pose: { ...REST0, x: 7, scale: 1.3, apart: 2 }, fx: ['exclaim'] }],
    [2400, { pose: REST0, fx: [] }],
  ]),
  idleBubble: rest('Watches a bubble float up, and pops it', [
    [250, { pose: { ...REST0, x: 5, y: 3 }, fx: ['bubble'] }],
    [900, { pose: { ...REST0, x: 5, y: -1 } }],
    [1600, { pose: { ...REST0, x: 6, y: -4 } }],
    [2000, { pose: { ...REST0, x: 3, y: -2, scale: 1.25 } }],
    [2500, { pose: { ...REST0, ...C }, fx: [] }],
    [2900, { pose: REST0 }],
  ]),
  idleFirefly: rest('Follows a firefly around, then blinks it away', [
    [150, { pose: { ...REST0, x: -6, y: 3 }, fx: ['firefly'] }],
    [650, { pose: { ...REST0, x: -3, y: -3 } }],
    [1150, { pose: { ...REST0, x: 2, y: 1 } }],
    [1700, { pose: { ...REST0, x: 6, y: -4 } }],
    [2200, { pose: { ...REST0, x: 1, y: 1 } }],
    [2800, { pose: { ...REST0, x: -3, y: 2 } }],
    [3200, { pose: { ...REST0, ...C }, fx: [] }],
    [3500, { pose: REST0 }],
  ]),
  idleNod: rest(
    'Nods off, jerks awake',
    [
      [500, { lid: 0, shape: 'sleepy', pose: { ...REST0, y: 2 } }],
      [1000, { shape: null, lid: 0.3, pose: { ...REST0, y: 1 } }],
      [1500, { shape: 'sleepy', pose: { ...REST0, y: 3 } }],
      [2100, { shape: null, lid: 0, pose: { ...REST0, scale: 1.3, apart: 2, y: -2 }, fx: ['exclaim'] }],
      [2900, { pose: REST0, fx: [] }],
    ],
    { lid: 0.3, pose: { y: 1 } },
  ),
  idleGroove: rest('Grooves along to some music in its head', [[2800, { loop: null, pose: REST0, fx: [] }]], {
    pose: C,
    mouth: 'smile',
    loop: { y: [0, -2.5, 0], rot: [-6, 6, -6], dur: 0.5 },
    fx: ['notes'],
    tint: '#c4b5fd',
    glow: 0.3,
  }),
  idleYawn: rest('A big yawn', [
    [400, { mouth: 'yawn', pose: { ...REST0, ...C, sx: 1.1, sy: 1.25, y: -2 } }],
    [1500, { pose: { ...REST0, ...C, y: 1 }, fx: ['sparks'] }],
    [1900, { mouth: null, pose: REST0, fx: [] }],
  ]),
  idlePop: rest('Inflates and pops with a sparkle', [
    [250, { pose: { ...REST0, scale: 1.3, sx: 0.9, sy: 1.25, y: -3 } }],
    [550, { pose: { ...REST0, scale: 1.6 } }],
    [800, { pose: { ...REST0, lo: 0, ro: 0, scale: 0.2 }, fx: ['burst', 'sparks'] }],
    [1200, { pose: { ...REST0, scale: 1.2 }, fx: [] }],
    [1600, { pose: REST0 }],
  ]),
  idlePlayful: rest('Playful: a wink, a tilt of the head and the tongue out', [
    [250, { mouth: 'tongue', pose: { ...REST0, closedR: 1, rot: -5 }, fx: ['sparks'] }],
    [1500, { mouth: null, pose: REST0, fx: [] }],
  ]),
  idleAwkward: rest('Awkward: looks away, sweats, looks the other way, then pretends nothing happened', [
    [300, { brow: 8, mouth: 'awkward', pose: { ...REST0, x: -5, y: 1 }, fx: ['sweat'] }],
    [1300, { pose: { ...REST0, x: 5, y: 1 } }],
    [2200, { brow: 0, mouth: null, pose: REST0, fx: [] }],
  ]),
  idleDeadpan: rest('Deadpan: the eyes go perfectly flat for a long moment', [
    [350, { brow: 9, mouth: 'dot' }],
    [2600, { brow: 0, mouth: null }],
  ]),
  idleStare: rest('Stares you down, unblinking', [
    [500, { lid: 0.15, pose: { ...REST0, apart: -1 } }],
    [1100, { lid: 0.3, pose: { ...REST0, apart: -2.5 } }],
    [1700, { lid: 0.4, pose: { ...REST0, apart: -3.5 }, loop: { x: [-0.4, 0.4, -0.4], dur: 0.12 } }],
    [2600, { loop: null, lid: 0, pose: { ...REST0, ...C } }],
    [2900, { pose: REST0 }],
  ]),
}

export const MOODS: Record<LumiMood, MoodDef> = {
  idle: { label: 'Resting: blinks, glances, follows the cursor', group: 'Resting', tint: '#ffffff', glow: 0.18, fx: [] },
  sleep: { label: 'Asleep: slow breathing, z z z', group: 'Resting', tint: '#9aa7ff', pose: C, mouth: 'tiny', glow: 0.1, loop: { y: [0, 1.2, 0], dur: 3.6 }, fx: ['zzz'] },
  wake: {
    label: 'Jolts awake, shakes it off, blinks',
    group: 'Resting',
    tint: '#ffffff',
    pose: { sx: 0.7, sy: 1.5, y: -5 },
    glow: 0.5,
    fx: ['exclaim', 'sparks'],
    story: [
      [220, { pose: { sx: 1.3, sy: 0.75, y: 2 } }],
      [450, { pose: { ...REST0, scale: 1.2, apart: 2 } }],
      [900, { pose: { ...REST0, rot: -8 }, fx: ['sparks'] }],
      [1100, { pose: { ...REST0, rot: 8 } }],
      [1300, { pose: REST0 }],
      [1700, { pose: { closedL: 1, closedR: 1 } }],
      [1850, { pose: REST0 }],
    ],
  },

  hello: {
    label: 'Hatches from a spark, looks around, finds you, gasps, goes shy, peeks back, greets you, then looks at the question',
    group: 'Hello',
    tint: BLUE,
    pose: { scale: 0.15, apart: -6 },
    mouth: 'tiny',
    glow: 0.1,
    fx: [],
    story: [
      // a seed of light in the dark
      [250, { pose: { scale: 0.5, apart: -4 }, fx: ['sparks'], glow: 0.3 }],
      // it hatches: the two eyes split and stretch up
      [700, { pose: { ...REST0, scale: 1.25, sx: 0.8, sy: 1.3, y: -3 }, glow: 0.5 }],
      [950, { pose: { ...REST0, sx: 1.2, sy: 0.85, y: 1.5 } }],
      // she looks about, seeing where she is for the first time
      [1250, { pose: { ...REST0, x: -6 }, fx: [] }],
      [1800, { pose: { ...REST0, x: 6, y: -1 } }],
      // and finds you: eye contact, and a gasp
      [2350, { shape: 'star4', pose: { ...REST0, scale: 1.25, apart: 2 }, fx: ['sparks'], glow: 0.7 }],
      // shy: looks away and down
      [2900, { shape: null, mouth: 'tiny', pose: { ...REST0, x: -4, y: 3, scale: 0.9 }, glow: 0.4 }],
      // peeks back with one eye
      [3500, { pose: { ...REST0, x: 2, y: -1, closedR: 1 } }],
      // and says hello, with a bounce and a smile
      [3950, { mouth: 'grin', pose: { ...REST0, ...C }, loop: { y: [0, -3, 0], rot: [-4, 4, -4], dur: 0.5 }, fx: ['sparks', 'handWave'], glow: 0.8 }],
      // then looks down at the question she is asking
      [4900, { mouth: 'smile', pose: { ...REST0, y: 4 }, loop: null, fx: [], glow: 0.45 }],
    ],
  },
  delight: {
    label: 'Hears the name: pulses for each syllable, then a happy bounce',
    group: 'Hello',
    tint: BLUE,
    pose: { y: 3 },
    glow: 0.4,
    fx: [],
    story: [
      [300, { pose: { ...REST0, scale: 1.2, sy: 1.2 } }],
      [600, { pose: { ...REST0, scale: 0.95 } }],
      [900, { pose: { ...REST0, scale: 1.2, sy: 1.2 } }],
      [1200, { pose: { ...REST0, scale: 0.95 } }],
      [1500, { pose: { ...REST0, ...C, scale: 1.1 }, fx: ['sparks'], glow: 0.8, loop: { y: [0, -3, 0], rot: [-5, 5, -5], dur: 0.5 } }],
      [2600, { pose: { ...REST0, ...C }, loop: { y: [0, -1.5, 0], dur: 1.8 } }],
    ],
  },
  goodMorning: {
    label: 'Asleep, yawns, stretches, then the sun comes up',
    group: 'Hello',
    tint: '#9aa7ff',
    shape: 'sleepy',
    pose: { y: 1 },
    glow: 0.2,
    fx: [],
    story: [
      [700, { shape: null, lid: 0.55 }],
      [1200, { shape: null, lid: 0, mouth: 'yawn', pose: { ...C, scale: 1.2, sy: 1.1 } }],
      [1800, { mouth: null, pose: { ...REST0, sx: 1.3, sy: 0.8 } }],
      [2100, { pose: { ...REST0, scale: 1.1 }, tint: '#ffd166', paint: true, glow: 0.7, fx: ['sun'], loop: { y: [0, -1.5, 0], dur: 2.4 } }],
    ],
  },
  goodNight: {
    label: 'Looks up at the moon, droops, dozes off',
    group: 'Hello',
    tint: '#c7d2fe',
    glow: 0.35,
    pose: { y: -1.5 },
    fx: ['moon'],
    story: [
      [1000, { pose: { y: 0 }, lid: 0.3 }],
      [1900, { lid: 0, shape: 'sleepy', pose: { y: 1 } }],
    ],
  },
  welcomeBack: {
    label: 'Groggy: eyes open slowly, slow blink, a yawn, wide awake',
    group: 'Hello',
    tint: '#9aa7ff',
    shape: 'sleepy',
    pose: { y: 1 },
    glow: 0.15,
    fx: ['zzz'],
    story: [
      [1000, { shape: null, lid: 0.6, fx: [] }],
      [1500, { shape: 'sleepy' }],
      [1850, { shape: null, lid: 0.35, pose: { x: -4, y: 0 } }],
      [2500, { shape: null, lid: 0, mouth: 'yawn', pose: { ...C, scale: 1.15, x: 0 }, fx: ['sparks'] }],
      [3200, { mouth: null, pose: { ...O, scale: 1.1 }, tint: BLUE, glow: 0.6, fx: ['sparks'] }],
    ],
  },
  updated: {
    label: 'Peeks at something new, then a shine sweeps across',
    group: 'Hello',
    tint: BLUE,
    pose: { y: -2, x: 3 },
    glow: 0.4,
    fx: [],
    story: [[600, { shape: 'star4', pose: { scale: 1.1, apart: 2, y: 0, x: 0 }, glow: 0.7, fx: ['shine', 'sparks'] }]],
  },

  class1h: {
    label: 'A clock turns up: she checks it (squinting at the time), then turns to you',
    group: 'Classes',
    ...scene({ tint: BLUE, prop: ['clock'], look: [5, -1], react: C, settle: {}, settleFx: ['sparks'] }),
  },
  class10m: {
    label: 'The clock turns up, then it rings: she jolts, then turns to you in a hurry',
    group: 'Classes',
    ...scene({ tint: '#ffb454', glow: 0.6, prop: ['clock'], look: [5, -1], react: { scale: 1.15, apart: 2.5 }, reactFx: ['alarm'], reactLoop: { x: [-0.8, 0.8, -0.8], dur: 0.4 }, settle: { scale: 1.1, apart: 2.5 }, settleFx: ['alarm'], settleLoop: { x: [-0.6, 0.6, -0.6], dur: 0.3 } }),
  },
  classNow: {
    label: 'A bell turns up: she watches it swing, then beams at you',
    group: 'Classes',
    ...scene({ tint: '#6ee7a7', glow: 0.6, prop: ['bell'], look: [5, -2], react: { scale: 1.12, apart: 2 }, reactLoop: { y: [0, -2, 0], dur: 0.5 }, settle: { ...C }, settleFx: ['sparks'] }),
  },
  classDone: {
    label: 'Relieved: a long breath out, then humming',
    group: 'Classes',
    tint: '#a5f3c4',
    glow: 0.4,
    pose: { scale: 1.08, y: -2 },
    fx: ['sparks'],
    story: [
      [800, { pose: { ...C, scale: 1, y: 1 }, fx: [] }],
      [1500, { pose: C, fx: ['notes'], loop: { y: [0, -1.5, 0], dur: 2.2 } }],
    ],
  },

  examTomorrow: {
    label: 'The calendar turns up: she sweats, then steadies herself and turns to you, determined',
    group: 'Exams',
    ...scene({ tint: '#ffd166', glow: 0.4, prop: ['calendar'], look: [5, 0], react: { y: 1 }, reactFx: ['sweat'], settle: {}, lid: 0.28, after: [[1950, { brow: -8 }]] }),
  },
  examLuck: {
    label: 'Eyes shut, fingers crossed, then a wink',
    group: 'Exams',
    tint: '#86efac',
    glow: 0.5,
    fx: ['clover'],
    story: [
      [500, { pose: C }],
      [1500, { pose: { ...O, closedR: 1, scale: 1.05 }, fx: ['clover', 'sparks'] }],
      [2300, { pose: { ...O, scale: 1 } }],
    ],
  },
  examDone: {
    label: 'Drained, a long exhale, then the eyes launch as fireworks and fall back as gold stars with a trophy',
    group: 'Exams',
    tint: '#ffd166',
    glow: 0.25,
    lid: 0.45,
    pose: { y: 3, scale: 0.9 },
    mouth: 'wavy',
    fx: ['sweat'],
    story: [
      // the long breath out
      [900, { lid: 0, mouth: 'o', shape: 'sleepy', pose: { ...REST0, y: 2 }, fx: [] }],
      // eyes snap open
      [1500, { mouth: null, shape: null, pose: { ...REST0, scale: 1.2, apart: 2 }, fx: ['exclaim'] }],
      // and fly up and apart like two rockets
      [1800, { pose: { ...REST0, lx: -13, ly: -19, rx: 13, ry: -19, scale: 0.7, lrot: -25, rrot: 25 }, glow: 0.7, fx: ['firework'] }],
      // where they burst
      [2250, { pose: { ...REST0, lx: -13, ly: -19, rx: 13, ry: -19, lo: 0, ro: 0, scale: 0.3 }, fx: ['firework', 'confettiSmall'] }],
      // and come back down as gold stars, with the trophy
      [2700, { paint: true, shape: 'star5', pose: { ...REST0, scale: 1.3 }, glow: 1, fx: ['confetti', 'stars', 'trophy', 'handsUp'] }],
      [3000, { pose: REST0, loop: { scale: [1, 1.1, 1], rot: [-5, 5, -5], dur: 0.9 } }],
    ],
  },

  due3d: {
    label: '3 days: leans back in the chair, no rush',
    group: 'Deadlines: locking in',
    tint: BLUE,
    glow: 0.3,
    pose: REST0,
    mouth: 'smile',
    fx: [],
    speakAt: 1000,
    story: [
      // the calendar turns up and she glances at it
      [300, { fx: ['calendar'], pose: { ...REST0, x: 5, y: -1 } }],
      // three days: she sinks back into the seat, lids low, humming
      [800, { fx: ['calendar', 'notes'], lid: 0.35, pose: { ...REST0, by: 3, bsy: 0.9 }, loop: { y: [0, 1, 0], dur: 2.6 } }],
      [1500, { pose: { ...REST0, by: 3, bsy: 0.9, ...C } }],
      [1750, { pose: { ...REST0, by: 3, bsy: 0.9 } }],
    ],
  },
  due2d: {
    label: '2 days: still slouched, but the calendar catches her eye and she sits up a little',
    group: 'Deadlines: locking in',
    tint: BLUE,
    glow: 0.35,
    lid: 0.35,
    pose: { ...REST0, by: 3, bsy: 0.9 },
    mouth: 'flat',
    fx: [],
    speakAt: 1400,
    story: [
      [300, { fx: ['calendar'], pose: { ...REST0, by: 3, bsy: 0.9, x: 5 } }],
      // oh: the eyes open all the way
      [800, { lid: 0, mouth: 'o', pose: { ...REST0, by: 2, bsy: 0.94, x: 5, scale: 1.12, apart: 1.5 }, fx: ['calendar', 'exclaim'] }],
      // and she pulls herself up a bit
      [1400, { mouth: 'wavy', brow: 12, fx: ['calendar'], pose: { ...REST0, by: 0.5, bsy: 1.02, scale: 1.04 } }],
    ],
  },
  due24h: {
    label: '1 day: a lightbulb. Time to plan, and she sits up',
    group: 'Deadlines: locking in',
    tint: '#ffd166',
    glow: 0.45,
    pose: { ...REST0, by: 1, bsy: 0.97 },
    mouth: 'smile',
    fx: [],
    speakAt: 1400,
    story: [
      // she looks up: something is coming
      [300, { pose: { ...REST0, y: -3, x: 3, by: 1 } }],
      // the bulb pops on, and her eyes go wide
      [650, { fx: ['bulb'], mouth: 'o', pose: { ...REST0, y: -2, x: 3, scale: 1.12, apart: 1.5 }, glow: 0.7 }],
      // sits up, and turns to you with the plan
      [1400, { fx: ['bulb', 'sparks'], mouth: 'grin', pose: { ...REST0, by: -2, bsy: 1.06, scale: 1.05 } }],
      [1700, { pose: { ...REST0, by: -2, bsy: 1.05 } }],
    ],
  },
  due12h: {
    label: '12 hours: glasses on, sleeves up',
    group: 'Deadlines: locking in',
    tint: '#ffb454',
    glow: 0.4,
    pose: { ...REST0, by: -1.5, bsy: 1.04 },
    mouth: 'smile',
    fx: [],
    speakAt: 1500,
    story: [
      [300, { pose: { ...REST0, by: -2, bsy: 1.06, y: -1 } }],
      // the glasses drop on
      [650, { fx: ['glasses'], lid: 0.12, brow: -10, mouth: 'flat', pose: { ...REST0, by: -2, bsy: 1.06, scale: 1.05 } }],
      // a push of the glasses: a small nod, and a glint
      [1150, { pose: { ...REST0, by: -2, bsy: 1.06, y: 1.5 } }],
      [1400, { pose: { ...REST0, by: -2, bsy: 1.06, y: 0 } }],
      // and she looks at you over the top of them
      [1500, { lid: 0.18, mouth: 'smirk', pose: { ...REST0, by: -2.5, bsy: 1.08, scale: 1.05, brot: 2 } }],
    ],
  },
  due6h: {
    label: '6 hours: the thinking cat. A heavy-lidded sideways look, a paw at the chin',
    group: 'Deadlines: locking in',
    tint: '#c9c4ff',
    glow: 0.15,
    mouth: 'flat',
    pose: { ...REST0 },
    fx: [],
    speakAt: 900,
    story: [
      // the eyes drift off to the side, as if considering something
      [450, { pose: { ...REST0, x: 5, y: -1 } }],
      // the lids come down, and a hand comes up to her chin: she is weighing it up
      [900, { lid: 0.38, fx: ['handChin'], pose: { ...REST0, x: 5, y: -1, brot: -5 } }],
      [1500, { pose: { ...REST0, x: 5.5, y: -1.5, brot: -6 }, loop: { rot: [-1.2, 1.2, -1.2], dur: 3.6 } }],
    ],
  },
  due3h: {
    label: '3 hours: "time to lock in." Fireball behind her, wide eyes, a gulp',
    group: 'Deadlines: locking in',
    tint: '#ff7a45',
    glow: 0.5,
    shape: 'round',
    mouth: 'wavy',
    pose: { ...REST0, scale: 1.04, apart: -0.5 },
    fx: ['sweat'],
    speakAt: 600,
    // the stare, and every couple of seconds a gulp: she squashes down and back
    loop: { y: [0, 0, 0, 2, 0, 0], scale: [1, 1, 1, 0.93, 1.02, 1], dur: 2.4 },
    story: [
      [500, { mouth: 'flat', pose: { ...REST0, scale: 1.04, apart: -0.5 } }],
      [1100, { mouth: 'wavy' }],
    ],
  },
  due1h: {
    label: '1 hour: "time to lock in." The same, and she cannot look away',
    group: 'Deadlines: locking in',
    tint: '#ff7a45',
    glow: 0.5,
    shape: 'round',
    mouth: 'wavy',
    pose: { ...REST0, scale: 1.04, apart: -0.5 },
    fx: ['sweat'],
    speakAt: 600,
    // the stare, and every couple of seconds a gulp: she squashes down and back
    loop: { y: [0, 0, 0, 2, 0, 0], scale: [1, 1, 1, 0.93, 1.02, 1], dur: 2.4 },
    story: [
      [500, { mouth: 'flat', pose: { ...REST0, scale: 1.04, apart: -0.5 } }],
      [1100, { mouth: 'wavy' }],
    ],
  },
  overdue: {
    label: 'Startled, then droops under a little rain',
    group: 'Assignments',
    tint: '#9db4d6',
    glow: 0.3,
    pose: { scale: 1.15, apart: 2 },
    fx: ['exclaim'],
    story: [[600, { brow: 15, mouth: 'frown', pose: { ...REST0, y: 2.5, lrot: -18, rrot: 18 }, glow: 0.2, fx: ['rain'] }]],
  },
  submitted: {
    label: 'Holds its breath, winds up, claps together with a bang, bounces and stamps a tick',
    group: 'Assignments',
    tint: GREEN,
    glow: 0.25,
    // pressing the button: small, looking down, a tremor
    pose: { scale: 0.85, y: 2, x: -1 },
    mouth: 'flat',
    loop: { x: [-1.8, -0.4, -1.8], dur: 0.1 },
    fx: [],
    story: [
      // the wind-up: the eyes pull apart, leaning away from each other
      [600, { loop: null, pose: { ...REST0, apart: 4, scale: 0.9, lrot: -12, rrot: 12 }, glow: 0.5 }],
      // the clap: slammed together
      [850, { pose: { ...REST0, apart: -8, sx: 1.2, sy: 0.85 }, fx: ['impact', 'confetti'], glow: 1 }],
      // and thrown apart again, up
      [1050, { pose: { ...REST0, apart: 3, scale: 1.1, sx: 0.9, sy: 1.25, y: -5 } }],
      // a smile that bounces, with the tick stamped beside it
      [1300, { mouth: 'grin', paint: true, pose: { ...REST0, ...C, apart: 2, scale: 1.15 }, fx: ['confetti', 'stamp'], loop: { y: [0, -3.5, 0], rot: [-5, 5, -5], dur: 0.55 } }],
      [2500, { loop: { y: [0, -1.5, 0], dur: 1.8 }, fx: ['stamp', 'sparks'], glow: 0.7 }],
    ],
  },
  graded: {
    label: 'Eyes shut, a drumroll, a breath in, then spinning star eyes (never the score)',
    group: 'Assignments',
    tint: '#ffd166',
    glow: 0.3,
    pose: { y: -2, x: 3 },
    fx: [],
    story: [
      // the drumroll: eyes shut, trembling
      [500, { pose: { ...REST0, ...C, y: 1 }, loop: { x: [-1.4, 1.4, -1.4], dur: 0.07 }, fx: ['sparks'] }],
      // a breath in
      [1500, { loop: null, pose: { ...REST0, ...C, sx: 0.8, sy: 1.3, y: -3 } }],
      // the reveal: the eyes spin into stars (a star turned 72 degrees is the same star)
      [1750, { mouth: 'grin', paint: true, shape: 'star5', pose: { ...REST0, scale: 1.4, lrot: -72, rrot: 72 }, glow: 1, fx: ['impact', 'stars'] }],
      [2100, { pose: { ...REST0, lrot: -72, rrot: 72 }, fx: ['stars', 'shine'], loop: { scale: [1, 1.1, 1], dur: 1.2 } }],
    ],
  },
  allClear: {
    label: 'Surprised there is nothing, then relaxed',
    group: 'Assignments',
    tint: '#a5f3c4',
    glow: 0.35,
    pose: { x: 3 },
    fx: [],
    story: [
      [600, { pose: { x: -3 } }],
      [1200, { pose: { x: 0, scale: 1.1 }, fx: ['sparks'] }],
      [1900, { pose: C, fx: ['notes', 'sparks'], loop: { y: [0, -1.5, 0], dur: 2.2 } }],
    ],
  },

  announcement: {
    label: 'A letter slides in: she watches it, then turns to you with the news',
    group: 'Inbox',
    ...scene({ tint: BLUE, glow: 0.35, prop: ['envelope'], look: [5, 0], react: { scale: 1.1 }, settle: {}, settleFx: ['sparks'] }),
  },
  newMaterial: {
    label: 'A page pops up: she reads it, then turns to you',
    group: 'Inbox',
    ...scene({ tint: BLUE, glow: 0.35, prop: ['doc'], look: [5, 0], react: { scale: 1.12, y: -1 }, settle: {} }),
  },

  focusStart: {
    label: 'Stretches, rolls its shoulders, then locks on',
    group: 'Focus and care',
    tint: '#c4b5fd',
    glow: 0.4,
    pose: C,
    mouth: 'flat',
    fx: [],
    story: [
      [500, { pose: O }],
      [1000, { pose: { closedL: 0 }, lid: 0.25, brow: -9, fx: ['lock'], glow: 0.6 }],
    ],
  },
  focusDone: {
    label: 'Drained, then relieved and cheering',
    group: 'Focus and care',
    tint: '#6ee7a7',
    glow: 0.4,
    lid: 0.3,
    pose: { y: 1 },
    fx: [],
    story: [
      [600, { lid: 0, pose: { ...REST0, sx: 0.7, sy: 1.45, y: -6 }, fx: ['burst'] }],
      [850, { pose: { ...C, sx: 1.3, sy: 0.75, y: 2 }, glow: 0.8, fx: ['burst', 'confettiSmall', 'sparks'] }],
      [1100, { pose: { ...C, sx: 1, sy: 1, y: 0 }, loop: { y: [0, -2.5, 0], dur: 0.6 } }],
    ],
  },
  breakTime: {
    label: 'A coffee turns up: she breathes in the steam, then turns to you, content',
    group: 'Focus and care',
    ...scene({ tint: '#ffd9a0', prop: ['mug'], look: [5, 1], react: { ...C }, settle: { ...C }, settleLoop: { y: [0, 1, 0], dur: 2.6 } }),
  },
  hydrate: {
    label: 'A drop turns up: she watches it, then turns to you with a wink',
    group: 'Focus and care',
    ...scene({ tint: '#7dd3fc', glow: 0.4, prop: ['drop'], look: [5, -2], react: { scale: 1.08 }, settle: { closedR: 1 }, after: [[1700, { mouth: 'w' }]] }),
  },
  eyeRest: {
    label: 'Looks far away, then rests its eyes',
    group: 'Focus and care',
    tint: BLUE,
    glow: 0.35,
    fx: [],
    story: [
      [400, { pose: { y: -2 }, loop: { x: [-6, 6, -6], dur: 4 }, fx: ['sparks'] }],
      [3400, { loop: null, pose: { ...C, y: 0 } }],
    ],
  },
  stretch: {
    label: 'Reaches up, relaxes, bright-eyed',
    group: 'Focus and care',
    tint: '#6ee7a7',
    glow: 0.4,
    fx: [],
    story: [
      [300, { pose: C, loop: { y: [1, -4, 1], scale: [1, 1.18, 1], dur: 1.8 } }],
      [2100, { loop: null, pose: { ...O, scale: 1.1 }, fx: ['sparks'] }],
    ],
  },
  lowBattery: {
    label: 'The battery turns up, nearly empty: she sags, turns to you, and droops',
    group: 'Focus and care',
    ...scene({ tint: '#ffb454', prop: ['battery'], look: [5, 0], react: { y: 2, scale: 0.95 }, settle: { y: 1 }, after: [[1900, { brow: 10 }], [2400, { shape: 'sleepy', pose: { y: 1 }, glow: 0.3 }]] }),
  },
  charging: {
    label: 'Drowsy, then perks up with a zap',
    group: 'Focus and care',
    tint: '#ffe14d',
    glow: 0.3,
    shape: 'sleepy',
    pose: { y: 1 },
    fx: ['battery'],
    story: [
      [600, { shape: null, pose: { scale: 1.1, apart: 2, y: 0 }, glow: 0.7, fx: ['zap'] }],
      [1500, { pose: { ...C } }],
      [1900, { pose: O }],
    ],
  },
  lateNight: {
    label: 'Droops, yawns, dozes under the moon',
    group: 'Focus and care',
    tint: '#c7d2fe',
    glow: 0.3,
    lid: 0.3,
    pose: { y: 1 },
    fx: ['moon'],
    story: [
      [900, { lid: 0, mouth: 'yawn', pose: { ...C, scale: 1.15, y: 0 } }],
      [1700, { mouth: 'tiny', pose: { ...O, scale: 1 }, shape: 'sleepy' }],
    ],
  },

  todoDone: {
    label: 'A quick hop, a wink and a stamped tick',
    group: 'To-dos',
    tint: GREEN,
    glow: 0.3,
    pose: { sy: 0.8, sx: 1.15, y: 1.5 },
    fx: [],
    story: [
      [160, { pose: { ...REST0, sx: 0.8, sy: 1.35, y: -4 } }],
      [330, { pose: { ...REST0, closedL: 1, sx: 1.2, sy: 0.85, y: 1 }, glow: 0.6, fx: ['stamp'] }],
      [550, { pose: { ...REST0, closedL: 1 } }],
    ],
  },
  allTodosDone: {
    label: 'Gasps, then the eyes take turns hopping and dancing, ending in heart eyes and confetti',
    group: 'To-dos',
    tint: '#ff8fb8',
    glow: 0.4,
    pose: { scale: 1.2, apart: 2 },
    fx: ['exclaim'],
    story: [
      [450, { pose: { ...REST0, ly: -7, lrot: -18, ry: 2, rrot: 6, sx: 1.1 }, glow: 0.7, fx: ['sparks'] }],
      [750, { pose: { ...REST0, ry: -7, rrot: 18, ly: 2, lrot: -6, sx: 1.1 } }],
      [1050, { pose: { ...REST0, ly: -7, lrot: -18, ry: 2, rrot: 6, sx: 1.1 } }],
      [1350, { pose: { ...REST0, ry: -7, rrot: 18, ly: 2, lrot: -6, sx: 1.1 }, glow: 1, fx: ['confetti', 'hearts'] }],
      [1650, { pose: { ...REST0, heartL: 1, heartR: 1, scale: 1.12, apart: 2 }, loop: { scale: [1, 1.12, 1], dur: 0.7 } }],
    ],
  },

  message: {
    label: 'A letter slides in: she watches it, then turns to you with a happy wink',
    group: 'Talking',
    ...scene({ tint: BLUE, glow: 0.4, prop: ['envelope'], look: [5, 0], react: { scale: 1.1 }, settle: { closedR: 1 } }),
  },
  speaking: {
    label: 'Speaking: eyes pulse, voice arcs',
    group: 'Talking',
    tint: '#ffffff',
    glow: 0.5,
    pose: { scale: 1.05 }, mouth: 'talk',
    loop: { scale: [1, 1.1, 0.98, 1.07, 1], dur: 0.9 },
    fx: ['ripple'],
  },
  thinking: {
    label: 'Looks up, left, right, then lands on an answer',
    group: 'Talking',
    tint: '#c4b5fd',
    glow: 0.5,
    pose: { x: -5, y: -4 },
    fx: ['orbit'],
    story: [
      [1200, { pose: { x: 5, y: -3 } }],
      [2200, { pose: { x: -3, y: -2 } }],
      [3000, { pose: { x: 0, y: 0, scale: 1.1 }, fx: ['sparks'] }],
    ],
  },
  confirm: {
    label: 'Tilts, waits, tilts the other way',
    group: 'Talking',
    tint: '#ffd166',
    glow: 0.5,
    pose: { rot: -7, y: -1 },
    loop: { y: [0, -1.6, 0], dur: 1.1 },
    fx: ['qmark'],
    story: [
      [1000, { pose: { rot: 7, y: -1 } }],
      [2000, { pose: { rot: -7, y: -1 } }],
    ],
  },
  error: {
    label: 'Gasps, glitches, then droops',
    group: 'Talking',
    tint: '#ff6b6b',
    glow: 0.4,
    pose: { scale: 1.2, apart: 2 },
    fx: ['exclaim'],
    story: [
      [400, { paint: true, shape: 'x', pose: { scale: 1, apart: 0 }, glow: 0.7, fx: ['glitch', 'qmark'] }],
      [1800, { paint: false, shape: null, tint: '#ffb4b4', lid: 0.2, brow: 11, pose: { y: 2.5 }, glow: 0.3, fx: ['qmark'] }],
    ],
  },
  // ---- the expression sheet: twelve readable feelings, in her own parts
  happy: { label: 'Happy', group: 'Expression sheet', tint: '#8ab4ff', glow: 0.3, brow: 5, mouth: 'smile', pose: REST0, fx: [] },
  veryHappy: { label: 'Very happy', group: 'Expression sheet', tint: '#8ab4ff', glow: 0.45, mouth: 'smile', pose: { ...REST0, ...C }, fx: ['sparks'] },
  bigGrin: { label: 'Big grin', group: 'Expression sheet', tint: '#8ab4ff', glow: 0.4, mouth: 'teeth', pose: { ...REST0, ...C }, fx: [] },
  laughing: { label: 'Laughing', group: 'Expression sheet', tint: '#ffd166', glow: 0.5, mouth: 'laugh', pose: { ...REST0, ...C }, loop: { y: [0, -2.4, 0], rot: [-3, 3, -3], dur: 0.45 }, fx: ['sparks'] },
  worried: { label: 'Worried', group: 'Expression sheet', tint: '#ffd9a0', glow: 0.25, brow: 14, mouth: 'frown', pose: { ...REST0, y: 1 }, fx: [] },
  veryWorried: { label: 'Very worried', group: 'Expression sheet', tint: '#ffb454', glow: 0.35, brow: 20, mouth: 'o', pose: { ...REST0, scale: 1.08 }, loop: { x: [-0.5, 0.5, -0.5], dur: 0.12 }, fx: ['sweat'] },
  sad: { label: 'Sad', group: 'Expression sheet', tint: '#9db4d6', glow: 0.15, brow: 18, mouth: 'frown', pose: { ...REST0, y: 2.2 }, fx: ['tear'] },
  angry: { label: 'Angry', group: 'Expression sheet', tint: '#ff6b6b', glow: 0.45, brow: -16, mouth: 'frown', pose: { ...REST0, scale: 1.04 }, fx: ['anger'] },
  playful: { label: 'Playful', group: 'Expression sheet', tint: '#8ab4ff', glow: 0.35, brow: 4, mouth: 'tongue', pose: { ...REST0, closedR: 1, rot: -4 }, fx: ['sparks'] },
  awkward: { label: 'Awkward', group: 'Expression sheet', tint: '#ffd9a0', glow: 0.2, brow: 8, mouth: 'awkward', pose: { ...REST0, x: -4, y: 1 }, fx: ['sweat'] },
  unemotional: { label: 'Unemotional', group: 'Expression sheet', tint: '#c9d3ff', glow: 0.12, brow: 9, mouth: 'dot', pose: REST0, fx: [] },
  sleepy: { label: 'Sleepy', group: 'Expression sheet', tint: '#9aa7ff', glow: 0.15, shape: 'sleepy', mouth: 'tiny', pose: { ...REST0, y: 1 }, loop: { y: [1, 2.4, 1], dur: 3.4 }, fx: ['zzz'] },
  // ---- the weather: she notices it, reacts, and tells you what to do about it
  rainSoon: { label: 'Rain on its way: sees the cloud, reacts, winks at you', group: 'Weather', ...scene({ tint: '#7fb8ff', glow: 0.4, prop: ['rainCloud'], look: [5, -2], react: { scale: 1.08, y: -1 }, settle: { closedR: 1 } }) },
  rainNow: { label: 'Raining: glances at the umbrella, content', group: 'Weather', ...scene({ tint: '#7fb8ff', glow: 0.35, prop: ['umbrella'], look: [5, -1], react: { y: 1 }, settle: {} }) },
  rainEnds: { label: 'The rain is stopping: relief, and the sun comes out', group: 'Weather', ...scene({ tint: '#ffd166', glow: 0.5, prop: ['sunStrong'], look: [5, -3], react: { ...C }, settle: { scale: 1.05 }, settleFx: ['sparks'] }) },
  rainyDay: { label: 'A rainy day: looks out the window and settles in, cosy', group: 'Weather', ...scene({ tint: '#8ab4ff', glow: 0.3, prop: ['rainCloud'], look: [5, -2], react: { y: 2 }, settle: { ...C }, settleLoop: { y: [0, 1, 0], dur: 2.6 } }) },
  storm: { label: 'A thunderstorm: eyes wide, a gulp, a nervous mouth', group: 'Weather', mouth: 'wavy', ...scene({ tint: '#c4b5fd', glow: 0.5, prop: ['stormCloud'], look: [5, -2], react: { scale: 1.15, apart: 2 }, reactFx: ['sweat'], settle: { scale: 1.1 }, settleFx: ['sweat'] }) },
  hot: { label: 'A hot day: sweating, heavy-lidded', group: 'Weather', mouth: 'flat', ...scene({ tint: '#ff8a5c', glow: 0.4, prop: ['heat'], look: [5, -1], react: { scale: 1.05 }, reactFx: ['sweat'], settle: { y: 1 }, settleFx: ['sweat'], lid: 0.22 }) },
  strongSun: { label: 'Strong sun: squints against it', group: 'Weather', mouth: 'flat', ...scene({ tint: '#ffd166', glow: 0.45, prop: ['sunStrong'], look: [5, -3], react: { scale: 1.04 }, settle: {}, lid: 0.3 }) },
  ...IDLE_STORIES,
}

/** the reminders where the whole card is the "time to lock in." picture */
export const LOCKIN_MOODS: LumiMood[] = ['due3h', 'due1h', 'due6h']

export const MOOD_IDS = Object.keys(MOODS) as LumiMood[]
/** the stories she tells to herself while resting */
export const IDLE_STORY_IDS = MOOD_IDS.filter((m) => m.startsWith('idle') && m !== 'idle')
/** how long a story lasts: to its last beat, and a moment more */
export const storyLength = (mood: LumiMood) => Math.max(0, ...beatTimes(mood)) + 900

/** The look of a mood once its first `n` beats have happened. */
export function lookAt(mood: LumiMood, n: number): Look {
  const m = MOODS[mood]
  let cur: Look = { tint: m.tint, paint: m.paint, shape: m.shape, lid: m.lid, mouth: m.mouth, pose: m.pose, loop: m.loop, glow: m.glow, fx: m.fx }
  for (const [, patch] of (m.story ?? []).slice(0, n)) cur = { ...cur, ...patch, pose: patch.pose ? { ...cur.pose, ...patch.pose } : cur.pose }
  return cur
}

/** When each beat of a mood's story happens (ms after it starts). */
export const beatTimes = (mood: LumiMood) => (MOODS[mood].story ?? []).map(([at]) => at)
