import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './useMedia'

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
 * user has not verified (or is not a Fasilkom student).
 */
export function useStudent() {
  const [student, setStudent] = useState<Student | null | undefined>(() => (IS_TAURI ? undefined : demoSaved()))

  useEffect(() => {
    if (!IS_TAURI) return
    invoke<Student | null>('sso_student')
      .then((s) => setStudent(s?.fasilkom ? s : null))
      .catch(() => setStudent(null))
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
    if (s.fasilkom) setStudent(s)
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

  return { student, verify, forget }
}

export type StudentState = ReturnType<typeof useStudent>
