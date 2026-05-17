'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { PassphraseStep } from './PassphraseStep'
import { RecoveryKeyStep } from './RecoveryKeyStep'
import { ConfirmStep } from './ConfirmStep'

type Step = 'intro' | 'passphrase' | 'recovery' | 'confirm'

export function E2EEOnboardingModal({ userName }: { userName: string }) {
  const { theme } = useThemeStore()
  const [step, setStep] = useState<Step>('intro')
  const [passphrase, setPassphrase] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')

  return (
    <div
      className="relative z-10 min-h-screen flex items-center justify-center p-6"
      style={{ color: theme.text.primary }}
    >
      <div className="max-w-xl w-full">
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h1 className="font-serif text-3xl mb-4">
                Welcome to Hearth, {userName || 'friend'}.
              </h1>
              <p className="mb-2 leading-relaxed">
                Before you start writing, we need to set up encryption.
              </p>
              <p className="mb-6 leading-relaxed">
                Everything you write here — your diary, your letters, your
                photos — should only be readable by you. Even we can&apos;t
                see it. This is how we promise that.
              </p>
              <p
                className="mb-6 text-sm leading-relaxed"
                style={{ color: theme.text.secondary }}
              >
                It takes about a minute. You&apos;ll set a memorable phrase
                (like a UPI PIN you type once a day), and we&apos;ll give you
                a recovery key in case you ever forget.
              </p>
              <button
                onClick={() => setStep('passphrase')}
                className="px-6 py-3 rounded-full transition-opacity hover:opacity-90"
                style={{
                  background: theme.text.primary,
                  color: theme.bg.primary,
                }}
              >
                Let&apos;s set it up
              </button>
            </motion.div>
          )}

          {step === 'passphrase' && (
            <motion.div
              key="passphrase"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <PassphraseStep
                onComplete={(pp) => {
                  setPassphrase(pp)
                  setStep('recovery')
                }}
              />
            </motion.div>
          )}

          {step === 'recovery' && (
            <motion.div
              key="recovery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <RecoveryKeyStep
                passphrase={passphrase}
                onComplete={(rk) => {
                  setRecoveryKey(rk)
                  setStep('confirm')
                }}
              />
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ConfirmStep
                passphrase={passphrase}
                recoveryKey={recoveryKey}
                onComplete={() => {
                  // Hard redirect so middleware re-evaluates the E2EE cookie
                  window.location.href = '/me'
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
