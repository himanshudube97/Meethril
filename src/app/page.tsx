'use client'

import { useThemeStore } from '@/store/theme'
import HeroSection from '@/components/landing/HeroSection'
import DiarySection from '@/components/landing/DiarySection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import FooterCTA from '@/components/landing/FooterCTA'
import StickyHeader from '@/components/landing/StickyHeader'

/**
 * Landing page: HeroSection → DiarySection → FeaturesSection → FooterCTA.
 *
 * The interactive 3D diary flip (issue #44) sits between the hero and the
 * feature grid on every viewport. The book is authored at a fixed desktop
 * size (1080×660); Diary's own useFitScale shrinks it to fit narrow screens
 * so the mobile responsive view gets the same tactile, page-turning preview.
 */
export default function LandingPage() {
  const { theme } = useThemeStore()

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
      <DiarySection />
      <FeaturesSection />
      <FooterCTA />
    </main>
  )
}
