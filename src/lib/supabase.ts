import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until a Supabase project is filled into .env.local (see supabase/README.md). */
export const BACKEND_READY = Boolean(URL && KEY)

export const supabase = createClient(URL ?? 'http://localhost', KEY ?? 'missing', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: BACKEND_READY,
    // the desktop app has no URL to read the session from; Google sign-in is finished by hand
    detectSessionInUrl: false,
  },
})

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_emoji: string
  avatar_color: string
  /** small square JPEG as a data: URL, null = use the emoji */
  avatar_url: string | null
  status: string
}

export type MessageKind = 'text' | 'activity' | 'note'

export interface Message {
  id: number
  sender: string
  recipient: string
  kind: MessageKind
  body: string
  created_at: string
}
