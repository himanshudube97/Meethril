'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { useThemeStore } from '@/store/theme'
import { useProfileStore } from '@/store/profile'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'
import { sanitizeLetterClient } from '@/lib/sanitize-letter-client'

interface ArrivedLetter {
  id: string
  text: string
  createdAt: string
  unlockDate: string
  letterLocation: string | null
  encryptionType?: string
  e2eeIVs?: unknown
}

function parseViewedIds(raw: string | null): Set<string> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.map(String))
    return null
  } catch {
    return null
  }
}

// Twinkling star component for the reveal background
function TwinklingStar({ delay, size, x, y }: { delay: number; size: number; x: number; y: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        left: `${x}%`,
        top: `${y}%`,
        background: 'white',
        boxShadow: `0 0 ${size * 2}px ${size / 2}px rgba(255,255,255,0.5)`,
      }}
      animate={{
        opacity: [0.2, 1, 0.2],
        scale: [0.8, 1.2, 0.8],
      }}
      transition={{
        duration: 2 + Math.random() * 2,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

export default function LetterReveal() {
  const { theme } = useThemeStore()
  const { profile, fetchProfile } = useProfileStore()
  const [arrivedLetters, setArrivedLetters] = useState<ArrivedLetter[]>([])
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [viewedLetterIds, setViewedLetterIds] = useState<Set<string>>(new Set())
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  // Fetch profile for nickname
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Generate random stars for background
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    size: 1 + Math.random() * 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
  }))

  // Check for arrived letters on mount
  const checkForLetters = useCallback(async () => {
    try {
      // Get already viewed letters from session storage. Guard the parse so
      // a corrupted/foreign value can't permanently brick the arrived-letter
      // modal — without try/catch a syntax error would skip the rest of this
      // effect and the user would never see a delivered letter.
      const viewedIds = sessionStorage.getItem('viewedLetterIds')
      const parsedViewedIds = parseViewedIds(viewedIds)
      if (parsedViewedIds) {
        setViewedLetterIds(parsedViewedIds)
      }

      const res = await fetch('/api/letters/arrived')
      if (res.ok) {
        const data = await res.json()
        // Decrypt E2EE letters client-side; non-e2ee passes through unchanged.
        const decryptedLetters = (await decryptEntriesFromServer(
          (data.letters || []) as unknown as JournalEntry[]
        )) as unknown as ArrivedLetter[]
        // Filter out already viewed letters
        const viewedSet: Set<string> = parsedViewedIds ?? new Set()
        const unviewedLetters = decryptedLetters.filter(
          (letter) => !viewedSet.has(letter.id)
        )

        if (unviewedLetters.length > 0) {
          setArrivedLetters(unviewedLetters)
          setIsOpen(true)
        }
      }
    } catch (error) {
      console.error('Failed to check for arrived letters:', error)
    } finally {
      setHasChecked(true)
    }
  }, [decryptEntriesFromServer])

  useEffect(() => {
    if (!hasChecked) {
      // Small delay to let the page load first
      const timer = setTimeout(checkForLetters, 1500)
      return () => clearTimeout(timer)
    }
  }, [checkForLetters, hasChecked, isE2EEReady])

  const handleClose = async () => {
    // Mark current letter as viewed
    const currentLetter = arrivedLetters[currentLetterIndex]
    if (currentLetter) {
      const newViewedIds = new Set(viewedLetterIds)
      newViewedIds.add(currentLetter.id)
      setViewedLetterIds(newViewedIds)
      sessionStorage.setItem('viewedLetterIds', JSON.stringify([...newViewedIds]))

      // Mark as viewed in database so it shows in Letters tab
      try {
        await fetch(`/api/letters/${currentLetter.id}/viewed`, { method: 'POST' })
      } catch (error) {
        console.error('Failed to mark letter as viewed:', error)
      }
    }

    // If there are more letters, show the next one
    if (currentLetterIndex < arrivedLetters.length - 1) {
      setCurrentLetterIndex(currentLetterIndex + 1)
    } else {
      setIsOpen(false)
    }
  }

  const currentLetter = arrivedLetters[currentLetterIndex]

  if (!isOpen || !currentLetter) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{ background: 'rgba(5,5,15,0.98)' }}
      >
        {/* Twinkling stars background */}
        <div className="absolute inset-0 overflow-hidden">
          {stars.map((star) => (
            <TwinklingStar key={star.id} {...star} />
          ))}
        </div>

        {/* Envelope opening animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="relative max-w-lg w-full mx-4"
        >
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-6"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="text-5xl mb-4"
            >
              ✨
            </motion.div>
            <h2
              className="text-2xl font-light tracking-wide mb-2"
              style={{ color: theme.text.primary }}
            >
              A letter from the past
            </h2>
            <p className="text-sm" style={{ color: theme.text.muted }}>
              Written on {format(new Date(currentLetter.createdAt), 'MMMM d, yyyy')}
              {currentLetter.letterLocation && ` from ${currentLetter.letterLocation}`}
            </p>
            {arrivedLetters.length > 1 && (
              <p className="text-xs mt-2" style={{ color: theme.accent.warm }}>
                {currentLetterIndex + 1} of {arrivedLetters.length} letters
              </p>
            )}
          </motion.div>

          {/* Letter card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl overflow-hidden max-h-[60vh] overflow-y-auto"
            style={{
              background: `linear-gradient(135deg, ${theme.accent.warm}15, ${theme.accent.primary}08)`,
              border: `1px solid ${theme.accent.warm}30`,
            }}
          >
            {/* Letter header */}
            <div
              className="p-5 border-b"
              style={{ borderColor: `${theme.accent.warm}20` }}
            >
              <span className="text-sm italic" style={{ color: theme.text.muted }}>
                {profile.nickname ? `Dear future ${profile.nickname},` : 'Dear future me,'}
              </span>
            </div>

            {/* Letter content */}
            <div
              className="p-6 prose prose-invert max-w-none"
              style={{
                fontFamily: 'Georgia, Palatino, serif',
                fontSize: '17px',
                lineHeight: 2,
                color: theme.text.primary,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeLetterClient(currentLetter.text) }}
            />

            {/* Letter footer */}
            <div
              className="p-5 border-t"
              style={{ borderColor: `${theme.accent.warm}20` }}
            >
              <p
                className="text-sm italic text-right"
                style={{ color: theme.text.muted }}
              >
                — Past you
              </p>
            </div>
          </motion.div>

          {/* Close button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center mt-6"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClose}
              className="px-8 py-3 rounded-full text-sm font-medium"
              style={{
                background: theme.accent.primary,
                color: theme.bg.primary,
              }}
            >
              {currentLetterIndex < arrivedLetters.length - 1
                ? 'Next Letter'
                : 'Close'
              }
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
