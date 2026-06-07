'use client'

/**
 * Per-spread mini animated mock — replaces the dashed "media slot" placeholder.
 * Each mock renders a small "app window" (traffic-light dots, title bar) with
 * the feature shown inside as polished UI. Subtle bob + soft glow underneath
 * across all of them.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { themes, type ThemeName } from '@/lib/themes'

type Palette = {
  page: string
  pageEdge: string
  ink: string
  inkSoft: string
  inkQuiet: string
  accent: string
  thread: string
}

// ─── Reusable app-window shell + glow ─────────────────────────────────────
function AppWindow({
  children,
  p,
  glow = true,
  padded = true,
}: {
  children: React.ReactNode
  p: Palette
  glow?: boolean
  padded?: boolean
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        style={{
          position: 'relative',
          width: 240,
          height: 168,
          background: p.page,
          border: `1.5px solid ${p.inkQuiet}66`,
          borderRadius: 6,
          boxShadow: '0 14px 30px rgba(0,0,0,0.22), 0 4px 8px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Title bar */}
        <div
          style={{
            height: 18,
            background: `${p.inkQuiet}22`,
            borderBottom: `1px solid ${p.inkQuiet}44`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            gap: 6,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ed6a5e' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f6c046' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#62c554' }} />
        </div>
        {/* Body */}
        <div style={{ position: 'absolute', inset: padded ? '26px 16px 16px 16px' : '18px 0 0 0' }}>
          {children}
        </div>
      </motion.div>
      {glow && (
        <motion.div
          style={{
            position: 'absolute',
            bottom: '18%',
            width: '60%',
            height: 22,
            background: `radial-gradient(ellipse, ${p.accent}55, transparent 70%)`,
            filter: 'blur(12px)',
            pointerEvents: 'none',
          }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

// I — Journal entry being written
function MockJournalApp({ p }: { p: Palette }) {
  return (
    <AppWindow p={p}>
      {/* Date */}
      <div
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontStyle: 'italic',
          fontSize: 11,
          color: p.inkSoft,
          opacity: 0.7,
          marginBottom: 14,
        }}
      >
        Tuesday · September 3
      </div>
      {/* Animated text lines */}
      {[0.92, 0.7, 0.85, 0.55].map((w, i) => (
        <motion.div
          key={i}
          style={{ height: 4, borderRadius: 99, background: p.ink, opacity: 0.45, marginBottom: 7, transformOrigin: 'left' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: w }}
          transition={{ duration: 0.7, delay: 0.4 + i * 0.3, repeat: Infinity, repeatDelay: 4, repeatType: 'reverse' }}
        />
      ))}
      {/* A small song embed at the bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 14,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          background: `${p.accent}1a`,
          borderRadius: 4,
        }}
      >
        <motion.div
          style={{ width: 4, height: 4, borderRadius: '50%', background: p.accent }}
          animate={{ scale: [1, 1.6, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div style={{ flex: 1, height: 2, borderRadius: 99, background: `${p.ink}33` }}>
          <motion.div
            style={{ height: '100%', background: p.accent, borderRadius: 99, transformOrigin: 'left' }}
            animate={{ scaleX: [0.2, 0.8, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </AppWindow>
  )
}

// II — Letter compose UI
function MockLetterApp({ p }: { p: Palette }) {
  return (
    <AppWindow p={p}>
      <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 10, color: p.inkSoft, marginBottom: 6 }}>
        <span style={{ opacity: 0.55 }}>To · </span>
        <span style={{ fontStyle: 'italic' }}>future me</span>
      </div>
      <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 10, color: p.inkSoft, marginBottom: 10 }}>
        <span style={{ opacity: 0.55 }}>Opens · </span>
        <span style={{ fontStyle: 'italic' }}>January 2027</span>
      </div>
      {/* Letter body lines */}
      {[0.95, 0.6, 0.85].map((w, i) => (
        <motion.div
          key={i}
          style={{ height: 3, borderRadius: 99, background: p.ink, opacity: 0.4, marginBottom: 6, transformOrigin: 'left' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: w }}
          transition={{ duration: 0.7, delay: 0.3 + i * 0.25, repeat: Infinity, repeatDelay: 3.5, repeatType: 'reverse' }}
        />
      ))}
      {/* Seal & send button with pulsing wax dot */}
      <motion.div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          translateX: '-50%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 12px',
          background: p.accent,
          borderRadius: 999,
          boxShadow: `0 2px 8px ${p.accent}66`,
        }}
        animate={{ scale: [1, 1.04, 1], boxShadow: [`0 2px 8px ${p.accent}66`, `0 2px 16px ${p.accent}aa`, `0 2px 8px ${p.accent}66`] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${p.thread}, ${p.accent})`,
            boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.3)',
          }}
        />
        <span style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 11, color: p.page }}>
          Seal & send
        </span>
      </motion.div>
    </AppWindow>
  )
}

// III — Scrapbook canvas with polaroid scraps
function MockScrapbookApp({ p }: { p: Palette }) {
  const items = [
    { rot: -8, x: -52, y: 10 },
    { rot: 4, x: 0, y: -8 },
    { rot: -3, x: 50, y: 14 },
  ]
  return (
    <AppWindow p={p} padded={false}>
      <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
        {/* Faint dotted board */}
        <div
          style={{
            position: 'absolute',
            inset: 14,
            backgroundImage: `radial-gradient(circle, ${p.inkQuiet}22 1px, transparent 1px)`,
            backgroundSize: '12px 12px',
            opacity: 0.6,
          }}
        />
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {items.map((it, i) => (
            <motion.div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 64,
                height: 78,
                background: '#fbf6e7',
                padding: 5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                translateX: '-50%',
                translateY: '-50%',
                x: it.x,
                y: it.y,
                rotate: it.rot,
                borderRadius: 2,
              }}
              animate={{ y: [it.y, it.y - 3, it.y], rotate: [it.rot, it.rot + 1.5, it.rot] }}
              transition={{ duration: 5 + i * 0.8, delay: i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div style={{ width: '100%', height: 48, background: i === 1 ? p.accent + '55' : p.thread + '44', borderRadius: 1 }} />
              <div style={{ marginTop: 4, height: 2, background: p.inkQuiet, opacity: 0.5, borderRadius: 99 }} />
              {/* Washi tape on the top corner */}
              <div
                style={{
                  position: 'absolute',
                  top: -5,
                  left: 12,
                  width: 28,
                  height: 10,
                  background: `${p.accent}55`,
                  transform: 'rotate(-12deg)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </AppWindow>
  )
}

// IV — Constellation view — dark sky inside the window with stars + year label
function MockConstellationApp({ p }: { p: Palette }) {
  const stars = [
    { cx: 40, cy: 60 },
    { cx: 70, cy: 35 },
    { cx: 110, cy: 55 },
    { cx: 145, cy: 30 },
    { cx: 175, cy: 60 },
    { cx: 130, cy: 85 },
    { cx: 80, cy: 95 },
  ]
  return (
    <AppWindow p={p} padded={false}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #1a1d2e 0%, #0e0f1c 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Year label */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 14,
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '.1em',
          }}
        >
          2026
        </div>
        <svg width="100%" height="100%" viewBox="0 0 220 130" preserveAspectRatio="none">
          {stars.slice(0, -1).map((s, i) => {
            const next = stars[i + 1]
            return (
              <motion.line
                key={`l-${i}`}
                x1={s.cx}
                y1={s.cy}
                x2={next.cx}
                y2={next.cy}
                stroke={p.accent}
                strokeOpacity="0.5"
                strokeWidth="0.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.3 + i * 0.18, repeat: Infinity, repeatDelay: 4, repeatType: 'reverse' }}
              />
            )
          })}
          {stars.map((s, i) => (
            <motion.circle
              key={`s-${i}`}
              cx={s.cx}
              cy={s.cy}
              r="1.8"
              fill={p.accent}
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.25, 0.85] }}
              transition={{ duration: 2.2 + i * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }}
              style={{ filter: `drop-shadow(0 0 4px ${p.accent}cc)` }}
            />
          ))}
        </svg>
      </div>
    </AppWindow>
  )
}

// IV — Shelf: a row of month-books, one pulling out
function MockShelfApp({ p }: { p: Palette }) {
  // Each book is a colored spine standing on the shelf; the highlighted one
  // eases out a touch, as if being pulled to read.
  const books = [
    { h: 118, pull: 0 },
    { h: 126, pull: 0 },
    { h: 112, pull: 0 },
    { h: 130, pull: 10, accent: true },
    { h: 120, pull: 0 },
    { h: 116, pull: 0 },
    { h: 124, pull: 0 },
  ]
  return (
    <AppWindow p={p} padded={false}>
      <div style={{ position: 'absolute', inset: 0, padding: '20px 16px 0 16px' }}>
        {/* Books standing in a row, baseline-aligned on the shelf */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 14,
            height: 132,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          {books.map((b, i) => (
            <motion.div
              key={i}
              style={{
                width: 22,
                height: b.h,
                borderRadius: '3px 3px 1px 1px',
                background: b.accent
                  ? p.accent
                  : `color-mix(in srgb, ${p.accent} ${18 + (i % 3) * 14}%, ${p.page})`,
                border: `1px solid ${p.inkQuiet}44`,
                boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.18), 0 4px 8px rgba(0,0,0,0.14)',
                position: 'relative',
              }}
              animate={{ y: b.pull ? [-b.pull, -b.pull - 3, -b.pull] : [0, 0, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* A couple of label lines down the spine */}
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 3,
                  height: b.h - 40,
                  borderRadius: 99,
                  background: b.accent ? p.page : `${p.ink}33`,
                  opacity: 0.6,
                }}
              />
            </motion.div>
          ))}
        </div>
        {/* The shelf board */}
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 8,
            height: 7,
            borderRadius: 2,
            background: `color-mix(in srgb, ${p.inkSoft} 55%, ${p.page})`,
            boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
          }}
        />
      </div>
    </AppWindow>
  )
}

// VI — Lock / unlock screen
function MockLockApp({ p }: { p: Palette }) {
  return (
    <AppWindow p={p}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 8 }}>
        {/* Padlock icon */}
        <svg width="36" height="44" viewBox="0 0 36 44">
          <motion.path
            d="M 10 18 L 10 12 Q 10 4 18 4 Q 26 4 26 12 L 26 18"
            stroke={p.accent}
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            animate={{ d: [
              'M 10 18 L 10 12 Q 10 4 18 4 Q 26 4 26 12 L 26 18',
              'M 10 18 L 10 8 Q 10 0 18 0 Q 26 0 26 8 L 26 14',
              'M 10 18 L 10 12 Q 10 4 18 4 Q 26 4 26 12 L 26 18',
            ] }}
            transition={{ duration: 4, times: [0, 0.4, 1], repeat: Infinity, ease: 'easeInOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${p.accent}66)` }}
          />
          <rect x="6" y="18" width="24" height="22" rx="3" fill={p.accent} opacity="0.85" />
          <circle cx="18" cy="29" r="2.2" fill={p.page} />
        </svg>
        {/* Daily-key prompt */}
        <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 10, color: p.inkSoft, opacity: 0.7 }}>
          Enter your daily key
        </div>
        {/* Animated dots */}
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={i}
              style={{ width: 6, height: 6, borderRadius: '50%', background: p.ink, opacity: 0.5 }}
              animate={{ opacity: [0.2, 0.9, 0.2] }}
              transition={{ duration: 0.7, delay: i * 0.13, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </AppWindow>
  )
}

