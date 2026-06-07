'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

// The fold-and-seal moment: the letter folds, a wax seal stamps it, then it
// drifts up and is lost into a quiet, twinkling universe. Every colour is read
// from the active theme (paper = bg, ink = text, wax = accent) so it sits right
// on rose-light, rivendell-dark, sunset — all of them.
//
// Shared by the desktop SealModal and the mobile compose flow so the seal
// feels identical on both. Drive it with two beats:
//   phase 'folding' → fold + wax stamp (~1.3s)
//   phase 'sealed'  → the letter departs into the universe (~1.7s)
export function SealJourney({
  recipient,
  phase,
  theme,
}: {
  recipient: 'self' | 'friend'
  phase: 'folding' | 'sealed'
  theme: ReturnType<typeof useThemeStore.getState>['theme']
}) {
  const ink = theme.text.primary
  const departed = phase === 'sealed'

  // a sparse scatter of stars that wake up only as the letter leaves
  const stars = [
    { left: '16%', top: '20%', d: 0 },
    { left: '80%', top: '26%', d: 0.5 },
    { left: '28%', top: '70%', d: 0.8 },
    { left: '70%', top: '74%', d: 0.3 },
    { left: '50%', top: '12%', d: 0.6 },
    { left: '88%', top: '60%', d: 0.95 },
    { left: '10%', top: '52%', d: 0.4 },
  ]

  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden py-6"
      style={{ minHeight: 260 }}
    >
      {/* the universe */}
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: s.left,
            top: s.top,
            width: 3,
            height: 3,
            backgroundColor: ink,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={
            departed
              ? { opacity: [0, 0.55, 0.15, 0.55], scale: [0, 1, 0.6, 1] }
              : { opacity: 0, scale: 0 }
          }
          transition={{
            duration: 2.6,
            delay: s.d,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* the letter — the wrapper carries it away; children handle fold + stamp */}
      <motion.div
        className="relative"
        initial={{ y: 0, x: 0, scale: 1, rotate: 0, opacity: 1 }}
        animate={
          departed
            ? { y: -150, x: 22, scale: 0.16, rotate: -16, opacity: 0 }
            : { y: 0, x: 0, scale: 1, rotate: 0, opacity: 1 }
        }
        transition={
          departed
            ? { duration: 1.7, ease: [0.4, 0, 0.2, 1] }
            : { duration: 0.3 }
        }
      >
        {/* paper folds down into thirds */}
        <motion.div
          className="flex flex-col gap-2 p-4"
          style={{
            width: 118,
            height: 150,
            transformOrigin: 'center',
            backgroundColor: theme.bg.primary,
            border: `1px solid ${ink}26`,
            borderRadius: 6,
            boxShadow: `0 12px 32px ${ink}1f`,
          }}
          initial={{ scaleY: 1, rotateX: 0 }}
          animate={{ scaleY: [1, 1, 0.4, 0.42], rotateX: [0, 0, 10, 6] }}
          transition={{ duration: 1.3, times: [0, 0.25, 0.8, 1], ease: 'easeInOut' }}
        >
          {[0.72, 0.9, 0.55, 0.82, 0.42].map((w, i) => (
            <span
              key={i}
              style={{
                display: 'block',
                height: 3,
                width: `${w * 100}%`,
                backgroundColor: ink,
                opacity: 0.18,
                borderRadius: 2,
              }}
            />
          ))}
        </motion.div>

        {/* wax seal stamps once the fold completes */}
        <motion.div
          className="absolute left-1/2 top-1/2 flex items-center justify-center rounded-full"
          style={{
            width: 34,
            height: 34,
            marginLeft: -17,
            marginTop: -17,
            backgroundColor: theme.accent.primary,
            boxShadow: `0 2px 10px ${theme.accent.primary}66`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 0, 1.2, 1], opacity: [0, 0, 1, 1] }}
          transition={{ duration: 1.3, times: [0, 0.62, 0.88, 1], ease: 'easeOut' }}
        >
          <span style={{ color: theme.bg.primary, fontSize: 14, opacity: 0.9 }}>
            ✦
          </span>
        </motion.div>
      </motion.div>

      {/* poetic caption, crossfading between the two beats */}
      <div className="mt-7 flex h-14 items-center justify-center px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5 }}
            className="font-serif text-base italic leading-relaxed sm:text-lg"
            style={{ color: theme.text.primary }}
          >
            {phase === 'folding'
              ? 'folding it away…'
              : recipient === 'self'
              ? 'off into the universe — it will find its way back to you.'
              : 'off into the universe — it will reach them when the time is right.'}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
