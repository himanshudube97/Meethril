'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'
import { whispers } from '@/lib/themes'

const tagline = 'A hush at the end of the day, kept just for you.'

/**
 * Landing hero — stripped of the orbs, particles, typewriter, scroll
 * indicator, and button pulse that used to live here. What's left: a
 * gentle title fade-in, a tagline, a rotating "whisper" (the only
 * lingering motion — slow text crossfade, ~no CPU cost), and the CTA.
 * Loads cleanly on mobile.
 */
export default function HeroSection() {
  const { theme } = useThemeStore()
  const [currentWhisper, setCurrentWhisper] = useState('')
  const [whisperKey, setWhisperKey] = useState(0)

  useEffect(() => {
    const changeWhisper = () => {
      setCurrentWhisper(whispers[Math.floor(Math.random() * whispers.length)])
      setWhisperKey(prev => prev + 1)
    }
    changeWhisper()
    const interval = setInterval(changeWhisper, 8000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ background: theme.bg.gradient }}
    >
      <div className="relative z-10 text-center max-w-xl">
        <motion.h1
          className="text-5xl md:text-7xl lg:text-8xl font-serif tracking-[0.3em] mb-6"
          style={{ color: theme.text.primary }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          MEETHRIL
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl font-light tracking-wide mb-10"
          style={{ color: theme.text.secondary }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          {tagline}
        </motion.p>

        {/* Rotating whisper — same gentle pace as the in-app prompts. */}
        <div className="h-16 mb-10 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={whisperKey}
              className="text-sm md:text-base italic max-w-md"
              style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9 }}
            >
              &ldquo;{currentWhisper}&rdquo;
            </motion.p>
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/write"
              className="inline-block px-10 py-4 rounded-full text-lg font-medium transition"
              style={{
                background: theme.accent.primary,
                color: theme.bg.primary,
                fontFamily: 'Georgia, serif',
              }}
            >
              Begin writing
            </Link>
            <Link
              href="/try"
              className="inline-block px-10 py-4 rounded-full text-lg font-medium transition hover:opacity-80"
              style={{
                background: 'transparent',
                color: theme.text.primary,
                border: `1px solid ${theme.glass.border}`,
                fontFamily: 'Georgia, serif',
              }}
            >
              Get the feel
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
