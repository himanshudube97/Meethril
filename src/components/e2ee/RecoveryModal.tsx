'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { PasswordToggle } from '@/components/PasswordToggle'
import { useAuthStore } from '@/store/auth'
import {
  deriveKeyFromRecoveryKey,
  deriveKeyFromPassphrase,
  unwrapMasterKey,
  wrapMasterKey,
  verifyRecoveryKey,
  generateSalt,
  parseSalt,
} from '@/lib/e2ee/crypto'
import { downloadDailyKeyFile } from '@/lib/e2ee/download-keys'

type Step = 'recovery' | 'new-daily-key' | 'complete'

export default function RecoveryModal() {
  const { theme } = useThemeStore()
  const userEmail = useAuthStore(s => s.user?.email)
  const {
    showRecoveryModal,
    setShowRecoveryModal,
    setShowUnlockModal,
    keyData,
    storeMasterKey,
    fetchKeyData,
  } = useE2EEStore()

  const [step, setStep] = useState<Step>('recovery')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newDailyKey, setNewDailyKey] = useState('')
  const [confirmDailyKey, setConfirmDailyKey] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)

  const handleRecovery = async () => {
    if (!keyData?.recoveryKeyHash || !keyData?.encryptedMasterKeyRecovery || !keyData?.recoveryKeyIV) {
      setError('Recovery key data not available')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Verify recovery key
      const isValid = await verifyRecoveryKey(recoveryKey, keyData.recoveryKeyHash)
      if (!isValid) {
        setError('Invalid recovery key. Please check and try again.')
        setLoading(false)
        return
      }

      // Derive wrapping key from recovery key
      const recoveryWrappingKey = await deriveKeyFromRecoveryKey(recoveryKey)

      // Unwrap master key
      const unwrappedMasterKey = await unwrapMasterKey(
        keyData.encryptedMasterKeyRecovery,
        recoveryWrappingKey,
        keyData.recoveryKeyIV
      )

      // Store master key temporarily
      setMasterKey(unwrappedMasterKey)
      setStep('new-daily-key')
    } catch {
      setError('Failed to recover. Please check your recovery key.')
    } finally {
      setLoading(false)
    }
  }

  const handleSetNewDailyKey = async () => {
    if (!masterKey) {
      setError('Master key not available')
      return
    }

    if (newDailyKey.length < 8) {
      setError('Daily key must be at least 8 characters')
      return
    }

    if (newDailyKey !== confirmDailyKey) {
      setError('Daily keys do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Generate new salt
      const salt = generateSalt()
      const saltBytes = parseSalt(salt)

      // Derive new wrapping key from new daily key
      const newWrappingKey = await deriveKeyFromPassphrase(newDailyKey, saltBytes)

      // Wrap master key with new daily key
      const { wrappedKey: encryptedMasterKey, iv: masterKeyIV } = await wrapMasterKey(
        masterKey,
        newWrappingKey
      )

      // Update server with new daily key encryption
      const res = await fetch('/api/e2ee/update-daily-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedMasterKey,
          masterKeyIV,
          masterKeySalt: salt,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update daily key')
      }

      // Store master key and refresh key data
      await storeMasterKey(masterKey, 0)
      await fetchKeyData()

      // Auto-download the new daily key so the user has a fresh local
      // backup of the value they just typed. The recovery key is
      // unchanged in this flow, so we don't re-emit it here.
      downloadDailyKeyFile(newDailyKey, userEmail)

      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set new daily key')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setShowRecoveryModal(false)
    setStep('recovery')
    setRecoveryKey('')
    setNewDailyKey('')
    setConfirmDailyKey('')
    setError('')
    setMasterKey(null)
  }

  const handleBackToUnlock = () => {
    handleClose()
    setShowUnlockModal(true)
  }

  if (!showRecoveryModal) return null

  const renderStep = () => {
    switch (step) {
      case 'recovery':
        return (
          <motion.div
            key="recovery"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center">
              <div className="text-4xl mb-4">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                Recovery Mode
              </h2>
              <p className="text-sm" style={{ color: theme.text.secondary }}>
                Enter your recovery key to regain access.
              </p>
            </div>

            <div>
              <label className="block text-xs mb-2" style={{ color: theme.text.muted }}>
                Recovery Key
              </label>
              <input
                type="text"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoFocus
                className="w-full p-4 rounded-xl text-sm font-mono tracking-wider outline-none uppercase text-center"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.primary,
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-center" style={{ color: theme.accent.warm }}>
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBackToUnlock}
                className="flex-1 py-3 rounded-xl text-sm"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.muted,
                }}
              >
                Back
              </button>
              <button
                onClick={handleRecovery}
                disabled={loading || recoveryKey.length < 20}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: loading || recoveryKey.length < 20 ? 0.5 : 1,
                }}
              >
                {loading ? 'Verifying...' : 'Recover'}
              </button>
            </div>
          </motion.div>
        )

      case 'new-daily-key':
        return (
          <motion.div
            key="new-daily-key"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center">
              <div className="text-4xl mb-4">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                Recovery Successful
              </h2>
              <p className="text-sm" style={{ color: theme.text.secondary }}>
                Now set a new daily key for future access.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-2" style={{ color: theme.text.muted }}>
                  New Daily Key (min 8 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newDailyKey}
                    onChange={(e) => setNewDailyKey(e.target.value)}
                    placeholder="Enter new daily key..."
                    className="w-full p-4 rounded-xl text-sm outline-none"
                    style={{
                      background: theme.glass.bg,
                      border: `1px solid ${theme.glass.border}`,
                      color: theme.text.primary,
                      paddingRight: '2.75rem',
                    }}
                  />
                  <PasswordToggle shown={showNew} onToggle={() => setShowNew((v) => !v)} color={theme.text.muted} />
                </div>
              </div>

              <div>
                <label className="block text-xs mb-2" style={{ color: theme.text.muted }}>
                  Confirm New Daily Key
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmDailyKey}
                    onChange={(e) => setConfirmDailyKey(e.target.value)}
                    placeholder="Confirm new daily key..."
                    className="w-full p-4 rounded-xl text-sm outline-none"
                    style={{
                      background: theme.glass.bg,
                      border: `1px solid ${newDailyKey === confirmDailyKey && confirmDailyKey ? theme.accent.primary : theme.glass.border}`,
                      color: theme.text.primary,
                      paddingRight: '2.75rem',
                    }}
                  />
                  <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} color={theme.text.muted} />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-center" style={{ color: theme.accent.warm }}>
                {error}
              </p>
            )}

            <button
              onClick={handleSetNewDailyKey}
              disabled={loading || newDailyKey.length < 8 || newDailyKey !== confirmDailyKey}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{
                background: theme.accent.primary,
                color: '#fff',
                opacity: loading || newDailyKey.length < 8 || newDailyKey !== confirmDailyKey ? 0.5 : 1,
              }}
            >
              {loading ? 'Updating...' : 'Set New Daily Key'}
            </button>

            <button
              onClick={async () => {
                // Skip setting new daily key, just use the master key
                if (masterKey) {
                  await storeMasterKey(masterKey, 0)
                  handleClose()
                }
              }}
              className="w-full text-sm"
              style={{ color: theme.text.muted }}
            >
              Skip for now
            </button>
          </motion.div>
        )

      case 'complete':
        return (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.5, delay: 0.2 }}
            >
              <svg className="w-20 h-20 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </motion.div>

            <div>
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                All Set!
              </h2>
              <p className="text-sm" style={{ color: theme.text.secondary }}>
                Your new daily key has been set. Use it next time you need to unlock your journal.
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{
                background: theme.accent.primary,
                color: '#fff',
              }}
            >
              Continue
            </button>
          </motion.div>
        )
    }
  }

  return (
    <AnimatePresence>
      {showRecoveryModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto p-6 rounded-2xl"
            style={{
              background: theme.bg.primary,
              border: `1px solid ${theme.glass.border}`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full"
              style={{ color: theme.text.muted }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <AnimatePresence mode="wait">
              {renderStep()}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
