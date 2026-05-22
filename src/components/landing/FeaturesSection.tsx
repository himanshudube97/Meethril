'use client'

import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

interface Feature {
  icon: string
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    icon: '✎',
    title: 'A diary that listens',
    body: 'Write what your day felt like, attach a song you couldn’t stop hearing, paste a photo, sketch something small. Each entry locks the next day so what you wrote stays what you wrote.',
  },
  {
    icon: '✉',
    title: 'Letters across time',
    body: 'Write to your future self or someone close. Hearth keeps the letter sealed until the day you chose — a week from now, a year from now — then delivers it.',
  },
  {
    icon: '✦',
    title: 'Notes from strangers',
    body: 'A small light you can send to someone you’ll never meet. Short, anonymous, optional postmark. Sometimes one comes back.',
  },
  {
    icon: '★',
    title: 'Memories that drift back',
    body: 'Old entries return as quiet butterflies on the memory page. Tap one to revisit a past you, in your own handwriting.',
  },
  {
    icon: '❒',
    title: 'A shelf of your months',
    body: 'Twelve diaries per year, one per month. Open any of them and the spread unfolds with everything you put inside.',
  },
  {
    icon: '🔒',
    title: 'Yours, end to end',
    body: 'Journals, letters, scrapbook items — encrypted in your browser before they ever leave. We can’t read them.',
  },
]

/**
 * Calm, scroll-into-view feature cards. No 3D, no parallax, no orbs.
 * One column on phones; two columns once there’s room. Each card fades
 * in when it scrolls into view (whileInView, viewport-once) so the
 * motion is finite and cheap on mobile.
 */
export default function FeaturesSection() {
  const { theme } = useThemeStore()

  return (
    <section
      className="relative py-24 px-6"
      style={{ background: theme.bg.gradient, color: theme.text.primary }}
    >
      <div className="max-w-3xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-serif text-center mb-3"
          style={{ color: theme.text.primary }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          What’s inside
        </motion.h2>
        <motion.p
          className="text-center text-base italic mb-12 max-w-md mx-auto"
          style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          A handful of small, gentle places to put what you’re carrying.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 2) * 0.08 }}
              className="rounded-2xl p-5"
              style={{
                background: theme.glass.bg,
                backdropFilter: `blur(${theme.glass.blur})`,
                WebkitBackdropFilter: `blur(${theme.glass.blur})`,
                border: `1px solid ${theme.glass.border}`,
              }}
            >
              <div
                className="text-2xl mb-3"
                aria-hidden
                style={{ color: theme.accent.primary }}
              >
                {f.icon}
              </div>
              <div
                className="text-base mb-2"
                style={{ color: theme.text.primary, fontFamily: 'var(--font-playfair), Georgia, serif' }}
              >
                {f.title}
              </div>
              <div
                className="text-sm leading-relaxed"
                style={{ color: theme.text.secondary, fontFamily: 'Georgia, serif' }}
              >
                {f.body}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
