import { AnimatePresence, motion } from 'motion/react'
import { FileTile } from './FileTile'
import type { FileItem } from '../lib/files'

interface Props {
  items: FileItem[]
  onRemove: (id: string) => void
  /** Apps page: no file meta, not draggable out, shows a hint when empty */
  apps?: boolean
  emptyHint: string
}

/** Horizontally scrolling row of tiles (mouse wheel or touchpad swipe scrolls it). */
export function ShelfWidget({ items, onRemove, apps = false, emptyHint }: Props) {
  return (
    <div className="shelf" onClick={(e) => e.stopPropagation()}>
      <div
        className="shelf-row"
        onWheel={(e) => {
          if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY
        }}
      >
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              <FileTile item={item} onRemove={onRemove} draggable={!apps} showMeta={!apps} />
            </motion.div>
          ))}
        </AnimatePresence>
        {!items.length && <div className="empty">{emptyHint}</div>}
      </div>
    </div>
  )
}
