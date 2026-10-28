import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import { documentLines, htmlLines, READABLE, type Window } from './timeline'

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
  modules: SceleModule[]
}

/** An activity or resource on a course page; labels are kept for their text. */
export interface SceleModule {
  id: number
  name: string
  /** 'resource', 'page', 'label', 'assign', … */
  mod: string
  url: string
  /** text of its description (a label's whole content), one line per row or paragraph */
  text?: string
  files?: { name: string; url: string; mime: string; modified: number; size: number }[]
  /** web addresses it points to (a URL activity), e.g. a Google Sheet with the timeline */
  links?: string[]
}

/** One weekly meeting of a course: found on its SCELE page, or added by the user. */
export interface ClassSlot {
  id: string
  courseId: number
  /** 0 = Sunday … 6 = Saturday */
  day: number
  /** "08:00"; '' when the class day is known but its time is not listed */
  start: string
  end: string
  room: string
  /** read from the course page rather than added by hand */
  auto?: boolean
  /** where a found meeting was read: the course page, a syllabus, or the course timeline's dates */
  source?: 'page' | 'syllabus' | 'timeline'
  /** a course the user teaches (a TA) rather than takes */
  teaching?: boolean
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
    summary: htmlLines(c.summary),
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
  type Raw = {
    section: number
    name: string
    summary?: string
    modules?: {
      id: number
      name: string
      modname: string
      url?: string
      visible?: number
      description?: string
      contents?: { type: string; filename: string; fileurl?: string; mimetype?: string; timemodified?: number; filesize?: number }[]
    }[]
  }
  const r = await call<Raw[]>('core_course_get_contents', { courseid: courseId })
  return r.map((s) => ({
    num: s.section,
    name: htmlText(s.name),
    summary: htmlLines(s.summary),
    modules: (s.modules ?? [])
      .filter((m) => m.visible !== 0)
      .map((m) => ({
        id: m.id,
        name: htmlText(m.name),
        mod: m.modname,
        url: m.url ?? `${SCELE_URL}/mod/${m.modname}/view.php?id=${m.id}`,
        text: htmlLines(m.description),
        files: (m.contents ?? [])
          .filter((f) => f.type === 'file' && f.fileurl)
          .map((f) => ({ name: f.filename, url: f.fileurl!, mime: f.mimetype ?? '', modified: f.timemodified ?? 0, size: f.filesize ?? 0 })),
        links: (m.contents ?? []).filter((f) => f.type === 'url' && f.fileurl).map((f) => f.fileurl!),
      })),
  }))
}

/** Activities and files a student would open: everything but labels. */
export const materials = (sections: Section[]) => sections.flatMap((s) => s.modules).filter((m) => m.mod !== 'label')

// ---------- terms and roles ----------

/** A term, ordered: Odd (Gasal) of 2026/2027 is 2026·3, Even (Genap) is +1, a short term +2. */
export function termOf(c: Course): number | null {
  const name = c.full
  const kind = (w: string) => (/^(odd|gasal|ganjil)$/i.test(w) ? 0 : /^(even|genap)$/i.test(w) ? 1 : 2)
  // "Odd 2026/2027", "Gasal 2026/2027", "Genap - 2025/2026"
  let m = name.match(/\b(odd|even|gasal|genap|ganjil|short|pendek|antara)\b\s*[-–]?\s*(\d{4})\s*[/-]\s*\d{4}/i)
  if (m) return Number(m[2]) * 3 + kind(m[1])
  // "2026-2027 Gasal", "2026/2027 Odd"
  m = name.match(/(\d{4})\s*[/-]\s*\d{4}\s*[-–]?\s*\b(odd|even|gasal|genap|ganjil|short|pendek|antara)\b/i)
  if (m) return Number(m[1]) * 3 + kind(m[2])
  return null
}

/** The term running on a date: Odd from August to January, Even from February to June, short in July. */
export function termAt(date: number): number {
  const d = new Date(date)
  const y = d.getFullYear()
  const mo = d.getMonth()
  if (mo >= 7) return y * 3
  if (mo === 0) return (y - 1) * 3
  if (mo <= 5) return (y - 1) * 3 + 1
  return (y - 1) * 3 + 2
}

