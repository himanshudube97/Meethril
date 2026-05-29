'use client'

import Link from 'next/link'
import { useThemeStore } from '@/store/theme'

/**
 * Shared reading layout for the public legal pages (/privacy, /terms).
 *
 * Themed via useThemeStore so it follows the user's palette on every theme
 * (rose light, rivendell dark, sunset, …) rather than baking in cream/brown.
 * No particles — long-form reading wants a calm, flat background. Rendered
 * full-bleed by LayoutContent's public branch (no nav bar).
 */
export default function LegalShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const { theme } = useThemeStore()

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: theme.bg.gradient, color: theme.text.primary }}
    >
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <Link
          href="/"
          className="inline-block mb-10 text-xs tracking-[0.3em] uppercase opacity-60 hover:opacity-100 transition"
          style={{ color: theme.text.muted }}
        >
          ← Home
        </Link>

        <h1
          className="font-serif text-4xl md:text-5xl mb-3"
          style={{ color: theme.text.primary }}
        >
          {title}
        </h1>

        <div
          className="legal-prose text-[15px] leading-relaxed"
          style={{ color: theme.text.secondary }}
        >
          {children}
        </div>
      </div>

      {/* Scoped typography for the policy body. Headings/links pull the theme
          accent via CSS vars set inline above the prose isn't trivial, so we
          set them on the wrapper and let these rules inherit. */}
      <style jsx global>{`
        .legal-prose h2 {
          font-family: var(--font-serif), Georgia, serif;
          font-size: 1.35rem;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          color: ${theme.text.primary};
        }
        .legal-prose h3 {
          font-size: 1.05rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          color: ${theme.text.primary};
        }
        .legal-prose p {
          margin-bottom: 1rem;
        }
        .legal-prose ul {
          list-style: disc;
          padding-left: 1.4rem;
          margin-bottom: 1rem;
        }
        .legal-prose li {
          margin-bottom: 0.4rem;
        }
        .legal-prose a {
          color: ${theme.accent.primary};
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .legal-prose strong {
          color: ${theme.text.primary};
        }
        .legal-prose .last-updated {
          font-size: 0.85rem;
          opacity: 0.7;
          margin-bottom: 2rem;
        }
        .legal-prose .disclaimer {
          font-size: 0.85rem;
          opacity: 0.7;
          border-top: 1px solid ${theme.glass.border};
          margin-top: 3rem;
          padding-top: 1.5rem;
        }
      `}</style>
    </div>
  )
}
