'use client'

import type { ReactNode } from 'react'
import PostalSky from './inbox/PostalSky'

/**
 * Shared animated backdrop for the Letters tabs that don't render their own
 * scene (sent, to-a-stranger). Mirrors the inbox's PostalSky ambience — sun,
 * hills, village, drifting theme particles — so the whole Letters section
 * feels alive. The backdrop is fixed to the viewport (so it doesn't stretch
 * with long content); children sit above it.
 */
export default function LettersScene({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 0, background: 'linear-gradient(180deg, var(--bg-1), var(--bg-2))' }}
      >
        <PostalSky />
      </div>
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </>
  )
}
