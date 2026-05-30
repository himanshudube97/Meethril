'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'

const CONTACT_EMAIL = 'himanshu@meethril.com'
// Opens Gmail's web compose, prefilled to us. mailto: was unreliable — it
// silently does nothing for visitors with no default mail client. We also
// render the address as visible text so non-Gmail visitors can read/copy it.
const GMAIL_COMPOSE = `https://mail.google.com/mail/?view=cm&fs=1&to=${CONTACT_EMAIL}`

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

        <div className="mt-14 flex flex-col items-center gap-7">
          <Link
            href="/download"
            className="text-base italic underline-offset-4 hover:underline"
            style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
          >
            Also on desktop — Mac · Windows · Linux
          </Link>

          {/* Social */}
          <div className="flex items-center gap-7" style={{ color: theme.text.secondary }}>
            <a
              href="https://x.com/meethril_space"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Meethril on X"
              className="opacity-70 hover:opacity-100 transition-opacity"
            >
              <XIcon />
            </a>
            <a
              href="https://www.instagram.com/meethril_space/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Meethril on Instagram"
              className="opacity-70 hover:opacity-100 transition-opacity"
            >
              <InstagramIcon />
            </a>
          </div>

          {/* Contact */}
          <p className="text-base" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
            Contact us —{' '}
            <a
              href={GMAIL_COMPOSE}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:opacity-100 opacity-90 transition-opacity"
              style={{ color: theme.text.secondary }}
            >
              {CONTACT_EMAIL}
            </a>
          </p>

          {/* Brand + legal */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <p
              className="text-base"
              style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
            >
              Meethril — a meditative journal that listens
            </p>
            <div
              className="flex items-center gap-4 text-sm"
              style={{ color: theme.text.muted }}
            >
              <Link href="/privacy" className="hover:underline underline-offset-4 transition">
                Privacy
              </Link>
              <span aria-hidden>·</span>
              <Link href="/terms" className="hover:underline underline-offset-4 transition">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function XIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

