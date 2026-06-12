'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useE2EEStore } from '@/store/e2ee'
import { useBackfill } from '@/hooks/useBackfill'
import { allowsE2EEModals } from '@/lib/auth/public-routes'
import SetupModal from './SetupModal'
import UnlockModal from './UnlockModal'
import RecoveryModal from './RecoveryModal'
import BackfillToast from './BackfillToast'
import { e2eeGateState } from '@/lib/e2ee/gate'
import LockGate from './LockGate'

interface E2EEProviderProps {
  children: React.ReactNode
}

export default function E2EEProvider({ children }: E2EEProviderProps) {
  const { user } = useAuthStore()
  const { initialize, initialized, clearMasterKey } = useE2EEStore()
  const { runBackfill } = useBackfill()
  const backfillStatus = useE2EEStore(s => s.backfillProgress.status)
  const isUnlocked = useE2EEStore(s => s.isUnlocked)
  const isEnabled = useE2EEStore(s => s.isEnabled)
  const pathname = usePathname()
  // Pre-auth pages (login, landing, onboarding…) must never trigger the
  // unlock flow — otherwise a lingering session surfaces the daily-key modal
  // over the login page. The friend-letter save flow is the one public
  // exception (see allowsE2EEModals).
  const modalsAllowed = allowsE2EEModals(pathname)

  const gate = e2eeGateState({
    hasUser: !!user,
    allowsModals: modalsAllowed,
    initialized,
    isEnabled,
    isUnlocked,
  })

  // Initialize E2EE when user logs in (but not while sitting on a pre-auth
  // page — defer until the user lands on the authed app surface).
  useEffect(() => {
    if (user && !initialized && modalsAllowed) {
      initialize()
    }
  }, [user, initialized, initialize, modalsAllowed])

  // Clear master key when user logs out. Exempt the anonymous /try sandbox:
  // it deliberately primes a throwaway in-tab key with no logged-in user, and
  // this effect would otherwise wipe it the instant trial sets `initialized`.
  useEffect(() => {
    if (!user && initialized && !pathname.startsWith('/try')) {
      clearMasterKey()
    }
  }, [user, initialized, clearMasterKey, pathname])

  // Auto-resume backfill if it was previously running or paused
  useEffect(() => {
    if (isUnlocked && (backfillStatus === 'running' || backfillStatus === 'paused')) {
      runBackfill().catch(console.error)
    }
  }, [isUnlocked, backfillStatus, runBackfill])

  // Gate: while pending (figuring out E2EE status) or locked (E2EE on, not
  // unlocked) on an authed app surface, do NOT mount {children}. The journal
  // editors and every other E2EE-content fetcher live inside {children}, so
  // withholding it means nothing is fetched or decrypted before the daily key
  // is entered — on every device. RecoveryModal stays mounted because the
  // lock screen's "use recovery key" link drives it.
  if (gate !== 'open') {
    return (
      <>
        <LockGate pending={gate === 'pending'} />
        <RecoveryModal />
      </>
    )
  }

  return (
    <>
      {children}
      {modalsAllowed && (
        <>
          <SetupModal />
          <UnlockModal />
          <RecoveryModal />
          <BackfillToast />
        </>
      )}
    </>
  )
}
