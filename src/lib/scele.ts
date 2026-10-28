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
  modules: SceleModule[]
}

/** An activity or resource on a course page; labels are kept for their text. */
export interface SceleModule {
  id: number
  name: string
  /** 'resource', 'page', 'label', 'assign', … */
  mod: string
  url: string
  /** plain text of its description (a label's whole content) */
  text?: string
  files?: { name: string; url: string; mime: string; modified: number }[]
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
  /** where a found meeting was read: the course page or its syllabus */
  source?: 'page' | 'syllabus'
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
      contents?: { type: string; filename: string; fileurl?: string; mimetype?: string; timemodified?: number }[]
    }[]
  }
  const r = await call<Raw[]>('core_course_get_contents', { courseid: courseId })
  return r.map((s) => ({
    num: s.section,
    name: htmlText(s.name),
    summary: htmlText(s.summary),
    modules: (s.modules ?? [])
      .filter((m) => m.visible !== 0)
      .map((m) => ({
        id: m.id,
        name: htmlText(m.name),
        mod: m.modname,
        url: m.url ?? `${SCELE_URL}/mod/${m.modname}/view.php?id=${m.id}`,
        text: htmlText(m.description),
        files: (m.contents ?? [])
          .filter((f) => f.type === 'file' && f.fileurl)
          .map((f) => ({ name: f.filename, url: f.fileurl!, mime: f.mimetype ?? '', modified: f.timemodified ?? 0 })),
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

// ---------- reading syllabus files ----------

/** Files worth reading for the class days: the syllabus (RPS), the schedule, the course outline. */
const SYLLABUS_RE = /\b(rps|silabus|syllabus|sap|course outline|kontrak kuliah|rencana pembelajaran|jadwal|schedule|timeline|course info|informasi)\b/i

export function syllabusFiles(sections: Section[]) {
  return sections
    .flatMap((s) => s.modules)
    .filter((m) => SYLLABUS_RE.test(m.name) && m.files?.length)
    .flatMap((m) => m.files!.filter((f) => /\.(pdf|docx|html?|txt)$/i.test(f.name)).map((f) => ({ ...f, module: m.name })))
    .slice(0, 4)
}

/** Text of a SCELE file (PDF, Word, HTML or plain text), downloaded by Rust with the token. */
export async function fileText(url: string, name: string): Promise<string> {
  if (!IS_TAURI) return DEMO_FILES[name] ?? ''
  const b64 = await invoke<string>('scele_file', { url })
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  let text: string
  if (/\.pdf$/i.test(name)) text = await pdfText(bytes)
  else if (/\.docx$/i.test(name)) text = await docxText(bytes)
  else if (/\.html?$/i.test(name)) text = htmlText(new TextDecoder().decode(bytes))
  else text = new TextDecoder().decode(bytes)
  return text.replace(/\s+/g, ' ').slice(0, 40_000)
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  // loaded only when a syllabus PDF is read, so the island itself stays light
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  await doc.destroy()
  return pages.join('\n')
}

/** word/document.xml out of the .docx zip, unpacked with the browser's own inflate. */
async function docxText(bytes: Uint8Array): Promise<string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // the central directory lists each entry with its local header's offset
  let eocd = bytes.length - 22
  while (eocd > 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--
  let p = v.getUint32(eocd + 16, true)
  const entries = v.getUint16(eocd + 10, true)
  for (let i = 0; i < entries; i++) {
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extra = v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    if (name === 'word/document.xml') {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
      const raw = bytes.slice(start, start + size)
      const xml =
        method === 0
          ? new TextDecoder().decode(raw)
          : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
      return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '')
    }
    p += 46 + nameLen + extra
  }
  return ''
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
  return materials(sections)
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
// named the way SCELE names them, and shaped like a real term: the class times are only in the
// syllabus files, last term's Calculus 2 is still "in progress", the user TAs this term's Calculus 1,
// and Databases is enrolled twice to show the "which one is your class" question
const term = (n: string) => `${n} Odd 2026/2027`
const DEMO_COURSES: Course[] = [
  { id: 101, short: 'PBD', full: term('[KI] Platform-Based Development (A)'), start: termStart, end: 0, url: SCELE_URL, summary: '' },
  { id: 102, short: 'OS', full: term('[KI] Operating Systems (A)'), start: termStart, end: 0, url: SCELE_URL, summary: '' },
  { id: 103, short: 'SP', full: term('[KI] Statistics & Probability (A)'), start: termStart, end: 0, url: SCELE_URL, summary: '' },
  { id: 104, short: 'Calc1', full: term('[KI] Calculus 1 (A)'), start: termStart, end: 0, url: SCELE_URL, summary: 'Lecture: Wednesday 08:00 - 09:40, Room 2.2301' },
  { id: 105, short: 'DB', full: term('[KI] Databases (A)'), start: termStart, end: 0, url: SCELE_URL, summary: '' },
  { id: 106, short: 'DB-Reg', full: '[Reg] Basis Data (A,B,C) Gasal 2026/2027', start: termStart, end: 0, url: SCELE_URL, summary: '' },
  { id: 107, short: 'Calc2-GNP2026', full: '[KI] Calculus 2 (A) Even 2025/2026', start: termStart - 30 * 7 * DAY, end: 0, url: SCELE_URL, summary: 'Senin 13.00 - 14.40 · Selasa 09.00 - 09.50' },
]
const DEMO_GROUPS: Record<number, string[]> = {}
const DEMO_ROLES: Record<number, string[]> = { 104: ['teacher'] }
const file = (name: string) => [{ name, url: `${SCELE_URL}/webservice/pluginfile.php/demo/${name}`, mime: 'application/pdf', modified: 0 }]
// what the syllabus files say, standing in for the downloaded PDFs
const DEMO_FILES: Record<string, string> = {
  'RPS-PBD.pdf': 'Rencana Pembelajaran Semester. Jadwal kuliah: Selasa & Kamis, 10.00 - 11.40, Ruang 2.2402. UTS: Senin 13.00 - 15.00.',
  'Syllabus-OS.pdf': 'Course Syllabus. Lectures: Monday and Wednesday 13:00 - 14:40 (Room 2.2303). Quiz: Friday 08:00 - 08:30.',
  'Course-Outline-SP.pdf': 'Kelas A: Jumat 08.00 - 10.30 R. 2.2301 · Kelas B: Jumat 13.00 - 15.30',
}
const week = Math.floor((now0 - termStart) / (7 * DAY)) + 1
const DEMO_CONTENTS: Record<number, Section[]> = {
  101: [
    { num: 0, name: 'General', summary: '', modules: [{ id: 1, name: 'RPS PBD 2026', mod: 'resource', url: SCELE_URL, files: file('RPS-PBD.pdf') }] },
    { num: week, name: `Week ${week}: React Hooks & State`, summary: 'useState, useEffect, custom hooks.', modules: [{ id: 2, name: `Slides Week ${week}`, mod: 'resource', url: SCELE_URL }, { id: 3, name: 'Lab 8: Todo app', mod: 'assign', url: SCELE_URL }] },
  ],
  102: [{ num: 0, name: 'General', summary: '', modules: [{ id: 4, name: 'Syllabus', mod: 'resource', url: SCELE_URL, files: file('Syllabus-OS.pdf') }] }],
  103: [{ num: 0, name: 'General', summary: '', modules: [{ id: 5, name: 'Course Outline', mod: 'resource', url: SCELE_URL, files: file('Course-Outline-SP.pdf') }] }],
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
