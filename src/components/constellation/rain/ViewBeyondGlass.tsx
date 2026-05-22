'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'

interface DistantLight {
  id: number
  x: number
  y: number
  size: number
  hue: number
  pulseDelay: number
}

export function ViewBeyondGlass() {
  // A handful of far-off lit windows / lanterns scattered across the dusk.
  // Pseudo-randomised but stable across renders.
  const lights = useMemo<DistantLight[]>(() => {
    const seeded = [
      { x: 12, y: 48, size: 5, hue: 38, pulseDelay: 0 },
      { x: 22, y: 62, size: 4, hue: 32, pulseDelay: 2.3 },
      { x: 38, y: 55, size: 6, hue: 42, pulseDelay: 1.1 },
      { x: 58, y: 60, size: 5, hue: 36, pulseDelay: 3.4 },
      { x: 71, y: 50, size: 4, hue: 30, pulseDelay: 0.7 },
      { x: 84, y: 64, size: 6, hue: 40, pulseDelay: 2.0 },
      { x: 92, y: 53, size: 4, hue: 34, pulseDelay: 1.6 },
    ]
    return seeded.map((l, i) => ({ id: i, ...l }))
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky gradient (dusk) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #1d2733 0%, #2f3a4a 55%, #46505d 100%)',
        }}
      />

      {/* Far skyline silhouette — soft, heavily blurred */}
      <motion.div
        className="absolute left-0 right-0"
        style={{ bottom: '22%', height: '38%' }}
        animate={{ x: [0, -6, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg
          viewBox="0 0 1000 200"
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ filter: 'blur(2.5px)', opacity: 0.55 }}
        >
          <path
            d="M0,200 L0,140 L40,140 L40,120 L80,120 L80,150 L130,150 L130,100 L170,100 L170,135 L220,135 L220,118 L270,118 L270,90 L300,90 L300,108 L340,108 L340,130 L390,130 L390,112 L430,112 L430,140 L480,140 L480,100 L520,100 L520,122 L560,122 L560,138 L610,138 L610,116 L650,116 L650,128 L700,128 L700,108 L750,108 L750,130 L800,130 L800,118 L860,118 L860,140 L900,140 L900,120 L960,120 L960,140 L1000,140 L1000,200 Z"
            fill="#141a23"
          />
        </svg>
      </motion.div>

      {/* Nearer treetops / rooftops — even more blurred and darker */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: '24%',
          background:
            'radial-gradient(ellipse at 30% 0%, rgba(10,14,20,0.0) 0%, rgba(10,14,20,0.85) 60%, #0a0e14 100%)',
          filter: 'blur(8px)',
        }}
      />

      {/* Distant warm windows */}
      {lights.map((l) => (
        <motion.div
          key={l.id}
          className="absolute"
          style={{
            left: `${l.x}%`,
            top: `${l.y}%`,
            width: `${l.size}px`,
            height: `${l.size * 1.4}px`,
            background: `hsla(${l.hue}, 55%, 65%, 0.9)`,
            borderRadius: '1px',
            boxShadow: `
              0 0 ${l.size * 2}px hsla(${l.hue}, 60%, 60%, 0.55),
              0 0 ${l.size * 5}px hsla(${l.hue}, 50%, 55%, 0.25)
            `,
            filter: 'blur(1.2px)',
          }}
          animate={{ opacity: [0.55, 0.85, 0.55] }}
          transition={{
            duration: 6 + (l.id % 3),
            delay: l.pulseDelay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Streetlamp halo bleeding up from below the frame */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: '-10%',
          width: '70%',
          height: '40%',
          background:
            'radial-gradient(ellipse at 50% 100%, rgba(212,168,120,0.18) 0%, rgba(212,168,120,0.05) 45%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
