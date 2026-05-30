'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import { SPREADS, type Spread } from './spreads'
import MediaPreview from './MediaPreview'

type Palette = {
  page: string
  pageEdge: string
  ink: string
  inkSoft: string
  inkQuiet: string
  accent: string
  thread: string
  // Theme-derived hardcover frame around the spread (issue #53) — replaces
  // the old hardcoded brown leather so the book matches every theme.
  cover: string
  coverBorder: string
}

function useDiaryPalette(): Palette {
  const { theme } = useThemeStore()
  const colors = getGlassDiaryColors(theme)

  // The landing book always reads as paper — a warm, lightly theme-tinted
  // page with a themed cover + accents. Three cases keep every theme legible
  // (issue #53; Rivendell/Rain looked muddy under a single cream-mix rule):
  //  • light themes        → soften the light page toward cream
  //  • dark + own paper    → Rain ships a pale grey paper; use it as-is
  //  • dark, no paper      → Rivendell/Hearth: warm parchment + dark ink,
  //                          because their paper ink is light and would
  //                          vanish on a light page.
  let page: string
  let ink: string
  let inkSoft: string
  let inkQuiet: string

  if (theme.mode === 'light') {
    page = `color-mix(in oklab, ${colors.pageBgSolid} 62%, #fbf5e2 38%)`
    ink = colors.bodyText
    inkSoft = colors.prompt
    inkQuiet = colors.sectionLabel
  } else if (theme.paper) {
    page = colors.pageBgSolid
    ink = colors.bodyText
    inkSoft = colors.prompt
    inkQuiet = colors.sectionLabel
  } else {
    page = `color-mix(in oklab, #ece4d0 90%, ${theme.accent.primary} 10%)`
    ink = '#3a342a'
    inkSoft = 'rgba(58, 52, 42, 0.72)'
    inkQuiet = 'rgba(58, 52, 42, 0.55)'
  }

  return {
    page,
    pageEdge: colors.coverBorder,
    ink,
    inkSoft,
    inkQuiet,
    accent: theme.accent.primary,
    thread: theme.accent.warm,
    cover: colors.cover,
    coverBorder: colors.coverBorder,
  }
}

function useCursorTilt(maxTilt = 12) {
  const ref = useRef<HTMLDivElement | null>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 140, damping: 18, mass: 0.6 })
  const sy = useSpring(y, { stiffness: 140, damping: 18, mass: 0.6 })
  const rotateY = useTransform(sx, [-1, 1], [-maxTilt, maxTilt])
  const rotateX = useTransform(sy, [-1, 1], [maxTilt * 0.7, -maxTilt * 0.7])
  const lightX = useTransform(sx, [-1, 1], ['0%', '100%'])
  const lightY = useTransform(sy, [-1, 1], ['0%', '100%'])

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    x.set(px * 2 - 1)
    y.set(py * 2 - 1)
  }
  const onLeave = () => {
    x.set(0)
    y.set(0)
  }
  return { ref, onMove, onLeave, rotateX, rotateY, lightX, lightY }
}

/**
 * The book is authored at a fixed desktop size (1080×660). On narrow
 * viewports (the diary only renders on mobile now — issue #44) that fixed
 * size would overflow and the spine would slice through the text. This
 * measures the available width and returns a uniform scale factor so the
 * whole book — type, spine, page-turn — shrinks proportionally to fit.
 */
function useFitScale(targetWidth: number) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      setScale(w > 0 ? Math.min(1, w / targetWidth) : 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [targetWidth])

  return { wrapRef, scale }
}

function CornerFlourish({ position, color }: { position: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const positionStyle: Record<typeof position, React.CSSProperties> = {
    tl: { top: 18, left: 18 },
    tr: { top: 18, right: 18, transform: 'scaleX(-1)' },
    bl: { bottom: 18, left: 18, transform: 'scaleY(-1)' },
    br: { bottom: 18, right: 18, transform: 'scale(-1, -1)' },
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      style={{ position: 'absolute', pointerEvents: 'none', opacity: 0.45, ...positionStyle[position] }}
      aria-hidden
    >
      <path d="M 2 12 Q 2 2 12 2" stroke={color} strokeWidth="0.7" fill="none" strokeLinecap="round" />
      <circle cx="2" cy="2" r="1" fill={color} opacity="0.7" />
    </svg>
  )
}

/** Ink-stamp date in the top-right of the left page. Slightly rotated, soft. */
function DateStamp({ text, color }: { text: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, rotate: -7 }}
      animate={{ opacity: 0.55, scale: 1, rotate: -4 }}
      transition={{ duration: 0.5, delay: 0.55 }}
      style={{
        position: 'absolute',
        top: 22,
        right: 22,
        padding: '5px 10px',
        border: `1.5px solid ${color}`,
        borderRadius: 3,
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        opacity: 0.55,
      }}
    >
      {text}
    </motion.div>
  )
}

