'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import BookSpread from './BookSpread'
import WhisperFooter from './WhisperFooter'

// Pre-generate random particle data at module level to keep render pure
const DUST_PARTICLES = Array.from({ length: 12 }, () => ({
  width: 1 + Math.random() * 1.5,
  height: 1 + Math.random() * 1.5,
  opacity: Math.floor(20 + Math.random() * 30),
  left: 10 + Math.random() * 80,
  top: 20 + Math.random() * 60,
  animY: -25 - Math.random() * 15,
  animX: (Math.random() - 0.5) * 15,
  duration: 12 + Math.random() * 8,
  delay: Math.random() * 8,
}))
import MobileJournalEntry from './MobileJournalEntry'

export default function DeskScene() {
  const [mounted, setMounted] = useState(false)
  const { theme } = useThemeStore()
  const layoutMode = useLayoutMode()
  const [spreadScale, setSpreadScale] = useState(1)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Scale the book spread to fit both viewport dimensions on every non-mobile
  // layout. Capped at 1 — we never grow the diary beyond its design size on
  // large monitors. The diary is TOP-ANCHORED (not centered) so the gap
  // between navbar → whisper → book stays visually identical no matter how
  // tall the viewport is. Any excess vertical space falls to the bottom.
  // SPREAD_W is the diary's design width (650 * 2) plus a ~100px right-side
  // bleed for the date pendant + ribbon that hangs outside the page edge.
  useEffect(() => {
    if (layoutMode === 'mobile') return
    // Footprint includes the hardcover bleed (.book-cover extends -48px each
    // side, -28px top/bottom) plus the ribbon/date pendant hanging past the
    // top-right edge — so the scale never lets the cover clip off-screen.
    const SPREAD_W = 1440
    const SPREAD_H = 900
    // Small symmetric side margin (the action buttons now live in the top-right
    // chrome, so no wide gutter to reserve). Keeps the book centered and fully
    // on-screen.
    const MARGIN_X = 72
    // Top reserves: navbar (16+48=64) + 24px gap + whisper (~24px) + 32px
    // gap = 144px before the book starts. Bottom is light now that pull-a-card
    // moved off the footer into the top-right cluster.
    const MARGIN_Y_TOP = 144
    // Small bottom margin — the diary grows to fill the space (actions now live
    // on the cover's top-right edge, not a bottom bar).
    const MARGIN_Y_BOTTOM = 32
    // Allow the diary to grow past its design size on roomy screens
    // (fullscreen / large monitors) so it fills the height instead of
    // leaving a dead gap below. Still bounded by available width/height, so
    // smaller windows shrink as before. Tunable — 1.35 lets it fill big screens.
    const MAX_SCALE = 1.35
    const calcScale = () => {
      const availW = window.innerWidth - MARGIN_X
      const availH = window.innerHeight - MARGIN_Y_TOP - MARGIN_Y_BOTTOM
      const s = Math.min(MAX_SCALE, availW / SPREAD_W, availH / SPREAD_H)
      setSpreadScale(s)
    }
    calcScale()
    window.addEventListener('resize', calcScale)
    return () => window.removeEventListener('resize', calcScale)
  }, [layoutMode])

  if (!mounted) return null

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        perspective: '2000px',
      }}
    >
      {/* Vignette overlay - very subtle to let background animations show */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.15) 100%)',
        }}
      />

      {/* Desk surface gradient - very subtle to let background animations show */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none"
        style={{
          background: `linear-gradient(180deg,
            transparent 0%,
            ${theme.bg.secondary}15 40%,
            ${theme.bg.secondary}30 100%
          )`,
        }}
      />

      {/* Warm ambient light - centered, subtle glow */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          bottom: '15%',
          left: '35%',
          width: '30%',
          height: '35%',
          background: `radial-gradient(ellipse at center,
            ${theme.accent.warm}08 0%,
            transparent 70%
          )`,
          filter: 'blur(40px)',
        }}
        animate={{
          opacity: [0.2, 0.35, 0.2],
          scale: [1, 1.03, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {layoutMode === 'mobile' ? (
        <MobileJournalEntry />
      ) : (
        <>
          {/* Whisper line — sits 24px below the navbar (which ends at y=64). */}
          <div
            className="absolute left-0 right-0 z-30 flex justify-center pointer-events-none"
            style={{ top: '88px' }}
          >
            <WhisperFooter color={theme.text.muted} />
          </div>

          {/* Book — TOP-anchored so the chrome above it (navbar + whisper)
              keeps an identical visual gap regardless of viewport height.
              On tall fullscreens any extra room falls below the book; on
              shorter windows the scale calc above shrinks the book to fit. */}
          <div
            className="absolute z-30"
            style={{
              top: '144px',
              left: '50%',
              transform: `translateX(-50%) scale(${spreadScale})`,
              transformOrigin: 'center top',
            }}
          >
            <BookSpread />
          </div>

          {/* Floating dust particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {DUST_PARTICLES.map((p, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${p.width}px`,
                  height: `${p.height}px`,
                  background: `${theme.accent.warm}${p.opacity.toString(16)}`,
                  left: `${p.left}%`,
                  top: `${p.top}%`,
                  filter: 'blur(0.5px)',
                }}
                animate={{
                  y: [0, p.animY, 0],
                  x: [0, p.animX, 0],
                  opacity: [0.15, 0.4, 0.15],
                }}
                transition={{
                  duration: p.duration,
                  repeat: Infinity,
                  delay: p.delay,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
