'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useAuthStore } from '@/store/auth'

/**
 * Confirm dialog for requesting account deletion. Requires the user to type
 * their exact email, captures an optional reason, then POSTs to
 * /api/account/delete-request. On success the user is signed out (deletion is
 * processed manually by an operator after the 14-day window).
 */
export default function DeleteAccountModal({
  userEmail,
  onClose,
}: {
  userEmail: string
  onClose: () => void
}) {
  const { theme } = useThemeStore()
  const logout = useAuthStore((s) => s.logout)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim().toLowerCase() === userEmail.toLowerCase()

  const handleDelete = async () => {
    if (!matches || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: typed.trim(), reason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      // Signed-in session no longer needed — log out and leave.
      await logout()
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full rounded-2xl p-6"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
          backdropFilter: 'blur(12px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-light mb-3" style={{ color: theme.text.primary }}>
          Delete your account
        </h2>
        <p className="text-sm leading-relaxed mb-2" style={{ color: theme.text.muted }}>
          This schedules your account for permanent deletion in{' '}
          <strong style={{ color: theme.text.primary }}>14 days</strong>. Your journal, letters,
          scrapbook, and photos will all be erased.
        </p>
        <p className="text-sm leading-relaxed mb-4" style={{ color: theme.text.muted }}>
          Changed your mind before then? Email us and we&apos;ll cancel the request — nothing is
          deleted until that date.
        </p>

        <label className="block text-xs mb-1" style={{ color: theme.text.muted }}>
          Anything you&apos;d like us to know? (optional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why are you leaving?"
          className="w-full px-3 py-2 rounded-lg mb-4 text-sm outline-none resize-none"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.primary,
          }}
        />

        <p className="text-sm leading-relaxed mb-2" style={{ color: theme.text.muted }}>
          Type your email{' '}
          <strong style={{ color: theme.text.primary }}>{userEmail}</strong> to confirm.
        </p>
        <input
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-3 py-2 rounded-lg mb-3 outline-none"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.primary,
          }}
        />
        {error && <p className="text-sm mb-3" style={{ color: '#f87171' }}>{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-full text-sm"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              color: theme.text.muted,
            }}
          >
            Keep my account
          </button>
          <button
            onClick={handleDelete}
            disabled={!matches || submitting}
            className="flex-1 py-2.5 rounded-full text-sm font-medium text-white transition-opacity"
            style={{ background: '#dc2626', opacity: !matches || submitting ? 0.4 : 1 }}
          >
            {submitting ? 'Submitting…' : 'Delete forever'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
