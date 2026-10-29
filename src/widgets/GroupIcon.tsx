import type { ComponentType } from 'react'
import { House, CalendarClock, FolderOpen, ListChecks, Settings2, Target, Users } from 'lucide-react'
import { AstraStar } from './AstraStar'
import { UiLogo } from './UiLogo'

// written out, not imported, so the bundler can drop the logo from the regular build
// also the browser dev server, for the SCELE demo (see campus.ts)
const CAMPUS = (import.meta.env.VITE_CAMPUS === '1' || (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window) && !location.search.includes('nocampus')))

const ICONS: Record<string, ComponentType<{ size?: number | string; strokeWidth?: number | string }>> = {
  astra: AstraStar,
  home: House,
  tools: ListChecks,
  focus: Target,
  plan: CalendarClock,
  files: FolderOpen,
  social: Users,
  settings: Settings2,
}

/** Line icons for the page groups on the rail. They use the current text colour. */
export function GroupIcon({ id, size = 18 }: { id: string; size?: number }) {
  // Campus is Universitas Indonesia's
  if (CAMPUS && id === 'campus') return <UiLogo size={size + 1} />
  const Icon = ICONS[id] ?? Settings2
  return <Icon size={size} strokeWidth={1.9} aria-hidden />
}
