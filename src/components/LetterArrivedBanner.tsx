'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
// html-to-image (~40-60KB) is only needed when the user taps Download.
// Pulled in dynamically inside the handler so it doesn't ship in the main
// bundle for every user who ever opens an arrived letter modal.
import { useThemeStore } from '@/store/theme'
import { themes, ThemeName } from '@/lib/themes'
import DoodlePreview from '@/components/DoodlePreview'
import SongEmbed, { isMusicUrl } from '@/components/SongEmbed'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'
import { sanitizeLetterClient } from '@/lib/sanitize-letter-client'

interface ArrivedLetter {
  id: string
  text: string
  createdAt: string
  unlockDate: string
  letterLocation: string | null
  song?: string | null
  photos?: { url: string; position: number; spread: number; rotation: number }[]
  doodles?: { strokes: any[]; positionInEntry: number; spread: number }[]
  encryptionType?: string
  e2eeIVs?: unknown
}

interface LetterArrivedBannerProps {
  nickname?: string
}

function parseViewedIds(raw: string | null): Set<string> {
  if (!raw) return new Set<string>()
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set<string>(parsed.map(String))
    return new Set<string>()
  } catch {
    // Corrupted/foreign value — start from empty rather than throwing and
    // skipping the rest of the effect (which would prevent the arrived-letter
    // modal from ever opening).
    return new Set<string>()
  }
}

// Theme-specific stamps
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

// Floating sparkle particles for reading phase
function FloatingSparkle({ delay, index }: { delay: number; index: number }) {
  const angle = (index / 12) * Math.PI * 2
  const distance = 150 + Math.random() * 100
  const x = Math.cos(angle) * distance
  const y = Math.sin(angle) * distance

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: '50%',
        top: '50%',
        width: 3,
        height: 3,
        borderRadius: '50%',
        background: 'white',
        boxShadow: '0 0 6px 2px rgba(255,255,255,0.8)',
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
      animate={{
        x: [0, x * 0.5, x],
        y: [0, y * 0.5 - 30, y - 60],
        opacity: [0, 1, 0],
        scale: [0, 1.5, 0],
      }}
      transition={{
        duration: 2,
        delay,
        ease: 'easeOut',
      }}
    />
  )
}

// Magic particle for envelope opening
function MagicParticle({ delay, x }: { delay: number; x: number }) {
  const colors = ['#FFD700', '#FFF8DC', '#FFFACD', '#F0E68C']
  const color = colors[Math.floor(Math.random() * colors.length)]

  return (
    <motion.div
      className="fixed pointer-events-none rounded-full"
      style={{
        left: `${x}%`,
        bottom: '30%',
        width: 4 + Math.random() * 4,
        height: 4 + Math.random() * 4,
        background: color,
        boxShadow: `0 0 10px ${color}`,
      }}
      initial={{ y: 0, opacity: 0 }}
      animate={{
        y: -200 - Math.random() * 200,
        opacity: [0, 1, 1, 0],
        x: (Math.random() - 0.5) * 100,
      }}
      transition={{
        duration: 2 + Math.random() * 2,
        delay,
        ease: 'easeOut',
      }}
    />
  )
}

// Star burst effect for envelope opening
function StarBurst({ delay }: { delay: number }) {
  return (
    <motion.div
      className="fixed pointer-events-none text-4xl"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ scale: 0, opacity: 0, rotate: 0 }}
      animate={{
        scale: [0, 2, 0],
        opacity: [0, 1, 0],
        rotate: [0, 180],
      }}
      transition={{
        duration: 1.5,
        delay,
        ease: 'easeOut',
      }}
    >
      ✨
    </motion.div>
  )
}

// Ink writing effect - words appear as if being written
function InkWriteText({ text, delay = 0 }: { text: string; delay?: number }) {
  // Strip HTML and split into words
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const words = plainText.split(' ')

  return (
    <p style={{ fontFamily: "var(--font-caveat), 'Caveat', cursive", fontSize: '24px', lineHeight: 1.8, color: '#2a2520' }}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: delay + i * 0.06,
            duration: 0.25,
            ease: 'easeOut',
          }}
          style={{ display: 'inline-block', marginRight: '0.3em' }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  )
}

