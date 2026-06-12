'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

export default function TryEntryScreen() {
  const { theme } = useThemeStore()
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center gap-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-md">
        <h1 className="text-3xl mb-3" style={{ color: theme.text.primary, fontFamily: 'var(--font-caveat), cursive' }}>
          A diary that listens
        </h1>
        <p style={{ color: theme.text.secondary }}>
          No account. No setup. Write something and feel it.
        </p>
      </motion.div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <Link href="/try/write" className="flex-1 py-3 rounded-xl text-center font-medium"
          style={{ background: theme.accent.primary, color: theme.bg.primary }}>
          Begin writing
        </Link>
        <Link href="/try/tour" className="flex-1 py-3 rounded-xl text-center font-medium"
          style={{ border: `1px solid ${theme.glass.border}`, color: theme.text.primary }}>
          Get the feel
        </Link>
      </div>
    </div>
  )
}
