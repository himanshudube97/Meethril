'use client'

import { motion } from 'framer-motion'
import type { Theme } from '@/lib/themes'
import type { JournalEntry } from '@/store/journal'
import type { MemoryStar } from '../../ConstellationRenderer'
import { MemoryModal } from '../../MemoryModal'
import { WindowFrame } from '../WindowFrame'
import { ViewBeyondGlass } from '../ViewBeyondGlass'
import { RainStreaks } from '../RainStreaks'
import { AmbientDrops } from '../AmbientDrops'
import { MemoryDroplet } from '../MemoryDroplet'
import { BrickWall } from '../BrickWall'

export interface RainWindowSceneProps {
  loading: boolean
  entries: JournalEntry[]
  memoryStars: MemoryStar[]
  selectedStar: MemoryStar | null
  setSelectedStar: (s: MemoryStar | null) => void
  theme: Theme
}

// Inside-the-glass layer order: dusk view → rain falling outside → wet drops
// on the inside of the pane (ambient + memory). Wrapped here once so loading,
// empty, and main branches all stay consistent.
function GlassContent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ViewBeyondGlass />
      <RainStreaks count={75} />
      {children}
    </div>
  )
}

export function RainWindowScene({
  loading,
  entries,
  memoryStars,
  selectedStar,
  setSelectedStar,
  theme,
}: RainWindowSceneProps) {
  // Loading
  if (loading) {
    return (
      <motion.div
        className="fixed inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrickWall />
        <WindowFrame>
          <GlassContent />
          <div className="absolute inset-0 flex items-center justify-center">
            <p
              style={{
                color: theme.text.muted,
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                textShadow: '0 1px 8px rgba(0,0,0,0.55)',
              }}
            >
              the rain is gathering…
            </p>
          </div>
        </WindowFrame>
      </motion.div>
    )
  }

  // Empty
  if (entries.length === 0) {
    return (
      <motion.div
        className="fixed inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrickWall />
        <WindowFrame>
          <GlassContent />
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <motion.p
              className="text-center max-w-xs"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 1 }}
              style={{
                color: '#dce3ec',
                fontFamily: 'var(--font-caveat, cursive)',
                fontSize: '1.35rem',
                lineHeight: 1.5,
                textShadow: '0 1px 8px rgba(0,0,0,0.7)',
              }}
            >
              no drops yet.<br />
              write something — the window remembers.
            </motion.p>
          </div>
        </WindowFrame>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
    >
      <BrickWall />

      <WindowFrame>
        <GlassContent>
          <AmbientDrops />
          {memoryStars.map((star) => (
            <MemoryDroplet
              key={star.id}
              star={star}
              onSelect={setSelectedStar}
            />
          ))}
        </GlassContent>
      </WindowFrame>

      {/* Title — sits over the wall, above the window */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute top-12 md:top-16 left-1/2 -translate-x-1/2 text-center pointer-events-none z-20 px-4"
      >
        <p
          style={{
            color: theme.text.primary,
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            letterSpacing: '0.015em',
            fontSize: 'clamp(1rem, 2.6vw, 1.625rem)',
            textShadow: `0 2px 18px rgba(0,0,0,0.85)`,
            lineHeight: 1.2,
          }}
        >
          the rain remembers
        </p>
        <p
          className="mt-2"
          style={{
            color: '#bcc4cf',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: '0.85rem',
            textShadow: '0 1px 8px rgba(0,0,0,0.8)',
          }}
        >
          {memoryStars.length} {memoryStars.length === 1 ? 'drop on the glass' : 'drops on the glass'} tonight
        </p>
      </motion.div>

      <MemoryModal
        selectedStar={selectedStar}
        setSelectedStar={setSelectedStar}
        theme={theme}
      />
    </motion.div>
  )
}
