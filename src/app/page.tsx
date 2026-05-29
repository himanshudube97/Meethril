'use client'

import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import HeroSection from '@/components/landing/HeroSection'
import DiarySection from '@/components/landing/DiarySection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import FooterCTA from '@/components/landing/FooterCTA'
import StickyHeader from '@/components/landing/StickyHeader'

/**
 * Landing page (issue #44). The 3D diary and the flat "What's inside"
 * feature grid are two presentations of the SAME content — each diary
 * spread is a feature — so they're shown as responsive alternates, never
 * both at once:
 *
 *   • Desktop / tablet (≥ 1024px): the interactive 3D diary flip.
 *   • Mobile (< 1024px): the flat feature grid — 3D omitted to keep the
 *     landing light on small/low-end devices.
 *
 * Hero + footer render on every viewport.
 *
 * Safe to branch on viewport without a hydration mismatch: the global
 * LayoutContent renders this page's children only after the client mounts.
 */
export default function LandingPage() {
  const { theme } = useThemeStore()
  const isMobile = useLayoutMode() === 'mobile'

  return (
    <main
      className="relative"
      style={{
        background: theme.bg.gradient,
        color: theme.text.primary,
      }}
    >
      <StickyHeader />
      <HeroSection />
      {isMobile ? <FeaturesSection /> : <DiarySection />}
      <FooterCTA />
    </main>
  )
}
