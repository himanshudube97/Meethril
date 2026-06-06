'use client'

import { useState } from 'react'
import { useThemeStore } from '@/store/theme'

export function PassphraseStep({ onComplete }: { onComplete: (pp: string) => void }) {
  const { theme } = useThemeStore()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)

  const tooShort = passphrase.length > 0 && passphrase.length < 8
  const mismatch = confirm.length > 0 && confirm !== passphrase
  const valid = passphrase.length >= 8 && passphrase === confirm

  const inputStyle = {
    background: theme.glass.bg,
    color: theme.text.primary,
    borderColor: `${theme.text.primary}33`,
  }

  return (
    <div>
      <h2 className="font-serif text-3xl md:text-4xl mb-4">Choose your memorable phrase.</h2>
      <p
        className="text-lg mb-7 leading-relaxed"
        style={{ color: theme.text.secondary }}
      >
        This is your daily key. Pick something only you would write — a
        sentence about your dog, a line of poetry, a phrase that means
        something to you. Aim for at least 8 characters.
      </p>

      <label
        className="block text-base uppercase tracking-wider mb-2"
        style={{ color: theme.text.secondary }}
      >
        Your phrase
      </label>
      <input
        type={show ? 'text' : 'password'}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="e.g. coffee with mira in the rain"
        className="w-full px-4 py-3.5 mb-3 border rounded-lg text-lg"
        style={inputStyle}
        autoFocus
      />

      <label
        className="block text-base uppercase tracking-wider mb-2"
        style={{ color: theme.text.secondary }}
      >
        Type it again to be sure
      </label>
      <input
        type={show ? 'text' : 'password'}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full px-4 py-3.5 mb-3 border rounded-lg text-lg"
        style={inputStyle}
      />

      <label
        className="text-lg flex items-center gap-2 mb-6"
        style={{ color: theme.text.secondary }}
      >
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          style={{ accentColor: theme.accent.primary }}
        />
        Show what I&apos;m typing
      </label>

      {tooShort && (
        <p className="text-lg font-medium mb-3" style={{ color: theme.text.primary }}>
          Just a little longer — 8 characters at minimum.
        </p>
      )}
      {mismatch && (
        <p className="text-lg font-medium mb-3" style={{ color: theme.text.primary }}>
          The two phrases don&apos;t match.
        </p>
      )}

      <div
        className="flex items-start gap-3 mb-7 p-4 rounded-xl border border-l-4"
        style={{
          background: theme.glass.bg,
          borderColor: theme.accent.warm,
        }}
      >
        <svg
          className="w-6 h-6 shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.accent.warm}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-base leading-relaxed" style={{ color: theme.text.primary }}>
          <strong style={{ color: theme.accent.warm }}>Important:</strong> if you forget
          this phrase, we cannot reset it. Even we don&apos;t know what it is — that&apos;s
          how this works. You&apos;ll get a recovery key next as a backup.
        </p>
      </div>

      <button
        disabled={!valid}
        onClick={() => onComplete(passphrase)}
        className="px-7 py-3.5 rounded-full text-lg disabled:opacity-30 transition-opacity hover:opacity-90 disabled:hover:opacity-30"
        style={{
          background: theme.text.primary,
          color: theme.bg.primary,
        }}
      >
        Continue
      </button>
    </div>
  )
}
