'use client'

import { usePathname } from 'next/navigation'
import { useIsHandheld } from '@/hooks/useIsHandheld'
import DesktopOnlySplash from '@/components/DesktopOnlySplash'

/**
 * Desktop-only gate. While the mobile experience is paused, phones/tablets see
 * a "built for desktop" splash instead of the app. Only the public marketing
 * pages (home `/`, pricing `/pricing`) and emailed friend-letter links
 * (`/letter/[token]`) stay reachable on handhelds — every other route, even a
 * manually typed URL, renders the splash.
 *
 * Placed ABOVE E2EEProvider in the tree (see app/layout.tsx) so it also
 * suppresses the global E2EE modals and the product tour, which render as
 * siblings of the page content and would otherwise leak over the splash.
 *
 * `useIsHandheld` returns false during SSR / first paint, so desktop never
 * flashes the splash; on a handheld the splash resolves on mount.
 */
function isMobileAllowed(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/pricing' ||
    pathname.startsWith('/letter/')
  )
}

export default function DesktopGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isHandheld = useIsHandheld()

  if (isHandheld && !isMobileAllowed(pathname)) {
    return <DesktopOnlySplash />
  }

  return <>{children}</>
}
