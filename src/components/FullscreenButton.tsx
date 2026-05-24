'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useLayoutMode } from '@/hooks/useMediaQuery'

type WebkitDoc = Document & { webkitFullscreenElement?: Element | null }

function isJsFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  return !!(document.fullscreenElement || (document as WebkitDoc).webkitFullscreenElement)
}

function ExpandIcon({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    // Brackets pointing inward → "exit fullscreen"
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      </svg>
    )
  }
  // Brackets pointing outward → "enter fullscreen"
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}

export default function FullscreenButton() {
  const { theme } = useThemeStore()
  const { isFullscreen, supported, toggle } = useFullscreen()
  const layoutMode = useLayoutMode()
  const [showHint, setShowHint] = useState(false)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current)
    }
  }, [])

  if (!supported) return null
  // Mobile browsers handle fullscreen via PWA install / native chrome; the
  // fullscreen API is unreliable here and the slot is reused by the menu.
  if (layoutMode === 'mobile') return null

  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'

  const handleClick = () => {
    // JS can only exit fullscreen if JS entered it. If the user is in
    // browser-/OS-level fullscreen (Chrome menu, F11, macOS green button),
    // there is no API to exit programmatically — show a hint instead.
    if (isFullscreen && !isJsFullscreen()) {
      setShowHint(true)
      if (hintTimer.current) clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setShowHint(false), 3500)
      return
    }
    void toggle()
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onClick={handleClick}
        // Sits immediately left of the gear (gear at right-6, w-12 → its left
        // edge is 72px from the viewport's right edge). Putting this button at
        // right-18 (72px) makes the two buttons touch.
        className="fixed top-6 right-18 z-50 w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
          color: theme.accent.warm,
        }}
        title={label}
        aria-label={label}
      >
        <ExpandIcon collapsed={isFullscreen} />
      </motion.button>

      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-20 right-6 z-50 px-3 py-2 rounded-xl text-xs shadow-lg max-w-xs"
            style={{
              background: theme.bg.primary,
              color: theme.text.primary,
              border: `1px solid ${theme.glass.border}`,
              fontFamily: 'Georgia, serif',
            }}
            role="status"
          >
            Press <kbd>Esc</kbd> or <kbd>F11</kbd> to exit fullscreen — browsers don&apos;t let pages do it.
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
