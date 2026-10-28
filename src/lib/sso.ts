import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'
import { CAMPUS } from './campus'

/** Who SSO UI says the user is (see sso.rs). */
export interface Student {
  username: string
  name: string
  npm: string
  org_code: string
  role: string
  study_program: string
  educational_program: string
  /** a Fasilkom UI student: the Campus pages are only for them */
  fasilkom: boolean
  /** SSO UI vouched for the account but sent no faculty: connecting SCELE confirms Fasilkom */
  needs_scele: boolean
  /** what SSO UI sent, shown when the faculty can't be confirmed */
  detail: string
  verified_at: number
}

// the browser demo keeps a pretend verification so the Campus pages can be tried
const DEMO_KEY = 'di.sso.demo'
const DEMO_STUDENT: Student = {
  username: 'demo.mahasiswa',
  name: 'Demo Mahasiswa',
  npm: '2306000000',
  org_code: '01.00.12.01',
  role: 'mahasiswa',
  study_program: 'Ilmu Komputer (Computer Science)',
  educational_program: 'S1 Reguler (Undergraduate Program)',
  fasilkom: true,
  needs_scele: false,
  detail: '',
  verified_at: 0,
}

function demoSaved(): Student | null {
  try {
    return localStorage.getItem(DEMO_KEY) ? DEMO_STUDENT : null
  } catch {
    return null
  }
}

/**
 * The SSO UI verification. `student` is undefined while it is being looked up, null when the
 * user has not verified (or is not a Fasilkom student). A student SSO UI gave no faculty for
 * has `needs_scele` until `confirm` signs in to SCELE; only `fasilkom` unlocks Campus.
 */
export function useStudent() {
  const [student, setStudent] = useState<Student | null | undefined>(() => (!CAMPUS ? null : IS_TAURI ? undefined : demoSaved()))

  useEffect(() => {
    if (!CAMPUS || !IS_TAURI) return
    invoke<Student | null>('sso_student')
      .then((s) => setStudent(s?.fasilkom || s?.needs_scele ? s : null))
      .catch(() => setStudent(null))
  }, [])

  /** Confirms Fasilkom with the SCELE password (and connects SCELE in the same step). */
  const confirm = useCallback(async (password: string) => {
    if (!IS_TAURI) return setStudent({ ...DEMO_STUDENT, verified_at: Date.now() })
    await invoke('scele_login', { password })
    setStudent(await invoke<Student | null>('sso_student'))
  }, [])

  /** Opens SSO UI in the browser; resolves with whoever signed in, Fasilkom or not. */
  const verify = useCallback(async () => {
    let s: Student
    if (IS_TAURI) s = await invoke<Student>('sso_verify')
    else {
      try {
        localStorage.setItem(DEMO_KEY, '1')
      } catch {
        /* ignore */
      }
      s = { ...DEMO_STUDENT, verified_at: Date.now() }
    }
    if (s.fasilkom || s.needs_scele) setStudent(s)
    return s
  }, [])

  const forget = useCallback(() => {
    if (IS_TAURI) invoke('sso_forget').catch(() => {})
    else
      try {
        localStorage.removeItem(DEMO_KEY)
      } catch {
        /* ignore */
      }
    setStudent(null)
  }, [])

  return { student, verify, confirm, forget }
}

export type StudentState = ReturnType<typeof useStudent>

/** the regular build has no verification */
export const NO_STUDENT: StudentState = {
  student: null,
  verify: () => Promise.reject(new Error('Campus is not part of this build')),
  confirm: () => Promise.reject(new Error('Campus is not part of this build')),
  forget: () => {},
}
