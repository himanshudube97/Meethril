'use client'

import { motion } from 'framer-motion'
import Background from '@/components/Background'
import { useThemeStore } from '@/store/theme'
import { UnlockForm } from './UnlockForm'

interface LockGateProps {
  /** true while we are still figuring out E2EE status (before init finishes):
   *  show a neutral splash, no input. false → show the unlock form. */
  pending?: boolean
}

export default function LockGate({ pending = false }: LockGateProps) {
  const { theme } = useThemeStore()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
      {/* Theme particles — matches the active theme, no hardcoded bg. Body bg
          colour is already set globally by LayoutContent's useEffect. */}
      <Background />

      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        {pending ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <motion.svg
              className="w-16 h-16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.accent.primary}
              strokeWidth="1.5"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </motion.svg>
            <p className="text-base" style={{ color: theme.text.secondary }}>
              Unlocking…
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="p-6 rounded-2xl"
            style={{
              background: theme.bg.primary,
              border: `1px solid ${theme.glass.border}`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <UnlockForm showLogout />
          </motion.div>
        )}
      </div>
    </div>
  )
}
