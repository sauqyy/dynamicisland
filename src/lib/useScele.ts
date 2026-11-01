import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SoundName } from 'cuelume'
import type { IslandAlert } from '../types'
import {
  browserUrl,
  classFromGroups,
  classInName,
  courseTitle,
  currentTerm,
  dayName,
  detectSlots,
  docCandidates,
  fetchContents,
  fetchCourses,
  fetchAssignments,
  fetchDeadlines,
  fetchGrades,
  fetchMyGroups,
  fetchMyRoles,
  fetchNotices,
  fetchSubmission,
  fetchUpdates,
  introText,
  isTeachingRole,
  materials,
  meetingOn,
  readDoc,
  relTime,
  SCELE_URL,
  sceleAccount,
  sceleLogin,
  sceleLogout,
  slotKey,
  subjectOf,
  termStartEstimate,
  termWindow,
  topicFor,
  type Assign,
  type ClassSlot,
  type Course,
  type Deadline,
  type Detected,
  type DocRef,
  type Grade,
  type Notice,
  type SceleAccount,
  type SceleModule,
  type Section,
  type Submission,
  WEEK_SECTION,
} from './scele'
import { coverage } from './coverage'
import { matchCourses, slcmCancel, slcmConnect, slcmForget, slcmSaved, slcmShow, type SlcmSchedule, type SlcmStage } from './slcm'
import { agendaOn, classDays, mondayOf, parseTimeline, timelineOver, timelineScore, type Timeline } from './timeline'

/** Something added to a course page since the last look. */
export interface Fresh {
  key: string
  courseId: number
  course: string
  name: string
  url: string
  at: number
}

/** A course page that lists several parallel classes, none of them known to be the user's. */
export interface ClassQuestion {
  courseId: number
  course: string
  labels: string[]
}

/** The same subject enrolled more than once, which is usually a mistake: which is the real class? */
export interface DuplicateQuestion {
  subject: string
  courses: { id: number; name: string }[]
}

/** What reading one of a course's documents gave. */
export interface DocResult {
  name: string
  url: string
  kind: DocRef['kind']
  timeline: Timeline | null
  /** class times written in it ("Selasa 10.00 - 11.40") */
  slots: Detected[]
  /** a link that needs a Google sign-in, or a file that couldn't be read */
  blocked?: 'signin' | 'failed'
  readAt: number
  /** the reader that read it (READER): a document read by an older one is read again */
  v?: number
}

/** Bumped whenever reading documents changes, so every document is read again with the new reader. */
const READER = 2

interface Cache {
  courses: Course[]
  deadlines: Deadline[]
  notices: Notice[]
  contents: Record<number, Section[]>
  /** the user's SCELE groups per course, for telling which parallel class is theirs */
  groups: Record<number, string[]>
  /** the user's roles per course ('student', 'teacher', …) */
  roles: Record<number, string[]>
  /** what each course document gave (DocRef.key), so each file is read once per version */
  docs: Record<string, DocResult>
  fresh: Fresh[]
  syncedAt: number
  /** per course: when SCELE was last asked what changed on its page (or the page read), and when the page was last read whole */
  checked: Record<number, number>
  readAt: Record<number, number>
  /** this term's assignments, and when they were listed */
  assigns: Assign[]
  assignsAt: number
  /** the user's submission per assignment id, with when it was looked up */
  subs: Record<number, { state: Submission; graded: boolean; at: number }>
  /** the user's graded items per course, and when each course's were read */
  grades: Record<number, Grade[]>
  gradesAt: Record<number, number>
}

/** The user's say over the class times found on course pages. */
interface Prefs {
  /** which parallel class the user is in, per course ('-' = none of the listed ones) */
  choice: Record<number, string>
  /** the real course of a subject that is enrolled more than once (subjectOf → course id) */
  primary: Record<string, number>
  /** found meetings the user removed (slotKey), so they are not brought back */
  dismissed: string[]
  /** the user's own say on teaching a course (a TA), over what SCELE's roles suggest */
  teaching: Record<number, boolean>
  /** courses left out of the schedule altogether */
  hidden: number[]
}

/** How the schedule sees one of this term's courses, for the list on the Classes page. */
export interface CourseStatus {
  course: Course
  /** meetings a week found for it */
  found: number
  source: ClassSlot['source'] | null
  teaching: boolean
  hidden: boolean
  /** the timeline it reads topics from */
  timeline?: { /** its entries: dated sessions, else numbered weeks */ sessions: number; name: string; url: string }
  /** documents it links to that need a sign-in to read */
  blocked: { name: string; url: string }[]
  /** its subject is enrolled twice and the user hasn't said which is theirs yet */
  waiting: boolean
}

/** One meeting of a class, with what it covers. */
export interface Meeting {
  slot: ClassSlot
  course?: Course
  /** the course's name as the user knows it: "Statistics & Probability (A)" */
  title: string
  start: number
  end: number
  /** what it covers, as its timeline row or outline section says it */
  topic: string
  /** the row's other topic cells (sub-topics, a lab), shown under the topic */
  detail: string[]
  /** where the topic came from: the timeline row for that day, the timeline's week, or the course outline */
  from: 'timeline' | 'timeline-week' | 'outline-dated' | 'outline-week' | null
  /** the document the topic was read from, opened at its page */
  source?: { name: string; url: string; page?: number }
  /** a class, an exam, or a day without class (holiday) */
  kind: 'class' | 'exam' | 'off'
  /** the course page's section about the topic */
  section: { name: string; url: string } | null
  /** the study materials that go with it: the section's, and any other named for the topic */
  materials: SceleModule[]
}

