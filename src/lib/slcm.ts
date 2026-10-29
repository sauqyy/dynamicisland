import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { IS_TAURI } from './useMedia'
import { classInName, subjectOf, type Course } from './scele'

/**
 * SLCM (slcm.ui.ac.id): UI's academic system, where the study plan holds each class's day, time
 * and room. The island opens SLCM's own study-plan schedule page in a window of its own; the user
 * signs in there as usual, and what that page loads (/course-plan/me/schedule and /classes) is
 * handed back (see slcm.rs). The island never sees the password or SLCM's tokens.
 */

/** One weekly meeting in the study plan. */
export interface SlcmClass {
  /** 0 = Sunday … 6 = Saturday */
  day: number
  start: string
  end: string
  course: string
  room: string
  /** "A", "B", … when SLCM names the parallel class */
  label: string
  code: string
}

export interface SlcmSchedule {
  classes: SlcmClass[]
  /** ms; when it was read from SLCM */
  at: number
}

/** What slcm.rs saved: the page's JSON responses as they came. */
interface Raw {
  schedule: unknown
  classes: unknown
  at: number
}

const time = (v: unknown) => {
  const m = String(v ?? '').match(/(\d{1,2})[.:](\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')
const pick = (o: Record<string, unknown>, ...keys: string[]) => keys.map((k) => text(o[k])).find(Boolean) ?? ''
const list = (v: unknown): Record<string, unknown>[] => {
  const d = v && typeof v === 'object' && 'data' in v ? (v as { data: unknown }).data : v
  return Array.isArray(d) ? d.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : []
}

/** SLCM numbers days from Monday (1) to Sunday (7). */
const dayOf = (code: unknown) => {
  const n = Number(code)
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n % 7 : -1
}

const LABEL = /\b(?:kelas|class|kls)\s*[-:]?\s*([A-Z]{1,2}\d?|\d{1,2})\b|[-–(]\s*([A-Z])\s*\)?\s*$/

export function parseSlcm(raw: Raw): SlcmSchedule {
  // the class list can say which parallel class each course is, when the schedule doesn't
  const labels = new Map<string, string>()
  for (const c of list(raw.classes)) {
    const name = pick(c, 'course_name', 'coursename', 'nama_matkul', 'name')
    const cls = pick(c, 'class_name', 'classname', 'nama_kelas')
    if (name && cls) labels.set(name.toLowerCase(), cls)
  }
  const classes: SlcmClass[] = []
  for (const e of list(raw.schedule)) {
    const day = dayOf(e.day_code ?? e.day)
    const start = time(e.start_time ?? e.start)
    const course = pick(e, 'course_name', 'coursename', 'name')
    if (day < 0 || !start || !course) continue
    const cls = pick(e, 'class_name', 'classname') || labels.get(course.toLowerCase()) || ''
    const m = `${cls} ${course}`.match(LABEL)
    classes.push({
      day,
      start,
      end: time(e.end_time ?? e.end) || start,
      course: course.replace(/\s*[-–]\s*(?:kelas|class)?\s*[A-Z]$/i, ''),
      room: pick(e, 'room', 'room_name', 'ruang'),
      label: (m?.[1] ?? m?.[2] ?? '').toUpperCase(),
      code: pick(e, 'course_code', 'coursecode', 'kode'),
    })
  }
  return { classes, at: raw.at }
}

// ---------- matching SLCM's course names to SCELE's ----------

/** SLCM may name a course in Indonesian where SCELE uses English (the international classes). */
const ID_EN: Record<string, string> = {
  statistika: 'statistics', statistik: 'statistics', probabilitas: 'probability', peluang: 'probability',
  basis: 'database', data: 'data', kalkulus: 'calculus', pemrograman: 'programming', berbasis: 'based',
  platform: 'platform', sistem: 'systems', operasi: 'operating', struktur: 'structures', algoritma: 'algorithms',
  matematika: 'mathematics', diskret: 'discrete', diskrit: 'discrete', jaringan: 'networks', komputer: 'computer',
  rekayasa: 'engineering', perangkat: 'software', lunak: 'software', keras: 'hardware', kecerdasan: 'intelligence',
  buatan: 'artificial', informasi: 'information', manajemen: 'management', proyek: 'project', keamanan: 'security',
  aljabar: 'algebra', linier: 'linear', linear: 'linear', analisis: 'analysis', desain: 'design', perancangan: 'design',
  interaksi: 'interaction', manusia: 'human', grafika: 'graphics', organisasi: 'organization', arsitektur: 'architecture',
  teori: 'theory', bahasa: 'languages', formal: 'formal', otomata: 'automata', lanjut: 'advanced', dasar: 'foundations',
  etika: 'ethics', profesional: 'professional', kewarganegaraan: 'civics', agama: 'religion',
  inggris: 'english', akademik: 'academic', penulisan: 'writing', ilmiah: 'scientific', metodologi: 'methodology',
  penelitian: 'research', komputasi: 'computing', paralel: 'parallel', terdistribusi: 'distributed', awan: 'cloud',
  bergerak: 'mobile', web: 'web', pembelajaran: 'learning', mesin: 'machine', penambangan: 'mining', visi: 'vision',
  pengolahan: 'processing', citra: 'image', sinyal: 'signal', fisika: 'physics', kimia: 'chemistry', biologi: 'biology',
  ekonomi: 'economics', bisnis: 'business', kewirausahaan: 'entrepreneurship',
  pemodelan: 'modeling', simulasi: 'simulation', numerik: 'numerical', metode: 'methods', riset: 'research',
}
const NOISE = new Set(['dan', 'and', 'of', 'the', 'untuk', 'for', 'di', 'in', 'kelas', 'class', 'ki', 'kki', 'intl', 'international', 'internasional', 'reguler', 'regular'])

/** A course name as comparable words: English, singular, without class labels and terms. */
function words(name: string): Set<string> {
  const out = new Set<string>()
  const plain = subjectOf({ full: name, short: name } as Course)
    .toLowerCase()
    .replace(/&/g, ' and ')
  for (let w of plain.match(/\p{L}+\d*/gu) ?? []) {
    if (NOISE.has(w)) continue
    w = ID_EN[w] ?? w
    out.add(w.replace(/(?:ies)$/, 'y').replace(/s$/, ''))
  }
  // roman numerals and numbers keep "Calculus 1" apart from "Calculus 2"
  for (const n of name.match(/\b(?:[1-4]|i{1,3}|iv)\b/gi) ?? []) out.add(`#${{ i: 1, ii: 2, iii: 3, iv: 4 }[n.toLowerCase()] ?? n}`)
  return out
}

/** How alike two course names are, from 0 to 1. */
function likeness(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return 0
  // a number on both sides that differs is a different course
  const na = [...wa].filter((w) => w.startsWith('#'))
  const nb = [...wb].filter((w) => w.startsWith('#'))
  if (na.length && nb.length && !na.some((x) => nb.includes(x))) return 0
  const shared = [...wa].filter((w) => wb.has(w)).length
  return (2 * shared) / (wa.size + wb.size)
}

/**
 * The SCELE courses an SLCM class is for: those with the closest name, if close enough. Several
 * when they tie (one subject enrolled twice); the class's label ("A") picks between them if it can.
 */
export function matchCourses(cls: SlcmClass, courses: Course[]): Course[] {
  const scored = courses.map((c) => ({ c, score: Math.max(likeness(cls.course, c.full), likeness(cls.course, c.short)) })).filter((x) => x.score >= 0.6)
  const top = Math.max(0, ...scored.map((x) => x.score))
  const best = scored.filter((x) => x.score === top).map((x) => x.c)
  const labelled = cls.label ? best.filter((c) => classInName(c) === cls.label) : []
  return labelled.length === 1 ? labelled : best
}

// ---------- the window ----------

export async function slcmSaved(): Promise<SlcmSchedule | null> {
  if (!IS_TAURI) return null
  const raw = await invoke<Raw | null>('slcm_saved').catch(() => null)
  return raw ? parseSlcm(raw) : null
}

/**
 * How far reading SLCM has got: its slow site loading, signing in to UI's login, the window waiting
 * for the user, or (trying the saved session) UI's login wanting a password after all.
 */
export type SlcmStage = 'loading' | 'signing-in' | 'needs-you' | 'needs-password'

/** The browser demo: whether UI's login still has a session (it does until "Disconnect everything"). */
let demoSession = true
export const demoForgetSlcmSession = () => {
  demoSession = false
}

/**
 * Opens SLCM in a hidden window and, with the SSO UI password, signs in for the user (the password
 * is used once, on UI's login page, and not kept). Without one, `quiet` tries UI's saved login
 * session and resolves 'needs-password' if it has run out. Otherwise resolves with the schedule
 * once SLCM's page has loaded it, or null if the window is closed first. `onStage` follows it.
 */
export function slcmConnect(password: string | null, onStage: (s: SlcmStage) => void = () => {}, quiet = false): Promise<SlcmSchedule | null | 'needs-password'> {
  if (!IS_TAURI) {
    onStage('loading')
    return new Promise((done) => {
      if (quiet && !password && !demoSession) {
        setTimeout(() => (onStage('needs-password'), done('needs-password')), 700)
        return
      }
      if (password) demoSession = true
      setTimeout(() => onStage('signing-in'), 500)
      setTimeout(() => done(parseSlcm(DEMO_SLCM)), 1200)
    })
  }
  return new Promise((done, fail) => {
    const off: (() => void)[] = []
    let wanted = false
    const finish = (v: SlcmSchedule | null | 'needs-password') => {
      off.forEach((f) => f())
      done(v)
    }
    Promise.all([
      listen<Raw>('slcm', (e) => finish(parseSlcm(e.payload))),
      listen('slcm-closed', () => finish(wanted ? 'needs-password' : null)),
      listen<SlcmStage>('slcm-status', (e) => {
        if (e.payload === 'needs-password') wanted = true
        onStage(e.payload)
      }),
    ])
      .then((fns) => {
        off.push(...fns)
        return invoke('slcm_open', { password, quiet })
      })
      .catch((e) => {
        off.forEach((f) => f())
        fail(e)
      })
  })
}

/** Shows the SLCM window, to see what it's doing or finish signing in there. */
export const slcmShow = () => (IS_TAURI ? invoke('slcm_show') : Promise.resolve())
/** Closes the SLCM window, giving up on this reading. */
export const slcmCancel = () => (IS_TAURI ? invoke('slcm_cancel') : Promise.resolve())
export const slcmForget = () => (IS_TAURI ? invoke('slcm_forget') : Promise.resolve())

/** The demo's study plan (browser preview): times for the course whose timeline gives none. */
const DEMO_SLCM: Raw = {
  at: Date.now(),
  schedule: {
    data: [
      { day_code: 4, start_time: '08.00', end_time: '10.30', course_name: 'Statistika dan Probabilitas', room: '2.2301' },
      { day_code: 2, start_time: '13.00', end_time: '14.40', course_name: 'Pemrograman Berbasis Platform', room: 'A2.2305' },
      { day_code: 4, start_time: '13.00', end_time: '14.40', course_name: 'Pemrograman Berbasis Platform', room: 'A2.2305' },
    ],
  },
  classes: { data: [] },
}
