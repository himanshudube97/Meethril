'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { PasswordToggle } from '@/components/PasswordToggle'
import { useAuthStore } from '@/store/auth'
import { useBackfill } from '@/hooks/useBackfill'
import {
  generateMasterKey,
  generateRecoveryKey,
  generateSalt,
  parseSalt,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryKey,
  wrapMasterKey,
  hashRecoveryKey,
} from '@/lib/e2ee/crypto'
import { downloadDailyKeyFile, downloadRecoveryKeyFile } from '@/lib/e2ee/download-keys'

type Step = 'intro' | 'daily-key' | 'save-keys' | 'done'

const STEPS: Step[] = ['intro', 'daily-key', 'save-keys', 'done']

export default function SetupModal() {
  const { theme } = useThemeStore()
  const { showSetupModal, setShowSetupModal, setEnabled, storeMasterKey, fetchKeyData } = useE2EEStore()
  const user = useAuthStore(s => s.user)
  const email = user?.email ?? ''
  const { runBackfill } = useBackfill()

  const [step, setStep] = useState<Step>('intro')
  const [agreedIntro, setAgreedIntro] = useState(false)
  const [dailyKey, setDailyKey] = useState('')
  const [confirmDailyKey, setConfirmDailyKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState('')
  const [savedRecovery, setSavedRecovery] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const resetState = useCallback(() => {
    setStep('intro')
    setAgreedIntro(false)
    setDailyKey('')
    setConfirmDailyKey('')
    setRecoveryKey('')
    setSavedRecovery(false)
    setError('')
    setLoading(false)
    setCopied(false)
  }, [])

  const handleClose = useCallback(() => {
    setShowSetupModal(false)
    resetState()
  }, [setShowSetupModal, resetState])

  const handleCopyRecoveryKey = async () => {
    await navigator.clipboard.writeText(recoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const validateDailyKey = () => {
    if (dailyKey.length < 8) {
      setError('Daily key must be at least 8 characters')
      return false
    }
    if (dailyKey !== confirmDailyKey) {
      setError('Daily keys do not match')
      return false
    }
    setError('')
    return true
  }

  const handleSetupComplete = async () => {
    setLoading(true)
    setError('')

    try {
      // Generate master key
      const masterKey = await generateMasterKey()

      // Generate salt for PBKDF2
      const salt = generateSalt()
      const saltBytes = parseSalt(salt)

      // Derive wrapping key from daily key
      const dailyWrappingKey = await deriveKeyFromPassphrase(dailyKey, saltBytes)

      // Wrap master key with daily key
      const { wrappedKey: encryptedMasterKey, iv: masterKeyIV } = await wrapMasterKey(
        masterKey,
        dailyWrappingKey
      )

      // Generate recovery key
      const newRecoveryKey = generateRecoveryKey()
      setRecoveryKey(newRecoveryKey)

      // Derive wrapping key from recovery key
      const recoveryWrappingKey = await deriveKeyFromRecoveryKey(newRecoveryKey)

      // Wrap master key with recovery key
      const { wrappedKey: encryptedMasterKeyRecovery, iv: recoveryKeyIV } = await wrapMasterKey(
        masterKey,
        recoveryWrappingKey
      )

      // Hash recovery key for verification
      const recoveryHash = await hashRecoveryKey(newRecoveryKey)

      // Send to server
      const res = await fetch('/api/e2ee/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedMasterKey,
          masterKeyIV,
          masterKeySalt: salt,
          recoveryKeyHash: recoveryHash,
          encryptedMasterKeyRecovery,
          recoveryKeyIV,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to setup E2EE')
      }

      // Store master key locally (localStorage, 1-day TTL — see crypto.ts; the
      // numeric arg is ignored) and update state
      await storeMasterKey(masterKey, 7)
      setEnabled(true)
      await fetchKeyData()

      // Auto-download both keys so the user always has a local backup,
      // even if they skip past the manual download buttons in the next
      // step. The user can delete the files; we just want to make sure
      // they have copies.
      downloadDailyKeyFile(dailyKey, email)
      downloadRecoveryKeyFile(newRecoveryKey, email)

      // Move to save-keys step
      setStep('save-keys')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  if (!showSetupModal) return null

  const currentStepIndex = STEPS.indexOf(step)

  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <motion.div
            key="intro"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                End-to-End Encryption
              </h2>
              <p className="text-base" style={{ color: theme.text.secondary }}>
                Your entries will be encrypted with a key only you know.
                Not even we can read them.
              </p>
            </div>

            <div
              className="p-4 rounded-xl text-base space-y-3"
              style={{ background: `${theme.accent.warm}15`, border: `1px solid ${theme.accent.warm}30` }}
            >
              <p style={{ color: theme.text.primary }}>
                <strong>How recovery works:</strong>
              </p>
              <ul className="space-y-2" style={{ color: theme.text.secondary }}>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">✅</span>
                  <span>You <strong>CAN</strong> recover your journal if you have either your daily key or your recovery key, on any device.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">❌</span>
                  <span>You <strong>CANNOT</strong> recover your journal if you lose both keys. There is no &quot;reset password&quot; — by design.</span>
                </li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedIntro}
                onChange={(e) => setAgreedIntro(e.target.checked)}
                className="mt-1 shrink-0 accent-current w-4 h-4 rounded"
                style={{ accentColor: theme.accent.primary }}
              />
              <span className="text-base" style={{ color: theme.text.secondary }}>
                I understand that if I lose both my daily key and recovery key, my journal cannot be recovered — not even by Meethril.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl text-base"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.muted,
                }}
              >
                Maybe Later
              </button>
              <button
                onClick={() => setStep('daily-key')}
                disabled={!agreedIntro}
                className="flex-1 py-3 rounded-xl text-base font-medium transition-opacity"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: agreedIntro ? 1 : 0.4,
                  cursor: agreedIntro ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            </div>
          </motion.div>
        )

      case 'daily-key':
        return (
          <motion.div
            key="daily-key"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center">
              <div className="mb-4">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                  <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                Create Your Daily Key
              </h2>
              <p className="text-base" style={{ color: theme.text.secondary }}>
                This is what you&apos;ll type to unlock your journal day-to-day.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-base mb-2" style={{ color: theme.text.secondary }}>
                  Daily Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={dailyKey}
                    onChange={(e) => { setDailyKey(e.target.value); setError('') }}
                    placeholder="Enter your daily key..."
                    className="w-full p-4 rounded-xl text-base outline-none"
                    style={{
                      background: theme.glass.bg,
                      border: `1px solid ${theme.glass.border}`,
                      color: theme.text.primary,
                      paddingRight: '2.75rem',
                    }}
                  />
                  <PasswordToggle shown={showKey} onToggle={() => setShowKey((v) => !v)} color={theme.text.muted} />
                </div>
              </div>

              <div>
                <label className="block text-base mb-2" style={{ color: theme.text.secondary }}>
                  Confirm Daily Key
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmDailyKey}
                    onChange={(e) => { setConfirmDailyKey(e.target.value); setError('') }}
                    placeholder="Confirm your daily key..."
                    className="w-full p-4 rounded-xl text-base outline-none"
                    style={{
                      background: theme.glass.bg,
                      border: `1px solid ${dailyKey === confirmDailyKey && confirmDailyKey ? theme.accent.primary : theme.glass.border}`,
                      color: theme.text.primary,
                      paddingRight: '2.75rem',
                    }}
                  />
                  <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} color={theme.text.muted} />
                </div>
              </div>

              <p className="text-base" style={{ color: theme.text.secondary }}>
                Minimum 8 characters. You&apos;ll re-enter this each time you reopen the app, or on a new device.
              </p>

              {error && (
                <p className="text-base text-center" style={{ color: theme.accent.warm }}>
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('intro')}
                className="flex-1 py-3 rounded-xl text-base"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.muted,
                }}
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  if (validateDailyKey()) {
                    handleSetupComplete()
                  }
                }}
                disabled={loading || dailyKey.length < 8 || dailyKey !== confirmDailyKey}
                className="flex-1 py-3 rounded-xl text-base font-medium transition-opacity"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: loading || dailyKey.length < 8 || dailyKey !== confirmDailyKey ? 0.5 : 1,
                  cursor: loading || dailyKey.length < 8 || dailyKey !== confirmDailyKey ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Setting up...' : 'Continue'}
              </button>
            </div>
          </motion.div>
        )

      case 'save-keys':
        return (
          <motion.div
            key="save-keys"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center">
              <div className="mb-4">
                <svg className="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                Save Your Recovery Key
              </h2>
              <p className="text-base" style={{ color: theme.text.secondary }}>
                Write this down or save it somewhere safe. You&apos;ll need it if you forget your daily key.
              </p>
            </div>

            {/* Recovery key display */}
            <div
              className="p-4 rounded-xl text-center"
              style={{ background: theme.glass.bg, border: `1px solid ${theme.accent.primary}50` }}
            >
              <p className="text-base mb-3" style={{ color: theme.text.secondary }}>
                Your Recovery Key
              </p>
              <p
                className="text-xl font-mono tracking-wide select-all break-all"
                style={{ color: theme.accent.primary }}
              >
                {recoveryKey}
              </p>
            </div>

            {/* Copy + Download recovery key */}
            <div className="flex gap-3">
              <button
                onClick={handleCopyRecoveryKey}
                className="flex-1 py-3 rounded-xl text-base flex items-center justify-center gap-2"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: copied ? theme.accent.primary : theme.text.secondary,
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => downloadRecoveryKeyFile(recoveryKey, email)}
                className="flex-1 py-3 rounded-xl text-base flex items-center justify-center gap-2"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.secondary,
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download as file
              </button>
            </div>

            {/* Optional daily key download */}
            <div
              className="pt-4 border-t space-y-3"
              style={{ borderColor: `${theme.glass.border}` }}
            >
              <p className="text-base" style={{ color: theme.text.secondary }}>
                Want to also download your daily key as a file?
              </p>
              <button
                onClick={() => downloadDailyKeyFile(dailyKey, email)}
                className="w-full py-2.5 rounded-xl text-base flex items-center justify-center gap-2"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.secondary,
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download daily key as file
              </button>
              <p className="text-base" style={{ color: theme.text.secondary }}>
                (Optional — many users prefer to remember their daily key)
              </p>
            </div>

            {/* Warning */}
            <p className="text-base text-center" style={{ color: theme.accent.warm }}>
              ⚠ If you lose both keys, your journal cannot be recovered.
            </p>

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={savedRecovery}
                onChange={(e) => setSavedRecovery(e.target.checked)}
                className="mt-1 shrink-0 w-4 h-4 rounded"
                style={{ accentColor: theme.accent.primary }}
              />
              <span className="text-base" style={{ color: theme.text.secondary }}>
                I&apos;ve saved my recovery key.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('daily-key')}
                className="flex-1 py-3 rounded-xl text-base"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.muted,
                }}
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  runBackfill().catch(err => console.error('backfill error', err))
                  setStep('done')
                }}
                disabled={!savedRecovery}
                className="flex-1 py-3 rounded-xl text-base font-medium transition-opacity"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: savedRecovery ? 1 : 0.4,
                  cursor: savedRecovery ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            </div>
          </motion.div>
        )

      case 'done':
        return (
          <motion.div
            key="done"
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
                Your journal is now end-to-end encrypted ✅
              </h2>
              <p className="text-base" style={{ color: theme.text.secondary }}>
                Migrating your existing entries… (this runs in the background)
              </p>
            </div>

            <div
              className="p-4 rounded-xl text-base"
              style={{ background: `${theme.accent.primary}10`, border: `1px solid ${theme.accent.primary}25` }}
            >
              <p style={{ color: theme.text.secondary }}>
                Remember: Keep your recovery key safe. It&apos;s the only way to access your entries
                if you forget your daily key.
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-base font-medium"
              style={{
                background: theme.accent.primary,
                color: '#fff',
              }}
            >
              Start writing
            </button>
          </motion.div>
        )
    }
  }

  return (
    <AnimatePresence>
      {showSetupModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto p-6 rounded-2xl overflow-y-auto max-h-[90vh]"
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

            {/* Progress indicator — 4 segments */}
            <div className="flex gap-1 mb-6">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className="flex-1 h-1 rounded-full transition-colors"
                  style={{
                    background: currentStepIndex >= i
                      ? theme.accent.primary
                      : `${theme.text.muted}30`,
                  }}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              {renderStep()}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
