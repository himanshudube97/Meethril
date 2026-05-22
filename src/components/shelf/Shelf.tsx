// src/components/shelf/Shelf.tsx
'use client'

import BookSpine from './BookSpine'
import EmptyMonthSpine from './EmptyMonthSpine'
import MobileShelfGrid from './MobileShelfGrid'
import { useLayoutMode } from '@/hooks/useMediaQuery'

export interface ShelfMonth {
  monthIndex: number   // 0..11
  entryCount: number   // 0 means render an EmptyMonthSpine
}

interface ShelfProps {
  year: number
  months: ShelfMonth[] // length 12, in calendar order
  onMonthClick: (monthIndex: number) => void
  pulledMonthIndex: number | null
}

const PLANK_HEIGHT = 14
const PLANK_OVERHANG = 28 // plank extends beyond the books on each side
const HANGER_HEIGHT = 60  // metal rod rising above the plank to the wall

const PLANK_GRAIN =
  'repeating-linear-gradient(90deg, #6b4528 0 8px, #533318 8px 9px, #6b4528 9px 18px, #5d3a20 18px 19px, #6b4528 19px 28px)'
const PLANK_FACE =
  'linear-gradient(180deg, #7a512c 0%, #6b4528 30%, #533318 75%, #3a2510 100%)'
const PLANK_EDGE =
  'linear-gradient(180deg, #4a2f18 0%, #2a1808 100%)'

export default function Shelf({
  year,
  months,
  onMonthClick,
  pulledMonthIndex,
}: ShelfProps) {
  const layoutMode = useLayoutMode()
  // Mobile: 3×4 grid of book-cover cards — fits on one screen, no
  // scroll, no rotated spines. Desktop keeps the wooden shelf.
  if (layoutMode === 'mobile') {
    return (
      <MobileShelfGrid
        year={year}
        months={months}
        onMonthClick={onMonthClick}
        pulledMonthIndex={pulledMonthIndex}
      />
    )
  }
  return (
    <div className="relative">
      {/* Desktop: horizontal row. Mobile: vertical stack with rotated spines. */}
      <div
        className={[
          'flex gap-3',
          'md:flex-row md:items-end md:justify-center',
          'flex-col items-center',
        ].join(' ')}
      >
        {months.map((m) => {
          if (m.entryCount === 0) {
            return (
              <div key={m.monthIndex} className="md:rotate-0 -rotate-90 md:transform-none">
                <EmptyMonthSpine monthIndex={m.monthIndex} />
              </div>
            )
          }
          return (
            <div key={m.monthIndex} className="md:rotate-0 -rotate-90 md:transform-none">
              <BookSpine
                year={year}
                monthIndex={m.monthIndex}
                entryCount={m.entryCount}
                onClick={() => onMonthClick(m.monthIndex)}
                hidden={pulledMonthIndex === m.monthIndex}
              />
            </div>
          )
        })}
      </div>

      {/* Wooden plank — desktop horizontal under the row, with hanger rods on
          each end so the shelf appears wall-mounted. */}
      <div
        aria-hidden="true"
        className="hidden md:block absolute"
        style={{
          left: -PLANK_OVERHANG,
          right: -PLANK_OVERHANG,
          bottom: -(PLANK_HEIGHT + 4),
          height: PLANK_HEIGHT,
          background: PLANK_FACE,
          backgroundImage: `${PLANK_FACE}, ${PLANK_GRAIN}`,
          backgroundBlendMode: 'overlay',
          borderRadius: '2px',
          boxShadow:
            'inset 0 1px 0 rgba(255,225,180,0.18), inset 0 -2px 0 rgba(0,0,0,0.45), 0 8px 14px rgba(0,0,0,0.28)',
        }}
      />
      {/* Plank front edge / shadow line */}
      <div
        aria-hidden="true"
        className="hidden md:block absolute"
        style={{
          left: -PLANK_OVERHANG,
          right: -PLANK_OVERHANG,
          bottom: -(PLANK_HEIGHT + 6),
          height: 3,
          background: PLANK_EDGE,
          borderRadius: '0 0 2px 2px',
          opacity: 0.85,
        }}
      />

      {/* Hanger rods — left + right metal verticals rising to the wall */}
      <Hanger side="left" />
      <Hanger side="right" />

      {/* Mobile vertical bar */}
      <div
        aria-hidden="true"
        className="md:hidden absolute top-0 bottom-0"
        style={{
          left: -(PLANK_HEIGHT + 4),
          width: PLANK_HEIGHT,
          background: PLANK_GRAIN,
          borderRadius: '2px',
          boxShadow: '6px 0 12px rgba(0,0,0,0.25)',
        }}
      />
    </div>
  )
}

function Hanger({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden="true"
      className="hidden md:block absolute"
      style={{
        [side]: 4,
        bottom: -2,
        width: 4,
        height: HANGER_HEIGHT + 14,
        pointerEvents: 'none',
      }}
    >
      {/* Rod */}
      <div
        style={{
          position: 'absolute',
          left: 1,
          top: 0,
          width: 2,
          height: HANGER_HEIGHT,
          background:
            'linear-gradient(180deg, #4a3a18 0%, #b8932e 35%, #856919 65%, #3a2810 100%)',
          borderRadius: 1,
          boxShadow: '0 0 1px rgba(0,0,0,0.4)',
        }}
      />
      {/* Top cap (pin head against the wall) */}
      <div
        style={{
          position: 'absolute',
          left: -3,
          top: -3,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 35% 30%, #5a3a18 0%, #2a1808 70%, #150a02 100%)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      />
    </div>
  )
}
