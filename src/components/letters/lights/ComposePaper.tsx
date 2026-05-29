'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import PaperWatermark from './PaperWatermark'

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
]

const STORAGE_KEY = 'hearth.stranger.lastCountry'

// ISO 3166-1 alpha-2 → regional indicator emoji flag (U+1F1E6 + (letter - 'A')).
function flagOf(code: string): string {
  const upper = code.toUpperCase()
  if (upper.length !== 2) return ''
  const base = 0x1f1e6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1))
}

interface Props {
  /** Send the message to the server. Resolves on network success. */
  onSend: (content: string, country?: string, stateName?: string) => Promise<void>
  /** Called when the ceremony has played through and the component should unmount. */
  onDismiss: () => void
}

type Phase = 'idle' | 'folding' | 'igniting' | 'drifting' | 'caption' | 'done'

export default function ComposePaper({ onSend, onDismiss }: Props) {
  const [text, setText] = useState('')
  const [country, setCountry] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const dismissedRef = useRef(false)
  // Light themes have near-white scenes, so the paper must be lifted to a
  // clearly brighter sheet or it dissolves into the page. Dark themes already
  // have contrast, so keep the paper close to its own tone there.
  const isDark = useThemeStore((s) => s.theme.mode === 'dark')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setCountry(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (country) {
      try {
        localStorage.setItem(STORAGE_KEY, country)
      } catch {}
    }
  }, [country])

  // Lifecycle: dismiss once the caption has had its moment.
  useEffect(() => {
    if (phase !== 'caption' || dismissedRef.current) return
    dismissedRef.current = true
    const t = setTimeout(() => {
      setPhase('done')
      onDismiss()
    }, 1800)
    return () => clearTimeout(t)
  }, [phase, onDismiss])

  const trimmed = text.trim()
  const canSend = trimmed.length >= 10 && trimmed.length <= 200 && phase === 'idle'

  async function handleSend() {
    if (!canSend) return
    setError(null)
    setPhase('folding')

    // Fire send in parallel with the fold; ignore the timing of network success
    // for the visuals — the ceremony plays regardless. Only revert on error.
    try {
      await Promise.all([
        onSend(trimmed, country || undefined),
        new Promise((r) => setTimeout(r, 750)),
      ])
    } catch (e) {
      setPhase('idle')
      setError(e instanceof Error ? e.message : 'Could not send')
      return
    }

    setPhase('igniting')
    await new Promise((r) => setTimeout(r, 420))
    setPhase('drifting')
    await new Promise((r) => setTimeout(r, 1700))
    setPhase('caption')
  }

  // Animation control: the paper is mounted during idle, folding, igniting;
  // the ember is mounted during igniting and drifting.
  const showPaper = phase === 'idle' || phase === 'folding' || phase === 'igniting'
  const showEmber = phase === 'igniting' || phase === 'drifting'
  const showCaption = phase === 'caption'

  return (
    <div
      className="relative mx-auto w-full max-w-lg"
      style={{ minHeight: 440, perspective: 1200 }}
    >
      <AnimatePresence>
        {showPaper && (
          <motion.form
            key="paper"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            initial={{ opacity: 0, y: 14, rotate: -2 }}
            animate={
              phase === 'folding'
                ? {
                    opacity: 1,
                    scaleX: 0.42,
                    scaleY: 0.7,
                    rotate: -8,
                    transition: { duration: 0.7, ease: [0.55, 0.05, 0.35, 1] },
                  }
                : phase === 'igniting'
                ? {
                    opacity: 0,
                    scale: 0.18,
                    rotate: -15,
                    filter: 'brightness(1.8) saturate(1.4)',
                    transition: { duration: 0.42, ease: [0.55, 0.05, 0.35, 1] },
                  }
                : { opacity: 1, y: 0, rotate: -2, scale: 1 }
            }
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative flex flex-col gap-3 overflow-hidden"
            style={{
              minHeight: 320,
              padding: '34px 36px 28px',
              // Lift the paper off the page so it doesn't melt into light
              // themes. On light scenes the sheet goes near-white (a clear
              // value step above the blush/cream background); on dark scenes it
              // stays close to its own paper tone. A crisp edge + top highlight
              // + layered shadow define it on both.
              background: isDark
                ? 'linear-gradient(180deg, color-mix(in oklab, var(--paper-1) 86%, white) 0%, var(--paper-1) 50%, color-mix(in oklab, var(--paper-1) 90%, var(--bg-2)) 100%)'
                : 'linear-gradient(180deg, color-mix(in oklab, var(--paper-1) 42%, white) 0%, color-mix(in oklab, var(--paper-1) 60%, white) 52%, color-mix(in oklab, var(--paper-1) 80%, var(--bg-2)) 100%)',
              borderRadius: 16,
              border: `1px solid color-mix(in oklab, var(--text-primary) ${isDark ? 22 : 26}%, transparent)`,
              boxShadow:
                '0 1px 0 color-mix(in oklab, white 60%, transparent) inset, 0 20px 46px -14px rgba(0,0,0,0.34), 0 50px 100px -44px rgba(0,0,0,0.28)',
              transformOrigin: 'center',
            }}
          >
            {/* Faint pressed-flower watermark, theme-tinted */}
            <PaperWatermark />

            {/* Top-right corner: flag picker */}
            <div className="absolute right-4 top-4 z-10">
              <FlagPicker value={country} onChange={setCountry} disabled={phase !== 'idle'} />
            </div>

            {/* Header line */}
            <p
              className="relative font-serif text-[13px] italic"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 70%, transparent)',
                marginRight: 64,
              }}
            >
              a letter to a stranger
            </p>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              rows={6}
              placeholder="write something true. a gratitude. a hope. a small kindness."
              disabled={phase !== 'idle'}
              className="stranger-note-field relative w-full resize-none bg-transparent focus:outline-none disabled:opacity-90"
              style={{
                color: 'var(--text-primary)',
                // Match the journal's hand (Caveat); sized up so handwriting
                // stays legible against the serif chrome around it.
                fontFamily: 'var(--font-caveat), Caveat, cursive',
                fontSize: '20px',
                lineHeight: '1.65',
                caretColor: 'var(--accent-warm)',
              }}
              autoFocus
            />

            {error && (
              <p className="relative text-xs italic" style={{ color: '#a13a3a' }}>
                {error}
              </p>
            )}

            <div className="relative flex items-center justify-between pt-1">
              <span
                className="font-serif text-[11px] italic"
                style={{ color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)' }}
              >
                {text.length}/200
              </span>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-full px-5 py-1.5 font-serif text-[13px] italic transition-all disabled:opacity-40"
                style={{
                  background: 'var(--accent-primary)',
                  color: 'var(--paper-1)',
                  letterSpacing: '0.04em',
                  boxShadow: '0 4px 12px color-mix(in oklab, var(--accent-primary) 50%, transparent)',
                }}
              >
                release into the night
              </button>
            </div>
          </motion.form>
        )}

        {showEmber && (
          <motion.div
            key="ember"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.18 }}
            animate={
              phase === 'igniting'
                ? {
                    opacity: [0, 1, 1],
                    scale: [0.18, 0.7, 0.55],
                    transition: { duration: 0.42, ease: [0.4, 0, 0.5, 1] },
                  }
                : {
                    // drifting
                    opacity: [1, 1, 0.6, 0],
                    scale: [0.55, 0.5, 0.34, 0.18],
                    x: [0, 18, -14, 24, 8],
                    y: [0, -60, -160, -260, -380],
                    rotate: [0, -8, 6, -4, 0],
                    transition: { duration: 1.7, ease: 'linear', times: [0, 0.25, 0.55, 0.8, 1] },
                  }
            }
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <Ember />
          </motion.div>
        )}

        {showCaption && (
          <motion.div
            key="caption"
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          >
            <p
              className="font-serif text-[15px] italic"
              style={{ color: 'color-mix(in oklab, var(--text-primary) 75%, transparent)' }}
            >
              your light is on its way…
            </p>
            <p
              className="mt-2 font-serif text-[11px]"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)',
                letterSpacing: '0.18em',
              }}
            >
              someone, somewhere, will find it
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ───────────────────────────── Ember / glow ─────────────────────────────

