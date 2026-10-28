import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

/** SCELE: Fasilkom UI's Moodle. Rust holds the token and makes the calls (see scele.rs). */
export const SCELE_URL = 'https://scele.cs.ui.ac.id'

export interface SceleAccount {
  userid: number
  fullname: string
  username: string
}

export interface Course {
  id: number
  short: string
  full: string
  /** ms; 0 when SCELE has none */
  start: number
  end: number
  url: string
  /** plain text of the course summary, where schedules are sometimes written */
  summary: string
}

export interface Deadline {
  id: number
  name: string
  courseId: number
  course: string
  /** ms */
  due: number
  url: string
  /** 'assign', 'quiz', … */
  module: string
  overdue: boolean
}

export interface Notice {
  id: number
  subject: string
  text: string
  /** ms */
  time: number
  read: boolean
  url: string
}

export interface Section {
  num: number
  name: string
  summary: string
  modules: { id: number; name: string; mod: string; url: string }[]
}

/** One weekly meeting of a course: found on its SCELE page, or added by the user. */
export interface ClassSlot {
  id: string
  courseId: number
  /** 0 = Sunday … 6 = Saturday */
  day: number
  /** "08:00" */
  start: string
  end: string
  room: string
  /** read from the course page rather than added by hand */
  auto?: boolean
}

/** Same course, day and start time: the same meeting. */
export const slotKey = (s: Pick<ClassSlot, 'courseId' | 'day' | 'start'>) => `${s.courseId}-${s.day}-${s.start}`

const DAY = 86_400_000

/** Plain text from the HTML SCELE sends in summaries and messages. */
export function htmlText(html: string | null | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function call<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('scele_call', { function: fn, params })
}

export const sceleAccount = () => (IS_TAURI ? invoke<SceleAccount | null>('scele_account') : Promise.resolve(DEMO_ACCOUNT))
/** Connects the SSO-verified account; Rust supplies the username. */
export const sceleLogin = (password: string) => (IS_TAURI ? invoke<SceleAccount>('scele_login', { password }) : Promise.resolve(DEMO_ACCOUNT))
export const sceleLogout = () => (IS_TAURI ? invoke('scele_logout') : Promise.resolve())

/** Courses of the current period. */
export async function fetchCourses(userid: number): Promise<Course[]> {
  if (!IS_TAURI) return DEMO_COURSES
  type Raw = { id: number; shortname: string; fullname: string; startdate?: number; enddate?: number; viewurl?: string; summary?: string; hidden?: boolean }
  let raw: Raw[]
  try {
    raw = (await call<{ courses: Raw[] }>('core_course_get_enrolled_courses_by_timeline_classification', { classification: 'inprogress' })).courses
  } catch (e) {
    if (e === 'signed-out') throw e
    // older Moodle or the function is switched off: take every course that is running now
    const now = Date.now() / 1000
    raw = (await call<Raw[]>('core_enrol_get_users_courses', { userid })).filter(
      (c) => !c.hidden && (c.startdate ?? 0) <= now && (!c.enddate || c.enddate >= now),
    )
  }
  return raw.map((c) => ({
    id: c.id,
    short: htmlText(c.shortname),
    full: htmlText(c.fullname),
    start: (c.startdate ?? 0) * 1000,
    end: (c.enddate ?? 0) * 1000,
    url: c.viewurl ?? `${SCELE_URL}/course/view.php?id=${c.id}`,
    summary: htmlText(c.summary),
  }))
}

/** Assignments, quizzes and other dated activities still to do, from an hour ago to `days` ahead. */
export async function fetchDeadlines(days = 14): Promise<Deadline[]> {
  if (!IS_TAURI) return demoDeadlines()
  const now = Math.floor(Date.now() / 1000)
  type Raw = {
    id: number
    name: string
    activityname?: string
    timesort: number
    url: string
    modulename?: string
    overdue?: boolean
    course?: { id: number; shortname: string; fullname: string }
  }
  const r = await call<{ events: Raw[] }>('core_calendar_get_action_events_by_timesort', {
    timesortfrom: now - 3600,
    timesortto: now + days * 86_400,
    limitnum: 50,
  })
  return r.events.map((e) => ({
    id: e.id,
    name: htmlText(e.activityname || e.name),
    courseId: e.course?.id ?? 0,
    course: htmlText(e.course?.shortname ?? ''),
    due: e.timesort * 1000,
    url: e.url,
    module: e.modulename ?? '',
    overdue: Boolean(e.overdue),
  }))
}

