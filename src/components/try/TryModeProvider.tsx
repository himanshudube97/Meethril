'use client'

import { createContext, useContext, useEffect, useState } from 'react'
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

  useEffect(() => {
    // Wait for auth to resolve before acting — avoids flash-redirecting an
    // anonymous visitor mid-fetch whose loading flag hasn't settled yet.
    if (loading) return

    // Seatbelt: a real session in this tab → bounce to the real diary so the
    // throwaway key can never touch real data.
    if (user) { router.replace('/me'); return }

    // StrictMode-safe: the async prime's restore is owned ONLY by this effect's
    // cleanup, read through the `restore` binding below. We must NOT call restore
    // from inside .then on cancel — under StrictMode's double-invoke the first
    // run's late-resolving prime would otherwise clear the key the second run
    // just set (the throwaway key + store priming live in shared global state).
    let active = true
    let restore: () => void = () => {}
    // Seed ONLY on a fresh tab. The trial store persists to sessionStorage, so on
    // reload/navigation within the session it's already populated — reset()ing
    // here would wipe entries the visitor just wrote. Empty entries ⇒ first visit.
    if (useTrialStore.getState().entries.length === 0) useTrialStore.getState().reset()
    const uninstall = installTrialFetch()
    primeTrialCrypto().then(r => {
      restore = r
      if (active) setReady(true)
    })

    return () => {
      active = false
      uninstall()
      restore()        // no-op if prime hasn't resolved yet — that's intended
      clearBlobs()
    }
  }, [user, loading, router])

  // Hold back children until auth is known AND the trial is primed.
  // Also hold if a real user is detected (redirect is in flight).
  if (loading || user || !ready) return null

  return <TryModeContext.Provider value={true}>{children}</TryModeContext.Provider>
}
