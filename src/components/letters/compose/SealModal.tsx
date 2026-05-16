'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

// PRELAUNCH-TEST-PILLS: '5m' and '1h' exist on BOTH SelfPill and FriendPill
// so the team can smoke-test delivery without waiting a week. Remove them
// (and the matching server lead-time relaxations in /api/letters/self
// + /api/letters/friend) before public launch. Grep for
// "PRELAUNCH-TEST-PILLS" to find every spot.
type SelfPill = '5m' | '1h' | '1w' | '1m' | '6m' | '1y' | 'custom'
type FriendPill = '5m' | '1h' | '1w' | '2w' | '30d' | 'custom'

function dateForSelf(p: Exclude<SelfPill, 'custom'>): Date {
  const now = Date.now()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (p === '5m') return new Date(now + 5 * minute)
  if (p === '1h') return new Date(now + hour)
  if (p === '1w') return new Date(now + 7 * day)
  if (p === '1m') return new Date(now + 30 * day)
  if (p === '6m') return new Date(now + 182 * day)
  return new Date(now + 365 * day)
}

function dateForFriend(p: Exclude<FriendPill, 'custom'>): Date {
  const now = Date.now()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (p === '5m') return new Date(now + 5 * minute)
  if (p === '1h') return new Date(now + hour)
  if (p === '1w') return new Date(now + 7 * day)
  if (p === '2w') return new Date(now + 14 * day)
  return new Date(now + 30 * day)
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function labelForSelf(p: SelfPill): string {
  return p === '5m'
    ? '5 min (test)'
    : p === '1h'
    ? '1 hr (test)'
    : p === '1w'
    ? '1 week'
    : p === '1m'
    ? '1 month'
    : p === '6m'
    ? '6 months'
    : p === '1y'
    ? '1 year'
    : 'custom'
}

function labelForFriend(p: FriendPill): string {
  return p === '5m'
    ? '5 min (test)'
    : p === '1h'
    ? '1 hr (test)'
    : p === '1w'
    ? '1 week'
    : p === '2w'
    ? '2 weeks'
    : p === '30d'
    ? '30 days'
    : 'custom'
}

export function SealModal({
  recipient,
  onClose,
  onSealed,
  onSeal,
}: {
  recipient: 'self' | 'friend'
  onClose: () => void
  onSealed: () => void
  onSeal: (data: { unlockDate: Date; recipientEmail?: string }) => Promise<void>
}) {
  const theme = useThemeStore((s) => s.theme)

  const [selfPill, setSelfPill] = useState<SelfPill>('1m')
  const [selfCustom, setSelfCustom] = useState<string>('')

  const [friendPill, setFriendPill] = useState<FriendPill>('1w')
  const [friendCustom, setFriendCustom] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'form' | 'folding' | 'sealed'>('form')

  const maxFriendDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const maxFriendIso = maxFriendDate.toISOString().split('T')[0]
  // Both self and friend letters enforce a 1-week minimum — friend letters
  // additionally have a 30-day ceiling enforced separately. The seal API
  // accepts whatever the client sends, so this min= attribute is the only
  // client-side floor for custom dates.
  const minIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  function resolveDate(): Date | null {
    if (recipient === 'self') {
      if (selfPill !== 'custom') return dateForSelf(selfPill)
      if (!selfCustom) return null
      return new Date(selfCustom + 'T12:00:00')
    }
    if (friendPill !== 'custom') return dateForFriend(friendPill)
    if (!friendCustom) return null
    return new Date(friendCustom + 'T12:00:00')
  }

  useEffect(() => {
    if (phase !== 'form') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  async function handleConfirm() {
    setError(null)
    const date = resolveDate()
    if (!date || Number.isNaN(date.valueOf())) {
      setError('Pick a date.')
      return
    }
    if (recipient === 'friend') {
      if (date > maxFriendDate) {
        setError('Friend letters must arrive within 30 days.')
        return
      }
      if (!EMAIL_REGEX.test(email.trim())) {
        setError('Enter a valid email.')
        return
      }
    }

    setBusy(true)
    try {
      await onSeal({
        unlockDate: date,
        recipientEmail: recipient === 'friend' ? email.trim() : undefined,
      })
      setPhase('folding')
      setTimeout(() => {
        setPhase('sealed')
        setTimeout(() => onSealed(), 700)
      }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.30)' }}
        onClick={phase === 'form' ? onClose : undefined}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={recipient === 'self' ? 'Seal letter to self' : 'Seal letter to friend'}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
          style={{
            backgroundColor: theme.bg.primary,
            color: theme.text.primary,
          }}
        >
          {phase === 'form' && (
            <>
              <h3 className="font-serif text-xl mb-5 italic text-center">
                {recipient === 'self'
                  ? 'When should this find you?'
                  : 'When should it arrive?'}
              </h3>

              {recipient === 'friend' && (
                <>
                  <label
                    className="block text-xs uppercase tracking-wider mb-2"
                    style={{ color: theme.text.muted }}
                  >
                    Their email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@example.com"
                    className="w-full px-4 py-3 mb-5 rounded-xl outline-none"
                    style={{
                      border: `1px solid ${theme.text.primary}33`,
                      backgroundColor: `${theme.bg.primary}b3`,
                      color: theme.text.primary,
                    }}
                  />
                </>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                {recipient === 'self'
                  // PRELAUNCH-TEST-PILLS: drop '5m' and '1h' before public launch.
                  ? (['5m', '1h', '1w', '1m', '6m', '1y', 'custom'] as SelfPill[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelfPill(p)}
                        className="px-3 py-1.5 rounded-full text-sm"
                        style={{
                          backgroundColor:
                            selfPill === p
                              ? theme.accent.primary
                              : 'transparent',
                          color:
                            selfPill === p ? theme.bg.primary : theme.text.primary,
                          border: `1px solid ${theme.text.primary}33`,
                        }}
                      >
                        {labelForSelf(p)}
                      </button>
                    ))
                  // PRELAUNCH-TEST-PILLS: drop '5m' and '1h' before public launch.
                  : (['5m', '1h', '1w', '2w', '30d', 'custom'] as FriendPill[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFriendPill(p)}
                        className="px-3 py-1.5 rounded-full text-sm"
                        style={{
                          backgroundColor:
                            friendPill === p
                              ? theme.accent.primary
                              : 'transparent',
                          color:
                            friendPill === p
                              ? theme.bg.primary
                              : theme.text.primary,
                          border: `1px solid ${theme.text.primary}33`,
                        }}
                      >
                        {labelForFriend(p)}
                      </button>
                    ))}
              </div>

              {recipient === 'self' && selfPill === 'custom' && (
                <input
                  type="date"
                  value={selfCustom}
                  min={minIso}
                  onChange={(e) => setSelfCustom(e.target.value)}
                  className="w-full px-4 py-3 mb-3 rounded-xl outline-none"
                  style={{
                    border: `1px solid ${theme.text.primary}33`,
                    backgroundColor: `${theme.bg.primary}b3`,
                    color: theme.text.primary,
                  }}
                />
              )}
              {recipient === 'friend' && friendPill === 'custom' && (
                <input
                  type="date"
                  value={friendCustom}
                  min={minIso}
                  max={maxFriendIso}
                  onChange={(e) => setFriendCustom(e.target.value)}
                  className="w-full px-4 py-3 mb-3 rounded-xl outline-none"
                  style={{
                    border: `1px solid ${theme.text.primary}33`,
                    backgroundColor: `${theme.bg.primary}b3`,
                    color: theme.text.primary,
                  }}
                />
              )}

              {error && (
                <p className="text-sm mb-3 text-center" style={{ color: '#b91c1c' }}>
                  {error}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={phase === 'form' && !busy ? onClose : undefined}
                  className="text-sm"
                  style={{ color: theme.text.primary, opacity: 0.7 }}
                >
                  cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirm}
                  className="px-5 py-2.5 rounded-full text-sm disabled:opacity-30"
                  style={{
                    backgroundColor: theme.accent.primary,
                    color: theme.bg.primary,
                  }}
                >
                  {busy
                    ? 'sealing...'
                    : recipient === 'self'
                    ? 'seal it.'
                    : 'seal and send.'}
                </button>
              </div>
            </>
          )}

          {phase !== 'form' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center font-serif italic text-lg"
              style={{ color: theme.text.primary }}
            >
              {phase === 'folding' ? 'folding...' : 'sealed.'}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
