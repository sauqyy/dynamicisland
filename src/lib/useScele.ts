import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SoundName } from 'cuelume'
import type { IslandAlert } from '../types'
import {
  DAY_NAMES,
  classFromGroups,
  classInName,
  currentTerm,
  detectSlots,
  docCandidates,
  fetchContents,
  fetchCourses,
  fetchDeadlines,
  fetchMyGroups,
  fetchMyRoles,
  fetchNotices,
  isTeachingRole,
  materials,
  meetingOn,
  readDoc,
  relTime,
  sceleAccount,
  sceleLogin,
  sceleLogout,
  slotKey,
  subjectOf,
  termWindow,
  topicFor,
  type ClassSlot,
  type Course,
  type Deadline,
  type Detected,
  type DocRef,
  type Notice,
  type SceleAccount,
  type SceleModule,
  type Section,
} from './scele'
import { agendaOn, classDays, overlap, parseTimeline, timelineOver, timelineScore, type Timeline } from './timeline'

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
}

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
  timeline?: { sessions: number; name: string; url: string }
  /** documents it links to that need a sign-in to read */
  blocked: { name: string; url: string }[]
}

/** One meeting of a class, with what it covers. */
export interface Meeting {
  slot: ClassSlot
  course?: Course
  start: number
  end: number
  topic: string
  /** where the topic came from: the timeline row for that day, the timeline's week, or the course outline */
  from: 'timeline' | 'timeline-week' | 'outline-dated' | 'outline-week' | null
  /** a class, an exam, or a day without class (holiday) */
  kind: 'class' | 'exam' | 'off'
  /** course materials that go with it */
  materials: SceleModule[]
}

const EMPTY: Cache = { courses: [], deadlines: [], notices: [], contents: {}, groups: {}, roles: {}, docs: {}, fresh: [], syncedAt: 0 }
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

/** Deadlines and notifications are checked this often; course pages every third time. */
const SYNC_MS = 10 * 60_000
/** Deadline heads-ups, tightest last. */
const DUE_STEPS = [24, 3, 1].map((h) => h * 3600_000)
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

const times = (slots: ClassSlot[]) => slots.map((s) => `${DAY_NAMES[s.day]} ${s.start || '(time not listed)'}`).join(', ')
const startOfDay = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Reads one course document into what the schedule needs; failures are kept too, so they aren't retried every sync. */
async function readOne(ref: DocRef, course: Course): Promise<DocResult> {
  const base = { name: ref.name, url: ref.url, kind: ref.kind, readAt: Date.now() }
  try {
    const text = await readDoc(ref)
    return { ...base, timeline: parseTimeline(text, termWindow(course)), slots: detectSlots(course, [], [text]) }
  } catch (e) {
    return { ...base, timeline: null, slots: [], blocked: e === 'signin' ? 'signin' : 'failed' }
  }
}

/**
 * The class times of this term's courses, with no setup:
 * - times written out ("Selasa 10.00 - 11.40") on the course page or in its documents;
 * - else the weekdays the course timeline's dated sessions fall on, with the time its rows give,
 *   or marked as not listed.
 * A course that lists several parallel classes gives the user's: the one its name is for ("(A)"),
 * or the one their SCELE group names. The only question asked is when one subject is enrolled
 * twice, since that is usually a mistake; until it is answered neither course adds classes.
 * Courses of earlier terms (SCELE keeps some "in progress") and hidden ones are left out; ones
 * the user teaches are marked.
 */
