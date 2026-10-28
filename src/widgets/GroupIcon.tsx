import { FolderOpen, ListChecks, Music2, Settings2, Users, type LucideIcon } from 'lucide-react'
import { UiLogo } from './UiLogo'

// written out, not imported, so the bundler can drop the logo from the regular build
const CAMPUS = import.meta.env.VITE_CAMPUS === '1'

const ICONS: Record<string, LucideIcon> = {
  home: Music2,
  tools: ListChecks,
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