// Vintage postmark stamp
function Postmark({ date, location }: { date: string; location: string | null }) {
  const formattedDate = format(new Date(date), 'dd.MM.yy')
  const displayLocation = location || 'SOMEWHERE'

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: 80,
        height: 80,
        transform: 'rotate(-12deg)',
      }}
    >
      {/* Outer circle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '3px solid rgba(139, 69, 69, 0.5)',
        }}
      />
      {/* Inner circle */}
      <div
        style={{
          position: 'absolute',
          inset: 6,
          borderRadius: '50%',
          border: '2px solid rgba(139, 69, 69, 0.4)',
        }}
      />
      {/* Text */}
      <div className="text-center" style={{ color: 'rgba(139, 69, 69, 0.6)' }}>
        <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: 1 }}>
          {displayLocation.toUpperCase().slice(0, 10)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 'bold', marginTop: 2 }}>
          {formattedDate}
        </div>
      </div>
      {/* Wavy lines */}
      <div
        style={{
          position: 'absolute',
          right: -30,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 40,
          height: 30,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 2,
              background: 'rgba(139, 69, 69, 0.4)',
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// Vintage stamp
function PostageStamp({ themeName }: { themeName: ThemeName }) {
  const stamp = themeStamps[themeName] || themeStamps.rivendell

  return (
    <div
      style={{
        width: 60,
        height: 72,
        background: '#f8f4f0',
        border: '2px dashed rgba(139, 115, 85, 0.4)',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 4 }}>{stamp.icon}</div>
      <div
        style={{
          fontSize: 8,
          fontWeight: 'bold',
          color: stamp.color,
          letterSpacing: 1,
        }}
      >
        HEARTH
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 'bold',
          color: '#8B7355',
          marginTop: 2,
        }}
      >
        ₹ 5
      </div>
    </div>
  )
}

