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

interface E2EEProviderProps {
  children: React.ReactNode
}

export default function E2EEProvider({ children }: E2EEProviderProps) {
  const { user } = useAuthStore()
  const { initialize, initialized, clearMasterKey } = useE2EEStore()
  const { runBackfill } = useBackfill()
  const backfillStatus = useE2EEStore(s => s.backfillProgress.status)
  const isUnlocked = useE2EEStore(s => s.isUnlocked)
  const pathname = usePathname()
  // Pre-auth pages (login, landing, onboarding…) must never trigger the
  // unlock flow — otherwise a lingering session surfaces the daily-key modal
  // over the login page. The friend-letter save flow is the one public
  // exception (see allowsE2EEModals).
  const modalsAllowed = allowsE2EEModals(pathname)

  // Initialize E2EE when user logs in (but not while sitting on a pre-auth
  // page — defer until the user lands on the authed app surface).
  useEffect(() => {
    if (user && !initialized && modalsAllowed) {
      initialize()
    }
  }, [user, initialized, initialize, modalsAllowed])

  // Clear master key when user logs out
  useEffect(() => {
    if (!user && initialized) {
      clearMasterKey()
    }
  }, [user, initialized, clearMasterKey])

  // Auto-resume backfill if it was previously running or paused
  useEffect(() => {
    if (isUnlocked && (backfillStatus === 'running' || backfillStatus === 'paused')) {
      runBackfill().catch(console.error)
    }
  }, [isUnlocked, backfillStatus, runBackfill])

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
