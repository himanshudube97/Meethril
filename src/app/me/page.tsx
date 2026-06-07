'use client'

import { useEffect, useState, useCallback, memo } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'
import { useAuthStore } from '@/store/auth'
import { useProfileStore, ProfileKey } from '@/store/profile'
import { useE2EEStore } from '@/store/e2ee'
import DatePicker from '@/components/DatePicker'
import RotateRecoveryKeyModal from '@/components/e2ee/RotateRecoveryKeyModal'
import ReminderControls from '@/components/reminders/ReminderControls'
import DeleteAccountModal from '@/components/account/DeleteAccountModal'

// Debounced save hook
function useDebouncedSave(delay = 500) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (key: ProfileKey, value: string) => {
    // Clear existing timer
    if (timer) clearTimeout(timer)
    setSaved(false)
    setSaveError(false)

    // Set new timer
    const newTimer = setTimeout(async () => {
      setSaving(true)
      try {
        const response = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        })
        if (response.ok) {
          setSaved(true)
          // Hide "saved" after 2 seconds
          setTimeout(() => setSaved(false), 2000)
        } else {
          setSaveError(true)
        }
      } catch {
        // Surface the failure instead of silently leaving the user thinking
        // the change persisted. Previously the catch swallowed both the
        // network and the non-2xx paths.
        setSaveError(true)
      } finally {
        setSaving(false)
      }
    }, delay)

    setTimer(newTimer)
  }, [timer, delay])

  return { saving, saved, saveError, save }
}

// Personal info input with local state
const PersonalInfoInput = memo(function PersonalInfoInput({
  label,
  type,
  initialValue,
  placeholder,
  fieldKey,
  disabled,
}: {
  label: string
  type: 'text' | 'email'
  initialValue: string
  placeholder?: string
  fieldKey: ProfileKey | null
  disabled?: boolean
}) {
  const { theme } = useThemeStore()
  const [value, setValue] = useState(initialValue)
  const { saving, saved, saveError, save } = useDebouncedSave()

  // Sync initial value when it changes (after fetch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop→state sync after async fetch
    setValue(initialValue)
  }, [initialValue])

  const handleChange = (newValue: string) => {
    setValue(newValue)
    if (fieldKey && !disabled) {
      save(fieldKey, newValue)
    }
  }

  return (
    <div>
      <label
        className="block text-base mb-2"
        style={{ color: theme.text.muted }}
      >
        {label}
        {saving && <span className="ml-2 opacity-60">saving...</span>}
        {saved && !saving && <span className="ml-2" style={{ color: theme.accent.primary }}>saved</span>}
        {saveError && !saving && (
          <span className="ml-2" style={{ color: '#b94c4c' }}>
            couldn’t save — try again
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full bg-transparent outline-none ${type === 'text' ? 'text-xl font-light' : 'text-base'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        style={{
          color: disabled ? theme.text.muted : theme.text.primary,
        }}
      />
    </div>
  )
})

// Date of birth input with custom date picker
const DateOfBirthInput = memo(function DateOfBirthInput({
  initialValue,
}: {
  initialValue: string
}) {
  const { theme } = useThemeStore()
  const [value, setValue] = useState(initialValue)
  const { saving, saved, saveError, save } = useDebouncedSave()

  // Sync initial value when it changes (after fetch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop→state sync after async fetch
    setValue(initialValue)
  }, [initialValue])

  const handleChange = (newValue: string) => {
    setValue(newValue)
    save('dateOfBirth', newValue)
  }

  return (
    <div>
      <label
        className="block text-base mb-2"
        style={{ color: theme.text.muted }}
      >
        when were you born?
        {saving && <span className="ml-2 opacity-60">saving...</span>}
        {saved && !saving && <span className="ml-2" style={{ color: theme.accent.primary }}>saved</span>}
        {saveError && !saving && (
          <span className="ml-2" style={{ color: '#b94c4c' }}>
            couldn’t save — try again
          </span>
        )}
      </label>
      <DatePicker
        value={value}
        onChange={handleChange}
        placeholder="select your birthday..."
      />
    </div>
  )
})

