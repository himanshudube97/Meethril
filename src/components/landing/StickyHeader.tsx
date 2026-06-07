'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'

/**
 * Landing-page header. On desktop it's a pill with MEETHRIL + links + a CTA.
 * On mobile we mirror the in-app hamburger so the chrome stays consistent:
 * a circular hamburger button top-left + a circular CTA top-right (Begin
 * Writing). The hamburger opens a compact drop-panel with the public
 * links — same component pattern as Navigation.tsx so users who've been
 * inside the app feel at home on the landing.
 */
export default function StickyHeader() {
  const { theme } = useThemeStore()
  const layoutMode = useLayoutMode()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  if (layoutMode === 'mobile') {
    return (
      <>
        <motion.button
          onClick={() => setOpen(o => !o)}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed top-4 left-4 z-50 w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.primary,
          }}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <HamburgerIcon open={open} />
        </motion.button>

        {/* Primary CTA mirrors the gear's top-right position so the page
            has one button on each shoulder, matching the in-app layout. */}
        <Link
          href="/write"
          className="fixed top-4 right-4 z-50 px-4 h-12 rounded-full inline-flex items-center text-sm transition"
          style={{
            background: theme.accent.primary,
            color: theme.bg.primary,
            fontFamily: 'Georgia, serif',
          }}
        >
          Begin
        </Link>

        <AnimatePresence>
          {open && (
            <>
              <div
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40"
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="fixed top-17 left-4 z-50 w-56 rounded-2xl p-2 flex flex-col gap-0.5"
                style={{
                  background: theme.glass.bg,
                  backdropFilter: `blur(${theme.glass.blur})`,
                  WebkitBackdropFilter: `blur(${theme.glass.blur})`,
                  border: `1px solid ${theme.glass.border}`,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.28)',
                  transformOrigin: 'top left',
                }}
              >
                <MenuLink href="/">Home</MenuLink>
                <MenuLink href="/pricing">Pricing</MenuLink>
                <MenuLink href="/download">Desktop app</MenuLink>
                <MenuLink href="/write">Begin writing</MenuLink>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    )
  }

  // Desktop — original pill header.
  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div
        className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3 rounded-full"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <Link href="/">
          <motion.span
            className="text-xl font-serif tracking-widest"
            style={{ color: theme.text.primary }}
            whileHover={{ scale: 1.02 }}
          >
            MEETHRIL
          </motion.span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/pricing">
            <motion.span
              className="text-sm"
              style={{ color: theme.text.secondary }}
              whileHover={{ color: theme.text.primary }}
            >
              Pricing
            </motion.span>
          </Link>

          <Link href="/download">
            <motion.span
              className="text-sm"
              style={{ color: theme.text.secondary }}
              whileHover={{ color: theme.text.primary }}
            >
              Desktop
            </motion.span>
          </Link>

          <Link href="/write">
            <motion.button
              className="px-6 py-2 rounded-full text-sm font-medium"
              style={{
                background: theme.accent.primary,
                color: theme.bg.primary,
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Begin Writing
            </motion.button>
          </Link>
        </div>
      </div>
    </motion.header>
  )
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <Link href={href}>
      <div
        className="px-3 py-2 rounded-xl text-sm"
        style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
      >
        {children}
      </div>
    </Link>
  )
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="7" x2="21" y2="7" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="17" x2="21" y2="17" />
        </>
      )}
    </svg>
  )
}
