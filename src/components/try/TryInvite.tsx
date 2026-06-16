'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useTrialStore } from '@/store/trial'

/**
 * Gentle, persistent "make it permanent" invite shown over the trial scenes.
 * Subtle while the visitor is exploring; warms up once they've written their
 * first journal entry (journalCount > 0) — the moment they've felt the product.
 * No hard wall: Hearth's tone is an invitation, not a paywall. Anonymous → links
 * to /login to create a real (E2EE) account.
 */
export default function TryInvite() {
  const { theme } = useThemeStore()
  const written = useTrialStore(s => s.journalCount) > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
    >
      <Link
        href="/login"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur transition-transform hover:scale-[1.03]"
        style={{
          background: written ? theme.accent.primary : `${theme.bg.primary}cc`,
          color: written ? theme.bg.primary : theme.text.secondary,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        {written ? 'Loved it? Keep your diary forever →' : 'Make it permanent →'}
      </Link>
    </motion.div>
  )
}
