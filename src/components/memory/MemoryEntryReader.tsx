'use client'

import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { htmlToPlainText } from '@/lib/text-utils'
import { JOURNAL } from '@/lib/journal-constants'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import SongEmbed from '@/components/SongEmbed'
import PhotoBlock from '@/components/desk/PhotoBlock'
import { JournalEntry } from '@/store/journal'

interface Props {
  entry: JournalEntry
  onClose: () => void
}

/**
 * Read-only scrollable view of a memory. Same component on mobile and
 * desktop — the memory feature uses one shared reader instead of the
 * desktop two-page spread + mobile scroll variants.
 */
export default function MemoryEntryReader({ entry, onClose }: Props) {
  const { theme } = useThemeStore()
  const colors = getGlassDiaryColors(theme)
  const plain = htmlToPlainText(entry.text || '')
  // JournalEntry stores photos with `position: number`; PhotoBlock expects
  // the narrower `1 | 2`. Server-side data has always been one of those
  // two values — only the type is loose. Cast through the narrower type.
  const photos = (entry.photos || []).map(p => ({
    ...p,
    position: (p.position === 2 ? 2 : 1) as 1 | 2,
  }))
  const captionDate = new Date(entry.createdAt)
  const dateCaption = captionDate
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-x-0 top-20 bottom-4 z-30 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="h-full max-w-lg mx-auto rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: colors.pageBg,
          border: `1px solid ${colors.pageBorder}`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.pageBorder}` }}
        >
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{
              background: colors.buttonBg,
              color: colors.bodyText,
              border: `1px solid ${colors.buttonBorder}`,
              fontFamily: 'Georgia, serif',
            }}
          >
            Close
          </button>
          <span className="text-xs italic" style={{ color: colors.date, fontFamily: 'Georgia, serif' }}>
            {captionDate.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            })}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {entry.song && (
            <div className="mb-4">
              <SongEmbed url={entry.song} compact audioOnly />
            </div>
          )}

          <div
            className="whitespace-pre-wrap mb-4"
            style={{
              color: colors.bodyText,
              fontFamily: 'var(--font-caveat), Georgia, serif',
              // Match the diary book (write + shelf) exactly so an entry reads
              // identically everywhere — same font size and line spacing.
              fontSize: `${JOURNAL.FONT_SIZE}px`,
              lineHeight: `${JOURNAL.LINE_HEIGHT}px`,
            }}
          >
            {plain || (
              <span style={{ color: colors.prompt, fontStyle: 'italic' }}>No text in this memory.</span>
            )}
          </div>

          {photos.length > 0 && (
            <div className="mb-2">
              <PhotoBlock photos={photos} disabled dateCaption={dateCaption} />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
