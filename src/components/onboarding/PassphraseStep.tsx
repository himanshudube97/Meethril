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

      {/*
        Theme-independent loss warning. Uses FIXED red/yellow colors (not theme
        tokens) on purpose so it stays loud and legible on every theme —
        including dark ones like rivendell where theme.accent.warm is too subtle.
        This must actually get read; it's the one irreversible decision here.
      */}
      <div
        className="mb-7 rounded-xl overflow-hidden"
        style={{
          background: '#FEF08A', // bright yellow
          border: '3px solid #DC2626', // red
          boxShadow: '0 0 0 3px rgba(220,38,38,0.30)',
        }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2"
          style={{ background: '#DC2626' }}
        >
          <svg
            className="w-5 h-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span
            className="text-sm font-bold uppercase"
            style={{ color: '#FFFFFF', letterSpacing: '0.08em' }}
          >
            Read this — it cannot be undone
          </span>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-base font-bold leading-snug" style={{ color: '#7F1D1D' }}>
            If you forget this phrase, your journal is gone forever.
          </p>
          <p className="text-sm font-medium leading-relaxed" style={{ color: '#7F1D1D' }}>
            We cannot reset it. There is no password recovery and no backdoor —
            not even for us. That&apos;s what keeps it private. Write your phrase
            down somewhere safe. You&apos;ll get a recovery key next as a backup.
          </p>
        </div>
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
