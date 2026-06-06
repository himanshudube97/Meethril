'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'
import type { Theme } from '@/lib/themes'

/** Minimal shape of the Chromium-only beforeinstallprompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Capture the install prompt at module load — it can fire before React mounts,
// so listening only inside useEffect would miss it. We stash it and notify the
// component via a custom event.
let capturedPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    capturedPrompt = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event('meethril:installable'))
  })
}

type Browser = 'safari' | 'chromium' | 'firefox' | 'other'

function detectBrowser(): Browser {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  if (/firefox|fxios/.test(ua)) return 'firefox'
  if (/edg|chrome|crios|brave/.test(ua)) return 'chromium'
  if (/safari/.test(ua)) return 'safari'
  return 'other'
}

const WHISPERS = [
  'Opens straight to today.',
  'Lives in your dock — no tabs, no noise.',
  'Sealed before it ever leaves your hands.',
]

export default function DownloadPage() {
  const { theme } = useThemeStore()

  const [installed, setInstalled] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(display-mode: standalone)').matches
  )
  const [canPrompt, setCanPrompt] = useState(() => !!capturedPrompt)
  const [showGuide, setShowGuide] = useState(false)
  const [browser] = useState<Browser>(() => detectBrowser())

  useEffect(() => {
    const onInstallable = () => setCanPrompt(true)
    const onInstalled = () => {
      setInstalled(true)
      setCanPrompt(false)
      capturedPrompt = null
    }
    window.addEventListener('meethril:installable', onInstallable)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('meethril:installable', onInstallable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (capturedPrompt) {
      await capturedPrompt.prompt()
      const { outcome } = await capturedPrompt.userChoice
      capturedPrompt = null
      setCanPrompt(false)
      if (outcome === 'dismissed') setShowGuide(true)
      return
    }
    // No programmatic prompt (Safari/Firefox, or criteria not met) — show the
    // step-by-step guide so manual install is obvious.
    setShowGuide(true)
  }

  return (
    <main
      className="relative min-h-[calc(100vh-7rem)] flex flex-col items-center justify-center px-6 py-16 overflow-hidden"
      style={{ background: theme.bg.gradient, color: theme.text.primary }}
    >
      {/* soft accent orb */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${theme.accent.primary}22 0%, transparent 70%)`,
          filter: 'blur(60px)',
          top: '-10%',
          right: '-10%',
        }}
        animate={{ opacity: [0.5, 0.7, 0.5], scale: [1, 1.05, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 max-w-2xl w-full text-center"
      >
        <Link
          href="/"
          className="inline-block mb-10 text-sm tracking-[0.3em] opacity-80 hover:opacity-100 transition"
          style={{ color: theme.text.secondary }}
        >
          ← MEETHRIL
        </Link>

        <h1
          className="text-5xl md:text-6xl font-light mb-5 tracking-tight"
          style={{ color: theme.text.primary }}
        >
          Meethril, on your desktop.
        </h1>
        <p
          className="text-lg md:text-xl italic mb-12"
          style={{ color: theme.text.secondary }}
        >
          A quiet little app for the corner of your screen.
        </p>

        {installed ? (
          <p className="text-base italic" style={{ color: theme.text.secondary }}>
            You&apos;re all set — Meethril is already on your desktop. ✦
          </p>
        ) : (
          <>
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-3 px-9 py-4 rounded-full text-base font-medium transition-all hover:opacity-90"
              style={{
                background: theme.accent.primary,
                color: theme.bg.primary,
                boxShadow: `0 8px 30px ${theme.accent.primary}40`,
                cursor: 'pointer',
              }}
            >
              {canPrompt ? 'Add Meethril to your desktop' : 'Download for your desktop'}
            </button>

            {!canPrompt && (
              <button
                onClick={() => setShowGuide((v) => !v)}
                className="block mx-auto mt-5 text-sm underline underline-offset-4 opacity-80 hover:opacity-100 transition"
                style={{ color: theme.text.secondary }}
              >
                How do I install it?
              </button>
            )}

            <AnimatePresence>
              {showGuide && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <InstallGuide theme={theme} browser={browser} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* atmospheric filler */}
        <div
          className="mt-16 pt-10 border-t max-w-md mx-auto"
          style={{ borderColor: `${theme.text.secondary}26` }}
        >
          <div className="space-y-3">
            {WHISPERS.map((line, i) => (
              <motion.p
                key={line}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 + i * 0.15, ease: 'easeOut' }}
                className="text-base"
                style={{ color: theme.text.secondary }}
              >
                {line}
              </motion.p>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="mt-10 text-sm italic"
            style={{ color: theme.text.muted }}
          >
            It installs straight from your browser — nothing to update, nothing to
            manage. Just a small warm light, always one click away.
          </motion.p>
        </div>
      </motion.div>
    </main>
  )
}

function InstallGuide({ theme, browser }: { theme: Theme; browser: Browser }) {
  const safariSteps = [
    <>Open the <strong style={{ color: theme.text.primary }}>File</strong> menu in the top bar (or the Share button).</>,
    <>Choose <strong style={{ color: theme.text.primary }}>Add to Dock</strong>.</>,
    <>Click <strong style={{ color: theme.text.primary }}>Add</strong> — Meethril now lives in your dock.</>,
  ]
  const chromiumSteps = [
    <>Look for the install icon <span aria-hidden style={{ color: theme.text.primary }}>⊕▾</span> at the right edge of the address bar.</>,
    <>Click it, then <strong style={{ color: theme.text.primary }}>Install</strong>.</>,
    <>Meethril opens in its own window, ready to pin to your dock.</>,
  ]

  // Lead with the user's browser; always show both so no one is stuck.
  const primary =
    browser === 'chromium'
      ? { title: 'Chrome, Edge or Brave', steps: chromiumSteps }
      : { title: 'Safari', steps: safariSteps }
  const secondary =
    browser === 'chromium'
      ? { title: 'Safari', steps: safariSteps }
      : { title: 'Chrome, Edge or Brave', steps: chromiumSteps }

  return (
    <div
      className="mt-6 mx-auto max-w-md text-left rounded-2xl p-6 border"
      style={{
        background: theme.glass.bg,
        borderColor: `${theme.text.secondary}26`,
      }}
    >
      <GuideBlock theme={theme} title={primary.title} steps={primary.steps} highlight />
      <div className="my-5 h-px" style={{ background: `${theme.text.secondary}1f` }} />
      <GuideBlock theme={theme} title={secondary.title} steps={secondary.steps} />
    </div>
  )
}

function GuideBlock({
  theme,
  title,
  steps,
  highlight,
}: {
  theme: Theme
  title: string
  steps: React.ReactNode[]
  highlight?: boolean
}) {
  return (
    <div>
      <p
        className="text-sm uppercase tracking-wider mb-3"
        style={{ color: highlight ? theme.accent.primary : theme.text.secondary }}
      >
        {title}
        {highlight && ' — you’re here'}
      </p>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium"
              style={{
                background: `${theme.accent.primary}22`,
                color: theme.text.primary,
              }}
            >
              {i + 1}
            </span>
            <span
              className="text-base leading-relaxed"
              style={{ color: theme.text.primary }}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