const EMPTY: Cache = {
  courses: [],
  deadlines: [],
  notices: [],
  contents: {},
  groups: {},
  roles: {},
  docs: {},
  fresh: [],
  syncedAt: 0,
  checked: {},
  readAt: {},
  assigns: [],
  assignsAt: 0,
  subs: {},
  grades: {},
  gradesAt: {},
}
const NO_PREFS: Prefs = { choice: {}, primary: {}, dismissed: [], teaching: {}, hidden: [] }
// the cache's shape changed with timelines (0.7.4); the old one is dropped and read afresh
const CACHE_KEY = 'di.scele.2'
const OLD_CACHE_KEY = 'di.scele'
/** classes the user added by hand */
const SLOTS_KEY = 'di.scele.slots'
const PREFS_KEY = 'di.scele.prefs'
const LEAD_KEY = 'di.scele.lead'
/** what has been seen or alerted already, so a restart does not repeat it */
const SEEN_KEY = 'di.scele.seen'
/** the newest SCELE notification the user has looked at on the Inbox page: it and everything before it count as read */
const INBOX_KEY = 'di.scele.inboxRead'

/**
 * Deadlines, notifications and what changed on this term's course pages are checked this often,
 * day and night; past terms' pages every PAGES_MS. A page is read only when SCELE reports a change
 * on it, or whole every FULL_MS for what that report leaves out (section text, removed activities).
 */
const SYNC_MS = 10 * 60_000
const PAGES_MS = 30 * 60_000
const FULL_MS = 6 * 3600_000
/** A submission or grade report SCELE hasn't reported a change to is looked up again after this long anyway. */
const STATUS_MS = 30 * 60_000
const GRADES_MS = 6 * 3600_000
/** What changed on a page counts from a little before the last check, so nothing falls between two. */
const OVERLAP_MS = 60_000
/** Changes SCELE reports that leave the page as it was: someone's grade, a submission, forum posts. Anything else is read. */
const NOT_ON_PAGE = new Set(['gradeitems', 'grades', 'submissions', 'outcomes', 'completion', 'comments', 'ratings', 'tags', 'discussions', 'attempts', 'entries', 'responses'])
/** Back from sleep, back online or opened again: data older than this is read again at once. */
const STALE_MS = 2 * 60_000
/** After a failed sync (offline, SCELE down), the next try. */
const RETRY_MS = 2 * 60_000
/** Course pages read at once: enough to overlap SCELE's slow answers, few enough to go easy on it. */
const PARALLEL = 4
/** Deadline heads-ups, tightest last. */
const DUE_HOURS = [72, 48, 24, 12, 6, 3, 1]
const DUE_STEPS = DUE_HOURS.map((h) => h * 3600_000)
/** From this step on (6 h and closer) a heads-up sounds urgent. */
const DUE_URGENT = DUE_HOURS.indexOf(6)
const DAY_MS = 86_400_000
/** A linked Google document is read again after this long; files only when they change. */
const LINK_TTL = 6 * 3600_000
/** Download limits for one sync: per course, and for all of them. */
const COURSE_BUDGET = 40 * 1024 * 1024
const SYNC_BUDGET = 150 * 1024 * 1024
/** Untimed classes and days without class are mentioned in the morning, between these hours. */
const MORNING = [7, 12]

interface Seen {
  /** newest notification id already shown */
  notice: number
  /** activity ids per course already known */
  modules: Record<number, number[]>
  /** alert keys already raised, with when */
  fired: Record<string, number>
  /** the found schedule per course, to notice when the course page changes it */
  schedule: Record<number, string>
}
// a fresh one each time: the nested records are filled in place
const noSeen = (): Seen => ({ notice: 0, modules: {}, fired: {}, schedule: {} })

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...(JSON.parse(v) as T) } : fallback
  } catch {
    return fallback
  }
}
function readList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]
  } catch {
    return []
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
function loadCache(): Cache {
  try {
    localStorage.removeItem(OLD_CACHE_KEY)
  } catch {
    /* ignore */
  }
  return read(CACHE_KEY, EMPTY)
}

const times = (slots: ClassSlot[]) => slots.map((s) => `${dayName(s.day)} ${s.start || '(time not listed)'}`).join(', ')
/** A study plan read this long ago is a past term's. */
const SLCM_MAX_AGE = 160 * 86_400_000
const startOfDay = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Runs `run` over `items`, at most `n` at a time. */
async function inParallel<T>(items: T[], n: number, run: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await run(items[next++])
    }),
  )
}

/** Reads one course document into what the schedule needs; failures are kept too, so they aren't retried every sync. */
async function readOne(ref: DocRef, course: Course): Promise<DocResult> {
  const base = { name: ref.name, url: ref.url, kind: ref.kind, readAt: Date.now(), v: READER }
  try {
    const text = await readDoc(ref)
    return { ...base, timeline: parseTimeline(text, termWindow(course)), slots: detectSlots(course, [], [text]) }
  } catch (e) {
    return { ...base, timeline: null, slots: [], blocked: e === 'signin' ? 'signin' : 'failed' }
  }
}

/**
 * The class times of this term's courses, with no setup:
 * - the study plan in SLCM, when the user has connected it: the official day, time and room;
 * - times written out ("Selasa 10.00 - 11.40") on the course page or in its documents;
 * - else the weekdays the course timeline's dated sessions fall on, with the time its rows give,
 *   or marked as not listed.
 * A course that lists several parallel classes gives the user's: the one its name is for ("(A)"),
 * or the one their SCELE group names. The only question asked is when one subject is enrolled
 * twice, since that is usually a mistake; until it is answered neither course adds classes.
 * Courses of earlier terms (SCELE keeps some "in progress") and hidden ones are left out; ones
 * the user teaches are marked.
 */
