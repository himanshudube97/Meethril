'use client'

import { useMemo } from 'react'

interface Streak {
  id: number
  left: number
  top: number
  length: number
  thickness: number
  opacity: number
  duration: number
  delay: number
}

interface RainStreaksProps {
  count?: number
  className?: string
}

export function RainStreaks({ count = 90, className = '' }: RainStreaksProps) {
  const streaks = useMemo<Streak[]>(() => {
    return Array.from({ length: count }).map((_, i) => {
      const length = 36 + Math.random() * 70
      return {
        id: i,
        left: Math.random() * 110 - 5,
        top: Math.random() * 100 - 30,
        length,
        thickness: 0.9 + Math.random() * 0.8,
        opacity: 0.18 + Math.random() * 0.22,
        duration: 0.7 + Math.random() * 0.6,
        delay: Math.random() * 2.5,
      }
    })
  }, [count])

  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ transform: 'rotate(6deg)', transformOrigin: 'center' }}
    >
      {streaks.map((s) => (
        <span
          key={s.id}
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.thickness}px`,
            height: `${s.length}px`,
            background: `linear-gradient(180deg, rgba(220,228,240,0) 0%, rgba(220,228,240,${s.opacity}) 50%, rgba(220,228,240,0) 100%)`,
            animation: `rain-fall ${s.duration}s linear ${s.delay}s infinite`,
            borderRadius: '999px',
          }}
        />
      ))}
      <style jsx>{`
        @keyframes rain-fall {
          0% {
            transform: translate3d(0, -20vh, 0);
          }
          100% {
            transform: translate3d(0, 120vh, 0);
          }
        }
      `}</style>
    </div>
  )
}