/** Recent notifications: announcements, forum posts, grading, … */
export async function fetchNotices(userid: number): Promise<Notice[]> {
  if (!IS_TAURI) return demoNotices()
  type Raw = { id: number; subject: string; smallmessage?: string; fullmessage?: string; timecreated: number; read: boolean; contexturl?: string }
  const r = await call<{ notifications: Raw[] }>('message_popup_get_popup_notifications', {
    useridto: userid,
    newestfirst: 1,
    limit: 25,
    offset: 0,
  })
  return r.notifications.map((n) => ({
    id: n.id,
    subject: htmlText(n.subject),
    text: htmlText(n.smallmessage || n.fullmessage),
    time: n.timecreated * 1000,
    read: n.read,
    url: n.contexturl || `${SCELE_URL}/message/output/popup/notifications.php`,
  }))
}

/** A course's outline: its sections and the activities and files in each. */
export async function fetchContents(courseId: number): Promise<Section[]> {
  if (!IS_TAURI) return DEMO_CONTENTS[courseId] ?? []
  type Raw = { section: number; name: string; summary?: string; modules?: { id: number; name: string; modname: string; url?: string; visible?: number }[] }
  const r = await call<Raw[]>('core_course_get_contents', { courseid: courseId })
  return r.map((s) => ({
    num: s.section,
    name: htmlText(s.name),
    summary: htmlText(s.summary),
    modules: (s.modules ?? [])
      .filter((m) => m.visible !== 0 && m.modname !== 'label')
      .map((m) => ({ id: m.id, name: htmlText(m.name), mod: m.modname, url: m.url ?? `${SCELE_URL}/mod/${m.modname}/view.php?id=${m.id}` })),
  }))
}

export function openScele(url: string) {
  if (IS_TAURI) invoke('open_url', { url }).catch(() => {})
  else window.open(url, '_blank')
}

// ---------- reading the course page ----------

const MONTHS: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agt: 7, agustus: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, oct: 9, october: 9,
  nov: 10, november: 10,
  des: 11, desember: 11, dec: 11, december: 11,
}
const month = (w: string | undefined) => (w ? MONTHS[w.toLowerCase().replace(/\.$/, '')] : undefined)

/** A date range written in a section name, e.g. "16 September - 22 September" or "Week 3 (16 - 22 Sep)". */
function sectionRange(name: string, year: number): [number, number] | null {
  const m = name.match(/(\d{1,2})\s*([A-Za-z]{3,9}\.?)?\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9}\.?)/)
  if (!m) return null
  const m2 = month(m[4])
  const m1 = month(m[2]) ?? m2
  if (m1 === undefined || m2 === undefined) return null
  const from = new Date(year, m1, Number(m[1])).getTime()
  // a range that crosses New Year ends in the next one
  const to = new Date(m2 < m1 ? year + 1 : year, m2, Number(m[3])).getTime() + DAY
  return [from, to]
}

export interface Topic {
  section: Section
  /** how the section was matched, shown so the user can judge it */
  source: 'dated' | 'week'
}

/**
 * The section of the course outline that a meeting on `date` belongs to. Only what SCELE itself says
 * is used: a section whose name carries that date, or else the "Week N" section counted from the
 * course's start date. Returns null rather than guessing further.
 */
export function topicFor(course: Course, sections: Section[], date: number): Topic | null {
  const year = new Date(course.start || date).getFullYear()
  for (const s of sections) {
    for (const y of [year, year + 1]) {
      const r = sectionRange(s.name, y)
      if (r && date >= r[0] && date < r[1]) return { section: s, source: 'dated' }
    }
  }
  if (!course.start || date < course.start) return null
  const week = Math.floor((date - course.start) / (7 * DAY)) + 1
  const s = sections.find((x) => Number(x.name.match(/\b(?:week|minggu|pekan|pertemuan|sesi|session|topic|topik)\s*(?:ke-?\s*)?(\d{1,2})\b/i)?.[1]) === week)
  return s ? { section: s, source: 'week' } : null
}

