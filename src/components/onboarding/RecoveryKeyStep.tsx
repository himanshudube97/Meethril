'use client'

import { useEffect, useState } from 'react'
import { generateRecoveryKey } from '@/lib/e2ee/crypto'
import { useThemeStore } from '@/store/theme'

export function RecoveryKeyStep({
  onComplete,
}: {
  passphrase: string
  onComplete: (rk: string) => void
}) {
  const { theme } = useThemeStore()
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setRecoveryKey(generateRecoveryKey())
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  if (!recoveryKey) {
    return (
      <p style={{ color: theme.text.secondary }}>Generating your recovery key...</p>
    )
  }

  return (
    <div>
      <h2 className="font-serif text-2xl mb-3">Save your recovery key.</h2>
      <p
        className="text-sm mb-6 leading-relaxed"
        style={{ color: theme.text.secondary }}
      >
        This is your only way back in if you ever forget your phrase. Save
        it somewhere safe — a password manager, a printed copy, an email to
        yourself. We don&apos;t keep a copy.
      </p>

      <div
        className="font-mono text-lg p-6 border rounded-lg mb-4 break-all select-all"
        style={{
          background: theme.glass.bg,
          borderColor: `${theme.text.primary}33`,
          color: theme.text.primary,
        }}
      >
        {recoveryKey}
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            navigator.clipboard.writeText(recoveryKey)
            setCopied(true)
          }}
          className="px-4 py-2 border rounded-full text-sm transition-opacity hover:opacity-80"
          style={{
            borderColor: `${theme.text.primary}4d`,
            color: theme.text.primary,
          }}
        >
          {copied ? 'Copied' : 'Copy to clipboard'}
        </button>
        <button
          onClick={() => downloadRecoveryKey(recoveryKey)}
          className="px-4 py-2 border rounded-full text-sm transition-opacity hover:opacity-80"
          style={{
            borderColor: `${theme.text.primary}4d`,
            color: theme.text.primary,
          }}
        >
          Download as .txt
        </button>
      </div>

      <label
        className="flex items-start gap-3 mb-6 cursor-pointer"
        style={{ color: theme.text.secondary }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1"
          style={{ accentColor: theme.accent.primary }}
        />
        <span className="text-sm leading-relaxed">
          I&apos;ve saved my recovery key somewhere I can find it again. I
          understand that if I lose both my phrase and this key, my data
          cannot be recovered.
        </span>
      </label>

      <button
        disabled={!acknowledged}
        onClick={() => onComplete(recoveryKey)}
        className="px-6 py-3 rounded-full disabled:opacity-30 transition-opacity hover:opacity-90 disabled:hover:opacity-30"
        style={{
          background: theme.text.primary,
          color: theme.bg.primary,
        }}
      >
        I&apos;ve saved it — continue
      </button>
    </div>
  )
}

function downloadRecoveryKey(key: string) {
  const blob = new Blob(
    [
      `Your Hearth recovery key:\n\n${key}\n\nKeep this safe. Together with your phrase, it's the only way back into your encrypted data.\n`,
    ],
    { type: 'text/plain' }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'hearth-recovery-key.txt'
  a.click()
  URL.revokeObjectURL(url)
}
