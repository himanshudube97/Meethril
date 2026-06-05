'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Theme } from '@/lib/themes'
import { useThemeStore } from '@/store/theme'
import PromptCard from './PromptCard'

interface DiaryActionRailProps {
  /** Colour for the pull-a-card prompt fallbacks (passed through to PromptCard). */
  promptColor: string
  /** Opens the share-capture flow (from useShareableCapture). */
  onShare: () => void
  /** True while a share capture is mid-flight — disables the share action. */
  shareBusy: boolean
  /**
   * Viewport position of the diary cover's top-right corner (measured live in
   * BookSpread): `top` = cover top edge y, `right` = distance from the viewport
   * right edge to the cover's right edge. The cluster right-aligns here so it
   * rides the cover's top-right edge on every screen size. Null until measured.
   */
  anchor: { top: number; right: number } | null
}

/**
 * Two diary actions — pick a note + share — as plain text, riding the diary
 * cover's top-right edge. Portalled to <body> so it pins to the viewport
 * (responsive windowed + fullscreen) and stays out of the share screenshot.
 * Only ever mounted on tablet/desktop: BookSpread (its only caller) isn't
 * rendered in the mobile layout.
 */
export default function DiaryActionRail({
  promptColor,
  onShare,
  shareBusy,
  anchor,
}: DiaryActionRailProps) {
  const { theme } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !anchor) return null

  return createPortal(
    <div
      className="fixed z-40 flex flex-row items-center gap-4 pointer-events-none"
      style={{ top: anchor.top - 30, right: anchor.right }}
    >
      {/* pick a note — the overlay portals to body, so rendering PromptCard
          here with a text trigger is fine. */}
      <PromptCard
        color={promptColor}
        trigger={({ onClick, disabled }) => (
          <TextButton label="pick a note" onClick={onClick} disabled={disabled} theme={theme} />
        )}
      />

      {/* tiny separator dot */}
      <span
        aria-hidden
        style={{ width: 3, height: 3, borderRadius: '50%', background: theme.text.muted, opacity: 0.4 }}
      />

      <TextButton label="share" onClick={onShare} disabled={shareBusy} theme={theme} />
    </div>,
    document.body,
  )
}

function TextButton({
  label,
  onClick,
  disabled,
  theme,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  theme: Theme
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="pointer-events-auto"
      style={{
        background: 'transparent',
        border: 'none',
        padding: '6px 8px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        fontSize: 14,
        letterSpacing: '0.04em',
        color: theme.text.muted,
        opacity: disabled ? 0.4 : 0.75,
        transition: 'opacity 0.25s ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '0.75'
      }}
    >
      &ldquo;{label}&rdquo;
    </button>
  )
}
