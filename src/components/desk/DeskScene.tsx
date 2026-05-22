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
  const [scaleForTablet, setScaleForTablet] = useState(1)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (layoutMode === 'tablet') {
      const calcScale = () => setScaleForTablet(Math.min(1, window.innerWidth / 1500))
      calcScale()
      window.addEventListener('resize', calcScale)
      return () => window.removeEventListener('resize', calcScale)
    }
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
          {/* Whisper line — anchored just below the global navbar so it
              hovers above the diary as a quiet header. */}
          <div
            className="absolute left-0 right-0 z-30 flex justify-center pointer-events-none"
            style={{ top: '70px' }}
          >
            <WhisperFooter color={theme.text.muted} />
          </div>

          {/* Book - center.
              `top` uses max() so on short viewports the book stays
              anchored ~100px below the page top, keeping the global
              navigation bar and the book's top decorations from
              colliding. On taller viewports the 50% wins and the book
              renders perfectly centered as before. */}
          <div
            className="absolute z-30"
            style={{
              top: 'max(50%, 510px)',
              left: '50%',
              transform: layoutMode === 'tablet'
                ? `translate(-50%, -50%) scale(${scaleForTablet})`
                : 'translate(-50%, -50%)',
              transformOrigin: 'center center',
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
