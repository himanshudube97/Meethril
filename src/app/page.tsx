'use client'

import { useThemeStore } from '@/store/theme'
import HeroSection from '@/components/landing/HeroSection'
import FooterCTA from '@/components/landing/FooterCTA'
import StickyHeader from '@/components/landing/StickyHeader'

/**
 * Landing page — kept minimal so it loads cleanly on mobile and on
 * lower-end devices.
 *
 * Previously this rendered HeroSection → DiarySection (a 715-line 3D
 * book) → FooterCTA inside a scroll-snap container with body overflow
 * locked and ambient blobs animating below the fold. All of that is
 * gone: two sections, normal page scroll, no 3D, no orbs, no snap.
 * The Hero and Footer keep just the gentle fades that feel like
 * Hearth without taxing the device.
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
      <FooterCTA />
    </main>
  )
}
