'use client'

import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { spineColor, monthLabel, toRoman } from './shelfPalette'

export interface MobileShelfGridMonth {
  monthIndex: number
  entryCount: number
}

interface Props {
  year: number
  months: MobileShelfGridMonth[]
  onMonthClick: (monthIndex: number) => void
  pulledMonthIndex: number | null
}

/**
 * Mobile shelf — twelve book-cover cards in a 3×4 grid, all visible on
 * one screen. Replaces the desktop's wood-shelf-with-rotated-spines on
 * narrow viewports where the rotation got cramped.
 *
 * Empty months render dimmer (no entries yet) but are still tappable.
 */
export default function MobileShelfGrid({
  year,
  months,
  onMonthClick,
  pulledMonthIndex,
}: Props) {
  const { theme } = useThemeStore()
  const yearRoman = toRoman(year)
  return (
    <div className="px-4 pt-2 pb-6">
      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
        {months.map((m) => {
          const empty = m.entryCount === 0
          const pulled = pulledMonthIndex === m.monthIndex
          const color = spineColor(m.monthIndex)
          const label = monthLabel(m.monthIndex)
          return (
            <motion.button
              key={m.monthIndex}
              onClick={() => onMonthClick(m.monthIndex)}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="rounded-md relative overflow-hidden"
              style={{
                aspectRatio: '3 / 4',
                background: empty ? `${color}30` : color,
                color: empty ? theme.text.muted : '#f7eedd',
                border: `1px solid ${empty ? theme.glass.border : 'rgba(0,0,0,0.25)'}`,
                boxShadow: empty
                  ? 'none'
                  : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 12px rgba(0,0,0,0.28)',
                opacity: pulled ? 0.25 : 1,
                cursor: 'pointer',
              }}
              aria-label={`${label} ${year}${empty ? ' (no entries)' : ` — ${m.entryCount} entries`}`}
            >
              {/* A subtle banding strip along the top edge of the cover */}
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-6"
                style={{
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 100%)',
                  pointerEvents: 'none',
                }}
              />
              {/* Etched roman-numeral year on the inside */}
              <div
                className="absolute top-2 right-2 text-[10px] tracking-[0.18em] uppercase"
                style={{ opacity: 0.6 }}
                aria-hidden
              >
                {yearRoman}
              </div>

              {/* Centered month label */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center px-2"
                style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
              >
                <span className="text-base capitalize">{label}</span>
                {!empty && (
                  <span
                    className="text-[10px] italic mt-1"
                    style={{ opacity: 0.7, fontFamily: 'Georgia, serif' }}
                  >
                    {m.entryCount} {m.entryCount === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>

              {/* Soft binding line on the left edge */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 w-1"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 100%)',
                  pointerEvents: 'none',
                }}
              />
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
