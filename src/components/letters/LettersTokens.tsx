'use client'

import { useThemeStore } from '@/store/theme'
import { useMemo } from 'react'

/**
 * Injects CSS variables that the letters surfaces consume. Derived from
 * the active theme — keeps the demo's palette names but always tracks the
 * real theme. Mount once at the top of LettersPage.
 */
export default function LettersTokens() {
  const theme = useThemeStore(s => s.theme)
  const css = useMemo(() => {
    const a = theme.accent
    const t = theme.text
    return `:root {
      --bg-1: ${theme.bg.primary};
      --bg-2: ${theme.bg.secondary};
      --text-primary: ${t.primary};
      --text-secondary: ${t.secondary};
      --text-muted: ${t.muted};
      --accent-primary: ${a.primary};
      --accent-secondary: ${a.secondary};
      --accent-warm: ${a.warm};
      --accent-highlight: ${a.highlight};
      --paper-1: color-mix(in oklab, ${theme.bg.primary} 80%, white);
      --paper-2: ${theme.bg.secondary};
      --paper-album: color-mix(in oklab, ${theme.bg.secondary} 70%, ${theme.bg.primary});
      --shelf: ${theme.cover ?? a.secondary};
      /* Postbox: one coherent hue ramp from a single base, so the pillar reads
         as one painted object on every theme (mapping the 3 stops to unrelated
         accents — warm/primary/secondary — made cool themes muddy). The base
         stays a RICH mid-to-dark tone (only lightly lifted for the lit centre)
         so the cream engraved lettering keeps contrast. Blend leans on the
         theme's deepest accent + a little warmth for life. */
      --postbox-base: color-mix(in oklab, ${a.primary} 82%, ${a.warm} 18%);
      --postbox-1: color-mix(in oklab, var(--postbox-base) 90%, white);
      --postbox-2: color-mix(in oklab, var(--postbox-base) 80%, black);
      --postbox-3: color-mix(in oklab, var(--postbox-base) 52%, black);
    }`
  }, [theme])
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
