'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useTrialStore } from '@/store/trial'

/**
 * Self-contained letter demo for the trial. The real compose pipeline is
 * server-coupled (drafts, /api/letters/self, answer-derived friend keys, a
 * cron-delivered week-long delay), which doesn't fit an offline sandbox. So the
 * trial gets its own lightweight flow that conveys the magic: write a letter to
 * your future self → seal it → and instead of waiting weeks, fast-forward to the
 * moment it arrives. Self-letters only. Stores via the trial store so it counts
 * as a kept entry, then reveals instantly.
 */
type Phase = 'compose' | 'sealing' | 'revealed'

export default function TryLetterDemo() {
  const { theme } = useThemeStore()
  const createLetter = useTrialStore(s => s.createLetter)
  const revealLetter = useTrialStore(s => s.revealLetter)
  const [phase, setPhase] = useState<Phase>('compose')
  const [text, setText] = useState('')

  const seal = () => {
    if (!text.trim()) return
    const id = createLetter({ text, recipientName: null })
    setPhase('sealing')
    // Fast-forward: skip the real week-long, cron-delivered wait.
    window.setTimeout(() => {
      revealLetter(id)
      setPhase('revealed')
    }, 1400)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-6">
      <AnimatePresence mode="wait">
        {phase === 'compose' && (
          <motion.div
            key="compose"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-lg"
          >
            <p
              className="mb-3 text-center text-sm uppercase tracking-[0.18em]"
              style={{ color: theme.text.secondary }}
            >
              A letter to your future self
            </p>
            <div
              className="rounded-2xl p-5"
              style={{ background: theme.bg.primary, border: `1px solid ${theme.glass.border}` }}
            >
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                autoFocus
                rows={6}
                placeholder="Dear me, by the time you read this…"
                className="w-full resize-none bg-transparent outline-none"
                style={{
                  color: theme.text.primary,
                  fontFamily: 'var(--font-caveat), cursive',
                  fontSize: '22px',
                  lineHeight: 1.6,
                }}
              />
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={seal}
                disabled={!text.trim()}
                className="rounded-full px-6 py-2.5 font-medium transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
                style={{ background: theme.accent.primary, color: theme.bg.primary }}
              >
                Seal it ✉
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'sealing' && (
          <motion.div
            key="sealing"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, rotate: [0, -4, 4, 0] }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 1.2 }}
            className="text-center"
          >
            <div className="text-6xl">✉️</div>
            <p className="mt-4 text-sm" style={{ color: theme.text.secondary }}>
              Sealing, and sending it down the years…
            </p>
          </motion.div>
        )}

        {phase === 'revealed' && (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg text-center"
          >
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-3 text-sm uppercase tracking-[0.18em]"
              style={{ color: theme.text.secondary }}
            >
              …and here it is, arrived
            </motion.p>
            <motion.div
              initial={{ rotateX: 80, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 90, damping: 14 }}
              className="rounded-2xl p-6"
              style={{
                background: theme.bg.primary,
                border: `1px solid ${theme.glass.border}`,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              }}
            >
              <p
                className="whitespace-pre-wrap text-left"
                style={{
                  color: theme.text.primary,
                  fontFamily: 'var(--font-caveat), cursive',
                  fontSize: '23px',
                  lineHeight: 1.6,
                }}
              >
                {text}
              </p>
            </motion.div>
            <p className="mt-4 text-xs" style={{ color: theme.text.secondary }}>
              In your real diary this stays sealed until the day you choose — then it truly arrives.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
