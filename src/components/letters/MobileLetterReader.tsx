'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EE } from '@/hooks/useE2EE'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import type { InboxLetter } from './letterTypes'
import type { JournalEntry } from '@/store/journal'

interface Props {
  letter: InboxLetter
  onClose: () => void
  onMarkRead: (id: string) => void
}

/**
 * Mobile-only letter reader. Replaces RevealModal's 320×220 envelope +
 * scale-and-translate ceremony (which broke on small screens) with the
 * same calm scrollable modal we use for memory entries — fade in,
 * decrypt body, show. Marks the letter read on open if it wasn't yet.
 */
export default function MobileLetterReader({ letter, onClose, onMarkRead }: Props) {
  const { theme } = useThemeStore()
  const colors = getGlassDiaryColors(theme)
  const { decryptEntryFromServer, isE2EEReady } = useE2EE()
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBody(null)
    setError(null)

    async function decryptAndSet() {
      try {
        // Inline ciphertext path (Phase-4 native self-letters and any
        // letter where the inbox endpoint includes letter.text).
        if (letter.text !== undefined) {
          const inlineEntry = {
            id: letter.id,
            text: letter.text,
            encryptionType: letter.encryptionType,
            e2eeIVs: letter.e2eeIVs,
          } as unknown as JournalEntry
          const decrypted = await decryptEntryFromServer(inlineEntry)
          let text = (decrypted?.text || '').toString()
          if (text.startsWith('{')) {
            try {
              const parsed = JSON.parse(text) as { text?: unknown }
              if (typeof parsed.text === 'string') text = parsed.text
            } catch {
              // not JSON — keep raw
            }
          }
          if (!cancelled) setBody(text)
          return
        }
        // Legacy fallback for older letters anchored to JournalEntry rows.
        const res = await fetch(`/api/entries/${letter.id}`)
        const d = await res.json()
        const entry = (d?.entry || d) as JournalEntry
        const decrypted = await decryptEntryFromServer(entry)
        if (!cancelled) setBody((decrypted?.text || '').toString())
      } catch {
        if (!cancelled) setError('Could not open this letter.')
      }
    }
    decryptAndSet()

    if (!letter.isViewed) onMarkRead(letter.id)

    return () => { cancelled = true }
  }, [letter, decryptEntryFromServer, isE2EEReady, onMarkRead])

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="max-w-lg mx-auto my-12 px-4"
      >
        <div
          className="rounded-3xl p-6"
          style={{
            background: colors.pageBg,
            backdropFilter: `blur(${colors.pageBlur})`,
            WebkitBackdropFilter: `blur(${colors.pageBlur})`,
            border: `1px solid ${colors.pageBorder}`,
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{
                background: colors.buttonBg,
                color: colors.bodyText,
                border: `1px solid ${colors.buttonBorder}`,
                fontFamily: 'Georgia, serif',
              }}
            >
              Close
            </button>
            <span className="text-xs italic" style={{ color: colors.date, fontFamily: 'Georgia, serif' }}>
              sealed {sealedLabel(letter.sealedAt)}
            </span>
          </div>

          <div className="text-sm mb-3" style={{ color: colors.prompt, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
            A letter from past you to {letter.recipientName || 'you'}
          </div>

          {body === null && !error && (
            <div className="text-sm italic py-6 text-center"
              style={{ color: colors.prompt, fontFamily: 'Georgia, serif' }}>
              Unsealing…
            </div>
          )}

          {error && (
            <div className="text-sm italic py-6 text-center"
              style={{ color: colors.saveButton, fontFamily: 'Georgia, serif' }}>
              {error}
            </div>
          )}

          {body !== null && !error && (
            <div
              className="whitespace-pre-wrap"
              style={{
                color: colors.bodyText,
                fontFamily: 'var(--font-caveat), Georgia, serif',
                fontSize: '21px',
                lineHeight: '34px',
              }}
            >
              {body || (
                <span style={{ color: colors.prompt, fontStyle: 'italic' }}>
                  No text in this letter.
                </span>
              )}
            </div>
          )}

          <div className="mt-6 text-right text-xs italic"
            style={{ color: colors.prompt, fontFamily: 'Georgia, serif' }}>
            yours, me
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function sealedLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}
