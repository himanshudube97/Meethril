'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EE } from '@/hooks/useE2EE'
import { JournalEntry } from '@/store/journal'
import MemoryEntryReader from './MemoryEntryReader'

const VISIBLE_BUTTERFLIES = 5

// Spread positions across the viewport. Slightly varied so it doesn't
// look like a grid. Coordinates are % of viewport.
const HOMES: Array<{ x: number; y: number }> = [
  { x: 20, y: 30 },
  { x: 70, y: 25 },
  { x: 35, y: 60 },
  { x: 78, y: 65 },
  { x: 50, y: 45 },
]

/**
 * Memory surface — same on mobile and desktop. Five butterflies drift
 * across the screen, each carrying one of your past entries. Tapping
 * a butterfly opens the entry as a read-only scrollable reader.
 *
 * Replaces the constellation / garden / firelight scenes which were
 * desktop-only and didn't translate to mobile.
 */
export default function ButterflyMemoryView() {
  const { theme } = useThemeStore()
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [selected, setSelected] = useState<JournalEntry | null>(null)

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/entries?limit=50')
      const data = await res.json()
      const raw = (data.entries || []) as JournalEntry[]
      const decrypted = await decryptEntriesFromServer(raw)
      setEntries(decrypted)
    } catch {
      setEntries([])
    }
  }, [decryptEntriesFromServer])

  useEffect(() => { fetchEntries() }, [fetchEntries, isE2EEReady])

  const visible = useMemo(() => {
    if (!entries) return []
    if (entries.length === 0) return []
    const shuffled = [...entries].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(VISIBLE_BUTTERFLIES, entries.length))
  }, [entries])

  if (entries === null) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ color: theme.text.muted, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
      >
        Looking for memories…
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-8 text-center"
        style={{ color: theme.text.muted, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
      >
        Memories appear here once you&apos;ve written a few entries.
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <p
        className="absolute top-24 left-1/2 -translate-x-1/2 text-xs italic px-4 text-center"
        style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
      >
        Tap a butterfly to revisit a memory.
      </p>

      {visible.map((entry, i) => {
        const home = HOMES[i % HOMES.length]
        const wing = theme.accent.primary
        const wingWarm = theme.accent.warm
        return (
          <motion.button
            key={entry.id}
            onClick={() => setSelected(entry)}
            aria-label={`Open memory from ${new Date(entry.createdAt).toLocaleDateString()}`}
            className="absolute"
            style={{
              left: `${home.x}%`,
              top: `${home.y}%`,
              transform: 'translate(-50%, -50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 12,
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: [0, -12, 0, 8, 0],
              x: [0, 6, -4, 3, 0],
            }}
            transition={{
              opacity: { delay: i * 0.18, duration: 0.6 },
              scale: { delay: i * 0.18, duration: 0.6 },
              y: { duration: 9 + i * 1.3, repeat: Infinity, ease: 'easeInOut' },
              x: { duration: 11 + i * 1.1, repeat: Infinity, ease: 'easeInOut' },
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
          >
            <Butterfly primary={wing} warm={wingWarm} size={56} />
          </motion.button>
        )
      })}

      <AnimatePresence>
        {selected && (
          <MemoryEntryReader entry={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ----------------------------------------------------------------------------

function Butterfly({ primary, warm, size }: { primary: string; warm: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.25))' }}
    >
      {/* Body */}
      <rect x="30" y="14" width="4" height="36" rx="2" fill="#3b2c20" />
      <circle cx="32" cy="12" r="3.5" fill="#3b2c20" />
      {/* Antennae */}
      <path d="M32 12 C28 6, 24 6, 22 4" stroke="#3b2c20" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M32 12 C36 6, 40 6, 42 4" stroke="#3b2c20" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Left wing — upper and lower */}
      <motion.g
        style={{ transformOrigin: '32px 32px' }}
        animate={{ rotateY: [0, 35, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M32 18 C16 8, 4 22, 10 34 C16 40, 26 36, 32 30 Z" fill={primary} opacity="0.85" />
        <path d="M32 32 C18 32, 8 44, 14 52 C22 56, 28 50, 32 44 Z" fill={warm} opacity="0.85" />
      </motion.g>

      {/* Right wing — upper and lower (mirror) */}
      <motion.g
        style={{ transformOrigin: '32px 32px' }}
        animate={{ rotateY: [0, -35, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M32 18 C48 8, 60 22, 54 34 C48 40, 38 36, 32 30 Z" fill={primary} opacity="0.85" />
        <path d="M32 32 C46 32, 56 44, 50 52 C42 56, 36 50, 32 44 Z" fill={warm} opacity="0.85" />
      </motion.g>
    </svg>
  )
}
