import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { User } from '@supabase/supabase-js'
import { BACKEND_READY, supabase, type Profile } from './supabase'
import { IS_TAURI } from './useMedia'

const OAUTH_PORT = 53682

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(BACKEND_READY)

  const loadProfile = useCallback(async (id: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    if (!BACKEND_READY) return
    let live = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!live) return
      setUser(data.session?.user ?? null)
      if (data.session?.user) await loadProfile(data.session.user.id)
      if (live) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setProfile(null)
      else setTimeout(() => loadProfile(session.user.id), 0)
    })
    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  /** Resolves to an error message, or null on success. */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return error.message
    // with email confirmation on there is no session yet
    return data.session ? null : 'Check your inbox to confirm your email, then sign in.'
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!IS_TAURI) {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
      return error?.message ?? null
    }
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `http://127.0.0.1:${OAUTH_PORT}`, skipBrowserRedirect: true },
      })
      if (error || !data.url) return error?.message ?? 'Could not start Google sign-in'
      // listen first, then open the browser, so the redirect can never be missed
      const waiting = invoke<string>('oauth_wait')
      await invoke('open_url', { url: data.url })
      const code = await waiting
      const res = await supabase.auth.exchangeCodeForSession(code)
      return res.error?.message ?? null
    } catch (e) {
      return String(e)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const saveProfile = useCallback(
    async (patch: Partial<Omit<Profile, 'id'>>) => {
      if (!user) return 'Not signed in'
      const row = { id: user.id, ...patch }
      const { data, error } = await supabase
        .from('profiles')
        .upsert(row, { onConflict: 'id' })
        .select()
        .single()
      if (error) return error.code === '23505' ? 'That username is taken' : error.message
      setProfile(data as Profile)
      return null
    },
    [user],
  )

  return { user, profile, loading, signIn, signUp, signInWithGoogle, signOut, saveProfile }
}

export type Auth = ReturnType<typeof useAuth>