// E2EE Settings Component
const E2EESettings = memo(function E2EESettings() {
  const { theme } = useThemeStore()
  const {
    isEnabled,
    isUnlocked,
    keyData,
    setShowSetupModal,
    setShowUnlockModal,
    clearMasterKey,
    loading: e2eeLoading,
  } = useE2EEStore()

  const [showRotate, setShowRotate] = useState(false)
  // The master key lives in sessionStorage (see crypto.ts) and clears when the
  // tab closes — no TTL state to track. The copy below says "this session".

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.8,
        delay: 0.95,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="p-6 rounded-2xl"
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="p-3 rounded-xl"
          style={{
            background: isEnabled ? `${theme.accent.primary}20` : `${theme.text.muted}10`,
          }}
        >
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isEnabled ? theme.accent.primary : theme.text.muted}
            strokeWidth="1.5"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div className="flex-1 space-y-3">
          <h3
            className="text-lg font-medium"
            style={{ color: theme.text.primary }}
          >
            End-to-end encryption
          </h3>

          {!isEnabled && (
            <>
              <p
                className="text-base"
                style={{ color: theme.text.secondary }}
              >
                Encrypt your journal entries with a key only you know. Not even we can read them.
              </p>
              <motion.button
                onClick={() => setShowSetupModal(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={e2eeLoading}
                className="px-4 py-2 rounded-xl text-base font-medium"
                style={{
                  background: theme.accent.primary,
                  color: '#fff',
                  opacity: e2eeLoading ? 0.5 : 1,
                }}
              >
                {e2eeLoading ? 'Loading...' : 'Enable end-to-end encryption'}
              </motion.button>
            </>
          )}

          {isEnabled && (
            <>
              <p className="text-base" style={{ color: theme.text.secondary }}>
                {keyData?.e2eeSetupAt
                  ? `Encrypted on ${new Date(keyData.e2eeSetupAt).toLocaleDateString()}.`
                  : 'Encrypted.'}
              </p>
              <p
                className="text-base"
                style={{ color: theme.text.secondary }}
                title={
                  isUnlocked
                    ? 'Your encryption key is loaded in this browser for this session, so your entries can be read and written. It is never sent to the server and clears when you close the tab.'
                    : 'Your encryption key is not loaded in this browser. Your entries stay encrypted and unreadable until you unlock with your daily key.'
                }
              >
                {isUnlocked
                  ? 'Unlocked on this device (this session).'
                  : 'Locked.'}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => clearMasterKey()}
                  title="Remove your encryption key from this browser. Nothing is deleted — your entries stay safely encrypted and can be reopened anytime by unlocking with your daily key. Handy on shared or public computers."
                  className="px-3 py-1.5 rounded-lg text-base"
                  style={{
                    background: theme.glass.bg,
                    border: `1px solid ${theme.glass.border}`,
                    color: theme.text.muted,
                  }}
                >
                  Lock on this device
                </button>
                <button
                  onClick={() => setShowUnlockModal(true)}
                  title="Change the daily key — the password you type to unlock day to day. Your entries and your recovery key are unaffected."
                  className="px-3 py-1.5 rounded-lg text-base"
                  style={{
                    background: theme.glass.bg,
                    border: `1px solid ${theme.glass.border}`,
                    color: theme.text.muted,
                  }}
                >
                  Change daily key
                </button>
                <button
                  onClick={() => setShowRotate(true)}
                  disabled={!isUnlocked}
                  title={
                    isUnlocked
                      ? 'Create a fresh backup recovery key. Your old recovery key stops working; your daily key is unaffected. Save the new key somewhere safe.'
                      : 'Unlock first (your key must be loaded in this browser) before you can generate a new recovery key.'
                  }
                  className="px-3 py-1.5 rounded-lg text-base"
                  style={{
                    background: theme.glass.bg,
                    border: `1px solid ${theme.glass.border}`,
                    color: theme.text.muted,
                    opacity: isUnlocked ? 1 : 0.5,
                    cursor: isUnlocked ? 'pointer' : 'not-allowed',
                  }}
                >
                  Generate new recovery key
                </button>
              </div>
              {/* Plain-language helper so the two key types aren't confusing. */}
              <p className="text-base leading-relaxed pt-1" style={{ color: theme.text.muted }}>
                Two keys open the same vault: a <strong>daily key</strong> you type to unlock, and a{' '}
                <strong>recovery key</strong> kept as a backup. Changing one never affects the other.
                {!isUnlocked && ' Unlock first to generate a new recovery key.'}
              </p>
            </>
          )}

          <Link
            href="/security"
            className="text-base underline block pt-1"
            style={{ color: theme.text.muted }}
          >
            How E2EE works →
          </Link>
        </div>
      </div>

      <RotateRecoveryKeyModal open={showRotate} onClose={() => setShowRotate(false)} />
    </motion.div>
  )
})

// Feedback / suggestion / issue — saved to the Feedback table, reviewed later.
const CATEGORIES = [
  { key: 'feedback', label: 'Feedback' },
  { key: 'suggestion', label: 'Suggestion' },
  { key: 'issue', label: 'Issue' },
] as const

