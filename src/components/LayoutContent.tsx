'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Background from '@/components/Background'
import Navigation from '@/components/Navigation'
import PageTransition from '@/components/PageTransition'
import DeskSettingsPanel from '@/components/desk/DeskSettingsPanel'
import AmbientSoundLayer from '@/components/AmbientSoundLayer'
import { InstallPrompt } from '@/components/InstallPrompt'
import FullscreenButton from '@/components/FullscreenButton'
import FullscreenPrompt from '@/components/FullscreenPrompt'
import { useThemeStore } from '@/store/theme'
import { useApplyCursorStyles } from '@/hooks/useApplyCursorStyles'

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const { theme } = useThemeStore()
  const isLandingPage = pathname === '/'
  const isPricingPage = pathname === '/pricing'
  const isWritingPage = pathname === '/write'
  const isLettersPage = pathname.startsWith('/letters')
  // /scrapbook (the listing) is a full-bleed scene like /letters; the
  // per-scrapbook canvas at /scrapbook/[id] keeps the padded <main> wrapper.
  const isScrapbookListingPage = pathname === '/scrapbook'
  // /onboarding is a forced flow: themed Background, no Navigation, no
  // padded main wrapper — the page lays itself out full-bleed so it feels
  // like a moment, not another tab.
  const isOnboardingPage = pathname.startsWith('/onboarding')

  // Apply the active cursor styles globally. The cursor selection now
  // lives entirely in the gear's DeskSettingsPanel, but the style
  // injection runs at the layout level so it applies to every page.
  useApplyCursorStyles()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Update body background color when theme changes
  useEffect(() => {
    if (mounted) {
      document.body.style.backgroundColor = theme.bg.primary
    }
  }, [theme.bg.primary, mounted])

  // Prevent hydration flash - show nothing until client is ready
  if (!mounted) {
    return null
  }

  if (isLandingPage || isPricingPage) {
    // Landing & Pricing - no navigation (public pages). The corner gear
    // is the single settings entry point everywhere now, including here.
    return (
      <>
        {children}
        <DeskSettingsPanel />
        <FullscreenPrompt />
        <InstallPrompt />
      </>
    )
  }

  // Background renders for every authed page (write, letters, timeline, etc.)
  // so it persists across navigations — no unmount/remount flash when moving
  // between /letters and /write. /write's DeskScene paints its desk surface
  // on top of this Background, /letters lays its postcard over it.
  //
  // The gear-driven DeskSettingsPanel is the single settings entry point on
  // every page now (theme, cursor, animations, sound — and page opacity on
  // /write). Landing/pricing render it via the public-pages branch above.
  if (isWritingPage || isLettersPage || isScrapbookListingPage) {
    return (
      <>
        <Background />
        <AmbientSoundLayer />
        {children}
        <Navigation />
        <FullscreenButton />
        <DeskSettingsPanel />
        <InstallPrompt />
      </>
    )
  }

  if (isOnboardingPage) {
    // Forced flow — themed bg + ambience but nothing else competing for
    // attention. No Navigation, no gear, no main padding. The onboarding
    // page renders its own full-bleed layout on top.
    return (
      <>
        <Background />
        <AmbientSoundLayer />
        {children}
      </>
    )
  }

  return (
    <>
      <Background />
      <AmbientSoundLayer />
      <Navigation />
      <main className="relative z-10 min-h-screen pt-20 pb-8 px-4">
        <PageTransition>
          {children}
        </PageTransition>
      </main>
      {/* Gear + fullscreen are rendered at the layout root so they're NOT
          inside <main> / <PageTransition> — those wrappers have transforms
          during the page-transition animation, which would otherwise become
          the containing block for their `position: fixed`. */}
      <FullscreenButton />
      <DeskSettingsPanel />
      <InstallPrompt />
    </>
  )
}
