'use client'

import { useEffect, useState } from 'react'
import { useThemeStore } from '@/store/theme'

const STORAGE_KEY = 'hearth.stranger.lastCountry'
const MIN = 10
const MAX = 200

interface Props {
  onSend: (content: string, country?: string, stateName?: string) => Promise<void>
  onDismiss: () => void
}

/**
 * Mobile compose surface for stranger notes. Replaces ComposePaper's
 * 3D folding-paper ceremony with a calm simple form — same 10–200 char
 * window so a note written from a phone reads identically on desktop.
 */
export default function MobileComposePaper({ onSend, onDismiss }: Props) {
  const { theme } = useThemeStore()
  const [text, setText] = useState('')
  const [country, setCountry] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setCountry(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (country) {
      try { localStorage.setItem(STORAGE_KEY, country) } catch {}
    }
  }, [country])

  const trimmed = text.trim()
  const canSend = trimmed.length >= MIN && trimmed.length <= MAX && !submitting

  async function handleSend() {
    if (!canSend) return
    setError(null)
    setSubmitting(true)
    try {
      await onSend(trimmed, country || undefined)
      setText('')
      // Brief pause so the user sees the empty state, then dismiss like
      // desktop does after its fold ceremony.
      setTimeout(onDismiss, 250)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em] font-medium"
        style={{ color: theme.text.muted }}
      >
        Write to a stranger
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="A short note, sent to someone you'll never meet…"
        maxLength={MAX}
        rows={6}
        className="w-full resize-none outline-none rounded-lg p-3"
        style={{
          color: theme.text.primary,
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: '17px',
          lineHeight: '28px',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${theme.glass.border}`,
          minHeight: 140,
        }}
      />
      <div className="flex items-center justify-between text-[10px] italic" style={{ color: theme.text.muted }}>
        <span>{trimmed.length < MIN ? `${MIN - trimmed.length} more to send` : 'ready to send'}</span>
        <span>{text.length} / {MAX}</span>
      </div>

      {/* Optional country postmark — kept short on mobile (text input, no
          24-flag picker grid which doesn't fit a phone). User can paste a
          country name; desktop's picker is still there if they prefer. */}
      <input
        type="text"
        value={country}
        onChange={e => setCountry(e.target.value)}
        placeholder="Postmark country (optional)"
        className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
        style={{
          border: `1px solid ${theme.glass.border}`,
          color: theme.text.primary,
          background: 'rgba(255,255,255,0.03)',
          fontFamily: 'Georgia, serif',
        }}
      />

      {error && (
        <div className="text-xs rounded-lg px-3 py-2"
          style={{ background: 'rgba(192,57,43,0.12)', color: '#c0392b' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={!canSend}
        className="w-full py-3 rounded-full text-sm transition mt-1"
        style={{
          background: canSend ? theme.accent.primary : `${theme.accent.primary}40`,
          color: '#fff',
          cursor: canSend ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.7 : 1,
          fontFamily: 'Georgia, serif',
        }}
      >
        {submitting ? 'Sending…' : 'Send to a stranger'}
      </button>
    </div>
  )
}