function detect(data: Cache, prefs: Prefs, slcm: SlcmSchedule | null) {
  const auto: ClassSlot[] = []
  const duplicates: DuplicateQuestion[] = []
  const unsure: ClassQuestion[] = []
  const status: CourseStatus[] = []
  const timelines: Record<number, { timeline: Timeline; name: string; url: string }> = {}
  const { current, earlier } = currentTerm(data.courses)
  const teaching = (c: Course) => prefs.teaching[c.id] ?? isTeachingRole(data.roles[c.id] ?? [])
  const taking = current.filter((c) => !prefs.hidden.includes(c.id) && !teaching(c))

  // the study plan: each of its classes goes to the course it names (every one of equally good
  // matches, so the one kept of a subject enrolled twice gets it), or stays a class of its own
  const planned = new Map<number, Omit<ClassSlot, 'id'>[]>()
  const unmatched: Omit<ClassSlot, 'id'>[] = []
  /** courses the study plan has no class for, and nothing else gives a time: the plan may be from before the user changed classes */
  const unplanned: Course[] = []
  const planOn = Boolean(slcm && Date.now() - slcm.at < SLCM_MAX_AGE)
  if (slcm && planOn) {
    for (const k of slcm.classes) {
      // "Lab A3.02 (Gd. Baru) --- PC 45" reads as "Lab A3.02 (Gd. Baru) · PC 45"
      const slot = { courseId: 0, day: k.day, start: k.start, end: k.end, room: k.room.replace(/\s*(?:-{2,}|—|\|)\s*/g, ' · ').trim() }
      const to = matchCourses(k, taking)
      if (!to.length) unmatched.push({ ...slot, name: k.course })
      for (const c of to) planned.set(c.id, [...(planned.get(c.id) ?? []), { ...slot, courseId: c.id }])
    }
  }

  const bySubject = new Map<string, Course[]>()
  for (const c of taking) {
    const k = subjectOf(c)
    if (k) bySubject.set(k, [...(bySubject.get(k) ?? []), c])
  }
  const skip = new Set<number>()
  for (const [subject, list] of bySubject) {
    if (list.length < 2) continue
    // the study plan settles it when it has exactly one of them
    const inPlan = list.filter((c) => planned.has(c.id))
    const keep = prefs.primary[subject] ?? (inPlan.length === 1 ? inPlan[0].id : undefined)
    if (!list.some((c) => c.id === keep)) duplicates.push({ subject, courses: list.map((c) => ({ id: c.id, name: c.full })) })
    for (const c of list) if (c.id !== keep) skip.add(c.id)
  }

  for (const c of current) {
    const hidden = prefs.hidden.includes(c.id)
    const teach = teaching(c)
    const sections = data.contents[c.id] ?? []
    const results = docCandidates(sections)
      .map((r) => data.docs[r.key])
      .filter((r): r is DocResult => Boolean(r))
    // the documents' timelines, and one typed onto the course page itself (often in its first week)
    const onPage = parseTimeline(introText(sections), termWindow(c))
    const best = [
      ...results.flatMap((r) => (r.timeline ? [{ timeline: r.timeline, name: r.name, url: r.url }] : [])),
      ...(onPage ? [{ timeline: onPage, name: 'Course page', url: c.url }] : []),
    ].sort((a, b) => timelineScore(b.timeline) - timelineScore(a.timeline))[0]
    if (best) timelines[c.id] = best
    const row: CourseStatus = {
      course: c,
      found: 0,
      source: null,
      teaching: teach,
      hidden,
      timeline: best ? { sessions: best.timeline.sessions.length || Object.keys(best.timeline.weeks).length, name: best.name, url: best.url } : undefined,
      blocked: results.filter((r) => r.blocked === 'signin').map((r) => ({ name: r.name, url: r.url })),
      waiting: duplicates.some((q) => q.courses.some((x) => x.id === c.id)),
    }
    status.push(row)
    if (hidden || skip.has(c.id)) continue

    // the study plan's times, else times written out: the course page first, then its documents
    let found = planned.has(c.id) ? [{ label: '', slots: planned.get(c.id)! }] : detectSlots(c, sections)
    let source: ClassSlot['source'] = planned.has(c.id) ? 'slcm' : 'page'
    if (!found.length) {
      found = results.find((r) => r.slots.length)?.slots ?? []
      source = 'syllabus'
    }
    let picked: (Omit<ClassSlot, 'id'> & { from?: 'timeline' })[] = []
    if (found.length) {
      const labels = found.map((f) => f.label).filter(Boolean)
      let pick = found.length === 1 ? found[0] : null
      if (!pick) {
        const own = classInName(c)
        const label = prefs.choice[c.id] ?? (own && labels.includes(own) ? own : classFromGroups(labels, data.groups[c.id] ?? []))
        if (label !== '-') {
          pick = found.find((f) => f.label === label) ?? null
          if (!pick) unsure.push({ courseId: c.id, course: c.short, labels })
        }
      }
      picked = pick?.slots ?? []
    }
    // the timeline's class days, only for a course whose times are written nowhere: a written
    // schedule (or the study plan) is complete as it is, and its dates may only date the weeks
    const days = best && !found.length ? classDays(best.timeline) : []
    if (days.length) source = 'timeline'
    for (const d of days) picked.push({ courseId: c.id, day: d.day, start: d.start ?? '', end: d.end ?? '', room: '', from: 'timeline' })
    if (planOn && !teach && !planned.has(c.id) && !picked.some((p) => p.start)) unplanned.push(c)

    for (const { from, ...sl } of picked) {
      const key = slotKey(sl)
      if (prefs.dismissed.includes(key)) continue
      auto.push({ ...sl, id: `auto-${key}`, auto: true, teaching: teach, source: from ?? source })
      row.found++
    }
    row.source = row.found ? source : null
  }

  // the Monday the term's first week starts: the week most dated timelines begin in (UI's courses
  // start together), when it is near the calendar's estimate; else the estimate
  const firsts = Object.values(timelines)
    .map(({ timeline }) => timeline.sessions.find((x) => !x.until && x.kind !== 'off'))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map((x) => mondayOf(x.date))
  const estimate = current[0] ? termStartEstimate(termWindow(current[0])) : 0
  const votes = new Map<number, number>()
  for (const f of firsts) if (!estimate || Math.abs(f - estimate) <= 21 * DAY_MS) votes.set(f, (votes.get(f) ?? 0) + 1)
  const termStart = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? estimate

  // a study-plan class no SCELE course was matched to: one already found at that day and time is
  // the same class under another name (it gets the room); any other is listed under SLCM's name
  for (const u of unmatched) {
    const same = auto.find((a) => a.day === u.day && a.start === u.start)
    if (same) same.room ||= u.room
    else if (!prefs.dismissed.includes(slotKey(u))) auto.push({ ...u, id: `auto-${slotKey(u)}`, auto: true, source: 'slcm' })
  }
  return { auto, duplicates, unsure, status, earlier, timelines, termStart, unplanned }
}

