'use client'

import { useState, type CSSProperties } from 'react'
import { useThemeStore } from '@/store/theme'
import type { Theme } from '@/lib/themes'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import SongEmbed from '@/components/SongEmbed'
import SongPicker from '@/components/SongPicker'
import PhotoBlock, { type Photo } from '@/components/desk/PhotoBlock'
import CompactDoodleCanvas from '@/components/desk/CompactDoodleCanvas'
import type { StrokeData } from '@/store/journal'
import { PostcardFrame } from './PostcardFrame'

// Postcard paper / ink / line colours are derived from getGlassDiaryColors()
// inside the component (see PostcardFront for the matching pattern) so they
// always contrast with the paper — a fixed dark ink vanished on dark themes
// (Rivendell/Rain) where the paper itself is dark.

// Doodle canvas surround — very low alpha, reads on any paper tint.
const DOODLE_BG = 'rgba(120, 90, 50, 0.05)'
const DOODLE_BORDER = 'rgba(120, 90, 50, 0.22)'

export function PostcardBack({
  photos = [],
  onPhotoAdd,
  onPhotoRemove,
  doodleStrokes = [],
  onDoodleStrokesChange,
  song = null,
  onSongChange,
  onTurnBack,
  onSeal,
  canSeal,
  active = true,
  readOnly = false,
  flat = false,
  hideFooter = false,
  themeOverride,
}: {
  photos?: Photo[]
  onPhotoAdd?: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  onPhotoRemove?: (position: 1 | 2) => void
  doodleStrokes?: StrokeData[]
  onDoodleStrokesChange?: (strokes: StrokeData[]) => void
  song?: string | null
  onSongChange?: (next: string | null) => void
  onTurnBack?: () => void
  onSeal?: () => void
  canSeal?: boolean
  // When false, the face is rotated away — turn off pointer-events so clicks
  // don't leak through to the invisible face.
  active?: boolean
  // Read-only reveal mode: no editing, embed-only song, no seal button.
  readOnly?: boolean
  // Spread mode: this face is shown side-by-side (not as the back of a flip
  // card), so drop the baked-in 180° rotation that would otherwise mirror it.
  flat?: boolean
  // Spread/reveal mode: drop the footer band (turn-back / seal) entirely.
  hideFooter?: boolean
  // Fixed paper palette for the public recipient reveal (warm cream).
  themeOverride?: Theme
}) {
  const storeTheme = useThemeStore((s) => s.theme)
  const theme = themeOverride ?? storeTheme
  // Same journal page tokens — solid theme bg + tinted overlay. Matches
  // .diary-page exactly.
  const diaryColors = getGlassDiaryColors(theme)
  const accent = theme.accent.primary

  // Ink / muted / rule colours derived from the paper so they contrast on
  // every theme (light paper → dark ink; dark paper → light ink).
  const PAPER_INK = diaryColors.bodyText
  const PAPER_INK_MUTED = diaryColors.prompt
  const LINE_COLOR = diaryColors.ruledLine
  // Default doodle pen contrasts with the paper; the rest stay as accents.
  const DOODLE_COLORS = [diaryColors.bodyText, '#b34a3a', '#5a7a5a', '#7a5a3a']
  // Shared section label — small italic lowercase caption above each block.
  const labelStyle: CSSProperties = {
    fontFamily: 'Cormorant Garamond, Georgia, serif',
    fontStyle: 'italic',
    fontSize: 11,
    letterSpacing: 2,
    color: PAPER_INK_MUTED,
    textTransform: 'lowercase',
    marginBottom: 6,
  }

  // Music input — same pattern as the journal's LeftPage: a single text input
  // that auto-collapses into <SongEmbed> the moment a valid URL is detected.
  // No "add" button — paste a URL and it just becomes a player.
  const [songInput, setSongInput] = useState(song ?? '')
  const [isEditingSong, setIsEditingSong] = useState(!song)

  const handleSongChange = (value: string) => {
    setSongInput(value)
    onSongChange?.(value || null)
    if (value && (/^https?:\/\//i.test(value) || value.startsWith('{'))) {
      setIsEditingSong(false)
    }
  }

  const sealEnabled = canSeal ?? true

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        backfaceVisibility: flat ? 'visible' : 'hidden',
        WebkitBackfaceVisibility: flat ? 'visible' : 'hidden',
        position: 'absolute',
        inset: 0,
        transform: flat ? 'none' : 'rotateY(180deg)',
        backgroundColor: diaryColors.pageBgSolid,
        backgroundImage: `linear-gradient(${diaryColors.pageBg}, ${diaryColors.pageBg})`,
        borderRadius: 8,
        border: '1px solid rgba(80, 55, 40, 0.16)',
        boxShadow:
          '0 20px 56px rgba(0,0,0,0.40), 0 4px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
        overflow: 'hidden',
        color: PAPER_INK,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      {/* Decorative illuminated frame — mirrors the front face. */}
      <PostcardFrame accent={accent} />

      {/* ── Vertical stack: song → photos → doodle → sign-off ───────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: '30px 34px 6px',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* SONG — journal-style: a single input that auto-collapses into
            <SongEmbed> the moment a valid URL is detected. No "add" button. */}
        <div style={{ flexShrink: 0 }}>
          <div style={labelStyle}>a song</div>
          {readOnly ? (
            songInput ? (
              <SongEmbed url={songInput} compact audioOnly />
            ) : (
              <div style={{ ...labelStyle, opacity: 0.4 }}>no song</div>
            )
          ) : isEditingSong || !songInput ? (
            <SongPicker
              value={songInput}
              onChange={(next) => handleSongChange(next ?? '')}
              placeholder="Search a song or paste a link…"
            />
          ) : (
            <div style={{ position: 'relative' }}>
              <SongEmbed url={songInput} compact audioOnly />
              <button
                onClick={() => setIsEditingSong(true)}
                title="Change song"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(120, 90, 50, 0.15)',
                  color: PAPER_INK_MUTED,
                  fontSize: 12,
                  cursor: 'pointer',
                  opacity: 0.6,
                }}
              >
                ✎
              </button>
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${LINE_COLOR}`, flexShrink: 0 }} />

        {/* PHOTOS — the two overlapping polaroids, centered and scaled up. */}
        <div style={{ flexShrink: 0 }}>
          <div style={labelStyle}>photos</div>
          <div
            style={{
              transform: 'scale(1.1)',
              transformOrigin: 'top center',
              marginTop: 16,
              marginBottom: 40, // accommodate scale overflow below
            }}
          >
            <PhotoBlock
              photos={photos}
              onPhotoAdd={readOnly ? undefined : onPhotoAdd}
              onPhotoRemove={readOnly ? undefined : onPhotoRemove}
              disabled={readOnly}
              layout="row"
            />
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${LINE_COLOR}`, flexShrink: 0 }} />

        {/* DOODLE */}
        <div style={{ flexShrink: 0 }}>
          <div style={labelStyle}>doodle</div>
          <div style={{ height: 170 }}>
            <CompactDoodleCanvas
              strokes={doodleStrokes}
              onStrokesChange={(s) => onDoodleStrokesChange?.(s)}
              doodleColors={DOODLE_COLORS}
              canvasBackground={DOODLE_BG}
              canvasBorder={DOODLE_BORDER}
              textColor={PAPER_INK}
              mutedColor={PAPER_INK_MUTED}
              readOnly={readOnly}
            />
          </div>
        </div>

        {/* SIGN-OFF — decorative close fills the leftover space at the bottom
            so the stack doesn't read as cut off. Not user-editable. */}
        <div
          style={{
            flex: 1,
            minHeight: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingTop: 8,
            color: accent,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 11,
              letterSpacing: 6,
              textTransform: 'uppercase',
              opacity: 0.55,
            }}
          >
            ❦ ✦ ❦
          </div>
          <div
            style={{
              fontFamily: 'var(--font-caveat), Caveat, cursive',
              fontStyle: 'italic',
              fontSize: 22,
              opacity: 0.85,
              lineHeight: 1,
            }}
          >
            with love &amp; ink
          </div>
          <div
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 10,
              letterSpacing: 3,
              textTransform: 'uppercase',
              opacity: 0.5,
            }}
          >
            — sealed by meethril —
          </div>
        </div>
      </div>

      {/* ── FOOTER BAND — matches PostcardFront's 84px height. Hidden in the
          spread/reveal where there's nothing to turn back to or seal. */}
      {!hideFooter && (
      <div
        style={{
          flexShrink: 0,
          height: 84,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px 18px',
          borderTop: `1px solid ${LINE_COLOR}`,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={onTurnBack}
          style={{
            padding: '7px 18px',
            borderRadius: 999,
            border: '1.5px solid rgba(120, 90, 50, 0.3)',
            background: 'transparent',
            color: PAPER_INK,
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 13,
            letterSpacing: 0.4,
            cursor: 'pointer',
            fontStyle: 'italic',
            opacity: 0.8,
          }}
        >
          ← turn back
        </button>

        {readOnly ? <span /> : (
        <button
          type="button"
          disabled={!sealEnabled}
          onClick={onSeal}
          style={{
            padding: '7px 22px 8px',
            borderRadius: 999,
            border: 'none',
            background: sealEnabled ? accent : 'rgba(120, 90, 50, 0.25)',
            color: sealEnabled ? '#fff' : 'rgba(120, 90, 50, 0.45)',
            fontFamily: 'Caveat, cursive',
            fontSize: 19,
            cursor: sealEnabled ? 'pointer' : 'not-allowed',
            boxShadow: sealEnabled ? '0 4px 14px rgba(0,0,0,0.18)' : 'none',
            letterSpacing: 0.2,
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          fold and seal →
        </button>
        )}
      </div>
      )}
    </div>
  )
}
