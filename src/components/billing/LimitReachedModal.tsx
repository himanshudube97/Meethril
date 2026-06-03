'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useLimitPromptStore } from '@/store/limit-prompt'
import { limitMessage } from '@/lib/billing/limit-error'

/**
 * Global modal shown when a create action is blocked by a usage limit (429
 * limit_reached). Mounted once in LayoutContent. Free users see an upgrade CTA;
 * paid users (already at their higher cap) just see when the limit resets.
 */
export default function LimitReachedModal() {
  const { theme } = useThemeStore()
  const router = useRouter()
  const limit = useLimitPromptStore((s) => s.limit)
  const hide = useLimitPromptStore((s) => s.hide)

  const open = limit !== null
  const showUpgrade = open && !limit.isPaid

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={hide}
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] max-w-sm mx-auto p-6 rounded-2xl text-center"
            style={{
              background: theme.bg.primary,
              border: `1px solid ${theme.glass.border}`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="mb-4">
              <svg
                className="w-12 h-12 mx-auto"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.accent.primary}
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
            </div>

            <h2 className="text-lg font-light mb-2" style={{ color: theme.text.primary }}>
              {showUpgrade ? 'You’ve reached your free limit' : 'Limit reached'}
            </h2>

            <p className="text-sm mb-6" style={{ color: theme.text.secondary }}>
              {limit && limitMessage(limit)}
            </p>

            <div className="flex gap-2">
              <button
                onClick={hide}
                className="flex-1 py-3 rounded-xl text-sm"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.muted,
                }}
              >
                {showUpgrade ? 'Maybe later' : 'Got it'}
              </button>
              {showUpgrade && (
                <button
                  onClick={() => {
                    hide()
                    router.push('/pricing')
                  }}
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: theme.accent.primary, color: theme.bg.primary }}
                >
                  Upgrade
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
