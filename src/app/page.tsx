'use client'

import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import HeroSection from '@/components/landing/HeroSection'
import DiarySection from '@/components/landing/DiarySection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import FooterCTA from '@/components/landing/FooterCTA'
import StickyHeader from '@/components/landing/StickyHeader'

/**
 * Landing page: HeroSection → DiarySection → FeaturesSection → FooterCTA.
 *
 * The interactive 3D diary flip (issue #44) sits between the hero and the
 * feature grid — desktop/tablet only (≥ 1024px). On the mobile responsive
 * view it's omitted to keep the landing light on small/low-end devices; the
 * hero + feature grid carry it there instead.
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
      {!isMobile && <DiarySection />}
      <FeaturesSection />
      <FooterCTA />
    </main>
  )
}
