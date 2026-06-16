'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useTrialStore, TRIAL_LIMIT } from '@/store/trial'
import { useThemeStore } from '@/store/theme'

const LABELS: Record<string, string> = {
  journal: 'journal entries',
  letter: 'letters',
  scrapbook: 'scrapbooks',
}

export default function TryLimitModal() {
  const prompt = useTrialStore(s => s.signupPrompt)
  const dismiss = useTrialStore(s => s.dismissSignup)
  const { theme } = useThemeStore()

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="max-w-sm w-full rounded-2xl p-6 text-center"
            style={{ background: theme.bg.primary, border: `1px solid ${theme.glass.border}`, color: theme.text.primary }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-lg mb-2" style={{ color: theme.text.primary }}>
              You&apos;ve filled your {LABELS[prompt] ?? 'trial'}.
            </p>
            <p className="text-sm mb-5" style={{ color: theme.text.muted }}>
              The trial holds {TRIAL_LIMIT} of each. Make it permanent to keep going — your real space starts fresh and private.
            </p>
            <Link href="/login">
              <span
                className="inline-block px-5 py-2.5 rounded-full text-sm font-medium"
                style={{ background: theme.accent.primary, color: theme.bg.primary }}
              >
                Make it permanent
              </span>
            </Link>
            <button onClick={dismiss} className="block w-full mt-3 text-xs" style={{ color: theme.text.muted }}>
              keep looking around
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
