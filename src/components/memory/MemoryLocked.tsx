'use client'

import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { Theme } from '@/lib/themes'
import type { MemoryProgress } from '@/hooks/useMemories'

/**
 * Locked state of the memory page (issue #37). Before the gate is met we
 * still show the page "in theme" — the theme gradient background and a few
 * faint, drifting silhouettes where the balloons / butterflies would be —
 * but nothing is interactive. A centred note explains how to unlock it and
 * shows current progress.
 */
export default function MemoryLocked({ progress }: { progress: MemoryProgress }) {
  const { theme } = useThemeStore()
  const prefersReducedMotion = usePrefersReducedMotion()

  // Silhouette anchor points (% of viewport), loosely scattered.
  const homes = [
    { x: 22, y: 32 },
    { x: 72, y: 26 },
    { x: 38, y: 64 },
    { x: 80, y: 66 },
    { x: 54, y: 46 },
  ]

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: theme.bg.gradient }}
    >
      {/* Faint silhouettes — where memories will one day drift. */}
      {homes.map((home, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute"
          style={{
            left: `${home.x}%`,
            top: `${home.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ opacity: 0 }}
          animate={
            prefersReducedMotion
              ? { opacity: 0.12 }
              : {
                  opacity: [0.06, 0.16, 0.06],
                  y: [0, -10, 0, 7, 0],
                  x: [0, 5, -3, 2, 0],
                }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.4 }
              : {
                  opacity: { duration: 6 + i, repeat: Infinity, ease: 'easeInOut' },
                  y: { duration: 10 + i * 1.3, repeat: Infinity, ease: 'easeInOut' },
                  x: { duration: 12 + i * 1.1, repeat: Infinity, ease: 'easeInOut' },
                }
          }
        >
          <Silhouette color={theme.text.primary} size={52} />
        </motion.div>
      ))}

      {/* Centred unlock note + progress. */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="text-2xl mb-5 opacity-70" style={{ color: theme.text.muted }}>
          ✦
        </div>
        <h1
          className="text-2xl md:text-3xl font-serif italic mb-3"
          style={{ color: theme.text.primary }}
        >
          Your memories are gathering
        </h1>
        <p
          className="max-w-md mb-8 leading-relaxed"
          style={{ color: theme.text.secondary, fontFamily: 'Georgia, serif' }}
        >
          Keep writing. This place opens once you&apos;ve kept{' '}
          <strong style={{ color: theme.text.primary }}>{progress.requiredJournals} journals</strong>
          {' '}— or <strong style={{ color: theme.text.primary }}>{progress.requiredTotal} entries</strong> in all
          (journals and delivered letters). Then your days drift back to you here.
        </p>

        <div
          className="flex items-center gap-6 text-sm"
          style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
        >
          <ProgressPill
            label="journals"
            value={progress.journals}
            target={progress.requiredJournals}
            theme={theme}
          />
          <ProgressPill
            label="entries in all"
            value={progress.total}
            target={progress.requiredTotal}
            theme={theme}
          />
        </div>
      </motion.div>
    </div>
  )
}

function ProgressPill({
  label,
  value,
  target,
  theme,
}: {
  label: string
  value: number
  target: number
  theme: Theme
}) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className="flex flex-col items-center gap-2 w-32">
      <span>
        <strong style={{ color: theme.text.primary }}>{Math.min(value, target)}</strong> / {target}
      </span>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: `color-mix(in oklab, ${theme.text.primary} 14%, transparent)` }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: theme.accent.primary }}
        />
      </div>
      <span className="text-xs italic opacity-80">{label}</span>
    </div>
  )
}

// A soft balloon/leaf silhouette — intentionally vague, just a hint of shape.
function Silhouette({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path
        d="M32 6 C20 6 12 16 12 28 C12 40 24 48 32 54 C40 48 52 40 52 28 C52 16 44 6 32 6 Z"
        fill={color}
        opacity="0.5"
      />
    </svg>
  )
}