export default function LetterArrivedBanner({ nickname }: LetterArrivedBannerProps) {
  const { theme, themeName } = useThemeStore()
  const [arrivedLetters, setArrivedLetters] = useState<ArrivedLetter[]>([])
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [envelopePhase, setEnvelopePhase] = useState<'closed' | 'opening' | 'open' | 'reading'>('closed')
  const [particles, setParticles] = useState<{ id: number; x: number; delay: number }[]>([])
  const [hasChecked, setHasChecked] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const letterCaptureRef = useRef<HTMLDivElement>(null)
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  // The envelope-phase animation schedules three setTimeouts per open/close.
  // Earlier these were bare and uncancelled — opening then quickly closing
  // (or unmounting) left the timers ticking and called setEnvelopePhase on
  // a dead instance. Track them so we can drain on unmount and on each new
  // sequence.
  const phaseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearPhaseTimeouts = useCallback(() => {
    for (const t of phaseTimeoutsRef.current) clearTimeout(t)
    phaseTimeoutsRef.current = []
  }, [])
  useEffect(() => {
    return () => {
      clearPhaseTimeouts()
    }
  }, [clearPhaseTimeouts])

  // Check for arrived letters
  const checkForLetters = useCallback(async () => {
    try {
      const viewedSet = parseViewedIds(sessionStorage.getItem('viewedLetterIds'))

      const res = await fetch('/api/letters/arrived')
      if (res.ok) {
        const data = await res.json()
        // Decrypt E2EE letters client-side; non-e2ee passes through unchanged.
        const decryptedLetters = (await decryptEntriesFromServer(
          (data.letters || []) as unknown as JournalEntry[]
        )) as unknown as ArrivedLetter[]
        const unviewedLetters = decryptedLetters.filter(
          (letter) => !viewedSet.has(letter.id)
        )
        setArrivedLetters(unviewedLetters)
      }
    } catch (error) {
      console.error('Failed to check for arrived letters:', error)
    } finally {
      setHasChecked(true)
    }
  }, [decryptEntriesFromServer])

  useEffect(() => {
    if (!hasChecked) {
      checkForLetters()
    }
  }, [checkForLetters, hasChecked, isE2EEReady])

  const currentLetter = arrivedLetters[currentLetterIndex]
  const displayName = nickname || 'me'

  // Download letter as image
  const handleDownloadLetter = useCallback(async () => {
    if (!letterCaptureRef.current || !currentLetter) return

    setIsDownloading(true)
    try {
      const element = letterCaptureRef.current

      // Make visible for capture - position behind the modal backdrop
      element.style.position = 'fixed'
      element.style.left = '50%'
      element.style.top = '50%'
      element.style.transform = 'translate(-50%, -50%)'
      element.style.zIndex = '50'  // Behind the modal (z-100)
      element.style.opacity = '1'
      element.style.pointerEvents = 'none'

      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 200))

      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(element, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#faf8f5',
      })

      // Hide again
      element.style.position = 'absolute'
      element.style.left = '-9999px'
      element.style.top = '0'
      element.style.transform = 'none'
      element.style.zIndex = 'auto'
      element.style.opacity = '1'

      const link = document.createElement('a')
      link.download = `letter-${format(new Date(currentLetter.createdAt), 'yyyy-MM-dd')}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error('Failed to download letter:', error)
    } finally {
      setIsDownloading(false)
    }
  }, [currentLetter])

  const handleOpenLetter = () => {
    setShowModal(true)
    setEnvelopePhase('closed')

    // Generate particles
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: 30 + Math.random() * 40,
      delay: 1.5 + Math.random() * 0.5,
    }))
    setParticles(newParticles)

    // Animate through phases. Cancel any in-flight phase timers first so a
    // rapid open/close/open doesn't queue stale state updates.
    clearPhaseTimeouts()
    phaseTimeoutsRef.current.push(
      setTimeout(() => setEnvelopePhase('opening'), 500),
      setTimeout(() => setEnvelopePhase('open'), 1500),
      setTimeout(() => setEnvelopePhase('reading'), 2500),
    )
  }

  const handleCloseLetter = async () => {
    const currentLetter = arrivedLetters[currentLetterIndex]
    if (currentLetter) {
      // Mark as viewed in sessionStorage
      const viewedSet = parseViewedIds(sessionStorage.getItem('viewedLetterIds'))
      viewedSet.add(currentLetter.id)
      sessionStorage.setItem('viewedLetterIds', JSON.stringify([...viewedSet]))

      // Mark as viewed in database so it shows in Letters tab
      try {
        await fetch(`/api/letters/${currentLetter.id}/viewed`, { method: 'POST' })
      } catch (error) {
        console.error('Failed to mark letter as viewed:', error)
      }
    }

    if (currentLetterIndex < arrivedLetters.length - 1) {
      setCurrentLetterIndex(currentLetterIndex + 1)
      setEnvelopePhase('closed')
      clearPhaseTimeouts()
      phaseTimeoutsRef.current.push(
        setTimeout(() => setEnvelopePhase('opening'), 500),
        setTimeout(() => setEnvelopePhase('open'), 1500),
        setTimeout(() => setEnvelopePhase('reading'), 2500),
      )
    } else {
      setShowModal(false)
      setEnvelopePhase('closed')
      setParticles([])
      setArrivedLetters([])
      clearPhaseTimeouts()
    }
  }

  // Don't render if no letters
  if (arrivedLetters.length === 0) return null

  return (
    <>
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <motion.button
          onClick={handleOpenLetter}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full p-4 rounded-2xl text-center cursor-pointer relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${theme.accent.primary}20, ${theme.accent.warm}20)`,
            border: `1px solid ${theme.accent.primary}40`,
          }}
        >
          {/* Subtle shimmer effect */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent, ${theme.accent.warm}10, transparent)`,
            }}
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />

          <motion.div
            animate={{
              y: [0, -5, 0],
              rotate: [0, -5, 5, 0],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="text-3xl mb-2"
          >
            ✉️
          </motion.div>
          <h2
            className="text-lg font-medium mb-1"
            style={{ color: theme.text.primary }}
          >
            A letter from the past has arrived
          </h2>
          <p
            className="text-sm"
            style={{ color: theme.text.muted }}
          >
            {arrivedLetters.length > 1
              ? `${arrivedLetters.length} letters are waiting for you`
              : 'tap to open'
            }
          </p>
        </motion.button>
      </motion.div>

      {/* Modal with envelope animation */}
      <AnimatePresence>
        {showModal && currentLetter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
            style={{ background: 'rgba(5,5,15,0.98)', paddingTop: '80px' }}
          >
            {/* Magic particles */}
            {particles.map((p) => (
              <MagicParticle key={p.id} delay={p.delay} x={p.x} />
            ))}

            {/* Star bursts */}
            {envelopePhase === 'open' && (
              <>
                <StarBurst delay={0} />
                <StarBurst delay={0.2} />
                <StarBurst delay={0.4} />
              </>
            )}

            {/* Envelope animation container */}
            <div className="relative flex items-center justify-center w-full h-full p-4 pb-6 overflow-hidden">

              {/* Closed/Opening Envelope */}
              <AnimatePresence>
                {(envelopePhase === 'closed' || envelopePhase === 'opening') && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative"
                  >
                    {/* Envelope body */}
                    <motion.div
                      className="w-64 h-44 relative"
                      style={{
                        background: `linear-gradient(135deg, ${theme.accent.warm}40, ${theme.accent.primary}30)`,
                        borderRadius: 8,
                        border: `2px solid ${theme.accent.warm}60`,
                      }}
                    >
                      {/* Envelope flap */}
                      <motion.div
                        className="absolute -top-px left-0 right-0"
                        style={{
                          height: 80,
                          background: `linear-gradient(135deg, ${theme.accent.warm}50, ${theme.accent.primary}40)`,
                          borderRadius: '8px 8px 0 0',
                          transformOrigin: 'top center',
                          clipPath: 'polygon(0 0, 50% 100%, 100% 0)',
                          border: `2px solid ${theme.accent.warm}60`,
                        }}
                        animate={{
                          rotateX: envelopePhase === 'opening' ? 180 : 0,
                        }}
                        transition={{ duration: 0.8, ease: 'easeInOut' }}
                      />

                      {/* Wax seal */}
                      <motion.div
                        className="absolute top-12 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full flex items-center justify-center text-xl"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, #c41e3a, #8b0000)`,
                          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                        }}
                        animate={{
                          scale: envelopePhase === 'opening' ? [1, 1.2, 0] : 1,
                          opacity: envelopePhase === 'opening' ? [1, 1, 0] : 1,
                        }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      >
                        ♥
                      </motion.div>

                      {/* Letter peeking out */}
                      <motion.div
                        className="absolute top-4 left-4 right-4 bottom-4 rounded"
                        style={{
                          background: theme.bg.secondary,
                          border: `1px solid ${theme.glass.border}`,
                        }}
                        animate={{
                          y: envelopePhase === 'opening' ? -60 : 0,
                        }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                      />
                    </motion.div>

                    <motion.p
                      className="text-center mt-6 text-lg"
                      style={{ color: theme.text.muted }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      {envelopePhase === 'closed' ? 'opening...' : 'revealing...'}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Open state - show glow */}
              <AnimatePresence>
                {envelopePhase === 'open' && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 3, 0], opacity: [0, 1, 0] }}
                    transition={{ duration: 1 }}
                    className="absolute w-32 h-32 rounded-full"
                    style={{
                      background: `radial-gradient(circle, ${theme.accent.warm}80, transparent)`,
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Reading phase - Vintage Postcard Design */}
              <AnimatePresence>
                {envelopePhase === 'reading' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0, rotateY: -10 }}
                    animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', duration: 0.8 }}
                    className="relative mx-4 flex flex-col items-center"
                    style={{
                      width: '95vw',
                      maxWidth: '900px',
                      maxHeight: 'calc(100vh - 120px)',
                      perspective: '1000px',
                    }}
                  >
                    {/* Floating sparkles */}
                    {Array.from({ length: 12 }).map((_, i) => (
                      <FloatingSparkle key={i} delay={0.1 * i} index={i} />
                    ))}

                    {/* Postcard container */}
                    <motion.div
                      initial={{ rotateX: -5 }}
                      animate={{ rotateX: 0 }}
                      transition={{ duration: 0.5 }}
                      className="relative flex-1 w-full flex flex-col overflow-hidden min-h-0"
                    >
                      {/* Postcard shadow */}
                      <div
                        className="absolute inset-0 rounded-sm"
                        style={{
                          background: 'rgba(0,0,0,0.25)',
                          filter: 'blur(25px)',
                          transform: 'translateY(15px) rotate(1deg)',
                        }}
                      />

                      {/* Main postcard */}
                      <div
                        className="relative rounded-sm flex-1 flex flex-col overflow-hidden min-h-0"
                        style={{
                          background: '#f5f0e6',
                          boxShadow: `
                            0 1px 2px rgba(0,0,0,0.08),
                            0 4px 8px rgba(0,0,0,0.08),
                            0 8px 16px rgba(0,0,0,0.1),
                            inset 0 0 60px rgba(139,119,101,0.04)
                          `,
                          border: '1px solid #e0d5c5',
                        }}
                      >
                        {/* Paper texture overlay */}
                        <div
                          className="absolute inset-0 pointer-events-none opacity-40"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                          }}
                        />

                        {/* Worn edge effect - top */}
                        <div
                          className="absolute top-0 left-0 right-0 h-2 pointer-events-none"
                          style={{
                            background: 'linear-gradient(to bottom, rgba(139,115,85,0.08), transparent)',
                          }}
                        />

                        {/* Fold line in the middle */}
                        <div
                          className="absolute left-[5%] right-[5%] top-1/2 h-px pointer-events-none"
                          style={{
                            background: 'rgba(139,115,85,0.08)',
                            boxShadow: '0 1px 0 rgba(255,255,255,0.5)',
                          }}
                        />

                        {/* Postcard header with stamp and postmark */}
                        <div className="relative pt-4 pb-3 px-6 shrink-0">
                          {/* Stamp and Postmark row */}
                          <div className="flex justify-between items-start mb-4">
                            {/* Left side - decorative */}
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 }}
                              className="text-xs uppercase tracking-widest"
                              style={{ color: 'rgba(139,115,85,0.5)' }}
                            >
                              Postcard
                            </motion.div>

                            {/* Right side - Stamp and Postmark */}
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.2, type: 'spring' }}
                              className="flex items-start gap-2"
                            >
                              <Postmark date={currentLetter.createdAt} location={currentLetter.letterLocation} />
                              <PostageStamp themeName={themeName} />
                            </motion.div>
                          </div>

                          {/* Letter count indicator */}
                          {arrivedLetters.length > 1 && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.4 }}
                              className="flex items-center gap-2 justify-center"
                            >
                              {arrivedLetters.map((_, i) => (
                                <div
                                  key={i}
                                  className="w-2 h-2 rounded-full transition-all"
                                  style={{
                                    background: i === currentLetterIndex ? '#8B7355' : '#d4c4b0',
                                    transform: i === currentLetterIndex ? 'scale(1.3)' : 'scale(1)',
                                  }}
                                />
                              ))}
                            </motion.div>
                          )}
                        </div>

                        {/* Divider line */}
                        <div
                          className="mx-6 h-px"
                          style={{ background: 'rgba(139,115,85,0.15)' }}
                        />

                        {/* Scrollable content area */}
                        <div className="flex-1 overflow-y-auto px-8 py-6">
                          {/* Letter salutation - with ink effect */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="mb-4"
                          >
                            <p
                              style={{
                                fontFamily: "var(--font-caveat), 'Caveat', cursive",
                                fontSize: '28px',
                                color: '#2a2520',
                              }}
                            >
                              Dear future {displayName},
                            </p>
                          </motion.div>

                          {/* Letter content - ink writing effect */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                          >
                            <InkWriteText text={currentLetter.text} delay={0.8} />
                          </motion.div>

                          {/* Letter signature */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.5 }}
                            className="mt-8 text-right"
                          >
                            <p
                              style={{
                                fontFamily: "var(--font-caveat), 'Caveat', cursive",
                                fontSize: '22px',
                                color: '#4a3f35',
                              }}
                            >
                              — Past {displayName}
                            </p>
                            <p
                              className="text-xs mt-1 italic"
                              style={{ color: 'rgba(139,115,85,0.6)' }}
                            >
                              {format(new Date(currentLetter.createdAt), 'MMMM d, yyyy')}
                              {currentLetter.letterLocation && ` • ${currentLetter.letterLocation}`}
                            </p>
                          </motion.div>

                          {/* Photos */}
                          {currentLetter?.photos && currentLetter.photos.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 1.8 }}
                              style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}
                            >
                              {currentLetter.photos.map((photo, i) => (
                                <div
                                  key={i}
                                  style={{
                                    transform: `rotate(${photo.rotation || (i === 0 ? 7 : -7)}deg)`,
                                    padding: '6px 6px 20px 6px',
                                    background: 'white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                    width: 100,
                                  }}
                                >
                                  <img
                                    src={photo.url}
                                    alt=""
                                    style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover' }}
                                  />
                                </div>
                              ))}
                            </motion.div>
                          )}

                          {/* Doodle */}
                          {currentLetter?.doodles && currentLetter.doodles.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 1.9 }}
                              style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}
                            >
                              <DoodlePreview strokes={currentLetter.doodles[0].strokes} size={180} />
                            </motion.div>
                          )}

                          {/* Music */}
                          {currentLetter?.song && isMusicUrl(currentLetter.song) && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 2.0 }}
                              style={{ marginTop: '24px' }}
                            >
                              <SongEmbed url={currentLetter.song} compact />
                            </motion.div>
                          )}
                        </div>

                        {/* Decorative bottom edge */}
                        <div
                          className="h-3 shrink-0"
                          style={{
                            background: 'linear-gradient(to top, rgba(139,115,85,0.06), transparent)',
                          }}
                        />
                      </div>
                    </motion.div>

                    {/* Action buttons */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.8 }}
                      className="flex justify-center gap-3 mt-4 shrink-0"
                    >
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleDownloadLetter}
                        disabled={isDownloading}
                        className="px-6 py-3 rounded-full text-sm font-medium flex items-center gap-2 relative overflow-hidden"
                        style={{
                          background: '#f5f0e6',
                          border: '1px solid rgba(139,115,85,0.3)',
                          color: '#5a4a3e',
                          boxShadow: '0 4px 12px rgba(139,115,85,0.15)',
                          opacity: isDownloading ? 0.7 : 1,
                        }}
                      >
                        {isDownloading ? (
                          <>
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            >
                              ✦
                            </motion.span>
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '14px' }}>📷</span>
                            <span>Save</span>
                          </>
                        )}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCloseLetter}
                        className="px-8 py-3 rounded-full text-sm font-medium relative overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, #8B7355 0%, #6b5a45 100%)',
                          color: '#fff',
                          boxShadow: '0 4px 15px rgba(139,115,85,0.3)',
                        }}
                      >
                        <span className="relative z-10">
                          {currentLetterIndex < arrivedLetters.length - 1
                            ? 'Next Letter →'
                            : 'Close & Keep'
                          }
                        </span>
                      </motion.button>
                    </motion.div>

                    {/* Hidden capture element for download - Postcard style */}
                    <div
                      ref={letterCaptureRef}
                      style={{
                        position: 'absolute',
                        left: '-9999px',
                        top: 0,
                        width: '900px',
                        minWidth: '900px',
                        background: '#f5f0e6',
                        borderRadius: '8px',
                        border: '1px solid #e0d5c5',
                        padding: '32px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      }}
                    >
                      {/* Paper texture overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0.3,
                          borderRadius: '8px',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                          pointerEvents: 'none',
                        }}
                      />

                      {/* Header with stamp area */}
                      <div
                        style={{
                          position: 'relative',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '24px',
                          paddingBottom: '20px',
                          borderBottom: '1px solid rgba(139,115,85,0.2)',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: 'rgba(139,115,85,0.6)', textTransform: 'uppercase', letterSpacing: '3px', fontWeight: '500' }}>
                          Postcard
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexShrink: 0 }}>
                          {/* Postmark for capture */}
                          <div
                            style={{
                              width: '80px',
                              height: '80px',
                              borderRadius: '50%',
                              border: '3px solid rgba(139,69,69,0.5)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transform: 'rotate(-15deg)',
                              position: 'relative',
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                inset: '4px',
                                borderRadius: '50%',
                                border: '2px solid rgba(139,69,69,0.3)',
                              }}
                            />
                            <span style={{ fontSize: '10px', color: 'rgba(139,69,69,0.6)', fontWeight: 'bold', letterSpacing: '1px' }}>
                              {(currentLetter?.letterLocation || 'SOMEWHERE').toUpperCase().slice(0, 8)}
                            </span>
                            <span style={{ fontSize: '14px', color: 'rgba(139,69,69,0.6)', fontWeight: 'bold', marginTop: '2px' }}>
                              {currentLetter && format(new Date(currentLetter.createdAt), 'dd.MM.yy')}
                            </span>
                          </div>
                          {/* Stamp for capture */}
                          <div
                            style={{
                              width: '65px',
                              height: '78px',
                              background: 'linear-gradient(145deg, #faf8f5, #f0ebe0)',
                              border: '3px dashed rgba(139,115,85,0.5)',
                              borderRadius: '3px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                            }}
                          >
                            <span style={{ fontSize: '28px', marginBottom: '4px' }}>{themeStamps[themeName]?.icon || '🍃'}</span>
                            <span style={{ fontSize: '8px', color: themeStamps[themeName]?.color || '#5E8B5A', fontWeight: 'bold', letterSpacing: '1px' }}>HEARTH</span>
                            <span style={{ fontSize: '10px', color: '#8B7355', fontWeight: 'bold', marginTop: '2px' }}>₹ 5</span>
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <div style={{ position: 'relative', padding: '12px 0' }}>
                        <p
                          style={{
                            fontSize: '32px',
                            fontFamily: "var(--font-caveat), 'Caveat', cursive",
                            color: '#2a2520',
                            marginBottom: '24px',
                          }}
                        >
                          Dear future {displayName},
                        </p>

                        <div
                          style={{
                            fontFamily: "var(--font-caveat), 'Caveat', cursive",
                            fontSize: '26px',
                            lineHeight: 1.9,
                            color: '#2a2520',
                          }}
                          dangerouslySetInnerHTML={{ __html: sanitizeLetterClient(currentLetter?.text) }}
                        />

                        <div style={{ marginTop: '40px', textAlign: 'right' }}>
                          <p
                            style={{
                              fontSize: '26px',
                              fontFamily: "var(--font-caveat), 'Caveat', cursive",
                              color: '#4a3f35',
                            }}
                          >
                            — Past {displayName}
                          </p>
                          <p
                            style={{
                              fontSize: '13px',
                              marginTop: '6px',
                              color: 'rgba(139,115,85,0.6)',
                              fontStyle: 'italic',
                            }}
                          >
                            {currentLetter && format(new Date(currentLetter.createdAt), 'MMMM d, yyyy')}
                            {currentLetter?.letterLocation && ` • ${currentLetter.letterLocation}`}
                          </p>
                        </div>

                        {/* Photos - capture */}
                        {currentLetter?.photos && currentLetter.photos.length > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
                            {currentLetter.photos.map((photo, i) => (
                              <div
                                key={i}
                                style={{
                                  transform: `rotate(${photo.rotation || (i === 0 ? 7 : -7)}deg)`,
                                  padding: '6px 6px 20px 6px',
                                  background: 'white',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                  width: 100,
                                }}
                              >
                                <img
                                  src={photo.url}
                                  alt=""
                                  style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover' }}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Doodle - capture */}
                        {currentLetter?.doodles && currentLetter.doodles.length > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
                            <DoodlePreview strokes={currentLetter.doodles[0].strokes} size={180} />
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div
                        style={{
                          position: 'relative',
                          marginTop: '24px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(139,115,85,0.15)',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: '11px', color: 'rgba(139,115,85,0.5)', letterSpacing: '3px', fontWeight: '500' }}>
                          HEARTH • A LETTER FROM THE PAST
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
