'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import type { RecipientChoice } from '../letterTypes'

// Intrinsic envelope paper colours — match PostcardFront so the picker reads
// as the same physical object as the surface you'll write on next.
const PAPER_BG = 'linear-gradient(160deg, #fff6f2 0%, #fbe6dd 100%)'
const PAPER_INK = '#3d342a'
const PAPER_INK_MUTED = 'rgba(61, 52, 42, 0.55)'
const FLAP_LINE = 'rgba(120, 90, 50, 0.32)'

type EnvelopeProps = {
  title: string
  subtitle: string
  tilt: number
  onClick: () => void
  accent: string
  delay: number
}

function EnvelopeCard({ title, subtitle, tilt, onClick, accent, delay }: EnvelopeProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 28, rotate: tilt }}
      animate={{ opacity: 1, y: hovered ? -8 : 0, rotate: tilt }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
      whileTap={{ scale: 0.98 }}
      style={{
        position: 'relative',
        width: 'min(440px, 38vw)',
        aspectRatio: '440 / 280',
        borderRadius: 10,
        background: PAPER_BG,
        border: '1px solid rgba(80, 55, 40, 0.18)',
        boxShadow: hovered
          ? '0 30px 60px rgba(0,0,0,0.32), 0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.55)'
          : '0 18px 40px rgba(0,0,0,0.22), 0 3px 8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.55)',
        cursor: 'pointer',
        overflow: 'hidden',
        padding: 0,
        textAlign: 'left',
      }}
    >
      {/* Flap V — two diagonals from top corners meeting at the wax seal.
          Drawn in SVG so it scales cleanly with the envelope. */}
      <svg
        viewBox="0 0 440 280"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <line
          x1="0" y1="0" x2="220" y2="118"
          stroke={FLAP_LINE} strokeWidth="1"
        />
        <line
          x1="440" y1="0" x2="220" y2="118"
          stroke={FLAP_LINE} strokeWidth="1"
        />
      </svg>

      {/* Stamp — dashed rectangle, top-right. Matches PostcardFront's Hearth stamp. */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 18,
          width: 44,
          height: 52,
          border: '1.5px dashed rgba(120, 90, 50, 0.45)',
          borderRadius: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          background: 'rgba(120, 90, 50, 0.04)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-caveat), Caveat, cursive',
            fontSize: 16,
            color: accent,
            lineHeight: 1,
          }}
        >
          ✦
        </span>
        <span
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 6,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'rgba(120, 90, 50, 0.55)',
          }}
        >
          MEETHRIL
        </span>
      </div>

      {/* Wax seal — sits where the flap V meets the body. Theme accent. */}
      <motion.div
        animate={{
          boxShadow: hovered
            ? `0 0 0 4px ${accent}1a, 0 0 24px ${accent}66, inset 0 -3px 6px rgba(0,0,0,0.25), inset 0 2px 4px rgba(255,255,255,0.35)`
            : `0 0 0 2px ${accent}14, 0 2px 6px rgba(0,0,0,0.22), inset 0 -3px 6px rgba(0,0,0,0.25), inset 0 2px 4px rgba(255,255,255,0.3)`,
        }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          left: '50%',
          top: '42%',
          transform: 'translate(-50%, -50%)',
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${accent}, ${accent}cc 60%, ${accent}99 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: 0.5,
        }}
      >
        h
      </motion.div>

      {/* Title + subtitle — sit in the lower half of the envelope body */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 32,
          textAlign: 'center',
          padding: '0 28px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-caveat), Caveat, cursive',
            fontSize: 32,
            lineHeight: 1.1,
            color: PAPER_INK,
            marginBottom: 6,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 14,
            color: PAPER_INK_MUTED,
            letterSpacing: 0.2,
          }}
        >
          {subtitle}
        </div>
      </div>
    </motion.button>
  )
}

export function RecipientPicker({
  onSubmit,
  onCancel,
}: {
  onSubmit: (choice: RecipientChoice) => void
  onCancel: () => void
}) {
  const theme = useThemeStore((s) => s.theme)
  const [mode, setMode] = useState<'idle' | 'friend-name'>('idle')
  const [name, setName] = useState('')

  function handleFriendSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ recipient: 'friend', name: trimmed })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
      style={{ color: theme.text.primary }}
    >
      <div className="w-full max-w-4xl text-center">
        <AnimatePresence mode="wait">
          {mode === 'idle' && (
            <motion.div
              key="picker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
                className="font-serif italic mb-14"
                style={{
                  color: theme.text.primary,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: 30,
                  letterSpacing: 0.3,
                }}
              >
                Who&apos;s this letter for?
              </motion.h2>

              <div className="flex items-center justify-center gap-10 flex-wrap">
                <EnvelopeCard
                  title="Future me"
                  subtitle="a note to yourself, later"
                  tilt={-3}
                  delay={0.15}
                  accent={theme.accent.primary}
                  onClick={() => onSubmit({ recipient: 'self' })}
                />
                <EnvelopeCard
                  title="A friend"
                  subtitle="delivered to their email, within 30 days"
                  tilt={3}
                  delay={0.28}
                  accent={theme.accent.primary}
                  onClick={() => setMode('friend-name')}
                />
              </div>

              <motion.button
                type="button"
                onClick={onCancel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                className="mt-14 text-sm"
                style={{
                  color: theme.text.primary,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  letterSpacing: 0.4,
                }}
              >
                ← cancel
              </motion.button>
            </motion.div>
          )}

          {mode === 'friend-name' && (
            <motion.form
              key="name"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleFriendSubmit}
              className="mx-auto max-w-sm"
            >
              <h2
                className="mb-8"
                style={{
                  color: theme.text.primary,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 26,
                }}
              >
                Who is this for?
              </h2>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="their name"
                className="w-full text-center text-lg italic px-4 py-3 rounded-xl outline-none"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: `${theme.bg.primary}b3`,
                  color: theme.text.primary,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                }}
              />
              <div className="mt-5 flex items-center justify-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('idle')
                    setName('')
                  }}
                  className="opacity-70 hover:opacity-100"
                  style={{
                    color: theme.text.primary,
                    fontFamily: 'Cormorant Garamond, Georgia, serif',
                    fontStyle: 'italic',
                  }}
                >
                  ← back
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-full text-sm disabled:opacity-30"
                  style={{
                    backgroundColor: theme.accent.primary,
                    color: theme.bg.primary,
                    fontFamily: 'var(--font-caveat), Caveat, cursive',
                    fontSize: 18,
                  }}
                >
                  continue
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
