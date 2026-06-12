'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useTrialStore } from '@/store/trial'
import { installTrialFetch } from '@/lib/trial/intercept'
import { primeTrialCrypto } from '@/lib/trial/crypto'
import { clearBlobs } from '@/lib/trial/blob-store'

const TryModeContext = createContext(false)
export const useTryMode = () => useContext(TryModeContext)

export default function TryModeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)
  const [ready, setReady] = useState(false)
  const restoreRef = useRef<null | (() => void)>(null)
  const uninstallRef = useRef<null | (() => void)>(null)

  useEffect(() => {
    // Wait for auth to resolve before acting — avoids flash-redirecting an
    // anonymous visitor mid-fetch whose loading flag hasn't settled yet.
    if (loading) return

    // Seatbelt: a real session in this tab → bounce to the real diary so the
    // throwaway key can never touch real data.
    if (user) { router.replace('/me'); return }

    let cancelled = false
    useTrialStore.getState().reset()
    uninstallRef.current = installTrialFetch()
    primeTrialCrypto().then(restore => {
      if (cancelled) { restore(); return }
      restoreRef.current = restore
      setReady(true)
    })

    return () => {
      cancelled = true
      uninstallRef.current?.()
      restoreRef.current?.()
      clearBlobs()
    }
  }, [user, loading, router])

  // Hold back children until auth is known AND the trial is primed.
  // Also hold if a real user is detected (redirect is in flight).
  if (loading || user || !ready) return null

  return <TryModeContext.Provider value={true}>{children}</TryModeContext.Provider>
}
