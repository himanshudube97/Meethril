'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'
import SongEmbed from '@/components/SongEmbed'

const LETTER_BODY_MAX = 500

type Recipient = 'self' | 'friend'

/**
 * Mobile compose surface for letters. Supports SELF letters only — friend
 * letters need the desktop's security-question/answer flow to wrap their
 * E2EE key for the recipient, and that ceremony doesn't compress cleanly
 * to mobile. Friend tab points the user to desktop.
 *
 * Cross-device contract: LETTER_BODY_MAX shared with desktop (postcard
 * naturally holds about this much) so a phone-written letter renders
 * cleanly on the desktop postcard.
 */
export default function MobileLetterCompose() {
  const { theme } = useThemeStore()
  const router = useRouter()
  const { masterKey, isUnlocked, isEnabled } = useE2EEStore()

  const [recipient, setRecipient] = useState<Recipient>('self')
  const [body, setBody] = useState('')
  const [song, setSong] = useState('')
  const [unlockDate, setUnlockDate] = useState<string>(() => {
    // Default = 1 week from today
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const minUnlockDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7) // Hearth minimum: 1 week
    return d.toISOString().slice(0, 10)
  }, [])

  const canSubmit = recipient === 'self'
    && body.trim().length > 0
    && body.length <= LETTER_BODY_MAX
    && unlockDate >= minUnlockDate
    && !submitting

  const onSubmit = async () => {
    if (!canSubmit) return
    if (!isEnabled || !isUnlocked || !masterKey) {
      setError('Unlock encryption on desktop before writing letters here.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const payload = await buildSelfLetterPayload({
        draft: {
          text: body.trim(),
          song: song && /https?:\/\//.test(song) ? song : null,
          photos: [],
          doodles: [],
          letterLocation: null,
        },
        unlockDate: new Date(unlockDate + 'T00:00:00'),
        masterKey,
      })
      const res = await fetch('/api/letters/self', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Could not save letter.')
      }
      router.push('/letters')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto" style={{ color: theme.text.primary }}>
      <div className="max-w-lg mx-auto px-4 pt-20 pb-12 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between px-12">
          <Link
            href="/letters"
            className="text-xs px-3 py-1.5 rounded-full transition"
            style={{
              background: theme.glass.bg,
              color: theme.text.muted,
              border: `1px solid ${theme.glass.border}`,
              fontFamily: 'Georgia, serif',
            }}
          >
            ← Letters
          </Link>
          <h1
            className="text-lg"
            style={{
              color: theme.text.primary,
              fontFamily: 'var(--font-playfair), Georgia, serif',
            }}
          >
            New Letter
          </h1>
          <div className="w-12" aria-hidden />
        </div>

        {/* Recipient toggle */}
        <div
          className="flex items-center rounded-full p-1 gap-1"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
          }}
        >
          <RecipientButton active={recipient === 'self'} onClick={() => setRecipient('self')}>
            Future me
          </RecipientButton>
          <RecipientButton active={recipient === 'friend'} onClick={() => setRecipient('friend')}>
            Someone close
          </RecipientButton>
        </div>

        {/* Compose card */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-4"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
            boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          }}
        >
          {recipient === 'friend' ? (
            <FriendComposeRedirect />
          ) : (
            <>
              {/* Unlock date */}
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
                  style={{ color: theme.text.muted }}
                >
                  Opens on
                </div>
                <input
                  type="date"
                  value={unlockDate}
                  min={minUnlockDate}
                  onChange={e => setUnlockDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{
                    border: `1px solid ${theme.glass.border}`,
                    color: theme.text.primary,
                    background: 'rgba(255,255,255,0.03)',
                  }}
                />
                <div
                  className="text-[10px] mt-1.5 italic"
                  style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}
                >
                  Earliest: one week from today.
                </div>
              </div>

              {/* Song */}
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
                  style={{ color: theme.text.muted }}
                >
                  Add a Song (optional)
                </div>
                {song && /https?:\/\//.test(song) ? (
                  <div className="relative">
                    <SongEmbed url={song} compact audioOnly />
                    <button
                      onClick={() => setSong('')}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      style={{ background: theme.glass.bg, color: theme.text.muted }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={song}
                    onChange={e => setSong(e.target.value)}
                    placeholder="Paste Spotify, YouTube, or SoundCloud..."
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                    style={{
                      border: `1px solid ${theme.glass.border}`,
                      color: theme.text.primary,
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  />
                )}
              </div>

              {/* Body */}
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
                  style={{ color: theme.text.muted }}
                >
                  Write the letter
                </div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Dear future me…"
                  maxLength={LETTER_BODY_MAX}
                  rows={10}
                  className="w-full resize-y outline-none rounded-lg p-3"
                  style={{
                    color: theme.text.primary,
                    fontFamily: 'var(--font-caveat), Georgia, serif',
                    fontSize: '20px',
                    lineHeight: '30px',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${theme.glass.border}`,
                    minHeight: 240,
                  }}
                />
                <div
                  className="text-right text-[10px] mt-2"
                  style={{ color: body.length > LETTER_BODY_MAX * 0.9 ? theme.accent.warm : theme.text.muted }}
                >
                  {body.length} / {LETTER_BODY_MAX}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="text-xs rounded-lg px-3 py-2"
                  style={{ background: 'rgba(192,57,43,0.12)', color: '#c0392b' }}
                >
                  {error}
                </div>
              )}

              {/* Send */}
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-full text-sm transition"
                style={{
                  background: canSubmit ? theme.accent.primary : `${theme.accent.primary}40`,
                  color: '#fff',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: submitting ? 0.7 : 1,
                  fontFamily: 'Georgia, serif',
                }}
              >
                {submitting ? 'Sealing…' : 'Seal letter'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RecipientButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const { theme } = useThemeStore()
  return (
    <button
      onClick={onClick}
      className="flex-1 text-xs px-3 py-1.5 rounded-full transition"
      style={{
        background: active ? `${theme.accent.primary}30` : 'transparent',
        color: active ? theme.text.primary : theme.text.muted,
        fontFamily: 'Georgia, serif',
      }}
    >
      {children}
    </button>
  )
}

function FriendComposeRedirect() {
  const { theme } = useThemeStore()
  return (
    <div className="text-center px-2 py-4">
      <p
        className="text-sm leading-relaxed mb-4"
        style={{ color: theme.text.primary, fontFamily: 'Georgia, serif' }}
      >
        Letters to friends use a private question only they can answer.
        That ceremony lives on desktop — open Hearth on a laptop to write
        to someone close.
      </p>
      <Link
        href="/letters"
        className="inline-block text-xs px-4 py-2 rounded-full"
        style={{
          background: `${theme.accent.primary}20`,
          color: theme.accent.primary,
          border: `1px solid ${theme.accent.primary}60`,
          fontFamily: 'Georgia, serif',
        }}
      >
        Back to letters
      </Link>
    </div>
  )
}
