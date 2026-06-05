'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import type { Theme } from '@/lib/themes'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import LeftPage from '@/components/desk/LeftPage'
import RightPage from '@/components/desk/RightPage'
import type { JournalEntry } from '@/store/journal'
import { useShareableCapture } from '@/components/share/ShareableCapture'
import { formatTimeAgo } from './MemoryModal'

const PAGE_W = 650
const PAGE_H = 820
// Gap between the two torn pages — they hang as separate sheets joined by
// the kraft-twine bow rendered above the spread.
const GAP = 32

// Where the punch holes live in each page (in page-local coordinates from the
// page's own top-left). Used both for the in-paper hole dots and as the
// anchor points the SVG twine arcs into.
const HOLE_FROM_TOP = 32
const HOLE_FROM_INNER_EDGE = 60

// Deterministic pseudo-random in [0, 1) — same i → same y, so the torn edge
// is stable across re-renders instead of jittering each mount.
function pseudoRandom(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function buildTornClipPath(points: number, amplitudePx: number, seedOffset: number): string {
  const top: string[] = []
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * 100
    const y = pseudoRandom(i + seedOffset) * amplitudePx
    top.push(`${x.toFixed(2)}% ${y.toFixed(2)}px`)
  }
  const bottom: string[] = []
  for (let i = points; i >= 0; i--) {
    const x = (i / points) * 100
    const y = pseudoRandom(i + seedOffset + 1000) * amplitudePx
    bottom.push(`${x.toFixed(2)}% calc(100% - ${y.toFixed(2)}px)`)
  }
  return `polygon(${[...top, ...bottom].join(', ')})`
}

function computeFitScale(): number {
  if (typeof window === 'undefined') return 1
  const margin = 80
  const sx = (window.innerWidth - margin) / (PAGE_W * 2 + GAP)
  const sy = (window.innerHeight - margin) / PAGE_H
  return Math.min(1, sx, sy)
}

