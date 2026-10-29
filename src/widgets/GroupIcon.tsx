import type { ComponentType } from 'react'
import { House, CalendarClock, FolderOpen, ListChecks, Settings2, Users } from 'lucide-react'
import { AstraStar } from './AstraStar'

const ICONS: Record<string, ComponentType<{ size?: number | string; strokeWidth?: number | string }>> = {
  astra: AstraStar,
  home: House,
  tools: ListChecks,
  plan: CalendarClock,
  files: FolderOpen,
  social: Users,
  settings: Settings2,
}

/** Line icons for the page groups on the rail. They use the current text colour. */
export function GroupIcon({ id, size = 18 }: { id: string; size?: number }) {
  const Icon = ICONS[id] ?? Settings2
  return <Icon size={size} strokeWidth={1.9} aria-hidden />
}
