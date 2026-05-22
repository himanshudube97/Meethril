'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { format } from 'date-fns'
import type { MemoryStar } from '../ConstellationRenderer'

interface MemoryDropletProps {
  star: MemoryStar
  onSelect: (star: MemoryStar) => void
}

// One memory raindrop. Idle: gentle breath. Hover: scale + date label + tremble.
// Click: drop accelerates downward leaving a trail. Modal opens partway through.
export function MemoryDroplet({ star, onSelect }: MemoryDropletProps) {
  const [hovered, setHovered] = useState(false)
  const [falling, setFalling] = useState(false)

  // Scale the existing star size (4..7) into droplet diameter (14..30px).
  const dropSize = 14 + (star.size - 4) * 5.3
  const date = format(new Date(star.entry.createdAt), 'MMM d')

  const handleActivate = () => {
    if (falling) return
    setFalling(true)
    // Modal opens partway through the fall so the user doesn't wait
    window.setTimeout(() => onSelect(star), 380)
  }

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${star.x}%`,
        top: `${star.y}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: falling ? 'none' : 'auto',
      }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: star.delay,
        duration: 1.4,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {/* Trail — only rendered while falling, anchored at the original spot */}
      <AnimatePresence>
        {falling && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 0.5, scaleY: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '0',
              width: `${dropSize * 0.45}px`,
              height: '70vh',
              transform: 'translateX(-50%)',
              transformOrigin: 'top center',
              background: `linear-gradient(180deg,
                rgba(220, 232, 248, 0.35) 0%,
                rgba(220, 232, 248, 0.12) 35%,
                transparent 100%)`,
              filter: 'blur(0.5px)',
              borderRadius: '999px',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* The drop itself */}
      <motion.button
        type="button"
        aria-label={`Memory from ${date}`}
        onClick={handleActivate}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="block focus:outline-none"
        style={{
          width: `${dropSize}px`,
          height: `${dropSize * 1.15}px`,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          position: 'relative',
        }}
        animate={
          falling
            ? {
                y: ['0vh', '85vh'],
                scale: [1, 1.35],
                opacity: [1, 0.0],
              }
            : hovered
            ? {
                scale: 1.18,
                x: [0, -1.5, 1.5, -1, 1, 0],
              }
            : {
                scale: [1, 1.05, 1],
              }
        }
        transition={
          falling
            ? { duration: 1.1, ease: [0.55, 0.05, 0.68, 0.99] }
            : hovered
            ? {
                scale: { duration: 0.2 },
                x: { duration: 0.35, ease: 'easeInOut' },
              }
            : {
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: star.delay,
              }
        }
      >
        {/* Drop body — round-ish teardrop using border-radius asymmetry */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '52% 48% 56% 44% / 58% 58% 42% 42%',
            background: `radial-gradient(
              circle at 32% 30%,
              rgba(253, 246, 227, 0.55) 0%,
              rgba(230, 240, 252, 0.35) 22%,
              rgba(168, 194, 220, 0.32) 55%,
              rgba(94, 120, 145, 0.28) 100%
            )`,
            boxShadow: `
              inset 1px 1px 2px rgba(255,255,255,0.5),
              inset -2px -3px 6px rgba(20, 30, 50, 0.35),
              0 2px 8px rgba(0, 0, 0, 0.25)
            `,
            backdropFilter: 'blur(1px)',
            WebkitBackdropFilter: 'blur(1px)',
            transform: 'rotate(-2deg)',
          }}
        />

        {/* Specular highlight */}
        <div
          style={{
            position: 'absolute',
            top: '14%',
            left: '20%',
            width: '28%',
            height: '22%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      </motion.button>

      {/* Date label below the drop on hover */}
      <AnimatePresence>
        {hovered && !falling && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
            style={{
              top: `${dropSize * 1.25 + 6}px`,
              color: '#dce3ec',
              fontFamily: 'var(--font-caveat, cursive)',
              fontSize: '1.05rem',
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
              opacity: 0.92,
            }}
          >
            {date}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