const FeedbackSection = memo(function FeedbackSection() {
  const { theme } = useThemeStore()
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['key']>('feedback')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message }),
      })
      if (res.ok) {
        setSent(true)
        setMessage('')
        setTimeout(() => setSent(false), 4000)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not send — try again.')
      }
    } catch {
      setError('Could not send — try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
      className="p-6 rounded-2xl mb-8"
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
      }}
    >
      <h3 className="text-lg font-medium mb-1" style={{ color: theme.text.primary }}>
        help shape Meethril
      </h3>
      <p className="text-base mb-4" style={{ color: theme.text.muted }}>
        Something you love, wish for, or that is broken? Tell us — we read every note.
      </p>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        {CATEGORIES.map((c) => {
          const active = c.key === category
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className="px-3 py-1.5 rounded-full text-base transition-colors"
              style={
                active
                  ? { background: theme.accent.primary, color: theme.bg.primary }
                  : { background: theme.glass.bg, border: `1px solid ${theme.glass.border}`, color: theme.text.muted }
              }
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          if (error) setError(null)
        }}
        maxLength={2000}
        rows={4}
        placeholder="write your thoughts..."
        className="w-full bg-transparent outline-none text-base resize-none rounded-xl p-3"
        style={{
          color: theme.text.primary,
          border: `1px solid ${theme.glass.border}`,
        }}
      />

      <div className="flex items-center justify-between gap-3 mt-3">
        <span className="text-base" style={{ color: sent ? theme.accent.primary : '#b94c4c' }}>
          {sent ? 'thank you 🌱' : error || ''}
        </span>
        <motion.button
          onClick={submit}
          disabled={sending || !message.trim()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-5 py-2 rounded-full text-base whitespace-nowrap"
          style={{
            background: theme.accent.primary,
            color: theme.bg.primary,
            opacity: sending || !message.trim() ? 0.5 : 1,
            cursor: sending || !message.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? 'sending...' : 'send'}
        </motion.button>
      </div>
    </motion.div>
  )
})

export default function MePage() {
  const { theme } = useThemeStore()
  const { user, logout } = useAuthStore()
  const { profile, loading, fetchProfile } = useProfileStore()
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-center"
          style={{ color: theme.text.muted }}
        >
          loading...
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="text-center mb-10"
      >
        <h1
          className="text-3xl font-light"
          style={{ color: theme.text.primary }}
        >
          {profile.nickname ? `about you, ${profile.nickname}` : 'about you'}
        </h1>
      </motion.div>

      {/* Personal Info */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.8,
          delay: 0.1,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="p-6 rounded-2xl mb-8"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <div className="space-y-5">
          <PersonalInfoInput
            label="what should we call you?"
            type="text"
            initialValue={profile.nickname || ''}
            placeholder="your nickname..."
            fieldKey="nickname"
          />
          <DateOfBirthInput
            initialValue={profile.dateOfBirth || ''}
          />
          <PersonalInfoInput
            label="email"
            type="email"
            initialValue={user?.email || ''}
            fieldKey={null}
            disabled
          />
        </div>
      </motion.div>

      {/* Divider before security */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.9 }}
        className="my-12 flex items-center gap-4"
      >
        <div
          className="flex-1 h-px"
          style={{ background: theme.glass.border }}
        />
        <span
          className="text-sm italic"
          style={{ color: theme.text.muted }}
        >
          security & privacy
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: theme.glass.border }}
        />
      </motion.div>

      {/* Gentle reminders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="p-6 rounded-2xl mb-8"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <ReminderControls />
      </motion.div>

      {/* Desktop App */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="p-6 rounded-2xl mb-8 flex items-center justify-between gap-4"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <div>
          <h3
            className="text-lg font-medium mb-1"
            style={{ color: theme.text.primary }}
          >
            Meethril on your desktop
          </h3>
          <p
            className="text-base"
            style={{ color: theme.text.muted }}
          >
            A quiet little app for your dock.
          </p>
        </div>
        <Link
          href="/download"
          className="px-4 py-2 rounded-full text-base whitespace-nowrap"
          style={{
            background: theme.accent.primary,
            color: theme.bg.primary,
          }}
        >
          Get the app
        </Link>
      </motion.div>

      {/* E2EE Settings */}
      <E2EESettings />

      {/* Feedback / suggestion / issue */}
      <FeedbackSection />

      {/* Final Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="my-12 flex items-center gap-4"
      >
        <div
          className="flex-1 h-px"
          style={{ background: theme.glass.border }}
        />
        <span
          className="text-sm"
          style={{ color: theme.text.muted }}
        >
          that&apos;s all for now
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: theme.glass.border }}
        />
      </motion.div>

      {/* Sign Out */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <motion.button
          onClick={logout}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-6 py-3 rounded-full text-base"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.muted,
          }}
        >
          sign out
        </motion.button>
      </motion.div>

      {/* Danger zone */}
      <div className="text-center mt-10">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="text-sm transition-colors"
          style={{ color: theme.text.muted, opacity: 0.7 }}
        >
          delete my account
        </button>
      </div>

      {showDeleteModal && user && (
        <DeleteAccountModal userEmail={user.email} onClose={() => setShowDeleteModal(false)} />
      )}
    </div>
  )
}