const DAYS: Record<string, number> = {
  minggu: 0, ahad: 0, sunday: 0,
  senin: 1, monday: 1,
  selasa: 2, tuesday: 2,
  rabu: 3, wednesday: 3,
  kamis: 4, thursday: 4,
  jumat: 5, "jum'at": 5, friday: 5,
  sabtu: 6, saturday: 6,
}
export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`

/** Meeting times one parallel class ("Kelas A") of a course has; label '' when the page names none. */
export interface Detected {
  label: string
  slots: Omit<ClassSlot, 'id'>[]
}

/**
 * Meeting times written on the course page ("Kelas A: Senin, 08.00 - 09.40, 2.2304"), grouped by
 * the parallel class they are listed under, since a page often lists every class's times.
 */
export function detectSlots(course: Course, sections: Section[]): Detected[] {
  const text = [course.summary, ...sections.slice(0, 2).map((s) => s.summary)].join(' \n ')
  const re = /\b(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|ahad|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[,\s]*(?:pukul\s*)?(\d{1,2})[.:](\d{2})\s*(?:-|–|s\.?d\.?|sampai)\s*(\d{1,2})[.:](\d{2})(?:\s*(?:WIB)?[,\s]*(?:(?:ruang|room|di)\s*)?([A-Z]?\d\.\d{3,4}|[A-Z]\d{3,4}))?/gi
  // "Kelas A", "Class B", "KELAS 2": case-sensitive so "kelas di …" is not a class named "di"
  const markers = [...text.matchAll(/\b(?:[Kk]elas|KELAS|[Cc]lass|CLASS|[Kk]ls)\s+([A-Z]{1,2}\d?|\d{1,2})\b/g)].map((m) => ({ at: m.index, label: m[1] }))
  const out: Detected[] = []
  for (const m of text.matchAll(re)) {
    const label = markers.filter((k) => k.at < m.index).at(-1)?.label ?? ''
    const slot = { courseId: course.id, day: DAYS[m[1].toLowerCase()], start: pad(m[2], m[3]), end: pad(m[4], m[5]), room: m[6] ?? '' }
    let group = out.find((g) => g.label === label)
    if (!group) out.push((group = { label, slots: [] }))
    if (!group.slots.some((s) => s.day === slot.day && s.start === slot.start)) group.slots.push(slot)
  }
  return out
}

/** The listed class that one of the user's SCELE groups names ("Kelas A", "PPW - A"), if exactly one does. */
export function classFromGroups(labels: string[], groups: string[]): string | null {
  const hits = labels.filter((l) => groups.some((g) => new RegExp(`(^|[^A-Za-z0-9])${l}$`).test(g.trim()) || g.toUpperCase().includes(`KELAS ${l}`)))
  return hits.length === 1 ? hits[0] : null
}

/**
 * The subject a course is for, without the programme, classes and term SCELE puts in its name:
 * "[Reg] Sistem Operasi (A,B,C) Gasal 2026/2027" → "sistem operasi". Two enrolled courses with the
 * same subject usually mean an enrolment mistake.
 */
export function subjectOf(c: Course): string {
  return c.full
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/\((?:\s*[A-Z]{1,2}\d?\s*,?)+\)/g, '')
    .replace(/\b(?:[Kk]elas|KELAS|[Cc]lass|[Kk]ls)\s+[A-Z]{1,2}\d?\b/g, '')
    .replace(/\b(?:gasal|genap|ganjil|pendek)\b/gi, '')
    .replace(/\d{4}\s*[/-]\s*\d{4}/g, '')
    .replace(/[^\p{L}\p{N}&]+/gu, ' ')
    .trim()
    .toLowerCase()
}

/** Names of the course groups the user is in. */
export async function fetchMyGroups(courseId: number, userid: number): Promise<string[]> {
  if (!IS_TAURI) return DEMO_GROUPS[courseId] ?? []
  const r = await call<{ groups: { name: string }[] }>('core_group_get_course_user_groups', { courseid: courseId, userid })
  return r.groups.map((g) => htmlText(g.name))
}

/** Files that look like the course's syllabus (RPS), for checking the topic by hand. */
export function syllabusLinks(sections: Section[]) {
  return sections
    .flatMap((s) => s.modules)
    .filter((m) => /\b(rps|silabus|syllabus|sap|course outline|kontrak kuliah|rencana pembelajaran)\b/i.test(m.name))
    .slice(0, 3)
}

/** When a slot next starts, from `now` (today's if it has not ended yet). */
export function nextMeeting(slot: ClassSlot, now: number): { start: number; end: number } {
  const [sh, sm] = slot.start.split(':').map(Number)
  const [eh, em] = slot.end.split(':').map(Number)
  const d = new Date(now)
  const ahead = (slot.day - d.getDay() + 7) % 7
  const at = (h: number, m: number, plus: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus, h, m).getTime()
  let start = at(sh, sm, ahead)
  let end = at(eh, em, ahead)
  if (end <= now) {
    start = at(sh, sm, ahead + 7)
    end = at(eh, em, ahead + 7)
  }
  return { start, end }
}

/** "in 3h 20m", "in 2 days", "2h ago" */
export function relTime(t: number, now: number): string {
  const diff = t - now
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60_000)
  let s: string
  if (min < 60) s = `${Math.max(1, min)}m`
  else if (min < 24 * 60) s = `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`
  else s = `${Math.round(min / 1440)} day${Math.round(min / 1440) > 1 ? 's' : ''}`
  return diff >= 0 ? `in ${s}` : `${s} ago`
}

// ---------- browser demo ----------

const DEMO_ACCOUNT: SceleAccount = { userid: 1, fullname: 'Demo Mahasiswa', username: 'demo.mahasiswa' }
const now0 = Date.now()
const termStart = now0 - 8 * 7 * DAY
// named the way SCELE names them; PPW is enrolled twice to show the "which one is your class" question
const DEMO_COURSES: Course[] = [
  { id: 101, short: 'PPW', full: '[Reg] Perancangan & Pemrograman Web (A) Gasal 2026/2027', start: termStart, end: now0 + 8 * 7 * DAY, url: SCELE_URL, summary: 'Senin, 08.00 - 09.40, Ruang 2.2304 · Rabu 08.00 - 09.40' },
  { id: 104, short: 'PPW-KI', full: '[Int] Perancangan & Pemrograman Web (A) Gasal 2026/2027', start: termStart, end: now0 + 8 * 7 * DAY, url: SCELE_URL, summary: 'Tuesday 10:00 - 11:40, Room 2.2402' },
  { id: 102, short: 'SDA', full: '[Reg] Struktur Data & Algoritma (A) Gasal 2026/2027', start: termStart, end: now0 + 8 * 7 * DAY, url: SCELE_URL, summary: 'Jadwal: Selasa, 13.00 - 14.40 dan Jumat 13.00 - 14.40, Ruang 3.3101' },
  { id: 103, short: 'SO', full: '[Reg] Sistem Operasi (A,B,C) Gasal 2026/2027', start: termStart, end: now0 + 8 * 7 * DAY, url: SCELE_URL, summary: 'Kelas A: Senin 10.00 - 11.40 · Kelas B: Kamis 08.00 - 09.40, Ruang 2.2301 · Kelas C: Jumat 15.00 - 16.40' },
]
const DEMO_GROUPS: Record<number, string[]> = { 103: ['Kelas B'] }
const week = Math.floor((now0 - termStart) / (7 * DAY)) + 1
const DEMO_CONTENTS: Record<number, Section[]> = {
  101: [
    { num: 0, name: 'General', summary: 'Kontrak kuliah dan RPS ada di bawah.', modules: [{ id: 1, name: 'RPS PPW 2026', mod: 'resource', url: SCELE_URL }] },
    { num: week, name: `Week ${week}: React Hooks & State`, summary: 'useState, useEffect, custom hooks.', modules: [{ id: 2, name: `Slides Week ${week}`, mod: 'resource', url: SCELE_URL }, { id: 3, name: 'Lab 8: Todo app', mod: 'assign', url: SCELE_URL }] },
  ],
  102: [{ num: week, name: `Minggu ${week} - AVL Tree`, summary: 'Rotasi dan balancing.', modules: [{ id: 4, name: 'Slide AVL', mod: 'resource', url: SCELE_URL }] }],
  103: [],
}
function demoDeadlines(): Deadline[] {
  const n = Date.now()
  return [
    { id: 1, name: 'Lab 8: Todo app', courseId: 101, course: 'PPW', due: n + 2.5 * 3600_000, url: SCELE_URL, module: 'assign', overdue: false },
    { id: 2, name: 'Quiz 3', courseId: 103, course: 'OS', due: n + 26 * 3600_000, url: SCELE_URL, module: 'quiz', overdue: false },
    { id: 3, name: 'Tugas Pemrograman 2', courseId: 102, course: 'SDA', due: n + 4 * DAY, url: SCELE_URL, module: 'assign', overdue: false },
  ]
}
function demoNotices(): Notice[] {
  const n = Date.now()
  return [
    { id: 11, subject: 'PPW: Pengumuman perubahan deadline Lab 8', text: 'Deadline Lab 8 diundur ke Jumat 23.55.', time: n - 40 * 60_000, read: false, url: SCELE_URL },
    { id: 10, subject: 'SDA: Nilai TP1 sudah keluar', text: 'Silakan cek gradebook.', time: n - 5 * 3600_000, read: true, url: SCELE_URL },
  ]
}
