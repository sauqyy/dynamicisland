import { useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { startDrag } from '@crabnebula/tauri-plugin-drag'
import { fmtSize, isImage, openPath, type FileItem } from '../lib/files'
import { IS_TAURI } from '../lib/useMedia'

interface Props {
  item: FileItem
  onRemove: (id: string) => void
  /** shelf tiles can be dragged back out to other apps */
  draggable?: boolean
  /** app tiles show just the name, files also show size / "Folder" */
  showMeta?: boolean
}

function fallbackGlyph(item: FileItem) {
  if (item.isDir) return '📁'
  if (isImage(item.name)) return '🖼️'
  return '📄'
}

async function dragOut(path: string) {
  const icon = await invoke<string | null>('drag_icon')
  if (icon) await startDrag({ item: [path], icon })
}

export function FileTile({ item, onRemove, draggable = true, showMeta = true }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const down = useRef<{ x: number; y: number } | null>(null)

  const thumb = IS_TAURI && isImage(item.name) && !imgFailed ? convertFileSrc(item.path) : null
  const label = item.name.replace(/\.lnk$/i, '')

  return (
    <div
      className="tile"
      title={item.path}
      data-cuelume-tap
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.tile-x')) return
        down.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        const d = down.current
        if (d && e.buttons === 1 && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
          down.current = null
          if (draggable && IS_TAURI) dragOut(item.path).catch(() => {})
        }
      }}
      onPointerUp={() => {
        if (down.current) {
          down.current = null
          openPath(item.path)
        }
      }}
      onPointerLeave={() => (down.current = null)}
    >
      <button className="tile-x" aria-label="Remove" data-cuelume-close data-cuelume-emphasis="subtle" onClick={() => onRemove(item.id)}>
        ×
      </button>
      <div className="tile-icon">
        {thumb ? (
          <img src={thumb} alt="" draggable={false} onError={() => setImgFailed(true)} />
        ) : item.icon ? (
          <img src={item.icon} alt="" draggable={false} />
        ) : (
          <span className="glyph">{showMeta ? fallbackGlyph(item) : label.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="tile-name">{label}</div>
      {showMeta && <div className="tile-meta">{item.isDir ? 'Folder' : fmtSize(item.size)}</div>}
    </div>
  )
}