// VII — Interactive theme switcher (special, no AppWindow shell — IT IS the switcher).
// Only the user-selectable themes are shown — must mirror DeskSettingsPanel,
// which hides `firelight` and `linen`. That leaves the seven the copy promises.
const HIDDEN_THEMES: ThemeName[] = ['firelight', 'linen', 'rain']
const THEME_ORDER: ThemeName[] = ['rivendell', 'rose', 'sage', 'ocean', 'postal', 'sunset']
const VISIBLE_THEMES = THEME_ORDER.filter((n) => !HIDDEN_THEMES.includes(n))

function MockThemeSwitcher() {
  const themeName = useThemeStore((s) => s.themeName)
  const setTheme = useThemeStore((s) => s.setTheme)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <div style={{ display: 'flex', gap: 6 }}>
        {VISIBLE_THEMES.map((name) => {
          const t = themes[name]
          const active = name === themeName
          return (
            <motion.button
              key={name}
              type="button"
              onClick={() => setTheme(name)}
              aria-label={`Try ${t.name}`}
              aria-pressed={active}
              whileHover={{ y: -4, scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              style={{
                width: 24,
                height: 92,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                background: t.bg.gradient,
                boxShadow: active
                  ? `0 0 0 2px ${t.accent.primary}, 0 4px 14px rgba(0,0,0,0.22)`
                  : '0 2px 8px rgba(0,0,0,0.18)',
                transition: 'box-shadow 0.25s ease',
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '30%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: t.accent.primary,
                  boxShadow: `0 0 6px ${t.accent.primary}`,
                  opacity: 0.85,
                }}
              />
            </motion.button>
          )
        })}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontStyle: 'italic',
          fontSize: 11,
          color: themes[themeName].text.muted,
          opacity: 0.75,
        }}
      >
        {themes[themeName].name}
      </div>
    </div>
  )
}

