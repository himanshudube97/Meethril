'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plant } from '@/components/constellation/garden/Plant'
import { useThemeStore } from '@/store/theme'
import { captureToBlob, downloadBlob, makeShareFilename, shareOrDownload, wrapInPolaroid, type ShareSurface } from '@/lib/share'
import CameraIcon from './CameraIcon'

// Hue rotations matching PromptCard's butterfly palette.
const BUTTERFLY_HUES = [0, -55, 200, 280, 95]

type Phase = 'closed' | 'butterfly' | 'preview'

interface UseShareableCaptureOptions {
  /**
   * The composed off-screen card to capture. Either a static ReactNode
   * (e.g. `<JournalShareCard entry={savedEntry} />`) or a lazy function
   * that returns one — the function form is read at click time so it can
   * pull from external state stores (like draft text) without forcing the
   * caller to re-render on every keystroke.
   *
   * Mutually exclusive with `captureTarget`.
   */
  cardContent?: React.ReactNode | (() => React.ReactNode)
  /**
   * Direct-DOM capture mode — returns the live element to snapshot. Use
   * this when off-screen reconstruction is fragile (e.g. the source tree
   * relies on parent contexts or refs that don't exist outside its real
   * mount point). Mutually exclusive with `cardContent`.
   */
  captureTarget?: () => HTMLElement | null
  surface: ShareSurface
  /** Date used for filename + (if shown) the frame footer. */
  date: Date
  /**
   * If provided, the captured PNG is wrapped in a Polaroid frame with this
   * caption in the bottom strip (e.g. "May 9, 2026 · hearth"). The wrapped
   * blob is what gets shared/downloaded — the original is discarded.
   */
  polaroidCaption?: string
}

