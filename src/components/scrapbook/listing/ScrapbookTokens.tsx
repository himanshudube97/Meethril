'use client'

import { useThemeStore } from '@/store/theme'
import { useMemo } from 'react'

/**
 * CSS variables for the scrapbook listing scene. Re-tints when the active
 * theme changes. Mirrors letters/LettersTokens.
 */
export default function ScrapbookTokens() {
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
      --card-paper: color-mix(in oklab, ${theme.bg.secondary} 80%, white);
      /* Wooden chest tinted to the active palette (issue #30). The old mix
         only blended accent.warm into the planks, so every theme — even cool
         ones like rain/ocean — read warm-brown. Anchoring on dark plank browns
         keeps it unmistakably wood, while accent.primary supplies the theme's
         hue/temperature (cool driftwood on rain, rosewood on rose, olive on
         rivendell). Brass/iron pick up a lighter tint so they harmonise too. */
      --chest-1: color-mix(in oklab, #6f4a30 62%, ${a.primary} 38%);
      --chest-2: color-mix(in oklab, #8a5e3a 62%, ${a.primary} 38%);
      --chest-3: color-mix(in oklab, #a06a3a 64%, ${a.primary} 36%);
      --chest-4: color-mix(in oklab, #5a3a26 64%, ${a.primary} 36%);
      --brass-1: color-mix(in oklab, #d4af6a 72%, ${a.warm} 28%);
      --brass-2: color-mix(in oklab, #b08a4a 74%, ${a.warm} 26%);
      --brass-3: color-mix(in oklab, #8a6a3a 74%, ${a.primary} 26%);
      --iron-1: color-mix(in oklab, #2a1f17 82%, ${a.primary} 18%);
      --iron-2: color-mix(in oklab, #15100b 86%, ${a.primary} 14%);
      --iron-3: #0a0805;
    }`
  }, [theme])
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