// VIII — Desktop app preview: window-in-window
function MockDesktopApp({ p }: { p: Palette }) {
  return (
    <AppWindow p={p} padded={false}>
      <div style={{ position: 'absolute', inset: '12px 14px 14px 14px', display: 'flex', gap: 6 }}>
        {/* Inner "diary" — left page */}
        <div style={{ flex: 1, background: `${p.accent}1a`, borderRadius: 2, padding: 8 }}>
          {[0.9, 0.7, 0.85, 0.6].map((w, i) => (
            <motion.div
              key={i}
              style={{ height: 3, borderRadius: 99, background: p.ink, opacity: 0.4, marginBottom: 5, transformOrigin: 'left' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: w }}
              transition={{ duration: 0.7, delay: 0.4 + i * 0.25, repeat: Infinity, repeatDelay: 4, repeatType: 'reverse' }}
            />
          ))}
        </div>
        {/* Inner "diary" — right page with a soft photo */}
        <div style={{ flex: 1, background: `${p.thread}1a`, borderRadius: 2, position: 'relative' }}>
          <motion.div
            style={{
              position: 'absolute',
              inset: 8,
              background: `linear-gradient(135deg, ${p.accent}33, ${p.thread}22)`,
              borderRadius: 2,
            }}
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </AppWindow>
  )
}

const MOCKS: Record<string, React.FC<{ p: Palette }>> = {
  I: MockJournalApp,
  II: MockScrapbookApp,
  III: MockLetterApp,
  IV: MockShelfApp,
  V: MockConstellationApp,
  VI: MockLockApp,
  VIII: MockDesktopApp,
}

export default function MediaPreview({ n, palette }: { n: string; palette: Palette }) {
  if (n === 'VII') return <MockThemeSwitcher />
  const Mock = MOCKS[n] ?? MockJournalApp
  return <Mock p={palette} />
}