export function useShareableCapture({ cardContent, captureTarget, surface, date, polaroidCaption }: UseShareableCaptureOptions) {
  const { theme } = useThemeStore()
  const [phase, setPhase] = useState<Phase>('closed')
  const [butterflyHue, setButterflyHue] = useState(0)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [captureError, setCaptureError] = useState(false)
  const [mounted, setMounted] = useState(false)
  // Resolved off-screen content at the moment open() was called. Held in
  // state so the off-screen container renders the same JSX through both
  // the butterfly and preview phases, even if the lazy function would
  // produce different output on a later read.
  const [resolvedCard, setResolvedCard] = useState<React.ReactNode>(null)
  const offscreenRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Esc closes
  useEffect(() => {
    if (phase === 'closed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // Auto-advance: the butterfly flies in, then opens the preview on its own
  // once the capture is ready — the user shouldn't have to click to "catch it".
  useEffect(() => {
    if (phase !== 'butterfly' || !imageUrl) return
    const t = setTimeout(() => setPhase('preview'), 1400)
    return () => clearTimeout(t)
  }, [phase, imageUrl])

  // Cleanup blob URL on close / unmount
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const open = useCallback(async () => {
    // Resolve the capture source. Two modes:
    //   - captureTarget: snapshot a live DOM element directly
    //   - cardContent:   render an off-screen ReactNode and snapshot that
    let liveTarget: HTMLElement | null = null
    let card: React.ReactNode = null

    if (captureTarget) {
      liveTarget = captureTarget()
      if (!liveTarget) {
        console.warn('[share] captureTarget returned null — nothing to capture')
        return
      }
    } else {
      card = typeof cardContent === 'function' ? cardContent() : cardContent
      if (!card) {
        console.warn('[share] no cardContent — nothing to capture')
        return
      }
    }

    setResolvedCard(card)
    setCaptureError(false)
    setImageUrl(null)
    setImageBlob(null)
    setButterflyHue(BUTTERFLY_HUES[Math.floor(Math.random() * BUTTERFLY_HUES.length)])
    setPhase('butterfly')

    // Brief settle so React commits the off-screen mount before we grab the
    // ref. captureToBlob() then waits on document.fonts.ready and all images
    // inside the element, so we don't need a long fixed timeout here.
    await new Promise((r) => setTimeout(r, 80))

    const target = liveTarget ?? offscreenRef.current
    if (!target) {
      console.error('[share] capture target not available after settle')
      setCaptureError(true)
      return
    }

    const rawBlob = await captureToBlob(target)
    if (!rawBlob) {
      setCaptureError(true)
      return
    }

    // Optional polaroid wrap. Falls back to the raw capture if wrapping fails.
    const finalBlob = polaroidCaption
      ? (await wrapInPolaroid(rawBlob, polaroidCaption)) ?? rawBlob
      : rawBlob

    setImageBlob(finalBlob)
    setImageUrl(URL.createObjectURL(finalBlob))
  }, [cardContent, captureTarget, polaroidCaption])

  const close = useCallback(() => {
    setPhase('closed')
    setCaptureError(false)
    // imageUrl revoked by cleanup effect on next state change
  }, [])

  const reveal = useCallback(() => {
    if (imageUrl) setPhase('preview')
  }, [imageUrl])

  const handleShare = useCallback(async () => {
    if (!imageBlob) return
    await shareOrDownload(imageBlob, makeShareFilename(surface, date))
  }, [imageBlob, surface, date])

  const handleSave = useCallback(() => {
    if (!imageBlob) return
    downloadBlob(imageBlob, makeShareFilename(surface, date))
  }, [imageBlob, surface, date])

  const CameraButton = (
    <button
      type="button"
      onClick={open}
      disabled={phase !== 'closed'}
      aria-label="Share this page"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 8,
        cursor: phase !== 'closed' ? 'default' : 'pointer',
        color: theme.text.muted,
        opacity: 0.55,
        transition: 'opacity 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.95')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.55')}
    >
      <CameraIcon size={20} />
    </button>
  )

  const Capture = mounted ? createPortal(
    <>
      {/* Off-screen capture container — mounted only while overlay is open */}
      {phase !== 'closed' && (
        <div
          ref={offscreenRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          {resolvedCard}
        </div>
      )}

      <AnimatePresence>
        {phase !== 'closed' && (
          <motion.div
            key="share-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            onClick={() => {
              if (phase === 'preview') close()
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: phase === 'preview' ? `${theme.bg.primary}E6` : `${theme.bg.primary}99`,
              backdropFilter: 'blur(10px) saturate(1.05)',
              WebkitBackdropFilter: 'blur(10px) saturate(1.05)',
              transition: 'background 0.4s ease',
              cursor: phase === 'preview' ? 'pointer' : 'default',
              pointerEvents: phase === 'preview' ? 'auto' : 'none',
            }}
          >
            {/* Butterfly phase */}
            <AnimatePresence>
              {phase === 'butterfly' && !captureError && (
                <motion.button
                  key="butterfly"
                  type="button"
                  initial={{ opacity: 0, x: -360, y: 220, rotate: -25, scale: 0.6 }}
                  animate={{
                    opacity: 1,
                    x: [-360, -120, 60, 0, 0],
                    y: [220, 60, -40, 10, 0],
                    rotate: [-25, 12, -8, 4, 0],
                    scale: [0.6, 0.95, 1.05, 1, 1],
                  }}
                  exit={{ opacity: 0, scale: 0.4, y: -80, rotate: 20, transition: { duration: 0.5 } }}
                  transition={{ duration: 1.6, ease: 'easeOut', times: [0, 0.35, 0.6, 0.85, 1] }}
                  onClick={(e) => { e.stopPropagation(); reveal() }}
                  style={{
                    position: 'relative',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: imageUrl ? 'pointer' : 'default',
                    pointerEvents: 'auto',
                  }}
                  disabled={!imageUrl}
                  aria-label="Reveal share preview"
                >
                  <motion.div
                    aria-hidden
                    animate={{ opacity: [0.25, 0.55, 0.25], scale: [1, 1.18, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      position: 'absolute',
                      inset: '-30%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(255,200,140,0.55) 0%, rgba(255,180,90,0.18) 40%, transparent 70%)',
                      filter: 'blur(8px)',
                      pointerEvents: 'none',
                    }}
                  />
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <motion.div
                      animate={{ scaleX: [1, 0.55, 1, 0.55, 1] }}
                      transition={{ duration: 0.4, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ transformOrigin: 'center' }}
                    >
                      <Plant name="butterfly" width={130} saturate={1.05} hueRotate={butterflyHue} opacity={0.98} />
                    </motion.div>
                  </motion.div>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Capture failure */}
            <AnimatePresence>
              {captureError && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={close}
                  style={{
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    color: theme.text.muted,
                    fontFamily: 'Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: 15,
                    background: 'rgba(0,0,0,0.25)',
                    padding: '14px 22px',
                    borderRadius: 10,
                  }}
                >
                  couldn't snap that page — tap to dismiss
                </motion.div>
              )}
            </AnimatePresence>

            {/* Preview phase */}
            <AnimatePresence>
              {phase === 'preview' && imageUrl && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, scale: 0.9, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ type: 'spring', duration: 0.6 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'relative',
                    background: '#fff',
                    borderRadius: 18,
                    padding: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                    maxWidth: 'min(90vw, 540px)',
                    maxHeight: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="Share preview"
                    style={{
                      display: 'block',
                      width: '100%',
                      height: 'auto',
                      maxHeight: 'calc(92vh - 100px)',
                      objectFit: 'contain',
                      borderRadius: 8,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={handleShare}
                      style={{
                        flex: 1,
                        padding: '12px 20px',
                        borderRadius: 999,
                        border: 'none',
                        background: `linear-gradient(135deg, ${theme.accent.primary}, ${theme.accent.warm})`,
                        color: '#fff',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                      }}
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      style={{
                        flex: 1,
                        padding: '12px 20px',
                        borderRadius: 999,
                        border: '1px solid rgba(0,0,0,0.12)',
                        background: '#f5f0e6',
                        color: '#5a4a3e',
                        fontSize: 15,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  ) : null

  // `open` is exposed so callers can drive the capture from a custom trigger
  // (e.g. a wax-seal button in the diary action rail) instead of CameraButton.
  return { CameraButton, Capture, open, isOpen: phase !== 'closed' }
}
