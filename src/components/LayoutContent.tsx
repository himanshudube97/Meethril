'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useMemoryViewStore } from '@/store/memoryView'
import Background from '@/components/Background'
import Navigation from '@/components/Navigation'
import PageTransition from '@/components/PageTransition'
import DeskSettingsPanel from '@/components/desk/DeskSettingsPanel'
import AmbientSoundLayer from '@/components/AmbientSoundLayer'
import { InstallPrompt } from '@/components/InstallPrompt'
import LimitReachedModal from '@/components/billing/LimitReachedModal'
import FullscreenButton from '@/components/FullscreenButton'
import FullscreenPrompt from '@/components/FullscreenPrompt'
import { useThemeStore } from '@/store/theme'
import { useApplyCursorStyles } from '@/hooks/useApplyCursorStyles'
import { useLayoutMode } from '@/hooks/useMediaQuery'

/**
 * Solid-to-transparent strip across the top of authed pages. Sits behind
 * the floating hamburger + gear buttons so scrolled page content fades
 * out cleanly instead of bleeding through under the translucent buttons.
 */
function TopChromeBackdrop() {
  const { theme } = useThemeStore()
  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-30 pointer-events-none"
      style={{
        height: 80,
        background: `linear-gradient(180deg, ${theme.bg.primary} 0%, ${theme.bg.primary}cc 55%, transparent 100%)`,
      }}
    />
  )
}

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const { theme } = useThemeStore()
  const setLayoutModeOnTheme = useThemeStore(s => s.setLayoutMode)
  const layoutMode = useLayoutMode()
  // When an open memory diary is on screen (/memory), fade the page chrome
  // (nav, gear, fullscreen) so the spread reads as the only thing on the desk.
  const diaryOpen = useMemoryViewStore(s => s.diaryOpen)

  // Mobile has no settings UI — the theme store flips the effective theme
  // to sunset while in mobile mode without mutating the user's persisted
  // desktop pick. Resizing back to desktop restores their choice.
  useEffect(() => {
    setLayoutModeOnTheme(layoutMode)
  }, [layoutMode, setLayoutModeOnTheme])
  const isLandingPage = pathname === '/'
  const isPricingPage = pathname === '/pricing'
  // Public legal pages — long-form reading, themed flat background, no nav.
  const isLegalPage = pathname === '/privacy' || pathname === '/terms'
  const isWritingPage = pathname === '/write'
  const isLettersPage = pathname.startsWith('/letters')
  // /scrapbook (the listing) is a full-bleed scene like /letters; the
  // per-scrapbook canvas at /scrapbook/[id] keeps the padded <main> wrapper.
  const isScrapbookListingPage = pathname === '/scrapbook'
  // /onboarding is a forced flow: themed Background, no Navigation, no
  // padded main wrapper — the page lays itself out full-bleed so it feels
  // like a moment, not another tab.
  const isOnboardingPage = pathname.startsWith('/onboarding')
  // /letter/[token] is the public friend-letter recipient flow. It's a
  // cinematic full-bleed scene and must NOT inherit the nav bar or the
  // pt-20 main padding — both would push the letter scene down and break
  // the absolute-positioned layout.
  const isPublicLetterPage = pathname.startsWith('/letter/')

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

  if (isLegalPage) {
    // Public /privacy & /terms — the page paints its own themed full-bleed
    // reading surface (LegalShell). No nav, no gear, no particles.
    return <>{children}</>
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
        <TopChromeBackdrop />
        <Navigation />
        <FullscreenButton />
        <DeskSettingsPanel />
        <InstallPrompt />
        <LimitReachedModal />
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

  if (isPublicLetterPage) {
    // Public recipient flow (/letter/[token] and /letter/[token]/save).
    // The recipient is often unauthenticated and arrives from an email link;
    // no nav, no gear, no install prompt — just the letter scene the page
    // renders on its own.
    return <>{children}</>
  }

  return (
    <>
      <Background />
      <AmbientSoundLayer />
      <main className="relative z-10 min-h-screen pt-20 pb-8 px-4">
        <PageTransition>
          {children}
        </PageTransition>
      </main>
      {/* Gear + fullscreen are rendered at the layout root so they're NOT
          inside <main> / <PageTransition> — those wrappers have transforms
          during the page-transition animation, which would otherwise become
          the containing block for their `position: fixed`.

          Wrapped in a fade layer that drops to 0 while a memory diary is open
          so reading a memory is uninterrupted by chrome. opacity (not transform)
          keeps the fixed children positioned against the viewport. */}
      <motion.div
        animate={{ opacity: diaryOpen ? 0 : 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{ pointerEvents: diaryOpen ? 'none' : undefined }}
      >
        <TopChromeBackdrop />
        <FullscreenButton />
        <DeskSettingsPanel />
        <Navigation />
      </motion.div>
      <InstallPrompt />
    </>
  )
}