function Ember() {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background:
          'radial-gradient(circle at center, #fff4d2 0%, var(--accent-warm) 30%, color-mix(in oklab, var(--accent-warm) 50%, #6e2c0a) 80%, transparent 100%)',
        boxShadow:
          '0 0 24px 10px color-mix(in oklab, var(--accent-warm) 70%, transparent), 0 0 60px 20px color-mix(in oklab, var(--accent-warm) 30%, transparent)',
        filter: 'blur(0.3px)',
      }}
    />
  )
}

// ───────────────────────────── Flag picker popover ────────────────────────────

interface FlagPickerProps {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}

function FlagPicker({ value, onChange, disabled }: FlagPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const selectedLabel = value
    ? COUNTRIES.find((c) => c.code === value)?.name ?? value
    : 'no postmark'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-label={`Postmark: ${selectedLabel}`}
        title={selectedLabel}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none transition-transform hover:scale-110 disabled:opacity-50"
        style={{
          background: value ? 'transparent' : 'color-mix(in oklab, var(--paper-1) 70%, transparent)',
          border: `1px dashed color-mix(in oklab, var(--text-primary) 50%, transparent)`,
        }}
      >
        {value ? (
          flagOf(value)
        ) : (
          <span style={{ fontSize: 12, color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}>
            +
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-10 z-30 rounded-lg p-2 shadow-lg"
            style={{
              background: 'var(--paper-1)',
              border: '1px solid color-mix(in oklab, var(--text-primary) 30%, transparent)',
              width: 232,
            }}
            role="dialog"
            aria-label="Choose a postmark"
          >
            <p
              className="mb-2 px-1 font-serif text-[10px] uppercase tracking-[0.2em]"
              style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}
            >
              postmark
            </p>
            <div className="grid grid-cols-5 gap-1">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                title="no postmark"
                aria-label="no postmark"
                className="flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                style={{
                  background:
                    value === ''
                      ? 'color-mix(in oklab, var(--text-primary) 12%, transparent)'
                      : 'transparent',
                  border:
                    value === ''
                      ? '1px solid color-mix(in oklab, var(--text-primary) 40%, transparent)'
                      : '1px solid transparent',
                  color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)',
                  fontSize: 14,
                }}
              >
                —
              </button>
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onChange(c.code)
                    setOpen(false)
                  }}
                  title={c.name}
                  aria-label={c.name}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[20px] leading-none transition-colors"
                  style={{
                    background:
                      value === c.code
                        ? 'color-mix(in oklab, var(--text-primary) 12%, transparent)'
                        : 'transparent',
                    border:
                      value === c.code
                        ? '1px solid color-mix(in oklab, var(--text-primary) 40%, transparent)'
                        : '1px solid transparent',
                  }}
                >
                  {flagOf(c.code)}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
