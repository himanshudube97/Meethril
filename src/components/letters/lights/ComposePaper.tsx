'use client'

import { useState, useEffect } from 'react'
import { useThemeStore } from '@/store/theme'

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

interface Props {
  onCancel: () => void
  onSend: (content: string, country?: string, stateName?: string) => Promise<void>
}

export default function ComposePaper({ onCancel, onSend }: Props) {
  const { theme } = useThemeStore()
  const [text, setText] = useState('')
  const [country, setCountry] = useState<string>('')
  const [stateName, setStateName] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const canSend = text.trim().length >= 10 && text.trim().length <= 200 && !sending

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!canSend) return
        setSending(true)
        setError(null)
        try {
          await onSend(text.trim(), country || undefined, stateName || undefined)
          setText('')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not send')
        } finally {
          setSending(false)
        }
      }}
      className="w-full max-w-md rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: theme.glass.bg,
        border: `1px solid ${theme.glass.border}`,
        backdropFilter: `blur(${theme.glass.blur})`,
      }}
    >
      <p className="text-sm opacity-80" style={{ color: theme.text.primary }}>
        Write a small light to a stranger. A gratitude, a hope, a kindness.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        rows={4}
        placeholder="Something warm…"
        className="w-full p-2 rounded-md text-sm resize-none"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
          color: theme.text.primary,
        }}
        autoFocus
      />
      <div className="flex gap-2 items-center">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="text-xs p-1 rounded-md"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.secondary,
          }}
        >
          <option value="">No postmark</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {country && (
          <input
            type="text"
            value={stateName}
            onChange={(e) => setStateName(e.target.value)}
            maxLength={40}
            placeholder="State (optional)"
            className="flex-1 text-xs p-1 rounded-md"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              color: theme.text.primary,
            }}
          />
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex justify-between items-center">
        <span className="text-xs opacity-60" style={{ color: theme.text.muted }}>
          {text.length}/200
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1 opacity-60 hover:opacity-100"
            style={{ color: theme.text.muted }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="px-4 py-1.5 rounded-full text-xs font-medium disabled:opacity-50"
            style={{ background: theme.accent.primary, color: theme.bg.primary }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  )
}