function detect(data: Cache, prefs: Prefs) {
  const auto: ClassSlot[] = []
  const duplicates: DuplicateQuestion[] = []
  const unsure: ClassQuestion[] = []
  const status: CourseStatus[] = []
  const timelines: Record<number, { timeline: Timeline; name: string; url: string }> = {}
  const { current, earlier } = currentTerm(data.courses)
  const teaching = (c: Course) => prefs.teaching[c.id] ?? isTeachingRole(data.roles[c.id] ?? [])
  const taking = current.filter((c) => !prefs.hidden.includes(c.id) && !teaching(c))

  const bySubject = new Map<string, Course[]>()
  for (const c of taking) {
    const k = subjectOf(c)
    if (k) bySubject.set(k, [...(bySubject.get(k) ?? []), c])
  }
  const skip = new Set<number>()
  for (const [subject, list] of bySubject) {
    if (list.length < 2) continue
    const keep = prefs.primary[subject]
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
    const best = results.filter((r) => r.timeline).sort((a, b) => timelineScore(b.timeline!) - timelineScore(a.timeline!))[0]
    if (best) timelines[c.id] = { timeline: best.timeline!, name: best.name, url: best.url }
    const row: CourseStatus = {
      course: c,
      found: 0,
      source: null,
      teaching: teach,
      hidden,
      timeline: best ? { sessions: best.timeline!.sessions.length, name: best.name, url: best.url } : undefined,
      blocked: results.filter((r) => r.blocked === 'signin').map((r) => ({ name: r.name, url: r.url })),
    }
    status.push(row)
    if (hidden || skip.has(c.id)) continue

    // times written out: the course page first, then its documents
    let found = detectSlots(c, sections)
    let source: ClassSlot['source'] = 'page'
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
    // the timeline's class days, for a course with no written times or days it leaves out
    const days = best ? classDays(best.timeline!) : []
    if (!picked.length && days.length) source = 'timeline'
    for (const d of days) {
      if (picked.some((p) => p.day === d.day)) continue
      if (found.length && !picked.length) break // a list of classes, none of them known to be the user's
      picked.push({ courseId: c.id, day: d.day, start: d.start ?? '', end: d.end ?? '', room: '', from: 'timeline' })
    }

    for (const { from, ...sl } of picked) {
      const key = slotKey(sl)
      if (prefs.dismissed.includes(key)) continue
      auto.push({ ...sl, id: `auto-${key}`, auto: true, teaching: teach, source: from ?? source })
      row.found++
    }
    row.source = row.found ? source : null
  }
  return { auto, duplicates, unsure, status, earlier, timelines }
}