/** A small wax-seal stamp on the page. Pulses softly. */
function WaxSeal({ color, threadColor }: { color: string; threadColor: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.7 }}
      style={{
        position: 'absolute',
        bottom: 38,
        right: 28,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${color} 0%, ${threadColor} 70%)`,
        boxShadow: `0 2px 6px rgba(0,0,0,0.25), inset 0 -2px 4px rgba(0,0,0,0.25), 0 0 12px ${color}55`,
      }}
    >
      <motion.div
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: `0 0 8px ${color}88` }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <svg viewBox="0 0 36 36" width="36" height="36" style={{ position: 'absolute', inset: 0 }}>
        <text x="18" y="22" textAnchor="middle" fontSize="11" fontFamily="Georgia, serif" fontStyle="italic" fill="rgba(255,255,255,0.6)">
          m
        </text>
      </svg>
    </motion.div>
  )
}

function PageContent({ spread, idx, palette: p }: { spread: Spread; idx: number; palette: Palette }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative' }}>
      <CornerFlourish position="tl" color={p.accent} />
      <CornerFlourish position="bl" color={p.accent} />
      <CornerFlourish position="tr" color={p.accent} />
      <CornerFlourish position="br" color={p.accent} />

      {/* Left: title + bullets */}
      <div
        style={{
          flex: 1,
          padding: '64px 64px 56px 76px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRight: `1px solid ${p.inkQuiet}33`,
          position: 'relative',
        }}
      >
        <DateStamp text={spread.stamp} color={p.inkSoft} />

        <div>
          {/* Numeral — large, glowing, breathing */}
          <motion.div
            key={`n-${idx}`}
            initial={{ opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 0.7, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.05, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontStyle: 'italic',
              color: p.accent,
              letterSpacing: '.06em',
              fontSize: 60,
              lineHeight: 1,
              marginBottom: 8,
              textShadow: `0 0 24px ${p.accent}66, 0 0 4px ${p.accent}88`,
            }}
          >
            <motion.span
              animate={{ textShadow: [`0 0 16px ${p.accent}55`, `0 0 32px ${p.accent}aa`, `0 0 16px ${p.accent}55`] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'inline-block' }}
            >
              {spread.n}
            </motion.span>
          </motion.div>

          {/* Title */}
          <motion.h3
            key={`t-${idx}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 42,
              lineHeight: 1.08,
              color: p.ink,
              margin: '0 0 22px',
              textWrap: 'balance' as React.CSSProperties['textWrap'],
              textShadow: `0 1px 0 ${p.page}, 0 0 24px ${p.accent}14`,
            }}
          >
            {spread.title}
          </motion.h3>

          {/* Blurb */}
          <motion.p
            key={`b-${idx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.28 }}
            style={{
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontSize: 16,
              lineHeight: 1.7,
              color: p.inkSoft,
              margin: '0 0 30px',
              maxWidth: 400,
            }}
          >
            {spread.blurb}
          </motion.p>

          {/* Bullets */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {spread.bullets.map((b, i) => (
              <motion.li
                key={`bul-${idx}-${i}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.4 + i * 0.1, ease: [0.22, 0.61, 0.36, 1] }}
                style={{
                  fontFamily: 'var(--font-serif), Georgia, serif',
                  fontSize: 14.5,
                  color: p.inkSoft,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <motion.span
                  animate={{ boxShadow: [`0 0 4px ${p.accent}66`, `0 0 12px ${p.accent}aa`, `0 0 4px ${p.accent}66`] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
                  style={{ width: 6, height: 6, borderRadius: 99, background: p.accent, flexShrink: 0 }}
                />
                {b}
              </motion.li>
            ))}
          </ul>

          {/* Handwritten margin annotation */}
          <motion.div
            key={`a-${idx}`}
            initial={{ opacity: 0, x: -8, rotate: -2 }}
            animate={{ opacity: 0.7, x: 0, rotate: -3.5 }}
            transition={{ duration: 0.6, delay: 0.85 }}
            style={{
              marginTop: 26,
              fontFamily: '"Caveat", "Kalam", "Bradley Hand", cursive',
              fontSize: 18,
              color: p.thread,
              transform: 'rotate(-3.5deg)',
              transformOrigin: 'left center',
              opacity: 0.75,
              maxWidth: 280,
            }}
          >
            — {spread.annotation}
          </motion.div>
        </div>

        {/* Footer line — italic spread title */}
        <motion.div
          key={`f-${idx}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 11,
            color: p.inkQuiet,
            letterSpacing: '.08em',
          }}
        >
          {spread.title.toLowerCase()} · meethril
        </motion.div>

        {/* Wax seal */}
        <WaxSeal color={p.accent} threadColor={p.thread} />
      </div>

      {/* Right: media polaroid */}
      <div
        style={{
          flex: 1,
          padding: '64px 76px 56px 64px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <motion.div
          key={`m-${idx}`}
          initial={{ opacity: 0, y: 12, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.65, delay: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          style={{
            flex: 1,
            position: 'relative',
            background: p.page,
            padding: 14,
            borderRadius: 2,
            boxShadow: `0 1px 0 ${p.pageEdge}88, 0 14px 28px rgba(0,0,0,0.16), 0 4px 8px rgba(0,0,0,0.08)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Washi tape across top corner */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -8,
              left: 16,
              width: 80,
              height: 22,
              background: `${p.accent}55`,
              transform: 'rotate(-9deg)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
              backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.18) 6px 12px)`,
              zIndex: 4,
            }}
          />

          {/* The polaroid "photo area" */}
          <div
            style={{
              position: 'absolute',
              inset: 14,
              background: `linear-gradient(135deg, ${p.pageEdge}55 0%, ${p.accent}10 50%, ${p.pageEdge}55 100%)`,
              overflow: 'hidden',
              borderRadius: 1,
            }}
          >
            {/* Live mock for this spread */}
            <MediaPreview n={spread.n} palette={p} />

            {/* Sweeping shimmer over the top */}
            <motion.div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(110deg, transparent 30%, ${p.accent}33 50%, transparent 70%)`,
                mixBlendMode: 'screen',
                pointerEvents: 'none',
              }}
              animate={{ x: ['-110%', '110%'] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Caption underneath the photo, polaroid-style */}
          <div
            style={{
              position: 'absolute',
              bottom: 6,
              left: 14,
              right: 14,
              textAlign: 'center',
              fontFamily: '"Caveat", "Kalam", "Bradley Hand", cursive',
              fontSize: 16,
              color: p.inkSoft,
              opacity: 0.75,
            }}
          >
            {spread.media}
          </div>
        </motion.div>

        <motion.div
          key={`p-${idx}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 11,
            color: p.inkQuiet,
            letterSpacing: '.12em',
            textAlign: 'right',
            marginTop: 18,
          }}
        >
          {String(SPREADS.indexOf(spread) + 1).padStart(2, '0')} / {String(SPREADS.length).padStart(2, '0')}
        </motion.div>
      </div>
    </div>
  )
}

function KnotBinding({ palette: p }: { palette: Palette }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: -18,
        bottom: -18,
        width: 36,
        transform: 'translateX(-50%) translateZ(2px)',
        pointerEvents: 'none',
      }}
    >
      <svg width="36" height="32" viewBox="0 0 36 32" style={{ position: 'absolute', top: 0, left: 0 }}>
        <path d="M 8 0 Q 18 14 28 0" stroke={p.thread} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 6 4 Q 18 22 30 4" stroke={p.thread} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.85" />
        <circle cx="18" cy="16" r="3.2" fill={p.thread} />
        <path d="M 14 18 L 10 30" stroke={p.thread} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 22 18 L 26 30" stroke={p.thread} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', left: 13, top: 28, bottom: 28, width: 1.8, background: p.thread, opacity: 0.85 }} />
      <div style={{ position: 'absolute', left: 22, top: 28, bottom: 28, width: 1.8, background: p.thread, opacity: 0.85 }} />
      <svg
        width="36"
        height="32"
        viewBox="0 0 36 32"
        style={{ position: 'absolute', bottom: 0, left: 0, transform: 'rotate(180deg)' }}
      >
        <path d="M 8 0 Q 18 14 28 0" stroke={p.thread} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 6 4 Q 18 22 30 4" stroke={p.thread} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.85" />
        <circle cx="18" cy="16" r="3.2" fill={p.thread} />
        <path d="M 14 18 L 10 30" stroke={p.thread} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 22 18 L 26 30" stroke={p.thread} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function btnStyle(p: Palette, disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: 'var(--font-serif), Georgia, serif',
    fontStyle: 'italic',
    fontSize: 15,
    color: disabled ? p.inkQuiet : p.ink,
    background: 'transparent',
    border: `1px solid ${disabled ? p.inkQuiet + '44' : p.inkQuiet + '88'}`,
    borderRadius: 99,
    padding: '10px 20px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'all .25s ease',
    letterSpacing: '.04em',
  }
}

export default function Diary() {
  const palette = useDiaryPalette()
  const tilt = useCursorTilt(12)
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)

  const spread = SPREADS[idx]

  const go = (d: number) => {
    setDir(d)
    setIdx((i) => Math.max(0, Math.min(SPREADS.length - 1, i + d)))
  }

  const bookW = 1080
  const bookH = 660
  const { wrapRef, scale } = useFitScale(bookW)

  const pageVariants = {
    enter: (d: number) => ({
      rotateY: d > 0 ? -90 : 90,
      opacity: 0,
      transformOrigin: d > 0 ? 'left center' : 'right center',
    }),
    center: { rotateY: 0, opacity: 1 },
    exit: (d: number) => ({
      rotateY: d > 0 ? 90 : -90,
      opacity: 0,
      transformOrigin: d > 0 ? 'right center' : 'left center',
    }),
  }

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: '24px 20px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 620 }}>
        <div
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            letterSpacing: '.32em',
            textTransform: 'uppercase',
            fontSize: 12,
            color: palette.inkQuiet,
            marginBottom: 14,
          }}
        >
          Inside the journal
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 54,
            lineHeight: 1.05,
            margin: '0 0 14px',
            color: palette.ink,
            textWrap: 'balance' as React.CSSProperties['textWrap'],
          }}
        >
          A small house for the days
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 15.5,
            color: palette.inkSoft,
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 460,
            marginInline: 'auto',
          }}
        >
          Turn the pages. Each spread is a feature — hover the diary to feel its weight.
        </p>
      </div>

      {/* Measuring wrapper: full available width, reserves the scaled book
          height so the surrounding flow stays correct. */}
      <div
        ref={wrapRef}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          height: bookH * scale,
        }}
      >
        <div
          ref={tilt.ref}
          onMouseMove={tilt.onMove}
          onMouseLeave={tilt.onLeave}
          style={{
            width: bookW,
            height: bookH,
            flex: 'none',
            perspective: 1800,
            position: 'relative',
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
        <motion.div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            rotateX: tilt.rotateX,
            rotateY: tilt.rotateY,
          }}
        >
          {/* Hardcover frame — theme-derived (issue #53), uniform on all
              four sides. The crosshatch + inner shadows keep the leather
              texture on whatever cover colour the theme provides. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: -14,
              borderRadius: 6,
              background: palette.cover,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 5px)',
              boxShadow:
                'inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 30px rgba(0,0,0,0.45), 0 30px 60px -18px rgba(0,0,0,0.55), 0 12px 24px -10px rgba(0,0,0,0.3)',
              transform: 'translateZ(-2px)',
            }}
          />
          {/* Inset gilt-line on the leather frame */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: 3,
              border: '1px solid rgba(0,0,0,0.4)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
              pointerEvents: 'none',
              transform: 'translateZ(-1px)',
            }}
          />

          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
            {/* The spread */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: palette.page,
                boxShadow: `inset 0 0 80px ${palette.pageEdge}44, 0 18px 40px -12px rgba(0,0,0,.35)`,
                display: 'flex',
                overflow: 'hidden',
                borderRadius: 2,
              }}
            >
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                  key={idx}
                  custom={dir}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
                  style={{ width: '100%', height: '100%', position: 'relative', zIndex: 2 }}
                >
                  <PageContent spread={spread} idx={idx} palette={palette} />
                </motion.div>
              </AnimatePresence>

              {/* Spine shadow */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: 60,
                  transform: 'translateX(-50%)',
                  background: `linear-gradient(90deg, transparent 0%, ${palette.pageEdge}88 35%, ${palette.pageEdge}aa 50%, ${palette.pageEdge}88 65%, transparent 100%)`,
                  mixBlendMode: 'multiply',
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              />

              {/* Paper grain */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  backgroundImage: `radial-gradient(circle at 20% 30%, ${palette.pageEdge}22 0%, transparent 40%),
                                    radial-gradient(circle at 80% 70%, ${palette.pageEdge}22 0%, transparent 40%)`,
                  mixBlendMode: 'multiply',
                }}
              />
            </div>

            <KnotBinding palette={palette} />
          </div>
        </motion.div>
        </div>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <button onClick={() => go(-1)} disabled={idx === 0} style={btnStyle(palette, idx === 0)}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
          <span>Prev</span>
        </button>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {SPREADS.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setDir(i > idx ? 1 : -1)
                setIdx(i)
              }}
              aria-label={`Go to spread ${i + 1}`}
              style={{
                width: i === idx ? 24 : 7,
                height: 7,
                borderRadius: 99,
                background: i === idx ? palette.accent : `${palette.inkQuiet}55`,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all .35s cubic-bezier(.4,0,.2,1)',
                boxShadow: i === idx ? `0 0 12px ${palette.accent}88` : 'none',
              }}
            />
          ))}
        </div>

        <button onClick={() => go(1)} disabled={idx === SPREADS.length - 1} style={btnStyle(palette, idx === SPREADS.length - 1)}>
          <span>Next</span>
          <span style={{ fontSize: 18, lineHeight: 1 }}>→</span>
        </button>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontStyle: 'italic',
          fontSize: 13,
          color: palette.inkQuiet,
        }}
      >
        {String(idx + 1).padStart(2, '0')} of {String(SPREADS.length).padStart(2, '0')} · {spread.title}
      </div>
    </div>
  )
}
