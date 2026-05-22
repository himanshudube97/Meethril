'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

interface AmbientDrop {
  id: number
  x: number
  startY: number
  size: number
  duration: number
}

// Non-memory decorative drops that occasionally slide down the inside of the
// glass. Gives the window life without consuming real memory drops.
export function AmbientDrops() {
  const [drops, setDrops] = useState<AmbientDrop[]>([])

  useEffect(() => {
    let nextId = 1

    const spawn = () => {
      const drop: AmbientDrop = {
        id: nextId++,
        x: 6 + Math.random() * 88,
        startY: 8 + Math.random() * 30,
        size: 6 + Math.random() * 8,
        duration: 4.5 + Math.random() * 3.5,
      }
      setDrops((prev) => [...prev, drop])
      // Remove the drop a moment after its slide ends.
      window.setTimeout(() => {
        setDrops((prev) => prev.filter((d) => d.id !== drop.id))
      }, (drop.duration + 0.8) * 1000)
    }

    // First one fairly quickly so the page feels alive, then a steady cadence.
    const firstTimer = window.setTimeout(spawn, 3500)
    const interval = window.setInterval(() => {
      // 70% chance per tick → average ~30s between drops
      if (Math.random() < 0.7) spawn()
    }, 22000)

    return () => {
      window.clearTimeout(firstTimer)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {drops.map((d) => (
          <motion.div
            key={d.id}
            initial={{
              left: `${d.x}%`,
              top: `${d.startY}%`,
              opacity: 0,
            }}
            animate={{
              top: '110%',
              opacity: [0, 0.85, 0.85, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              top: { duration: d.duration, ease: [0.55, 0.05, 0.68, 0.99] },
              opacity: {
                duration: d.duration,
                times: [0, 0.12, 0.85, 1],
                ease: 'easeOut',
              },
            }}
            style={{
              position: 'absolute',
              width: `${d.size}px`,
              height: `${d.size * 1.2}px`,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50% 50% 55% 45% / 60% 60% 40% 40%',
              background: `radial-gradient(
                circle at 32% 28%,
                rgba(253, 246, 227, 0.5) 0%,
                rgba(230, 240, 252, 0.3) 25%,
                rgba(168, 194, 220, 0.28) 60%,
                rgba(94, 120, 145, 0.22) 100%
              )`,
              boxShadow:
                'inset 1px 1px 2px rgba(255,255,255,0.45), inset -1px -2px 4px rgba(20, 30, 50, 0.3)',
            }}
          >
            {/* Trail behind the drop */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '50%',
                width: `${d.size * 0.4}px`,
                height: '40vh',
                transform: 'translateX(-50%)',
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(220,232,248,0.18) 50%, rgba(220,232,248,0.05) 100%)',
                borderRadius: '999px',
                filter: 'blur(0.4px)',
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
