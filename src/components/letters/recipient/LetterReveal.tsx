// src/components/letters/recipient/LetterReveal.tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PostcardFront } from '../compose/PostcardFront'
import { PostcardBack } from '../compose/PostcardBack'
import type { Photo } from '@/components/desk/PhotoBlock'
import type { StrokeData } from '@/store/journal'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { linenTheme } from '@/lib/themes'

// The postcard faces are authored at this fixed design size and the writer is
// capped to what fits it (see PostcardFront's measured visual cap), so the body
// is GUARANTEED to fit here too — we just mirror the same geometry and scale the
// whole spread to the viewport. No internal scroll, ever.
const CARD_W = 760
const CARD_H = 860
const GUTTER = 40

interface Props {
  senderName: string
  recipientName: string
  /** Raw letter body (plain text with newlines) as decrypted on the client. */
  body: string
  song: string | null
  doodleStrokes: StrokeData[]
  /** Photos already decrypted to blob URLs (position + rotation preserved). */
  photos: Photo[]
  /** Used only for the front-page date label. */
  createdAt: Date
  expiresAt: Date
  onKeepForever: () => void
  keepBusy: boolean
}

/** Escape HTML, then rebuild the writer's paragraph structure from newlines so
 *  TipTap renders the same line breaks the sender saw (and the same height, so
 *  the fit guarantee holds). */
function toLetterHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split('\n')
    .map((line) => (line.trim() === '' ? '<p></p>' : `<p>${line}</p>`))
    .join('')
}

function useCountdown(expiresAt: Date): { h: number; m: number } | null {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setRemaining(expiresAt.getTime() - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  if (remaining === null || remaining <= 0) return null
  return {
    h: Math.floor(remaining / 3_600_000),
    m: Math.floor((remaining % 3_600_000) / 60_000),
  }
}

export function LetterReveal({
  senderName,
  recipientName,
  body,
  song,
  doodleStrokes,
  photos,
  createdAt,
  expiresAt,
  onKeepForever,
  keepBusy,
}: Props) {
  const isWide = useMediaQuery('(min-width: 980px)')
  const countdown = useCountdown(expiresAt)

  const hasKeepsakes = !!song || photos.length > 0 || doodleStrokes.length > 0
  const mode: 'spread' | 'single' | 'stack' = !hasKeepsakes
    ? 'single'
    : isWide
      ? 'spread'
      : 'stack'

  // Natural (unscaled) footprint of the card group for the current mode.
  const isStack = mode === 'stack'
  const natW = mode === 'spread' ? CARD_W * 2 + GUTTER : CARD_W
  const natH = isStack ? CARD_H * 2 + GUTTER : CARD_H

  // Scale the card group to fit the viewport. Spread/single fill the screen with
  // no scroll; stack (mobile) scales to width and scrolls vertically.
  // NOTE: a CSS transform doesn't shrink the element's layout box, so the scaled
  // group is wrapped in a box sized to natW*scale × natH*scale (below) — without
  // that, header + full-height card + footer overflow 100dvh and the CTA clips.
  const [scale, setScale] = useState(0.1)
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (mode === 'stack') {
        setScale(Math.min(1, (vw - 32) / CARD_W))
        return
      }
      const groupW = mode === 'spread' ? CARD_W * 2 + GUTTER : CARD_W
      // Reserve room for the header (~74) + CTA footer (~120) so the spread sits
      // between them with no scroll.
      const availH = vh - 200
      setScale(Math.min(1.15, (vw - 56) / groupW, availH / CARD_H))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [mode])

  const cardBox = (children: React.ReactNode) => (
    <div style={{ position: 'relative', width: CARD_W, height: CARD_H, flexShrink: 0 }}>
      {children}
    </div>
  )

  const front = cardBox(
    <PostcardFront
      readOnly
      hideFooter
      active
      themeOverride={linenTheme}
      salutationName={recipientName}
      body={toLetterHtml(body)}
      createdAt={createdAt}
      onTurnOver={() => {}}
    />,
  )

  const back = hasKeepsakes
    ? cardBox(
        <PostcardBack
          readOnly
          flat
          hideFooter
          active
          themeOverride={linenTheme}
          photos={photos}
          song={song}
          doodleStrokes={doodleStrokes}
        />,
      )
    : null

  return (
    <div
      style={{
        minHeight: '100dvh',
        height: isStack ? 'auto' : '100dvh',
        overflowY: isStack ? 'auto' : 'hidden',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background:
          'radial-gradient(1100px 680px at 50% -8%, rgba(255,196,120,0.12), transparent 60%),' +
          'radial-gradient(900px 600px at 85% 110%, rgba(120,80,50,0.22), transparent 65%),' +
          'linear-gradient(165deg, #32271f 0%, #241c16 55%, #1c1511 100%)',
      }}
    >
      {/* HEADER — from / for + ephemeral countdown */}
      <header
        style={{
          flexShrink: 0,
          width: '100%',
          maxWidth: 920,
          padding: '26px 24px 8px',
          textAlign: 'center',
          color: 'rgba(246,239,227,0.82)',
          fontFamily: 'Cormorant Garamond, Georgia, serif',
        }}
      >
        <div style={{ fontSize: 16, letterSpacing: 0.3 }}>
          from <strong style={{ color: '#f3e2c2', fontWeight: 500 }}>{senderName}</strong>
          <span style={{ opacity: 0.5, margin: '0 8px' }}>·</span>
          for <strong style={{ color: '#f3e2c2', fontWeight: 500 }}>{recipientName}</strong>
        </div>
        {countdown && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              fontStyle: 'italic',
              color: 'rgba(243,226,194,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#e8a25c',
                boxShadow: '0 0 10px 3px rgba(232,162,92,0.5)',
              }}
            />
            this letter fades in {countdown.h}h {countdown.m}m
          </div>
        )}
      </header>

      {/* STAGE — the scaled card group */}
      <div
        style={{
          flex: isStack ? '0 0 auto' : 1,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isStack ? '12px 0' : 0,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: natW * scale, height: natH * scale, flexShrink: 0 }}
        >
          {/* Inner group is natural size; the transform scales it visually while
              the wrapper above reserves the scaled footprint in layout. */}
          <div
            style={{
              width: natW,
              height: natH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              display: 'flex',
              flexDirection: isStack ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: GUTTER,
            }}
          >
            {front}
            {back}
          </div>
        </motion.div>
      </div>

      {/* FOOTER — keep-forever CTA + brand mark */}
      <footer
        style={{
          flexShrink: 0,
          padding: isStack ? '20px 0 40px' : '8px 0 26px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <button
          onClick={onKeepForever}
          disabled={keepBusy}
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: '#f3e2c2',
            background: 'linear-gradient(180deg, #4a3a2d, #352a20)',
            border: '1px solid rgba(185,144,90,0.4)',
            borderRadius: 999,
            padding: '13px 34px',
            cursor: keepBusy ? 'wait' : 'pointer',
            opacity: keepBusy ? 0.6 : 1,
            boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {keepBusy ? 'Just a moment…' : 'Keep this letter forever'}
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'rgba(243,226,194,0.5)',
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 13,
            letterSpacing: 1.5,
          }}
        >
          <span
            style={{
              width: 7,
              height: 10,
              borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
              background: 'linear-gradient(180deg, #f0b06a, #c2552e)',
              boxShadow: '0 0 12px rgba(240,176,106,0.55)',
            }}
          />
          sent with hearth
        </div>
      </footer>
    </div>
  )
}
