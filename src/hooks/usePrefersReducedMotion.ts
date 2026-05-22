'use client'

import { useMediaQuery } from './useMediaQuery'

/**
 * Returns true when the OS asks for reduced motion. Use it to skip
 * heavy ambient animations (particles, drifting butterflies, parallax)
 * for users who've opted out via accessibility settings.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
