'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import {
  deriveKeyFromPassphrase,
  parseSalt,
  unwrapMasterKey,
} from '@/lib/e2ee/crypto'

export default function UnlockModal() {
  const { theme } = useThemeStore()
  const {
    showUnlockModal,
    setShowUnlockModal,
    setShowRecoveryModal,
    keyData,
    storeMasterKey,
  } = useE2EEStore()

  const [dailyKey, setDailyKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleUnlock = async () => {
    if (!keyData?.encryptedMasterKey || !keyData?.masterKeyIV || !keyData?.masterKeySalt) {
      setError('E2EE key data not available')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Derive wrapping key from daily key
      const salt = parseSalt(keyData.masterKeySalt)
      const wrappingKey = await deriveKeyFromPassphrase(dailyKey, salt)

      // Unwrap master key
      const masterKey = await unwrapMasterKey(
        keyData.encryptedMasterKey,
        wrappingKey,
        keyData.masterKeyIV
      )

      // Store master key (sessionStorage — cleared when the tab closes) and
      // close the modal. We keep the key for the session only; no device-trust.
      await storeMasterKey(masterKey)
      setShowUnlockModal(false)
      setDailyKey('')
    } catch {
      setError('Incorrect daily key. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotKey = () => {
    setShowUnlockModal(false)
    setShowRecoveryModal(true)
  }

  if (!showUnlockModal) return null

  return (
    <AnimatePresence>
      {showUnlockModal && (
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
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-4">
                  <svg className="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                  Unlock Your Journal
                </h2>
                <p className="text-sm" style={{ color: theme.text.secondary }}>
                  Enter your daily key to decrypt your entries.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2" style={{ color: theme.text.muted }}>
                    Daily Key
                  </label>
                  <input
                    type="password"
                    value={dailyKey}
                    onChange={(e) => setDailyKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dailyKey) handleUnlock()
                    }}
                    placeholder="Enter your daily key..."
                    autoFocus
                    className="w-full p-4 rounded-xl text-sm outline-none"
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
              </div>

              <button
                onClick={handleUnlock}
                disabled={loading || !dailyKey}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: loading || !dailyKey ? 0.5 : 1,
                }}
              >
                {loading ? 'Unlocking...' : 'Unlock'}
              </button>

              <button
                onClick={handleForgotKey}
                className="w-full text-sm"
                style={{ color: theme.text.muted }}
              >
                Forgot your daily key? Use recovery key
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
