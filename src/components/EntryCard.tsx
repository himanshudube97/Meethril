'use client'

import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { useThemeStore } from '@/store/theme'
import { JournalEntry } from '@/store/journal'
import DoodlePreview from './DoodlePreview'

interface EntryCardProps {
  entry: JournalEntry
  onClick?: () => void
}

export default function EntryCard({ entry, onClick }: EntryCardProps) {
  const { theme } = useThemeStore()

  // Letter drafts in JournalEntry are always unsealed (letters move to the
  // Letter table when sealed, and the JE draft is deleted). Sealed letters
  // no longer appear as JournalEntry rows, so this branch is now unreachable
  // in practice. Keeping the entryType check in case of old rows.
  const isLetterDraft = entry.entryType === 'letter' || entry.entryType === 'unsent_letter'

  // Strip HTML tags for preview
  const textPreview = entry.text.replace(/<[^>]*>/g, '').slice(0, 100)

  // Render letter draft card
  if (isLetterDraft) {
    return (
      <motion.div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
        layout
        transition={{ layout: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } }}
        onClick={onClick}
      >
        <span className="text-lg">✉️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: theme.text.primary }}>
            Letter draft
          </p>
        </div>
        <span className="text-sm" style={{ color: theme.text.muted }}>
          📝
        </span>
      </motion.div>
    )
  }

  // Regular entry card (compact preview)
  return (
    <motion.div
      className="rounded-2xl p-4 cursor-pointer"
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
      }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      layout
      transition={{ layout: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <span className="text-sm" style={{ color: theme.text.muted }}>
            {format(new Date(entry.createdAt), 'h:mm a')}
          </span>
        </div>
        {entry.song && (
          <span className="text-sm" style={{ color: theme.accent.warm }}>
            ♫
          </span>
        )}
      </div>

      {/* Text preview */}
      <p
        className="text-sm line-clamp-2"
        style={{ color: theme.text.secondary }}
      >
        {textPreview}{textPreview.length >= 100 ? '...' : ''}
      </p>

      {/* Doodle thumbnails */}
      {entry.doodles && entry.doodles.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {entry.doodles.map((doodle) => (
            <DoodlePreview key={doodle.id} strokes={doodle.strokes} />
          ))}
        </div>
      )}

      {/* Tags */}
      {entry.tags && entry.tags.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 rounded-full text-xs"
              style={{
                background: `${theme.accent.primary}30`,
                color: theme.accent.primary,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}
