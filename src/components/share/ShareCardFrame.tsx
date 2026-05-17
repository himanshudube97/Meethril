'use client'

import { format } from 'date-fns'
import { useThemeStore } from '@/store/theme'
import type { ThemeName } from '@/lib/themes'

// Vintage stamp tokens (mirrors the set from LetterArrivedBanner.tsx).
const themeStamps: Record<ThemeName, { icon: string; color: string }> = {
  rivendell: { icon: '🌲', color: '#5E8B5A' },
  hearth: { icon: '🔥', color: '#C8742C' },
  rose: { icon: '🌸', color: '#9A4555' },
  sage: { icon: '🌿', color: '#6B7A4B' },
  ocean: { icon: '🌊', color: '#2C5260' },
  postal: { icon: '✉️', color: '#1F2750' },
  linen: { icon: '🕊️', color: '#A85530' },
  sunset: { icon: '🌅', color: '#C8472D' },
  rain: { icon: '🌧️', color: '#7A98B8' },
}

export const SHARE_CARD_W = 1080
export const SHARE_CARD_H = 1350

interface ShareCardFrameProps {
  date: Date
  /** Optional small subtitle line above the date (e.g. "a memory from 3 weeks ago"). */
  subtitle?: string
  children: React.ReactNode
}

/**
 * Fixed-size 1080×1350 (4:5 portrait) container intended to be rendered
 * off-screen, then snapshotted by html-to-image. Theme-tinted backdrop,
 * theme stamp in the top-right corner, hearth + date footer.
 *
 * Children fill the remaining space and are responsible for their own
 * scaling — the frame just gives them a clean, branded canvas.
 */
export default function ShareCardFrame({ date, subtitle, children }: ShareCardFrameProps) {
  const { theme, themeName } = useThemeStore()
  const stamp = themeStamps[themeName] ?? themeStamps.rivendell

  return (
    <div
      style={{
        width: `${SHARE_CARD_W}px`,
        height: `${SHARE_CARD_H}px`,
        position: 'relative',
        background: theme.bg.primary,
        backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 35%, ${theme.accent.warm}22, transparent 70%), radial-gradient(ellipse 60% 50% at 50% 90%, ${theme.accent.primary}1A, transparent 70%)`,
        overflow: 'hidden',
        fontFamily: 'var(--font-serif), Georgia, serif',
        color: theme.text.primary,
      }}
    >
      {/* Theme stamp — top right corner */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          right: 48,
          width: 100,
          height: 120,
          background: 'linear-gradient(145deg, #faf8f5, #f0ebe0)',
          border: '3px dashed rgba(139, 115, 85, 0.5)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
          transform: 'rotate(4deg)',
        }}
      >
        <div style={{ fontSize: 42, marginBottom: 6 }}>{stamp.icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: stamp.color, letterSpacing: 2 }}>
          HEARTH
        </div>
      </div>

      {/* Children fill the middle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          paddingTop: 100,
          paddingBottom: 120,
          paddingLeft: 60,
          paddingRight: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>

      {/* Footer — subtitle + hearth + date */}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontStyle: 'italic',
          color: theme.text.muted,
          letterSpacing: '0.05em',
        }}
      >
        {subtitle && (
          <div style={{ fontSize: 22, marginBottom: 6, opacity: 0.85 }}>{subtitle}</div>
        )}
        <div style={{ fontSize: 18 }}>
          hearth · {format(date, 'MMMM d, yyyy')}
        </div>
      </div>
    </div>
  )
}
