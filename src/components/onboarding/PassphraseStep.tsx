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
      <h2 className="font-serif text-2xl mb-3">Choose your memorable phrase.</h2>
      <p
        className="text-sm mb-6 leading-relaxed"
        style={{ color: theme.text.secondary }}
      >
        This is your daily key. Pick something only you would write — a
        sentence about your dog, a line of poetry, a phrase that means
        something to you. Aim for at least 8 characters.
      </p>

      <label
        className="block text-xs uppercase tracking-wider mb-2"
        style={{ color: theme.text.muted }}
      >
        Your phrase
      </label>
      <input
        type={show ? 'text' : 'password'}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="e.g. coffee with mira in the rain"
        className="w-full px-4 py-3 mb-3 border rounded-lg"
        style={inputStyle}
        autoFocus
      />

      <label
        className="block text-xs uppercase tracking-wider mb-2"
        style={{ color: theme.text.muted }}
      >
        Type it again to be sure
      </label>
      <input
        type={show ? 'text' : 'password'}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full px-4 py-3 mb-3 border rounded-lg"
        style={inputStyle}
      />

      <label
        className="text-sm flex items-center gap-2 mb-6"
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
        <p className="text-sm mb-3" style={{ color: theme.accent.warm }}>
          Just a little longer — 8 characters at minimum.
        </p>
      )}
      {mismatch && (
        <p className="text-sm mb-3" style={{ color: theme.accent.warm }}>
          The two phrases don&apos;t match.
        </p>
      )}

      <p
        className="text-xs mb-6 italic leading-relaxed"
        style={{ color: theme.text.muted }}
      >
        Important: if you forget this phrase, we cannot reset it. Even we
        don&apos;t know what it is — that&apos;s how this works. You&apos;ll get a
        recovery key next as a backup.
      </p>

      <button
        disabled={!valid}
        onClick={() => onComplete(passphrase)}
        className="px-6 py-3 rounded-full disabled:opacity-30 transition-opacity hover:opacity-90 disabled:hover:opacity-30"
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