/**
 * The courses of the current term. SCELE keeps old courses "in progress" when they have no end date,
 * so the term written in the name decides: the term running now, or else the latest one among the
 * user's courses. A course whose name has no term stays in.
 */
export function currentTerm(courses: Course[], now = Date.now()) {
  const terms = courses.map(termOf).filter((t): t is number => t !== null)
  if (!terms.length) return { current: courses, earlier: [] as Course[] }
  const want = terms.includes(termAt(now)) ? termAt(now) : Math.max(...terms)
  const inTerm = (c: Course) => {
    const t = termOf(c)
    return t === null || t === want
  }
  return { current: courses.filter(inTerm), earlier: courses.filter((c) => !inTerm(c)) }
}

/** The user's role names in a course ('student', 'teacher', 'editingteacher', …). */
export async function fetchMyRoles(courseId: number, userid: number): Promise<string[]> {
  if (!IS_TAURI) return DEMO_ROLES[courseId] ?? ['student']
  const r = await call<{ roles?: { shortname: string }[] }[]>('core_user_get_course_user_profiles', { userlist: [{ userid, courseid: courseId }] })
  return (r[0]?.roles ?? []).map((x) => x.shortname)
}

/** Teaching rather than taking the course: any role in it, and none of them student. */
export const isTeachingRole = (roles: string[]) => roles.length > 0 && !roles.includes('student')

// ---------- reading the course's documents ----------

/** Names of what holds a course's schedule: its timeline, syllabus (RPS), outline or overview. */
const TIMELINE_RE = /\b(time\s?line|jadwal|schedule|rps|silabus|syllabus|sap|course outline|course overview|overview|course info|informasi|kontrak|rencana|lesson plan|kalender|calendar|tentative|agenda|outline)\b/i
/** Google documents a course can link to as its timeline (see web_doc in scele.rs). */
const GOOGLE_DOC = /^https:\/\/(docs\.google\.com\/(spreadsheets|document|presentation)\/|drive\.google\.com\/)/
/** Sections that hold a course's general information. */
const INFO_SECTION = /\b(general|umum|info|informasi|overview|course|pengantar|introduction|perkuliahan|silabus|syllabus)\b/i

/** A document to read for a course's timeline: a file on its SCELE page, or a link it points to. */
export interface DocRef {
  /** what it is cached under: the file and its version, or the link */
  key: string
  name: string
  url: string
  kind: 'file' | 'link'
  /** 1: named like a timeline or syllabus; 2: one of the general section's other documents */
  tier: 1 | 2
  size: number
  mime: string
}

/**
 * The documents worth reading for a course's timeline, most likely first: anything named like a
 * timeline, schedule, syllabus or overview (its files, or the Google Sheet/Doc/Slides/Drive file it
 * links to), then the other readable documents of the course's general section.
 */
