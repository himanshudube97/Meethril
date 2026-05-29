// src/components/letters/lights/PlanesSky.tsx
'use client'

import { motion } from 'framer-motion'
import type { InboxThread } from '@/hooks/useStrangerNotes'
import { monogram } from '@/lib/monogram'

interface Props {
  /** Unread threads only, already capped by the caller. */
  threads: InboxThread[]
  onPick: (id: string) => void
}

// A short, gentle arc of slots across the strip.
const SLOTS = [
  { x: 12, y: 40, r: -10 },
  { x: 32, y: 18, r: 12 },
  { x: 52, y: 46, r: -6 },
  { x: 72, y: 22, r: 14 },
  { x: 88, y: 50, r: -12 },
]

export default function PlanesSky({ threads, onPick }: Props) {
  if (threads.length === 0) {
    return (
      <p
        className="py-2 text-center font-serif text-[11px] italic"
        style={{ color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)' }}
      >
        the sky is quiet — no new arrivals.
      </p>
    )
  }

  return (
    <div className="relative h-28 w-full">
      {threads.map((t, i) => {
        const slot = SLOTS[i % SLOTS.length]
        const accent = t.status === 'pen_pal' ? 'var(--accent-primary)' : 'var(--accent-warm)'
        return (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            title={`${t.partnerDisplayName} · ${t.unreadCount} new`}
            aria-label={`${t.partnerDisplayName}, ${t.unreadCount} new`}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: [0, -5, 0, 3, 0],
              rotate: [slot.r - 2, slot.r + 2, slot.r - 2],
            }}
            transition={{
              opacity: { duration: 0.5, delay: i * 0.08 },
              y: { duration: 5 + i * 0.4, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 6 + i * 0.4, repeat: Infinity, ease: 'easeInOut' },
            }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.94 }}
          >
            <motion.span
              aria-hidden
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 52,
                height: 52,
                background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
                opacity: 0.4,
                filter: 'blur(4px)',
              }}
              animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.65, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <svg width="38" height="30" viewBox="0 0 40 32" fill="none" aria-hidden>
              <path
                d="M2 14 L38 2 L24 30 L18 20 L2 14 Z"
                fill={accent}
                fillOpacity="0.18"
                stroke={accent}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M18 20 L38 2" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span
              className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap font-serif text-[10px] italic"
              style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}
            >
              {monogram(t.partnerDisplayName)}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
