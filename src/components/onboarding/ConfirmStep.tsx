'use client'

import { useState } from 'react'
import {
  generateMasterKey,
  generateSalt,
  parseSalt,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryKey,
  wrapMasterKey,
  hashRecoveryKey,
} from '@/lib/e2ee/crypto'
import { useE2EEStore } from '@/store/e2ee'
import { useThemeStore } from '@/store/theme'

export function ConfirmStep({
  passphrase,
  recoveryKey,
  onComplete,
}: {
  passphrase: string
  recoveryKey: string
  onComplete: () => void
}) {
  const { theme } = useThemeStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { storeMasterKey, setEnabled, fetchKeyData } = useE2EEStore()

  async function finalize() {
    setBusy(true)
    setError(null)
    try {
      // 1. Generate a fresh master key
      const masterKey = await generateMasterKey()

      // 2. Derive a wrapping key from the passphrase (PBKDF2)
      const salt = generateSalt()
      const saltBytes = parseSalt(salt)
      const passphraseWrappingKey = await deriveKeyFromPassphrase(passphrase, saltBytes)

      // 3. Wrap (encrypt) the master key under the passphrase-derived key
      const { wrappedKey: encryptedMasterKey, iv: masterKeyIV } = await wrapMasterKey(
        masterKey,
        passphraseWrappingKey
      )

      // 4. Derive a wrapping key from the recovery key and wrap the master key
      const recoveryWrappingKey = await deriveKeyFromRecoveryKey(recoveryKey)
      const { wrappedKey: encryptedMasterKeyRecovery, iv: recoveryKeyIV } = await wrapMasterKey(
        masterKey,
        recoveryWrappingKey
      )

      // 5. Hash the recovery key for server-side verification
      const recoveryKeyHash = await hashRecoveryKey(recoveryKey)

      // 6. POST the six fields to the setup endpoint
      const res = await fetch('/api/e2ee/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedMasterKey,
          masterKeyIV,
          masterKeySalt: salt,
          recoveryKeyHash,
          encryptedMasterKeyRecovery,
          recoveryKeyIV,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Setup failed (${res.status})`)
      }

      // 7. Push the master key into the in-memory store (7-day TTL) so the
      //    user is already unlocked when they land on /me — no second prompt.
      await storeMasterKey(masterKey, 7)
      setEnabled(true)
      await fetchKeyData()

      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="font-serif text-2xl mb-3">One last check.</h2>
      <p
        className="mb-6 leading-relaxed"
        style={{ color: theme.text.secondary }}
      >
        You&apos;re about to encrypt your account with the phrase you just set.
        From now on, you&apos;ll type that phrase once a day to unlock your
        diary. Ready?
      </p>

      {error && (
        <p
          className="text-sm mb-4 p-3 rounded"
          style={{
            background: `${theme.accent.warm}22`,
            color: theme.accent.warm,
          }}
        >
          {error}
        </p>
      )}

      <button
        disabled={busy}
        onClick={finalize}
        className="px-6 py-3 rounded-full disabled:opacity-30 transition-opacity hover:opacity-90 disabled:hover:opacity-30"
        style={{
          background: theme.text.primary,
          color: theme.bg.primary,
        }}
      >
        {busy ? 'Setting up...' : 'Lock it in'}
      </button>
    </div>
  )
}
