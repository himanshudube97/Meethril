'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { isPublicRoute } from '@/lib/auth/public-routes'

/**
 * Client-side auth boundary. The middleware blocks unauthenticated *server*
 * requests, but every protected page is a client component that would
 * otherwise render the full platform while `fetchUser()` is still in flight —
 * or, worse, after it resolves to `null` (expired/refreshing session). That's
 * the "I can see the whole platform without logging in, only the profile is
 * blank" bug: the platform paints, and the one `user`-dependent piece stays
 * empty.
 *
 * On a protected route this gate shows a quiet splash until auth resolves,
 * then either renders the app (authenticated) or redirects to /login. Public
 * routes render their children immediately.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)
  const theme = useThemeStore(s => s.theme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isPublic = isPublicRoute(pathname)

  // Once auth has resolved to "no user" on a protected route, send them to
  // login with a redirect back. Guarded on !loading so we never bounce a user
  // mid-fetch.
  useEffect(() => {
    if (!isPublic && !loading && !user) {
      const params = new URLSearchParams({ redirect: pathname })
      router.replace(`/login?${params.toString()}`)
    }
  }, [isPublic, loading, user, pathname, router])

  if (isPublic) return <>{children}</>

  // Protected route, auth not yet resolved (or resolved to null and a redirect
  // is in flight) — hold back the platform behind a minimal themed splash.
  if (loading || !user) {
    return (
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: mounted ? theme.bg.primary : undefined,
        }}
      >
        <span
          style={{
            fontSize: 13,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            opacity: 0.5,
            color: mounted ? theme.text.muted : '#888',
            animation: 'authgate-pulse 1.6s ease-in-out infinite',
          }}
        >
          Hearth
        </span>
        <style>{`@keyframes authgate-pulse { 0%, 100% { opacity: 0.25 } 50% { opacity: 0.6 } }`}</style>
      </div>
    )
  }

  return <>{children}</>
}
