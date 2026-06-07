'use client'

import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { useLayoutMode } from '@/hooks/useMediaQuery'

/**
 * Top-right chrome button to manually lock/unlock the diary.
 *
 * The master key persists in localStorage for a day (see crypto.ts) so the
 * user isn't re-prompted constantly on mobile. This button is the deliberate
 * escape hatch: when you're done — or on a shared/borrowed device — tap it to
 * wipe the key from this browser immediately, without waiting for the TTL.
 *
 * It's a toggle: unlocked → 🔓 "Lock diary" (clears the key); locked → 🔒
 * "Unlock diary" (re-opens the daily-key modal so you can get back in without
 * reloading — the auto-prompt only fires on initial load).
 *
 * Only rendered when E2EE is enabled; there's nothing to lock otherwise.
 */
function OpenLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1.9" />
    </svg>
  )
}

function ClosedLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export default function LockDiaryButton() {
  const { theme } = useThemeStore()
  const layoutMode = useLayoutMode()
  const isEnabled = useE2EEStore((s) => s.isEnabled)
  const isUnlocked = useE2EEStore((s) => s.isUnlocked)
  const clearMasterKey = useE2EEStore((s) => s.clearMasterKey)
  const setShowUnlockModal = useE2EEStore((s) => s.setShowUnlockModal)

  // Nothing to lock if the user hasn't set up E2EE.
  if (!isEnabled) return null

  const label = isUnlocked ? 'Lock diary' : 'Unlock diary'

  const handleClick = () => {
    if (isUnlocked) {
      // Wipe the key from this browser now. Entries re-lock as the views
      // re-run their decrypt (they depend on isE2EEReady).
      clearMasterKey()
    } else {
      // Re-open the daily-key prompt so the user can unlock again without a
      // full reload (initialize() only auto-shows it on first load).
      setShowUnlockModal(true)
    }
  }

  // Sits just left of the fullscreen button on desktop (gear at right-6,
  // fullscreen at right-18). On mobile the fullscreen button is hidden, so we
  // slide into its slot (right-18), immediately left of the gear.
  const positionClass = layoutMode === 'mobile' ? 'right-18' : 'right-30'

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      onClick={handleClick}
      className={`fixed top-6 ${positionClass} z-50 w-12 h-12 rounded-full flex items-center justify-center`}
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
        color: theme.accent.warm,
      }}
      title={label}
      aria-label={label}
    >
      {isUnlocked ? <OpenLock /> : <ClosedLock />}
    </motion.button>
  )
}