export function docCandidates(sections: Section[]): DocRef[] {
  const out: DocRef[] = []
  const seen = new Set<string>()
  const add = (r: DocRef) => {
    if (!seen.has(r.url)) {
      seen.add(r.url)
      out.push(r)
    }
  }
  const mods = sections.flatMap((s) => s.modules.map((m) => ({ m, info: s.num === 0 || INFO_SECTION.test(s.name) })))
  for (const { m } of mods) {
    if (m.mod === 'label') continue
    const named = TIMELINE_RE.test(m.name)
    for (const f of m.files ?? []) {
      if (!READABLE.test(f.name)) continue
      if (named || TIMELINE_RE.test(f.name)) {
        add({ key: `${f.url}@${f.modified}`, name: m.name === f.name ? f.name : `${m.name} · ${f.name}`, url: f.url, kind: 'file', tier: 1, size: f.size, mime: f.mime })
      }
    }
    if (named) for (const l of m.links ?? []) if (GOOGLE_DOC.test(l)) add({ key: `link:${l}`, name: m.name, url: l, kind: 'link', tier: 1, size: 0, mime: '' })
  }
  for (const { m, info } of mods) {
    if (!info || m.mod === 'label') continue
    for (const f of m.files ?? []) if (READABLE.test(f.name)) add({ key: `${f.url}@${f.modified}`, name: m.name, url: f.url, kind: 'file', tier: 2, size: f.size, mime: f.mime })
    for (const l of m.links ?? []) if (GOOGLE_DOC.test(l)) add({ key: `link:${l}`, name: m.name, url: l, kind: 'link', tier: 2, size: 0, mime: '' })
  }
  return out
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/**
 * A document's text, one row per line: SCELE files through Rust with the token, links through
 * web_doc. Rejects with 'signin' for a link that isn't shared publicly.
 */
export async function readDoc(ref: DocRef): Promise<string> {
  if (!IS_TAURI) {
    if (DEMO_DOCS[ref.url] === 'signin') throw 'signin'
    return DEMO_DOCS[ref.url] ?? ''
  }
  if (ref.kind === 'link') {
    const doc = await invoke<{ mime: string; name: string; data: string }>('web_doc', { url: ref.url })
    return documentLines(fromBase64(doc.data), doc.name, doc.mime)
  }
  const file = decodeURIComponent(ref.url.split('?')[0].split('/').pop() ?? ref.name)
  return documentLines(fromBase64(await invoke<string>('scele_file', { url: ref.url })), file, ref.mime)
}

/**
 * The days a course's timeline can be about: its term (Odd runs August to January, Even February
 * to July), else around its start date, so revision dates and references in a document are ignored.
 */
export function termWindow(c: Course): Window {
  const t = termOf(c)
  if (t !== null) {
    const y = Math.floor(t / 3)
    const kind = t % 3
    if (kind === 0) return [new Date(y, 6, 15).getTime(), new Date(y + 1, 1, 15).getTime()]
    if (kind === 1) return [new Date(y + 1, 0, 15).getTime(), new Date(y + 1, 6, 31).getTime()]
    return [new Date(y + 1, 5, 1).getTime(), new Date(y + 1, 8, 30).getTime()]
  }
  const base = c.start || Date.now()
  return [base - 30 * DAY, base + 220 * DAY]
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

const DAY_WORD = "senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|ahad|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
const SPAN = String.raw`(\d{1,2})[.:](\d{2})\s*(?:-|–|s\.?d\.?|sampai|to)\s*(\d{1,2})[.:](\d{2})`
/** a room after the time: ", Ruang 2.2304", " (Room 2.2303)", " R. 2.2301" */
const ROOM = String.raw`(?:\s*(?:WIB)?[,\s(]*(?:(?:ruang|room|di|r\.)\s*)?([A-Z]?\d\.\d{3,4}|[A-Z]\d{3,4}))?`
/** an exam or deadline line, whose times are not classes */
const NOT_CLASS = /\b(uts|uas|ujian|exam|kuis|quiz|deadline|tenggat|pengumpulan|asistensi|responsi|konsultasi|office hours?)\b/i

/** Where a course writes its class times: the summary, the first section, labels that talk about the schedule. */
export function scheduleText(course: Course, sections: Section[]): string {
  const first = sections.find((s) => s.num === 0)
  const labels = sections
    .flatMap((s) => s.modules)
    .filter((m) => m.mod === 'label' || m.mod === 'page')
    .map((m) => m.text ?? '')
    .filter((t) => /\b(jadwal|schedule|kuliah|kelas|class|lecture|pertemuan)\b/i.test(t))
  return [course.summary, first?.summary ?? '', ...(first?.modules.map((m) => m.text ?? '') ?? []), ...labels].join(' \n ')
}

/** The one class a course is for when its name says so: "[KI] Operating Systems (A) Odd 2026/2027" → "A". */
export function classInName(c: Course): string | null {
  const m = c.full.match(/\(\s*([A-Z]{1,2}\d?)\s*\)/)
  return m ? m[1] : null
}

/**
 * Meeting times written for the course ("Kelas A: Senin, 08.00 - 09.40, 2.2304"), grouped by the
 * parallel class they are listed under, since a page often lists every class's times. `extra` is
 * text from the course's files, such as its syllabus.
 */
export function detectSlots(course: Course, sections: Section[], extra: string[] = []): Detected[] {
  let text = [scheduleText(course, sections), ...extra].join(' \n ')
  // "Selasa & Kamis, 10.00 - 11.40" is two meetings at the same time
  const list = new RegExp(String.raw`\b(${DAY_WORD})((?:\s*(?:,|&|dan|and|/)\s*(?:${DAY_WORD}))+)\b[,:\s]*(?:pukul|jam|at)?\s*(${SPAN}${ROOM})`, 'gi')
  text = text.replace(list, (_all, d1: string, rest: string, span: string) =>
    [d1, ...rest.split(/\s*(?:,|&|dan|and|\/)\s*/).filter(Boolean)].map((d) => `${d} ${span}`).join(' ; '),
  )
  const re = new RegExp(String.raw`\b(${DAY_WORD})\b[,:\s]*(?:pukul\s*|jam\s*|at\s*)?${SPAN}${ROOM}`, 'gi')
  // "Kelas A", "Class B", "KELAS 2": case-sensitive so "kelas di …" is not a class named "di"
  const markers = [...text.matchAll(/\b(?:[Kk]elas|KELAS|[Cc]lass|CLASS|[Kk]ls)\s+([A-Z]{1,2}\d?|\d{1,2})\b/g)].map((m) => ({ at: m.index, label: m[1] }))
  const out: Detected[] = []
  for (const m of text.matchAll(re)) {
    if (NOT_CLASS.test(text.slice(Math.max(0, m.index - 60), m.index))) continue
    const label = markers.filter((k) => k.at < m.index).at(-1)?.label ?? ''
    const slot = { courseId: course.id, day: DAYS[m[1].toLowerCase()], start: pad(m[2], m[3]), end: pad(m[4], m[5]), room: m[6] ?? '' }
    if (slot.end <= slot.start) continue
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
    .replace(/\b(?:gasal|genap|ganjil|pendek|odd|even|short|term|semester)\b/gi, '')
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
  return materials(sections)
    .filter((m) => /\b(rps|silabus|syllabus|sap|course outline|kontrak kuliah|rencana pembelajaran)\b/i.test(m.name))
    .slice(0, 3)
}

/** A class whose time isn't listed is placed at 07:00–23:59 of its day: reminded in the morning. */
const UNTIMED = { start: '07:00', end: '23:59' }

/** When a slot next starts, from `now` (today's if it has not ended yet). */
export function nextMeeting(slot: ClassSlot, now: number): { start: number; end: number } {
  const [sh, sm] = (slot.start || UNTIMED.start).split(':').map(Number)
  const [eh, em] = (slot.end || UNTIMED.end).split(':').map(Number)
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

/** A slot's meeting on a given day, if it meets that weekday. */
export function meetingOn(slot: ClassSlot, day: number): { start: number; end: number } | null {
  const d = new Date(day)
  if (d.getDay() !== slot.day) return null
  const [sh, sm] = (slot.start || UNTIMED.start).split(':').map(Number)
  const [eh, em] = (slot.end || UNTIMED.end).split(':').map(Number)
  return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm).getTime(), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em).getTime() }
}

/** "10:00–11:40", or that the time isn't listed. */
export const slotTime = (s: Pick<ClassSlot, 'start' | 'end'>) => (s.start ? `${s.start}–${s.end}` : 'time not listed')

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
// Shaped like a real term, named the way SCELE names them, with dates around today: Platform-Based
// Development keeps its timeline in a linked Google Sheet, Operating Systems in a PDF "Tentative
// Timeline", Statistics writes its class times in an outline (its sheet needs a Google sign-in),
// the user TAs Calculus 1, Databases is enrolled twice, and last term's Calculus 2 is still listed.
const termNow = termAt(now0)
const T = `${['Odd', 'Even', 'Short'][termNow % 3]} ${Math.floor(termNow / 3)}/${Math.floor(termNow / 3) + 1}`
const monday0 = new Date(new Date(now0).getFullYear(), new Date(now0).getMonth(), new Date(now0).getDate() - ((new Date(now0).getDay() + 6) % 7) - 8 * 7).getTime()
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** "Tue, 3 Nov 2026" for weekday `day` of week `w` (1 = eight weeks ago) */
const on = (w: number, day: number) => {
  const d = new Date(monday0 + ((w - 1) * 7 + ((day + 6) % 7)) * DAY)
  return `${WD[d.getDay()]}, ${d.getDate()} ${MON_EN[d.getMonth()]} ${d.getFullYear()}`
}
const PBD_TOPICS = ['Course intro & web basics', 'HTML & CSS layout', 'JavaScript fundamentals', 'DOM & events', 'Django models', 'Django views & templates', 'Forms & validation', 'Midterm', 'React components', 'React Hooks & State', 'Fetching data & REST APIs', 'Authentication', 'Deployment & CI', 'Final project presentations']
const OS_TOPICS = ['Introduction to operating systems', 'Processes', 'Threads & concurrency', 'CPU scheduling', 'Synchronization', 'Deadlocks', 'Main memory', 'Midterm exam', 'Virtual memory', 'File systems', 'Mass storage', 'I/O systems', 'Protection & security', 'Review']

const PBD_SHEET = 'https://docs.google.com/spreadsheets/d/1uT6b3YYEd5AqSNn2lvbAJjgK4tdIN5lF6KUx7Y38M40/edit?gid=982244062#gid=982244062'
const SP_SHEET = 'https://docs.google.com/spreadsheets/d/1demoSignInOnlySheetXXXXXXXXXXXXXXX/edit'
const fileUrl = (name: string) => `${SCELE_URL}/webservice/pluginfile.php/demo/${name}`
const OS_PDF = fileUrl('Tentative-Timeline.pdf')
const SP_DOC = fileUrl('Course-Outline-SP.docx')

/** What each document says, as its rows come out of the readers. */
const DEMO_DOCS: Record<string, string> = {
  [PBD_SHEET]: [
    'Week | Date | Topic | Notes',
    ...PBD_TOPICS.flatMap((t, i) =>
      i === 4
        ? [`${i + 1} | ${on(i + 1, 2)} | No class - public holiday |`, `${i + 1} | ${on(i + 1, 4)} | ${t} | Lab 4`]
        : i === 7
          ? [`${i + 1} | ${on(i + 1, 4)} | UTS (Midterm exam) | 08.00 - 10.00`]
          : [`${i + 1} | ${on(i + 1, 2)} | ${t} |`, `${i + 1} | ${on(i + 1, 4)} | ${t} (lab) | Lab ${i + 1}`],
    ),
  ].join('\n'),
  [OS_PDF]: [
    'Operating Systems - Tentative Timeline',
    'Meeting | Day/Date | Time | Topic',
    ...OS_TOPICS.flatMap((t, i) => [`${i * 2 + 1} | ${on(i + 1, 1)} | 13.00 - 14.40 | ${t}`, `${i * 2 + 2} | ${on(i + 1, 3)} | 13.00 - 14.40 | ${t} (continued)`]),
  ].join('\n'),
  [SP_SHEET]: 'signin',
  [SP_DOC]: 'Statistics & Probability — Course Outline\nKelas A: Jumat 08.00 - 10.30 R. 2.2301\nKelas B: Jumat 13.00 - 15.30',
}

const DEMO_COURSES: Course[] = [
  { id: 101, short: 'PBD', full: `[KI] Platform-Based Development (A) ${T}`, start: monday0, end: 0, url: SCELE_URL, summary: '' },
  { id: 102, short: 'OS', full: `[KI] Operating Systems (A) ${T}`, start: monday0, end: 0, url: SCELE_URL, summary: '' },
  { id: 103, short: 'SP', full: `[KI] Statistics & Probability (A) ${T}`, start: monday0, end: 0, url: SCELE_URL, summary: '' },
  { id: 104, short: 'Calc1', full: `[KI] Calculus 1 (A) ${T}`, start: monday0, end: 0, url: SCELE_URL, summary: 'Lecture: Wednesday 08:00 - 09:40, Room 2.2301' },
  { id: 105, short: 'DB', full: `[KI] Databases (A) ${T}`, start: monday0, end: 0, url: SCELE_URL, summary: '' },
  { id: 106, short: 'DB-Reg', full: `[Reg] Databases (A,B,C) ${T}`, start: monday0, end: 0, url: SCELE_URL, summary: '' },
  { id: 107, short: 'Calc2-GNP2026', full: '[KI] Calculus 2 (A) Even 2025/2026', start: monday0 - 30 * 7 * DAY, end: 0, url: SCELE_URL, summary: 'Senin 13.00 - 14.40 · Selasa 09.00 - 09.50' },
]
const DEMO_GROUPS: Record<number, string[]> = {}
const DEMO_ROLES: Record<number, string[]> = { 104: ['teacher'] }
const week = Math.floor((now0 - monday0) / (7 * DAY)) + 1
const mod = (id: number, name: string, extra: Partial<SceleModule> = {}): SceleModule => ({ id, name, mod: 'resource', url: SCELE_URL, ...extra })
const DEMO_CONTENTS: Record<number, Section[]> = {
  101: [
    {
      num: 0,
      name: 'General',
      summary: '',
      modules: [mod(1, 'Course Overview (Term 1)'), mod(2, `Course Timeline (Term 1 - ${T.split(' ')[1]})`, { mod: 'url', links: [PBD_SHEET] })],
    },
    ...PBD_TOPICS.map((t, i) => ({
      num: i + 1,
      name: `Week ${i + 1}: ${t}`,
      summary: '',
      modules: [mod(100 + i, `Slides: ${t}`), mod(200 + i, `Lab ${i + 1}`, { mod: 'assign' })],
    })),
  ],
  102: [
    {
      num: 0,
      name: 'General',
      summary: '',
      modules: [mod(5, 'Tentative Timeline (pdf version)', { files: [{ name: 'Tentative-Timeline.pdf', url: OS_PDF, mime: 'application/pdf', modified: 0, size: 120_000 }] })],
    },
    { num: week, name: `Topic ${week}`, summary: '', modules: [mod(301, `Chapter ${week}: ${OS_TOPICS[week - 1] ?? 'Review'}`)] },
  ],
  103: [
    {
      num: 0,
      name: 'Course Info',
      summary: '',
      modules: [
        mod(6, 'Course Outline', { files: [{ name: 'Course-Outline-SP.docx', url: SP_DOC, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modified: 0, size: 40_000 }] }),
        mod(7, 'Jadwal & Timeline', { mod: 'url', links: [SP_SHEET] }),
      ],
    },
  ],
}
function demoDeadlines(): Deadline[] {
  const n = Date.now()
  return [
    { id: 1, name: 'Lab 8: Todo app', courseId: 101, course: 'PBD', due: n + 2.5 * 3600_000, url: SCELE_URL, module: 'assign', overdue: false },
    { id: 2, name: 'Quiz 3', courseId: 102, course: 'OS', due: n + 26 * 3600_000, url: SCELE_URL, module: 'quiz', overdue: false },
    { id: 3, name: 'Tugas Pemrograman 2', courseId: 103, course: 'SP', due: n + 4 * DAY, url: SCELE_URL, module: 'assign', overdue: false },
  ]
}
function demoNotices(): Notice[] {
  const n = Date.now()
  return [
    { id: 11, subject: 'PPW: Pengumuman perubahan deadline Lab 8', text: 'Deadline Lab 8 diundur ke Jumat 23.55.', time: n - 40 * 60_000, read: false, url: SCELE_URL },
    { id: 10, subject: 'SDA: Nilai TP1 sudah keluar', text: 'Silakan cek gradebook.', time: n - 5 * 3600_000, read: true, url: SCELE_URL },
  ]
}