// Twine + bow tying the two torn pages together at the top. Drawn as a
// single SVG that spans the full spread width so the arc endpoints land on
// the punch holes in each page. Kraft brown is hardcoded — natural fiber
// twine reads the same regardless of garden theme.
function TwineBow() {
  const totalW = PAGE_W * 2 + GAP
  const leftHoleX = PAGE_W - HOLE_FROM_INNER_EDGE
  const rightHoleX = PAGE_W + GAP + HOLE_FROM_INNER_EDGE
  // SVG y where the spread top sits. Above this is "in the air"; below is
  // "in the paper" (where the hole dots show through the page).
  const SPREAD_TOP_Y = 60
  const holeY = SPREAD_TOP_Y + HOLE_FROM_TOP
  const knotX = totalW / 2
  const knotY = SPREAD_TOP_Y - 18

  const TWINE = '#8B6F47'
  const TWINE_DARK = '#5D4928'

  return (
    <svg
      width={totalW}
      height="120"
      viewBox={`0 0 ${totalW} 120`}
      style={{
        position: 'absolute',
        top: `-${SPREAD_TOP_Y}px`,
        left: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 25,
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))',
      }}
      aria-hidden
    >
      {/* Twine arc from left hole, up over the gap, dipping into the knot */}
      <path
        d={`M ${leftHoleX} ${holeY} Q ${leftHoleX + 80} ${knotY - 6} ${knotX} ${knotY}`}
        stroke={TWINE}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${rightHoleX} ${holeY} Q ${rightHoleX - 80} ${knotY - 6} ${knotX} ${knotY}`}
        stroke={TWINE}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Knot bow — two leaves + center wrap */}
      <g transform={`translate(${knotX}, ${knotY})`}>
        <ellipse cx="-9" cy="0" rx="8" ry="4" fill={TWINE} />
        <ellipse cx="9" cy="0" rx="8" ry="4" fill={TWINE} />
        <ellipse cx="-9" cy="0" rx="8" ry="4" fill="none" stroke={TWINE_DARK} strokeWidth="0.6" opacity="0.5" />
        <ellipse cx="9" cy="0" rx="8" ry="4" fill="none" stroke={TWINE_DARK} strokeWidth="0.6" opacity="0.5" />
        <rect x="-3" y="-3.5" width="6" height="7" rx="1.5" fill={TWINE_DARK} />
        {/* short tails dangling from the knot */}
        <path d={`M -2 3 Q -3 8 -5 11`} stroke={TWINE} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d={`M 2 3 Q 3 8 5 11`} stroke={TWINE} strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>

      {/* Punch holes — small dark dots inside each page */}
      <circle cx={leftHoleX} cy={holeY} r="3.2" fill="rgba(0,0,0,0.45)" />
      <circle cx={rightHoleX} cy={holeY} r="3.2" fill="rgba(0,0,0,0.45)" />
    </svg>
  )
}

interface Props {
  entry: JournalEntry
  theme: Theme
  onClose: () => void
}

export function MemoryDiaryView({ entry, theme, onClose }: Props) {
  const colors = getGlassDiaryColors(theme)

  const tornLeft = useMemo(() => buildTornClipPath(42, 9, 7), [])
  const tornRight = useMemo(() => buildTornClipPath(42, 9, 113), [])

  const [scale, setScale] = useState(() => computeFitScale())
  useEffect(() => {
    const onResize = () => setScale(computeFitScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // LeftPage/RightPage want a stricter Photo position type than JournalEntry uses.
  const entryForPages = useMemo(() => ({
    id: entry.id,
    text: entry.text,
    song: entry.song ?? null,
    createdAt: entry.createdAt,
    style: entry.style ?? null,
    photos: (entry.photos || []).map((p) => ({
      id: p.id,
      url: p.url,
      rotation: p.rotation,
      position: (p.position === 2 ? 2 : 1) as 1 | 2,
    })),
    doodles: entry.doodles || [],
  }), [entry])

  // Capture the live spread DOM directly. Off-screen synthesis was fragile
  // because LeftPage/RightPage rely on parent contexts that don't exist in
  // the off-screen tree. The polaroid caption shows time-ago.
  const spreadCaptureRef = useRef<HTMLDivElement>(null)
  const polaroidCaption = `a memory from ${formatTimeAgo(new Date(entry.createdAt))} · meethril`
  const { CameraButton: ShareCameraButton, Capture: ShareCapture } = useShareableCapture({
    captureTarget: () => spreadCaptureRef.current,
    surface: 'memory',
    date: new Date(entry.createdAt),
    polaroidCaption,
  })

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
        }}
        onClick={onClose}
      />

      {/* Spread */}
      <motion.div
        ref={spreadCaptureRef}
        initial={{ opacity: 0, scale: scale * 0.97, y: 18 }}
        animate={{ opacity: 1, scale, y: 0 }}
        exit={{ opacity: 0, scale: scale * 0.97, y: 18 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed left-1/2 top-1/2 z-50"
        style={{
          width: `${PAGE_W * 2 + GAP}px`,
          height: `${PAGE_H}px`,
          marginLeft: `-${(PAGE_W * 2 + GAP) / 2}px`,
          marginTop: `-${PAGE_H / 2}px`,
          transformOrigin: 'center center',
          ['--page-bg' as string]: colors.pageBg,
          ['--page-bg-solid' as string]: colors.pageBgSolid,
        } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <TwineBow />
        {/* Date caption pinned above the spread */}
        <div
          className="absolute left-0 right-0 text-center pointer-events-none"
          style={{
            top: '-44px',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.78)',
            fontSize: '15px',
            letterSpacing: '0.02em',
            textShadow: '0 2px 10px rgba(0,0,0,0.4)',
          }}
        >
          {format(new Date(entry.createdAt), 'EEEE · MMMM d, yyyy')}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close memory"
          className="absolute -top-12 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-2xl"
          style={{
            color: 'rgba(255,255,255,0.85)',
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          ×
        </button>

        {/* Two pages, each torn around its rectangle. drop-shadow on the
            wrapper picks up the clip-path edges, where box-shadow would be
            clipped away. */}
        <div
          style={{
            display: 'flex',
            gap: `${GAP}px`,
            width: '100%',
            height: '100%',
            filter:
              'drop-shadow(0 26px 44px rgba(0,0,0,0.42)) drop-shadow(0 6px 14px rgba(0,0,0,0.18))',
          }}
        >
          {/* Left page */}
          <div
            style={{
              width: `${PAGE_W}px`,
              height: `${PAGE_H}px`,
              backgroundColor: colors.pageBgSolid,
              backgroundImage: `linear-gradient(${colors.pageBg}, ${colors.pageBg})`,
              clipPath: tornLeft,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                padding: '20px 30px 20px 30px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <LeftPage entry={entryForPages} isNewEntry={false} />
            </div>
          </div>

          {/* Right page */}
          <div
            style={{
              width: `${PAGE_W}px`,
              height: `${PAGE_H}px`,
              backgroundColor: colors.pageBgSolid,
              backgroundImage: `linear-gradient(${colors.pageBg}, ${colors.pageBg})`,
              clipPath: tornRight,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                padding: '20px 30px 20px 30px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <RightPage
                entry={entryForPages}
                isNewEntry={false}
                photos={entryForPages.photos}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Share camera — top-right of the screen, between fullscreen and gear.
          Mirrors the diary placement so it feels native. Themed glass chrome
          uses the parent theme's glass tokens. */}
      <div
        className="fixed top-6 right-20 z-50 w-12 h-12 rounded-full flex items-center justify-center pointer-events-auto"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          WebkitBackdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        {ShareCameraButton}
      </div>

      {ShareCapture}
    </>
  )
}
