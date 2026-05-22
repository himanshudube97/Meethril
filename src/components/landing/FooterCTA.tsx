'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'

/**
 * Closing footer of the landing page. Stripped of the ambient glow,
 * the button heartbeat, and the staggered scroll-driven entrances —
 * just the poetic closing line, the CTA, and the desktop nudge.
 */
export default function FooterCTA() {
  const { theme } = useThemeStore()

  return (
    <section
      className="min-h-screen py-32 px-6 flex items-center justify-center"
      style={{ background: theme.bg.gradient }}
    >
      <div className="max-w-2xl mx-auto text-center">
        <div className="text-4xl mb-8">{theme.moodEmojis[4]}</div>

        <motion.p
          className="text-2xl md:text-3xl font-serif italic mb-4"
          style={{ color: theme.text.primary }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
        >
          The page is patient.
        </motion.p>

        <motion.p
          className="text-lg mb-12"
          style={{ color: theme.text.secondary }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          Your words are waiting. Your feelings matter. Begin when you&apos;re ready.
        </motion.p>

        <Link
          href="/write"
          className="inline-block px-12 py-5 rounded-full text-xl font-medium transition"
          style={{
            background: theme.accent.primary,
            color: theme.bg.primary,
            fontFamily: 'Georgia, serif',
          }}
        >
          Start your journey
        </Link>

        <div className="mt-12">
          <Link
            href="/download"
            className="text-sm italic underline-offset-4 hover:underline"
            style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
          >
            Also on desktop — Mac · Windows · Linux
          </Link>
        </div>

        <p
          className="mt-8 text-sm"
          style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
        >
          Hearth — a meditative journal that listens
        </p>
      </div>
    </section>
  )
}