/** The SCELE materials that go with a meeting: from its week's section, and named like its topic. */
function materialsFor(sections: Section[], topic: string, week: number | undefined, outline: Section | null): SceleModule[] {
  const weekOf = (s: Section) => Number(s.name.match(/\b(?:week|minggu|pekan|pertemuan|sesi|session|topic|topik)\s*(?:ke-?\s*)?(\d{1,2})\b/i)?.[1] ?? NaN)
  return sections
    .flatMap((s) => {
      const sameWeek = (week !== undefined && weekOf(s) === week) || s === outline
      return materials([s]).map((m) => ({ m, score: (sameWeek ? 2 : 0) + (topic ? overlap(topic, m.name) : 0) }))
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.m)
}

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
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Seen>(read(SEEN_KEY, noSeen()))
  const alertRef = useRef(onAlert)
  alertRef.current = onAlert
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const dataRef = useRef(data)
  dataRef.current = data
  const round = useRef(0)

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
      return
    }
    sceleAccount()
      .then((a) => setAccount(a ?? null))
      .catch(() => setAccount(null))
  }, [enabled, signedOut])

  const sync = useCallback(
    async (acc: SceleAccount, withContents: boolean) => {
      setSyncing(true)
      try {
        const [courses, deadlines, notices] = await Promise.all([fetchCourses(acc.userid), fetchDeadlines(), fetchNotices(acc.userid)])
        const s = seen.current

        // notifications newer than the last one shown; the very first sync only takes note of them
        const newest = notices.reduce((m, n) => Math.max(m, n.id), 0)
        if (s.notice) {
          const fresh = notices.filter((n) => n.id > s.notice && !n.read)
          if (fresh.length === 1) alertRef.current({ icon: '📣', text: fresh[0].subject.slice(0, 40), sub: fresh[0].text.slice(0, 48), openTab: 'inbox' }, 'ready')
          else if (fresh.length > 1) alertRef.current({ icon: '📣', text: `${fresh.length} new on SCELE`, sub: fresh[0].subject.slice(0, 48), openTab: 'inbox' }, 'ready')
        }
        s.notice = Math.max(s.notice, newest)

        let contents: Record<number, Section[]> | null = null
        const groups: Record<number, string[]> = {}
        const roles: Record<number, string[]> = {}
        const docs: Record<string, DocResult> = {}
        const added: Fresh[] = []
        if (withContents) {
          contents = {}
          const thisTerm = new Set(currentTerm(courses).current.map((c) => c.id))
          let spent = 0
          for (const c of courses) {
            const secs = await fetchContents(c.id).catch((e) => {
              if (e === 'signed-out') throw e
              return null
            })
            if (!secs) continue
            contents[c.id] = secs
            // labels are page text, not materials: they are neither counted nor announced
            const ids = materials(secs).map((m) => m.id)
            const known = s.modules[c.id]
            if (known) {
              const had = new Set(known)
              for (const m of materials(secs)) {
                if (!had.has(m.id)) added.push({ key: `${c.id}:${m.id}`, courseId: c.id, course: c.short, name: m.name, url: m.url, at: Date.now() })
              }
            }
            s.modules[c.id] = ids
            if (!thisTerm.has(c.id)) continue
            // teaching or taking it: SCELE's role in the course, looked up once
            if (dataRef.current.roles[c.id] === undefined) roles[c.id] = await fetchMyRoles(c.id, acc.userid).catch(() => [])

            // the course's documents, likeliest first: everything named like a timeline or
            // syllabus, then (only while nothing is found) the general section's other documents
            let haveTimeline = false
            let haveTimes = detectSlots(c, secs).length > 0
            let courseSpent = 0
            let general = 0
            const mine: DocResult[] = []
            for (const ref of docCandidates(secs)) {
              if (ref.tier === 2 && (haveTimeline || general >= 6)) break
              const cost = ref.size || 2 * 1024 * 1024
              const cached = dataRef.current.docs[ref.key]
              const fresh = cached && (ref.kind === 'file' || Date.now() - cached.readAt < LINK_TTL)
              if (!fresh && (ref.size > (ref.tier === 1 ? 20 : 10) * 1024 * 1024 || courseSpent + cost > COURSE_BUDGET || spent + cost > SYNC_BUDGET)) continue
              if (ref.tier === 2) general++
              const res = fresh ? cached : await readOne(ref, c)
              if (!fresh) {
                courseSpent += cost
                spent += cost
              }
              docs[ref.key] = res
              mine.push(res)
              if (res.timeline) haveTimeline = true
              if (res.slots.length) haveTimes = true
            }
            // several parallel classes listed and none chosen: the user's SCELE group may say which
            const listed = detectSlots(c, secs).length > 1 || mine.some((d) => d.slots.length > 1)
            if (haveTimes && listed && prefsRef.current.choice[c.id] === undefined) {
              groups[c.id] = await fetchMyGroups(c.id, acc.userid).catch(() => [])
            }
          }
          if (added.length === 1) alertRef.current({ icon: '📄', text: `New in ${added[0].course}`, sub: added[0].name.slice(0, 48), openTab: 'inbox' }, 'ready')
          else if (added.length > 1) alertRef.current({ icon: '📄', text: `${added.length} new materials`, sub: [...new Set(added.map((a) => a.course))].join(', '), openTab: 'inbox' }, 'ready')
        }
        write(SEEN_KEY, s)
        setData((d) => ({
          courses,
          deadlines,
          notices,
          contents: contents ? { ...d.contents, ...contents } : d.contents,
          groups: { ...d.groups, ...groups },
          roles: { ...d.roles, ...roles },
          // only the documents still on the course pages are kept
          docs: contents ? docs : d.docs,
          fresh: [...added, ...d.fresh].slice(0, 20),
          syncedAt: Date.now(),
        }))
        setError(null)
      } catch (e) {
        if (e === 'signed-out') signedOut()
        else setError(typeof e === 'string' ? e : 'Could not reach SCELE')
      } finally {
        setSyncing(false)
      }
    },
    [signedOut],
  )

  // sync now, then every SYNC_MS; course pages on the first round and every third after
  useEffect(() => {
    if (!account) return
    const run = () => sync(account, round.current++ % 3 === 0)
    run()
    const id = setInterval(run, SYNC_MS)
    return () => clearInterval(id)
  }, [account, sync])

  const { auto, duplicates, unsure, status, earlier, timelines } = useMemo(() => detect(data, prefs), [data, prefs])
  // the period's classes only: hand-added slots of a course that has ended drop out, and a class
  // added by hand stands in for a found one on the same day whose time wasn't listed
  const slots = useMemo(() => {
    const own = data.courses.length ? manual.filter((s) => data.courses.some((c) => c.id === s.courseId)) : manual
    const found = auto.filter((a) => !own.some((m) => slotKey(m) === slotKey(a) || (!a.start && m.courseId === a.courseId && m.day === a.day)))
    return [...own, ...found]
  }, [manual, auto, data.courses])

  /** One meeting of a slot, with what the timeline (or else the course outline) says it covers. */
  const meeting = useCallback(
    (slot: ClassSlot, start: number, end: number): Meeting => {
      const course = data.courses.find((c) => c.id === slot.courseId)
      const sections = course ? (data.contents[course.id] ?? []) : []
      const tl = timelines[slot.courseId]?.timeline
      const ag = tl && course ? agendaOn(tl, start, course.start) : null
      if (ag) {
        return {
          slot,
          course,
          start,
          end,
          topic: ag.topic || (ag.kind === 'off' ? 'No class' : ''),
          from: ag.exact ? 'timeline' : 'timeline-week',
          kind: ag.kind,
          materials: ag.kind === 'off' ? [] : materialsFor(sections, ag.topic, ag.week, null),
        }
      }
      const outline = course ? topicFor(course, sections, start) : null
      return {
        slot,
        course,
        start,
        end,
        topic: outline?.section.name ?? '',
        from: outline ? (outline.source === 'dated' ? 'outline-dated' : 'outline-week') : null,
        kind: 'class',
        materials: outline ? materialsFor(sections, outline.section.name, undefined, outline.section) : [],
      }
    },
    [data.courses, data.contents, timelines],
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
        if (left <= 0) continue
        // only the tightest step reached: opening the laptop 2h before is one alert, not three
        const i = DUE_STEPS.findLastIndex((t) => left <= t)
        if (i < 0) continue
        const key = `due:${d.id}:${i}`
        if (!s.fired[key]) {
          DUE_STEPS.slice(0, i + 1).forEach((_, j) => fire(`due:${d.id}:${j}`))
          alertRef.current({ icon: '📅', text: `${d.course}: ${d.name}`.slice(0, 40), sub: `Due ${relTime(d.due, now)}`, openTab: 'deadlines' }, i >= 1 ? 'attention' : 'ready')
        }
      }

      const hour = new Date(now).getHours()
      const morning = hour >= MORNING[0] && hour < MORNING[1]
      for (const m of upcoming(now, 2)) {
        const name = `${m.slot.teaching ? 'TA · ' : ''}${m.course?.short ?? 'Class'}`
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
    round.current = 0
    setAccount(a)
  }, [])

  const logout = useCallback(() => {
    sceleLogout().catch(() => {})
    seen.current = noSeen()
    write(SEEN_KEY, seen.current)
    signedOut()
  }, [signedOut])

  const refresh = useCallback(() => {
    if (account) sync(account, true)
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

  const tuned = prefs.dismissed.length > 0 || Object.keys(prefs.choice).length > 0 || Object.keys(prefs.primary).length > 0 || Object.keys(prefs.teaching).length > 0 || prefs.hidden.length > 0
  return {
    account,
    ...data,
    slots,
    duplicates,
    unsure,
    status,
    earlier,
    timelines,
    upcoming,
    tuned,
    lead,
    syncing,
    error,
    login,
    logout,
    refresh,
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