/** A section numbered for a week: "Week 3", "Minggu ke-3", "Pertemuan 3". */
const weekOf = (s: Section) => Number(s.name.match(WEEK_SECTION)?.[1] ?? NaN)

type Alert = (a: Omit<IslandAlert, 'id'>, cue?: SoundName) => void

/**
 * `enabled`: the user is a verified Fasilkom student; undefined while that is being looked up.
 * Nothing is fetched or alerted until it is true, and turning it off wipes what was kept.
 */
export function useScele(onAlert: Alert, enabled: boolean | undefined) {
  // undefined while the saved account is being looked up
  const [account, setAccount] = useState<SceleAccount | null | undefined>(undefined)
  const [data, setData] = useState<Cache>(loadCache)
  const [manual, setManual] = useState<ClassSlot[]>(() => readList(SLOTS_KEY))
  const [prefs, setPrefs] = useState<Prefs>(() => read(PREFS_KEY, NO_PREFS))
  const [lead, setLeadState] = useState<number>(() => Number(localStorage.getItem(LEAD_KEY)) || 30)
  const [syncing, setSyncing] = useState(false)
  /** reading the course pages: how many of this term's courses are done */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** the study plan read from SLCM; undefined while it is looked up */
  const [slcm, setSlcm] = useState<SlcmSchedule | null | undefined>(undefined)
  /** reading SLCM: how far it has got; null when not reading */
  const [slcmStage, setSlcmStage] = useState<SlcmStage | null>(null)
  const seen = useRef<Seen>(read(SEEN_KEY, noSeen()))
  // SCELE is only ever read from (see scele.rs), so it can't be told a notification was seen: the island keeps that
  const [inboxRead, setInboxRead] = useState<number>(() => read(INBOX_KEY, 0))
  const forgetInboxRead = () => {
    setInboxRead(0)
    write(INBOX_KEY, 0)
  }
  const alertRef = useRef(onAlert)
  alertRef.current = onAlert
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const dataRef = useRef(data)
  dataRef.current = data
  /** when the last sync, and the last one with course pages, went through; one sync at a time */
  const syncAt = useRef(0)
  const pagesAt = useRef(0)
  const busy = useRef(false)

  useEffect(() => write(CACHE_KEY, data), [data])
  useEffect(() => write(SLOTS_KEY, manual), [manual])
  useEffect(() => write(PREFS_KEY, prefs), [prefs])

  const signedOut = useCallback(() => {
    setAccount(null)
    setData(EMPTY)
  }, [])

  useEffect(() => {
    if (enabled === undefined) return
    if (!enabled) {
      // no longer verified: drop the SCELE data and the schedule along with the connection
      signedOut()
      setManual([])
      setPrefs(NO_PREFS)
      seen.current = noSeen()
      write(SEEN_KEY, seen.current)
      forgetInboxRead()
      setSlcm(null)
      return
    }
    slcmSaved()
      .then(setSlcm)
      .catch(() => setSlcm(null))
    sceleAccount()
      .then((a) => setAccount(a ?? null))
      .catch(() => setAccount(null))
  }, [enabled, signedOut])

  const sync = useCallback(
    /** `withContents`: past terms' pages too, with progress shown; `force`: read every page whole (Sync pressed) */
    async (acc: SceleAccount, withContents: boolean, force = false) => {
      if (busy.current) return
      busy.current = true
      setSyncing(true)
      try {
        const [courses, actions, notices] = await Promise.all([fetchCourses(acc.userid), fetchDeadlines(), fetchNotices(acc.userid)])
        const s = seen.current

        // notifications newer than the last one shown; the very first sync only takes note of them
        const newest = notices.reduce((m, n) => Math.max(m, n.id), 0)
        if (s.notice) {
          const fresh = notices.filter((n) => n.id > s.notice && !n.read)
          if (fresh.length === 1) alertRef.current({ icon: '📣', text: fresh[0].subject.slice(0, 40), sub: fresh[0].text.slice(0, 48), openTab: 'inbox' }, 'ready')
          else if (fresh.length > 1) alertRef.current({ icon: '📣', text: `${fresh.length} new on SCELE`, sub: fresh[0].subject.slice(0, 48), openTab: 'inbox' }, 'ready')
        }
        s.notice = Math.max(s.notice, newest)

        const prev = dataRef.current
        const started = Date.now()
        const contents: Record<number, Section[]> = {}
        const checked: Record<number, number> = {}
        const readAt: Record<number, number> = {}
        /** what SCELE reported changed, per course: activity id → what about it */
        const changes: Record<number, Record<number, string[]>> = {}
        const groups: Record<number, string[]> = {}
        const roles: Record<number, string[]> = {}
        const docs: Record<string, DocResult> = {}
        const added: Fresh[] = []
        const thisTerm = new Set(currentTerm(courses).current.map((c) => c.id))
        {
          let spent = 0
          let done = 0
          if (withContents) setProgress({ done, total: thisTerm.size })
          const step = () => withContents && setProgress({ done: ++done, total: thisTerm.size })
          // this term's courses every sync, past terms' with the pages round; this term's first,
          // a few at a time: SCELE answers each slowly, so overlapping them is what makes a sync quick
          const order = courses.filter((c) => thisTerm.has(c.id) || withContents).sort((a, b) => Number(thisTerm.has(b.id)) - Number(thisTerm.has(a.id)))
          await inParallel(order, PARALLEL, async (c) => {
            const page = prev.contents[c.id]
            // a page read a while ago is only read again when SCELE says something on it changed
            let whole = force || !page || started - (prev.readAt[c.id] ?? 0) >= FULL_MS
            if (!whole) {
              const upd = await fetchUpdates(c.id, (prev.checked[c.id] ?? 0) - OVERLAP_MS).catch((e) => {
                if (e === 'signed-out') throw e
                return null
              })
              if (upd) {
                changes[c.id] = upd
                checked[c.id] = started
              }
              whole = !upd || Object.values(upd).some((u) => u.some((name) => !NOT_ON_PAGE.has(name)))
            }
            let secs = page
            if (whole) {
              const got = await fetchContents(c.id).catch((e) => {
                if (e === 'signed-out') throw e
                return null
              })
              if (got) {
                secs = contents[c.id] = got
                checked[c.id] = readAt[c.id] = started
              } else delete checked[c.id]
            }
            if (!secs) {
              if (thisTerm.has(c.id)) step()
              return
            }
            // labels are page text, not materials: they are neither counted nor announced
            const known = s.modules[c.id]
            if (contents[c.id] && known) {
              const had = new Set(known)
              for (const m of materials(secs)) {
                if (!had.has(m.id)) added.push({ key: `${c.id}:${m.id}`, courseId: c.id, course: c.short, name: m.name, url: m.url, at: Date.now() })
              }
            }
            s.modules[c.id] = materials(secs).map((m) => m.id)
            if (!thisTerm.has(c.id)) return
            // teaching or taking it: SCELE's role in the course, looked up once, while the documents are read
            const role = dataRef.current.roles[c.id] === undefined ? fetchMyRoles(c.id, acc.userid).catch(() => []) : null

            // the course's documents, likeliest first: everything named like a timeline or
            // syllabus, then (only while nothing is found) the other documents of the sections
            // it introduces itself in
            const onPage = detectSlots(c, secs)
            let haveTimeline = false
            let haveTimes = onPage.length > 0
            let courseSpent = 0
            let general = 0
            const mine: DocResult[] = []
            for (const ref of docCandidates(secs)) {
              if (ref.tier === 2 && (haveTimeline || general >= 6)) break
              const cost = ref.size || 2 * 1024 * 1024
              const cached = dataRef.current.docs[ref.key]
              const fresh = cached && cached.v === READER && (ref.kind === 'file' || Date.now() - cached.readAt < LINK_TTL)
              if (!fresh && (ref.size > (ref.tier === 1 ? 20 : 10) * 1024 * 1024 || courseSpent + cost > COURSE_BUDGET || spent + cost > SYNC_BUDGET)) continue
              if (ref.tier === 2) general++
              // counted before the download, so courses read alongside this one see it
              if (!fresh) {
                courseSpent += cost
                spent += cost
              }
              const res = fresh ? cached : await readOne(ref, c)
              docs[ref.key] = res
              mine.push(res)
              if (res.timeline) haveTimeline = true
              if (res.slots.length) haveTimes = true
            }
            // several parallel classes listed and none chosen: the user's SCELE group may say which
            const listed = onPage.length > 1 || mine.some((d) => d.slots.length > 1)
            if (haveTimes && listed && prefsRef.current.choice[c.id] === undefined && (contents[c.id] || prev.groups[c.id] === undefined)) {
              groups[c.id] = await fetchMyGroups(c.id, acc.userid).catch(() => [])
            }
            if (role) roles[c.id] = await role
            step()
          })
          if (added.length === 1) alertRef.current({ icon: '📄', text: `New in ${added[0].course}`, sub: added[0].name.slice(0, 48), openTab: 'inbox' }, 'ready')
          else if (added.length > 1) alertRef.current({ icon: '📄', text: `${added.length} new materials`, sub: [...new Set(added.map((a) => a.course))].join(', '), openTab: 'inbox' }, 'ready')
        }

        // what SCELE reported about an activity, and whether any of it is about grades
        const touched = (cmid: number) => Object.values(changes).some((u) => u[cmid])
        const gradedIn = (courseId: number) => Object.values(changes[courseId] ?? {}).some((u) => u.includes('gradeitems') || u.includes('grades'))
        const term = courses.filter((c) => thisTerm.has(c.id))

        // this term's assignments, listed again when anything on a page changed: the action events
        // drop an assignment once it's handed in, so this is what still knows about it
        const anyChange = Object.values(changes).some((u) => Object.keys(u).length > 0) || Object.keys(contents).length > 0
        const relist = force || withContents || !prev.assignsAt || anyChange
        const assigns = relist ? await fetchAssignments(term.map((c) => c.id)).catch((e) => (e === 'signed-out' ? Promise.reject(e) : prev.assigns)) : prev.assigns
        const assignsAt = relist ? started : prev.assignsAt

        // the user's submission to each assignment due in the next two weeks: looked up when SCELE
        // reports a change to it, when it leaves or joins the action events (handed in, reopened),
        // and otherwise every STATUS_MS
        const actionable = new Set(actions.filter((d) => d.module === 'assign' && d.instance).map((d) => d.instance!))
        const due = assigns.filter((a) => actionable.has(a.id) || (a.due >= started - 3600_000 && a.due <= started + 14 * DAY_MS))
        const subs: Cache['subs'] = {}
        await inParallel(due, PARALLEL, async (a) => {
          const old = prev.subs[a.id]
          const moved = old && old.state !== 'offline' && (old.state === 'submitted') === actionable.has(a.id)
          if (old && !force && !moved && !touched(a.cmid) && started - old.at < STATUS_MS) {
            subs[a.id] = old
            return
          }
          const got = await fetchSubmission(a.id).catch((e) => {
            if (e === 'signed-out') throw e
            return null
          })
          if (got) subs[a.id] = { ...got, at: started }
          else if (old) subs[a.id] = old
        })
        // handed in since the last look (not just found handed in the first time it's looked up): well done
        const handedIn = due.filter((a) => subs[a.id]?.state === 'submitted' && prev.subs[a.id] && prev.subs[a.id].state !== 'submitted')
        if (handedIn.length === 1) {
          const a = handedIn[0]
          const left = a.due - started
          const ahead = relTime(a.due, started).replace(/^in /, '')
          const sub = left <= 0 ? 'Submitted. Reminders for it are off.' : left >= DAY_MS ? `Submitted ${ahead} early. Well done.` : `Submitted with ${ahead} to spare. Well done.`
          alertRef.current({ icon: '✅', text: a.name.slice(0, 40), sub, openTab: 'deadlines' }, 'success')
        } else if (handedIn.length > 1) {
          alertRef.current({ icon: '✅', text: `${handedIn.length} assignments submitted`, sub: 'Well done. Reminders for them are off.', openTab: 'deadlines' }, 'success')
        }

        const short = new Map(courses.map((c) => [c.id, c.short]))
        const deadlines: Deadline[] = actions.map((d) => {
          const sub = d.instance && d.module === 'assign' ? subs[d.instance] : undefined
          return sub ? { ...d, submission: sub.state, graded: sub.graded } : d
        })
        // handed in, so no longer an action event, but still due: kept on the list as done
        for (const a of due) {
          const sub = subs[a.id]
          if (actionable.has(a.id) || sub?.state !== 'submitted' || a.due < started) continue
          deadlines.push({
            id: -a.cmid,
            name: a.name,
            courseId: a.courseId,
            course: short.get(a.courseId) ?? '',
            due: a.due,
            url: `${SCELE_URL}/mod/assign/view.php?id=${a.cmid}`,
            module: 'assign',
            overdue: false,
            instance: a.id,
            submission: 'submitted',
            graded: sub.graded,
          })
        }

        // grades: read for a course when SCELE reports a grade changed in it, else every GRADES_MS
        const grades: Cache['grades'] = {}
        const gradesAt: Cache['gradesAt'] = {}
        await inParallel(term, PARALLEL, async (c) => {
          if (prev.grades[c.id] && !force && !gradedIn(c.id) && started - (prev.gradesAt[c.id] ?? 0) < GRADES_MS) return
          const got = await fetchGrades(c.id, acc.userid).catch((e) => {
            if (e === 'signed-out') throw e
            return null
          })
          if (!got) return
          grades[c.id] = got
          gradesAt[c.id] = started
        })
        // a grade new since the last read of that course; the first read only takes note. The
        // alert never says the grade itself: the island can be on a shared or projected screen
        const newGrades = Object.entries(grades).flatMap(([id, list]) => {
          const was = prev.grades[Number(id)]
          if (!was) return []
          return list.filter((g) => !was.some((w) => w.id === g.id && w.value === g.value && w.at === g.at)).map((g) => ({ g, course: short.get(g.courseId) ?? '' }))
        })
        if (newGrades.length === 1) alertRef.current({ icon: '🏅', text: `New grade in ${newGrades[0].course}`, sub: `${newGrades[0].g.name} · open Due to see it`.slice(0, 48), openTab: 'deadlines' }, 'ready')
        else if (newGrades.length > 1) alertRef.current({ icon: '🏅', text: `${newGrades.length} new grades`, sub: [...new Set(newGrades.map((n) => n.course))].join(', '), openTab: 'deadlines' }, 'ready')

        write(SEEN_KEY, s)
        setData((d) => ({
          courses,
          deadlines,
          notices,
          contents: { ...d.contents, ...contents },
          groups: { ...d.groups, ...groups },
          roles: { ...d.roles, ...roles },
          // only the documents still on this term's course pages are kept
          docs,
          fresh: [...added, ...d.fresh].slice(0, 20),
          syncedAt: Date.now(),
          checked: { ...d.checked, ...checked },
          readAt: { ...d.readAt, ...readAt },
          assigns,
          assignsAt,
          subs,
          grades: { ...d.grades, ...grades },
          gradesAt: { ...d.gradesAt, ...gradesAt },
        }))
        setError(null)
        syncAt.current = Date.now()
        if (withContents) pagesAt.current = Date.now()
      } catch (e) {
        if (e === 'signed-out') signedOut()
        else setError(typeof e === 'string' ? e : 'Could not reach SCELE')
        // tried again in RETRY_MS, or as soon as the network is back
        syncAt.current = Date.now() - SYNC_MS + RETRY_MS
      } finally {
        busy.current = false
        setSyncing(false)
        setProgress(null)
      }
    },
    [signedOut],
  )

  // a sync every SYNC_MS, with course pages every PAGES_MS, around the clock. Checked each minute
  // rather than left to one long timer, which sleep pauses: a computer waking up, coming back
  // online or the island being opened again reads anything older than STALE_MS at once
  useEffect(() => {
    if (!account) return
    const due = (soon = false) => {
      const now = Date.now()
      const pages = now - pagesAt.current >= PAGES_MS
      if (pages || now - syncAt.current >= (soon ? STALE_MS : SYNC_MS)) sync(account, pages)
    }
    const back = () => due(true)
    const shown = () => document.visibilityState === 'visible' && due(true)
    due()
    const id = setInterval(due, 60_000)
    window.addEventListener('online', back)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', shown)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', back)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', shown)
    }
  }, [account, sync])

  const { auto, duplicates, unsure, status, earlier, timelines, termStart, unplanned } = useMemo(() => detect(data, prefs, slcm ?? null), [data, prefs, slcm])
  // the period's classes only: hand-added slots of a course that has ended drop out, and a class
  // added by hand stands in for a found one on the same day whose time wasn't listed
  const slots = useMemo(() => {
    const own = data.courses.length ? manual.filter((s) => data.courses.some((c) => c.id === s.courseId)) : manual
    const found = auto.filter((a) => !own.some((m) => slotKey(m) === slotKey(a) || (!a.start && m.courseId === a.courseId && m.day === a.day)))
    return [...own, ...found]
  }, [manual, auto, data.courses])

  /**
   * One meeting of a slot: what the timeline (or else the course outline) says it covers, where
   * that is written, and the course page's section and materials for that topic.
   */
  const meeting = useCallback(
    (slot: ClassSlot, start: number, end: number): Meeting => {
      const course = data.courses.find((c) => c.id === slot.courseId)
      const sections = course ? (data.contents[course.id] ?? []) : []
      const base = { slot, course, title: course ? courseTitle(course) : (slot.name ?? 'Class'), start, end }
      const none = { section: null, materials: [] as SceleModule[] }
      const tl = timelines[slot.courseId]
      // which of the course's weekly classes this is, for a plan that numbers meetings ("Pertemuan 5")
      const week = [...new Set(slots.filter((x) => x.courseId === slot.courseId).map((x) => (x.day + 6) % 7))].sort((a, b) => a - b)
      const ag = tl && course ? agendaOn(tl.timeline, start, termStart, { perWeek: week.length || 1, index: Math.max(0, week.indexOf((slot.day + 6) % 7)) }) : null
      if (ag && course) {
        const [topic = '', ...detail] = ag.topic.split(' · ')
        // the words decide; a section dated or numbered for this week is the fallback
        const dated = topicFor(course, sections, start, termStart)
        const fallback = (ag.week !== undefined ? sections.find((s) => weekOf(s) === ag.week) : undefined) ?? (dated?.source === 'dated' ? dated.section : null)
        return {
          ...base,
          topic: topic || (ag.kind === 'off' ? 'No class' : ''),
          detail,
          from: ag.exact ? 'timeline' : 'timeline-week',
          source: { name: tl.name, url: browserUrl(tl.url, ag.page), page: ag.page },
          kind: ag.kind,
          ...(ag.kind === 'off' ? none : coverage(course, sections, ag.topic, start, fallback ?? null)),
        }
      }
      const outline = course ? topicFor(course, sections, start, termStart) : null
      return {
        ...base,
        topic: outline?.topic ?? '',
        detail: [],
        from: outline ? (outline.source === 'dated' ? 'outline-dated' : 'outline-week') : null,
        kind: 'class',
        ...(outline && course ? coverage(course, sections, outline.topic, start, outline.section) : none),
      }
    },
    [data.courses, data.contents, timelines, termStart, slots],
  )

  /** Every meeting from the day of `from` for `days` days, in order, leaving out any after the timeline ends. */
  const upcoming = useCallback(
    (from: number, days: number): Meeting[] => {
      const out: Meeting[] = []
      for (let d = 0; d < days; d++) {
        const day = startOfDay(from) + d * DAY_MS + 12 * 3600_000 // midday, clear of daylight-saving edges
        for (const slot of slots) {
          const m = meetingOn(slot, day)
          if (!m) continue
          const tl = timelines[slot.courseId]?.timeline
          if (tl && timelineOver(tl, m.start)) continue
          out.push(meeting(slot, m.start, m.end))
        }
      }
      return out.sort((a, b) => a.start - b.start)
    },
    [slots, timelines, meeting],
  )

  // the course page moved a class (time, day or room): say so, once
  useEffect(() => {
    if (!account) return
    const s = seen.current
    let changed = false
    for (const c of data.courses) {
      const mine = auto.filter((a) => a.courseId === c.id)
      const sig = `${prefs.choice[c.id] ?? ''}/${prefs.primary[subjectOf(c)] ?? ''}|${mine.map((m) => `${slotKey(m)}@${m.end}@${m.room}`).join(',')}`
      const was = s.schedule[c.id]
      if (was === sig) continue
      // only the room's separators changed (how it is written, not where): kept without an alert
      const squash = (x: string) => x.replace(/\s*(?:-{2,}|—|\||·)\s*/g, ' ')
      if (was !== undefined && squash(was) === squash(sig)) {
        s.schedule[c.id] = sig
        changed = true
        continue
      }
      // only a change the course made to classes it already had, not the user picking their class
      // or classes being found for the first time
      if (was !== undefined && was.split('|')[0] === sig.split('|')[0] && was.split('|')[1] && mine.length) {
        alertRef.current({ icon: '📅', text: `${c.short} schedule changed`, sub: times(mine), openTab: 'classes' }, 'attention')
      }
      s.schedule[c.id] = sig
      changed = true
    }
    if (changed) write(SEEN_KEY, s)
  }, [account, auto, data.courses, prefs.choice, prefs.primary])

  // heads-ups for deadlines and classes, checked every half minute
  useEffect(() => {
    if (!account) return
    const check = () => {
      const now = Date.now()
      const s = seen.current
      let changed = false
      const fire = (key: string) => {
        if (s.fired[key]) return false
        s.fired[key] = now
        changed = true
        return true
      }

      for (const d of data.deadlines) {
        const left = d.due - now
        // handed in: nothing left to remind about
        if (left <= 0 || d.submission === 'submitted') continue
        // only the tightest step reached: opening the laptop 2h before is one alert, not three
        const i = DUE_STEPS.findLastIndex((t) => left <= t)
        if (i < 0) continue
        const key = `due:${d.id}:${DUE_HOURS[i]}h`
        if (!s.fired[key]) {
          DUE_HOURS.slice(0, i + 1).forEach((h) => fire(`due:${d.id}:${h}h`))
          const state = d.submission === 'draft' ? ' · still a draft' : d.submission === 'reopened' ? ' · reopened' : ''
          alertRef.current({ icon: '📅', text: `${d.course}: ${d.name}`.slice(0, 40), sub: `Due ${relTime(d.due, now)}${state}`, openTab: 'deadlines' }, i >= DUE_URGENT ? 'attention' : 'ready')
        }
      }

      const hour = new Date(now).getHours()
      const morning = hour >= MORNING[0] && hour < MORNING[1]
      for (const m of upcoming(now, 2)) {
        const name = `${m.slot.teaching ? 'TA · ' : ''}${m.course?.short ?? m.title}`
        const key = `class:${slotKey(m.slot)}:${new Date(m.start).toDateString()}`
        const today = startOfDay(m.start) === startOfDay(now)
        if (m.kind === 'off') {
          // a holiday on the timeline: no reminder, just a word in the morning
          if (today && morning && fire(`${key}:off`)) alertRef.current({ icon: '📅', text: `No ${name} class today`, sub: m.topic.slice(0, 48), openTab: 'classes' }, 'ready')
          continue
        }
        const what = (m.kind === 'exam' ? '📝 ' : '') + (m.topic || 'Topic not listed on SCELE')
        if (!m.slot.start) {
          if (today && morning && fire(key)) alertRef.current({ icon: '🎓', text: `${name} today · time not listed`, sub: what.slice(0, 48), openTab: 'classes' }, 'attention')
          continue
        }
        const left = m.start - now
        if (left <= 0 || left > lead * 60_000 || !fire(key)) continue
        alertRef.current({ icon: '🎓', text: `${name} ${relTime(m.start, now)}${m.slot.room ? ` · ${m.slot.room}` : ''}`, sub: what.slice(0, 48), openTab: 'classes' }, 'attention')
      }

      if (changed) {
        // forget alerts older than a week
        for (const [k, t] of Object.entries(s.fired)) if (now - t > 8 * DAY_MS) delete s.fired[k]
        write(SEEN_KEY, s)
      }
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [account, data.deadlines, upcoming, lead])

  const login = useCallback(async (password: string) => {
    const a = await sceleLogin(password)
    pagesAt.current = 0
    setAccount(a)
  }, [])

  const logout = useCallback(() => {
    sceleLogout().catch(() => {})
    seen.current = noSeen()
    write(SEEN_KEY, seen.current)
    forgetInboxRead()
    signedOut()
  }, [signedOut])

  const refresh = useCallback(() => {
    if (account) sync(account, true, true)
  }, [account, sync])
  /** A regular sync now rather than at the next 10 minutes: the user is back and wants what's new. */
  const syncSoon = useCallback(() => {
    if (account) sync(account, false)
  }, [account, sync])

  const addSlot = useCallback((s: Omit<ClassSlot, 'id'>) => {
    setManual((l) => (l.some((x) => slotKey(x) === slotKey(s)) ? l : [...l, { ...s, id: `${slotKey(s)}-${Date.now()}` }]))
    // adding back a found meeting the user had removed
    setPrefs((p) => ({ ...p, dismissed: p.dismissed.filter((k) => k !== slotKey(s)) }))
  }, [])
  /** A found meeting is hidden (and stays hidden); a hand-added one is deleted. */
  const removeSlot = useCallback((slot: ClassSlot) => {
    if (slot.auto) setPrefs((p) => ({ ...p, dismissed: [...p.dismissed, slotKey(slot)] }))
    else setManual((l) => l.filter((x) => x.id !== slot.id))
  }, [])
  /** Which parallel class the user is in ('-' = none of them). */
  const chooseClass = useCallback((courseId: number, label: string) => {
    setPrefs((p) => ({ ...p, choice: { ...p.choice, [courseId]: label } }))
  }, [])
  /** The real course of a subject enrolled more than once. */
  const choosePrimary = useCallback((subject: string, courseId: number) => {
    setPrefs((p) => ({ ...p, primary: { ...p.primary, [subject]: courseId } }))
  }, [])
  /** Forget class choices and hidden meetings, and read the course pages afresh. */
  const redetect = useCallback(() => setPrefs(NO_PREFS), [])
  /** Mark a course as one the user teaches (a TA) or takes, over what SCELE's roles suggest. */
  const setTeaching = useCallback((courseId: number, on: boolean) => {
    setPrefs((p) => ({ ...p, teaching: { ...p.teaching, [courseId]: on } }))
  }, [])
  /** Leave a course out of the schedule, or bring it back. */
  const setHidden = useCallback((courseId: number, on: boolean) => {
    setPrefs((p) => ({ ...p, hidden: on ? [...new Set([...p.hidden, courseId])] : p.hidden.filter((x) => x !== courseId) }))
  }, [])
  const setLead = useCallback((m: number) => {
    setLeadState(m)
    write(LEAD_KEY, m)
  }, [])
  /**
   * Reads the study plan from SLCM, signing in with the SSO UI password (used once, not kept), or
   * with `quiet` and no password, UI's saved login session. Resolves 'ok', 'closed' if the SLCM
   * window was closed first, or 'needs-password' when the saved session has run out.
   */
  const connectSlcm = useCallback(async (password: string | null, quiet = false): Promise<'ok' | 'closed' | 'needs-password'> => {
    setSlcmStage('loading')
    try {
      const got = await slcmConnect(password, setSlcmStage, quiet)
      if (got === 'needs-password') return got
      if (got) setSlcm(got)
      return got ? 'ok' : 'closed'
    } finally {
      setSlcmStage(null)
    }
  }, [])
  const forgetSlcm = useCallback(() => {
    slcmForget().catch(() => {})
    setSlcm(null)
  }, [])

  // notifications already looked at on the Inbox page are read, whatever SCELE says
  const notices = useMemo(() => data.notices.map((n) => (n.read || n.id > inboxRead ? n : { ...n, read: true })), [data.notices, inboxRead])
  /** the Inbox page has been looked at: every notification on it now counts as read (later ones won't) */
  const markInboxRead = useCallback(() => {
    const newest = data.notices.reduce((m, n) => Math.max(m, n.id), 0)
    setInboxRead((was) => {
      const next = Math.max(was, newest)
      write(INBOX_KEY, next)
      return next
    })
  }, [data.notices])

  const tuned = prefs.dismissed.length > 0 || Object.keys(prefs.choice).length > 0 || Object.keys(prefs.primary).length > 0 || Object.keys(prefs.teaching).length > 0 || prefs.hidden.length > 0
  return {
    account,
    ...data,
    notices,
    markInboxRead,
    slots,
    duplicates,
    unsure,
    status,
    earlier,
    timelines,
    unplanned,
    upcoming,
    slcm: slcm ?? null,
    /** the saved SLCM timetable has been looked up (slcm is null until then too) */
    slcmKnown: slcm !== undefined,
    slcmStage,
    slcmBusy: slcmStage !== null,
    connectSlcm,
    showSlcm: slcmShow,
    cancelSlcm: slcmCancel,
    forgetSlcm,
    tuned,
    lead,
    syncing,
    progress,
    error,
    login,
    logout,
    refresh,
    syncSoon,
    addSlot,
    removeSlot,
    chooseClass,
    choosePrimary,
    redetect,
    setTeaching,
    setHidden,
    setLead,
  }
}

export type SceleState = ReturnType<typeof useScele>
