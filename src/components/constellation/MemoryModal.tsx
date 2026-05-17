'use client'

import { AnimatePresence } from 'framer-motion'
import { Theme } from '@/lib/themes'
import type { MemoryStar } from './ConstellationRenderer'
import { MemoryDiaryView } from './MemoryDiaryView'

export function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

interface MemoryModalProps {
  selectedStar: MemoryStar | null
  setSelectedStar: (s: MemoryStar | null) => void
  theme: Theme
}

export function MemoryModal({ selectedStar, setSelectedStar, theme }: MemoryModalProps) {
  return (
    <AnimatePresence>
      {selectedStar && (
        // All entries in the constellation are JournalEntry rows. Letters are
        // stored natively in the Letter table (not in JournalEntry) since
        // Phase 4, so every star here is a regular diary entry → diary view.
        <MemoryDiaryView
          key={selectedStar.entry.id}
          entry={selectedStar.entry}
          theme={theme}
          onClose={() => setSelectedStar(null)}
        />
      )}
    </AnimatePresence>
  )
}
