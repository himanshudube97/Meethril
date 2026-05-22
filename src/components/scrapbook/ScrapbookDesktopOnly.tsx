'use client'

import Link from 'next/link'
import { useThemeStore } from '@/store/theme'

/**
 * Rendered in place of the scrapbook canvas / listing on mobile. The
 * scrapbook surface (free-form drag, multi-select, fine positioning) is
 * fundamentally a desktop craft surface and forcing it onto a small touch
 * screen would feel worse than not showing it at all. This page tells the
 * user where to find it without making them feel like the app is broken.
 */
export default function ScrapbookDesktopOnly() {
  const { theme } = useThemeStore()
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto">
      <div
        className="min-h-full flex items-center justify-center px-6 py-16"
        style={{ color: theme.text.primary }}
      >
        <div
          className="rounded-3xl px-7 py-10 max-w-sm w-full text-center"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            WebkitBackdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
            boxShadow: '0 12px 36px rgba(0,0,0,0.2)',
          }}
        >
          <div
            className="text-4xl mb-4"
            aria-hidden
            style={{ color: theme.accent.warm }}
          >
            ✦
          </div>
          <h1
            className="text-xl mb-3"
            style={{
              color: theme.text.primary,
              fontFamily: 'var(--font-playfair), Georgia, serif',
            }}
          >
            Your scrapbook lives on desktop
          </h1>
          <p
            className="text-sm leading-relaxed mb-7"
            style={{
              color: theme.text.muted,
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
            }}
          >
            Arranging photos, songs, and stickers needs a bigger canvas than
            a phone can give it. Open Hearth on a laptop to keep building
            your scrapbook — everything you&apos;ve already pinned is safe.
          </p>
          <Link
            href="/write"
            className="inline-block px-5 py-2.5 rounded-full text-sm transition"
            style={{
              background: `${theme.accent.primary}30`,
              color: theme.accent.primary,
              border: `1px solid ${theme.accent.primary}60`,
              fontFamily: 'Georgia, serif',
            }}
          >
            Back to your diary
          </Link>
        </div>
      </div>
    </div>
  )
}
