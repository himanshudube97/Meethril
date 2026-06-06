'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CARD_DECK, type Card } from '@/lib/card-deck'
import { useThemeStore } from '@/store/theme'
import { useDeskStore } from '@/store/desk'
import { Plant } from '@/components/constellation/garden/Plant'

const STORAGE_KEY = 'card-deck-state-v1'

type DeckState = { shuffleSeed: number; nextIndex: number }
type Phase = 'closed' | 'butterfly' | 'note'

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledIds(seed: number): number[] {
  const ids = CARD_DECK.map((c) => c.id)
  const rand = mulberry32(seed)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

function loadState(): DeckState {
  if (typeof window === 'undefined') return { shuffleSeed: 0, nextIndex: 0 }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('no state')
    const parsed = JSON.parse(raw) as DeckState
    if (
      typeof parsed.shuffleSeed !== 'number' ||
      typeof parsed.nextIndex !== 'number'
    ) {
      throw new Error('bad shape')
    }
    return parsed
  } catch {
    return { shuffleSeed: Math.floor(Math.random() * 1e9), nextIndex: 0 }
  }
}

function saveState(state: DeckState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

// Hue rotations matching the Memory section's butterflies — default
// blue/yellow, warm, magenta, rose, and lime. Each draw picks one.
const BUTTERFLY_HUES = [0, -55, 200, 280, 95]

interface PromptCardProps {
  color: string
  /**
   * Optional custom trigger. The overlay (butterfly → note) always portals to
   * document.body, so the trigger can live anywhere — e.g. the right-margin
   * action rail. Falls back to the inline "✦ pull a card" text button.
   */
  trigger?: (api: { onClick: () => void; disabled: boolean }) => React.ReactNode
}

export default function PromptCard({ color, trigger }: PromptCardProps) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [card, setCard] = useState<Card | null>(null)
  const [butterflyHue, setButterflyHue] = useState(0)
  const [mounted, setMounted] = useState(false)
  const { theme } = useThemeStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  const drawNext = useCallback(() => {
    let { shuffleSeed, nextIndex } = loadState()
    let order = shuffledIds(shuffleSeed)
    if (nextIndex >= order.length) {
      shuffleSeed = Math.floor(Math.random() * 1e9)
      order = shuffledIds(shuffleSeed)
      nextIndex = 0
    }
    const id = order[nextIndex]
    const drawn = CARD_DECK.find((c) => c.id === id) ?? CARD_DECK[0]
    saveState({ shuffleSeed, nextIndex: nextIndex + 1 })
    setCard(drawn)
  }, [])

  const startPull = () => {
    drawNext()
    setButterflyHue(
      BUTTERFLY_HUES[Math.floor(Math.random() * BUTTERFLY_HUES.length)]
    )
    setPhase('butterfly')
  }

  const revealNote = () => setPhase('note')

  const close = () => setPhase('closed')

  // "begin" — drop the card's prompt into the left-page draft so the user
  // can continue from it. Existing draft text is preserved; the prompt is
  // appended after a blank line if the page already has content.
  const accept = () => {
    if (card?.prompt) {
      const setLeft = useDeskStore.getState().setLeftPageDraft
      setLeft((prev) =>
        prev.trim().length > 0
          ? `${prev.replace(/\s+$/, '')}\n\n${card.prompt}\n`
          : `${card.prompt}\n`
      )
    }
    setPhase('closed')
  }

  useEffect(() => {
    if (phase === 'closed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // Auto-advance: the butterfly flies in, then unfolds the card on its own —
  // the user shouldn't have to "catch it" with a click.
  useEffect(() => {
    if (phase !== 'butterfly') return
    const t = setTimeout(() => setPhase('note'), 1700)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <>
      {trigger ? (
        trigger({ onClick: startPull, disabled: phase !== 'closed' })
      ) : (
        <button
          type="button"
          onClick={startPull}
          className="pointer-events-auto"
          style={{
            background: 'transparent',
            border: 'none',
            padding: '6px 14px',
            cursor: 'pointer',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontSize: '13px',
            letterSpacing: '0.04em',
            color,
            opacity: 0.75,
            transition: 'opacity 0.3s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.75')}
          aria-label="Pull a card"
        >
          ✦ pull a card
        </button>
      )}

      {mounted && createPortal(
      <AnimatePresence>
        {phase !== 'closed' && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onClick={() => {
              if (phase === 'note') close()
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                phase === 'note' ? `${theme.bg.primary}D9` : 'transparent',
              backdropFilter:
                phase === 'note' ? 'blur(14px) saturate(1.05)' : 'none',
              WebkitBackdropFilter:
                phase === 'note' ? 'blur(14px) saturate(1.05)' : 'none',
              transition:
                'background 0.45s ease, backdrop-filter 0.45s ease',
              cursor: phase === 'note' ? 'pointer' : 'default',
              // butterfly phase: don't intercept clicks anywhere — only the
              // butterfly itself catches them so the diary stays usable.
              pointerEvents: phase === 'note' ? 'auto' : 'none',
            }}
          >
            {/* soft theme-tinted vignette only during the note phase */}
            {phase === 'note' && (
              <motion.div
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${theme.accent.warm}22, transparent 70%)`,
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* ─── PHASE: butterfly ─── */}
            <AnimatePresence>
              {phase === 'butterfly' && (
                <motion.button
                  key="butterfly"
                  type="button"
                  initial={{
                    opacity: 0,
                    x: -360,
                    y: 220,
                    rotate: -25,
                    scale: 0.6,
                  }}
                  animate={{
                    opacity: 1,
                    x: [-360, -120, 60, 0, 0],
                    y: [220, 60, -40, 10, 0],
                    rotate: [-25, 12, -8, 4, 0],
                    scale: [0.6, 0.95, 1.05, 1, 1],
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.4,
                    y: -80,
                    rotate: 20,
                    transition: { duration: 0.55, ease: 'easeIn' },
                  }}
                  transition={{
                    duration: 1.6,
                    ease: 'easeOut',
                    times: [0, 0.35, 0.6, 0.85, 1],
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    revealNote()
                  }}
                  style={{
                    position: 'relative',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    // restore clicks on the butterfly itself even though
                    // the surrounding overlay is set to pointer-events: none
                    pointerEvents: 'auto',
                  }}
                >
                  {/* gentle pulse glow under the butterfly to invite click */}
                  <motion.div
                    aria-hidden
                    animate={{
                      opacity: [0.25, 0.55, 0.25],
                      scale: [1, 1.18, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    style={{
                      position: 'absolute',
                      inset: '-30%',
                      borderRadius: '50%',
                      background:
                        'radial-gradient(circle, rgba(255,200,140,0.55) 0%, rgba(255,180,90,0.18) 40%, transparent 70%)',
                      filter: 'blur(8px)',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* bobbing wrapper for vertical drift */}
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{
                      duration: 2.6,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  >
                    {/* wing flap — same technique as the Memory garden */}
                    <motion.div
                      animate={{ scaleX: [1, 0.55, 1, 0.55, 1] }}
                      transition={{
                        duration: 0.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      style={{ transformOrigin: 'center' }}
                    >
                      <Plant
                        name="butterfly"
                        width={130}
                        saturate={1.05}
                        hueRotate={butterflyHue}
                        opacity={0.98}
                      />
                    </motion.div>
                  </motion.div>
                </motion.button>
              )}
            </AnimatePresence>

            {/* ─── PHASE: note ─── */}
            <AnimatePresence>
              {phase === 'note' && (
                <NoteCard card={card} onBegin={accept} />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// NoteCard: the unfolded prompt the user reads
// ─────────────────────────────────────────────────────────────────────────

interface NoteCardProps {
  card: Card | null
  onBegin: () => void
}

function NoteCard({ card, onBegin }: NoteCardProps) {
  return (
    <motion.div
      key={`note-${card?.id ?? 0}`}
      initial={{ opacity: 0, scale: 0.55, rotateX: -35, y: -30, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0, rotate: -1.2 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3 } }}
      transition={{
        duration: 0.95,
        ease: [0.22, 1, 0.36, 1],
        opacity: { duration: 0.6 },
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        width: 'min(460px, calc(100vw - 56px))',
        padding: '54px 54px 40px',
        background:
          'linear-gradient(178deg, #fdf6e4 0%, #f7ebcf 55%, #f1e0bb 100%)',
        borderRadius: '4px',
        boxShadow:
          '0 50px 100px rgba(40,20,10,0.45), 0 14px 30px rgba(40,20,10,0.22), inset 0 0 0 1px rgba(140,100,60,0.18), inset 0 -50px 80px rgba(120,80,40,0.10), inset 0 30px 60px rgba(255,255,255,0.35)',
        cursor: 'auto',
        transformStyle: 'preserve-3d',
        transformPerspective: 1400,
      }}
    >
      {/* paper grain overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          opacity: 0.5,
          pointerEvents: 'none',
          background:
            'repeating-radial-gradient(circle at 20% 30%, rgba(140,100,60,0.05) 0, rgba(140,100,60,0.05) 1px, transparent 1px, transparent 3px), repeating-radial-gradient(circle at 70% 70%, rgba(80,50,30,0.06) 0, rgba(80,50,30,0.06) 1px, transparent 1px, transparent 4px)',
          mixBlendMode: 'multiply',
        }}
      />
      {/* faint deckle along the top edge */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '18px',
          borderRadius: '4px 4px 0 0',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* small decorative flourish */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0.3 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginBottom: '26px',
          color: '#a17a4a',
        }}
      >
        <span
          aria-hidden
          style={{
            flex: 1,
            height: '1px',
            background:
              'linear-gradient(90deg, transparent, rgba(161,122,74,0.45), transparent)',
          }}
        />
        <span style={{ fontSize: '15px', letterSpacing: '0.3em' }}>✦</span>
        <span
          aria-hidden
          style={{
            flex: 1,
            height: '1px',
            background:
              'linear-gradient(90deg, transparent, rgba(161,122,74,0.45), transparent)',
          }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.55, ease: 'easeOut' }}
        style={{
          fontFamily: "'Caveat', cursive",
          fontWeight: 500,
          fontSize: '32px',
          lineHeight: 1.25,
          color: '#3a2a1c',
          marginBottom: '14px',
          textAlign: 'center',
        }}
      >
        {card?.prompt}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.55, ease: 'easeOut' }}
        style={{
          fontFamily: "'Caveat', cursive",
          fontSize: '22px',
          lineHeight: 1.35,
          color: '#7a5a3c',
          opacity: 0.85,
          marginBottom: '38px',
          textAlign: 'center',
        }}
      >
        {card?.wink}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.95, duration: 0.4 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onBegin()
          }}
          style={btnPrimary}
        >
          begin
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// shared button styles
// ─────────────────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  background: '#3a2a1c',
  color: '#fbf6ec',
  border: 'none',
  padding: '10px 28px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontFamily: 'Georgia, serif',
  fontSize: '14px',
  letterSpacing: '0.08em',
  textTransform: 'lowercase',
  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
}

