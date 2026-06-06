'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { useAuthStore } from '@/store/auth'
import {
  generateRecoveryKey,
  deriveKeyFromRecoveryKey,
  wrapMasterKey,
  hashRecoveryKey,
} from '@/lib/e2ee/crypto'
import { downloadRecoveryKeyFile } from '@/lib/e2ee/download-keys'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'confirm' | 'show-new-key' | 'done'

export default function RotateRecoveryKeyModal({ open, onClose }: Props) {
  const { theme } = useThemeStore()
  const { masterKey, fetchKeyData } = useE2EEStore()
  const user = useAuthStore(s => s.user)

  const [step, setStep] = useState<Step>('confirm')
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedAck, setSavedAck] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleConfirm = async () => {
    if (!masterKey) {
      setError('Master key not in memory. Please unlock first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const fresh = generateRecoveryKey()
      const wrappingKey = await deriveKeyFromRecoveryKey(fresh)
      const { wrappedKey: encryptedMasterKeyRecovery, iv: recoveryKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
      const recoveryKeyHash = await hashRecoveryKey(fresh)

      const res = await fetch('/api/e2ee/update-recovery-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedMasterKeyRecovery, recoveryKeyIV, recoveryKeyHash }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Update failed')
      }

      await fetchKeyData()
      setNewRecoveryKey(fresh)

      // Auto-download the new recovery key so the user always has a
      // fresh local backup, even if they bail out before clicking the
      // manual download button on the next step.
      downloadRecoveryKeyFile(fresh, user?.email)

      setStep('show-new-key')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newRecoveryKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadKey = () => downloadRecoveryKeyFile(newRecoveryKey, user?.email)

  const handleClose = () => {
    setStep('confirm')
    setNewRecoveryKey('')
    setError('')
    setLoading(false)
    setSavedAck(false)
    onClose()
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={step === 'done' ? handleClose : undefined}
      />
      <motion.div
        key="panel"
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
        {step === 'confirm' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                Generate new recovery key
              </h2>
              <p className="text-sm" style={{ color: theme.text.secondary }}>
                Your current recovery key will stop working. Make sure you save the new one before closing this dialog.
              </p>
            </div>
            {error && (
              <p className="text-sm text-center" style={{ color: theme.accent.warm }}>{error}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl text-sm"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.muted,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        )}
        {step === 'show-new-key' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
                Save your new recovery key
              </h2>
              <p className="text-sm" style={{ color: theme.text.secondary }}>
                We'll only show this once. Save it now.
              </p>
            </div>
            <div
              className="p-4 rounded-xl text-center font-mono tracking-wide select-all"
              style={{
                background: theme.glass.bg,
                border: `1px solid ${theme.accent.primary}50`,
                color: theme.accent.primary,
              }}
            >
              {newRecoveryKey}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 py-3 rounded-xl text-sm"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: copied ? theme.accent.primary : theme.text.secondary,
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={downloadKey}
                className="flex-1 py-3 rounded-xl text-sm"
                style={{
                  background: theme.glass.bg,
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.secondary,
                }}
              >
                Download
              </button>
            </div>
            <p className="text-xs" style={{ color: theme.accent.warm }}>
              ⚠ If you lose both your daily key and this recovery key, your journal cannot be recovered.
            </p>
            <label className="flex items-center gap-3 cursor-pointer text-sm" style={{ color: theme.text.secondary }}>
              <input
                type="checkbox"
                checked={savedAck}
                onChange={e => setSavedAck(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: theme.accent.primary }}
              />
              I've saved my new recovery key.
            </label>
            <button
              onClick={() => setStep('done')}
              disabled={!savedAck}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{
                background: theme.accent.primary,
                color: '#fff',
                opacity: savedAck ? 1 : 0.5,
              }}
            >
              Done
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-light" style={{ color: theme.text.primary }}>
              Recovery key updated ✅
            </h2>
            <p className="text-sm" style={{ color: theme.text.secondary }}>
              Your old recovery key is no longer valid.
            </p>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-sm font-medium"
              style={{ background: theme.accent.primary, color: '#fff' }}
            >
              Close
            </button>
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  )
}
