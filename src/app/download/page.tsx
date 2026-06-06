'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'
import type { Theme } from '@/lib/themes'

type OS = 'mac' | 'windows' | 'linux' | 'unknown'

const DOWNLOAD_LINKS: Record<Exclude<OS, 'unknown'>, string> = {
  mac: '/api/download/mac-arm',
  windows: '/api/download/windows',
  linux: '/api/download/linux',
}

const OS_LABELS: Record<Exclude<OS, 'unknown'>, string> = {
  mac: 'Mac',
  windows: 'Windows',
  linux: 'Linux',
}

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform?.toLowerCase() ?? ''
  if (ua.includes('mac') || platform.includes('mac')) return 'mac'
  if (ua.includes('win') || platform.includes('win')) return 'windows'
  if (ua.includes('linux') || platform.includes('linux')) return 'linux'
  return 'unknown'
}

export default function DownloadPage() {
  const { theme } = useThemeStore()
  const [detected, setDetected] = useState<OS>('unknown')

  useEffect(() => {
    setDetected(detectOS())
  }, [])

  const otherOptions: Array<Exclude<OS, 'unknown'>> = (
    ['mac', 'windows', 'linux'] as const
  ).filter((o) => o !== detected)

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

        <PrimaryDownload os={detected} theme={theme} />

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm">
          {otherOptions.map((os) => (
            <DownloadPill key={os} os={os} theme={theme} />
          ))}
        </div>

        <FirstLaunchNote theme={theme} />
      </motion.div>
    </main>
  )
}

function PrimaryDownload({
  os,
  theme,
}: {
  os: OS
  theme: Theme
}) {
  if (os === 'unknown') {
    return (
      <p
        className="text-sm italic"
        style={{ color: theme.text.muted }}
      >
        Pick your platform below.
      </p>
    )
  }
  return (
    <a
      href={DOWNLOAD_LINKS[os]}
      className="inline-flex items-center gap-3 px-8 py-4 rounded-full text-base font-medium transition-all"
      style={{
        background: theme.accent.primary,
        color: theme.bg.primary,
        boxShadow: `0 8px 30px ${theme.accent.primary}40`,
        cursor: 'pointer',
      }}
    >
      <span>Download for {OS_LABELS[os]}</span>
    </a>
  )
}

function DownloadPill({
  os,
  theme,
}: {
  os: Exclude<OS, 'unknown'>
  theme: Theme
}) {
  return (
    <a
      href={DOWNLOAD_LINKS[os]}
      className="px-5 py-2.5 rounded-full border text-sm tracking-wide transition hover:opacity-80"
      style={{
        borderColor: `${theme.text.secondary}66`,
        color: theme.text.secondary,
      }}
    >
      {OS_LABELS[os]}
    </a>
  )
}

function FirstLaunchNote({
  theme,
}: {
  theme: Theme
}) {
  return (
    <div
      className="mt-16 max-w-md mx-auto text-left text-sm leading-relaxed border-t pt-8"
      style={{
        borderColor: `${theme.text.secondary}30`,
        color: theme.text.secondary,
      }}
    >
      <p className="mb-2 italic">First launch?</p>
      <p className="mb-1">
        <strong style={{ color: theme.text.primary }}>Mac:</strong>{' '}
        right-click the app → Open → Open. macOS will remember after that.
      </p>
      <p className="mb-3">
        <strong style={{ color: theme.text.primary }}>Windows:</strong>{' '}
        click <em>More info</em> → <em>Run anyway</em> if SmartScreen warns
        you.
      </p>
      <p className="opacity-90">
        Mac build is for Apple Silicon (M1, M2, M3, M4). Intel Mac support
        coming later.
      </p>
    </div>
  )
}
