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

// Debounced save hook
function useDebouncedSave(delay = 500) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (key: ProfileKey, value: string) => {
    // Clear existing timer
    if (timer) clearTimeout(timer)
    setSaved(false)

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
        }
      } catch {
        // Silently fail
      } finally {
        setSaving(false)
      }
    }, delay)

    setTimer(newTimer)
  }, [timer, delay])

  return { saving, saved, save }
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
  const { saving, saved, save } = useDebouncedSave()

  // Sync initial value when it changes (after fetch)
  useEffect(() => {
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
        className="block text-xs mb-2"
        style={{ color: theme.text.muted }}
      >
        {label}
        {saving && <span className="ml-2 opacity-60">saving...</span>}
        {saved && !saving && <span className="ml-2" style={{ color: theme.accent.primary }}>saved</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full bg-transparent outline-none ${type === 'text' ? 'text-lg font-light' : 'text-sm'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
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
  const { saving, saved, save } = useDebouncedSave()

  // Sync initial value when it changes (after fetch)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const handleChange = (newValue: string) => {
    setValue(newValue)
    save('dateOfBirth', newValue)
  }

  return (
    <div>
      <label
        className="block text-xs mb-2"
        style={{ color: theme.text.muted }}
      >
        when were you born?
        {saving && <span className="ml-2 opacity-60">saving...</span>}
        {saved && !saving && <span className="ml-2" style={{ color: theme.accent.primary }}>saved</span>}
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
  // The master key now lives in sessionStorage and always clears on tab
  // close — no TTL state to track. Kept the "session only" copy below.

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
            className="text-base font-medium"
            style={{ color: theme.text.primary }}
          >
            End-to-end encryption
          </h3>

          {!isEnabled && (
            <>
              <p
                className="text-sm"
                style={{ color: theme.text.secondary }}
              >
                Encrypt your journal entries with a key only you know. Not even we can read them.
              </p>
              <motion.button
                onClick={() => setShowSetupModal(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={e2eeLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium"
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
              <p className="text-xs" style={{ color: theme.text.secondary }}>
                {keyData?.e2eeSetupAt
                  ? `Encrypted on ${new Date(keyData.e2eeSetupAt).toLocaleDateString()}.`
                  : 'Encrypted.'}
              </p>
              <p className="text-xs" style={{ color: theme.text.secondary }}>
                {isUnlocked
                  ? 'Unlocked on this device (session only).'
                  : 'Locked.'}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => clearMasterKey()}
                  className="px-3 py-1.5 rounded-lg text-xs"
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
                  className="px-3 py-1.5 rounded-lg text-xs"
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
                  className="px-3 py-1.5 rounded-lg text-xs"
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
            </>
          )}

          <Link
            href="/security"
            className="text-xs underline block pt-1"
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

export default function MePage() {
  const { theme } = useThemeStore()
  const { user, logout } = useAuthStore()
  const { profile, loading, fetchProfile } = useProfileStore()

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
          className="text-2xl font-light"
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
          className="text-xs italic"
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
            className="text-base font-medium mb-1"
            style={{ color: theme.text.primary }}
          >
            Hearth on your desktop
          </h3>
          <p
            className="text-sm"
            style={{ color: theme.text.muted }}
          >
            A quiet little app for your dock.
          </p>
        </div>
        <Link
          href="/download"
          className="px-4 py-2 rounded-full text-sm whitespace-nowrap"
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
          className="text-xs"
          style={{ color: theme.text.muted }}
        >
          that's all for now
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
          className="px-6 py-3 rounded-full text-sm"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.muted,
          }}
        >
          sign out
        </motion.button>
      </motion.div>
    </div>
  )
}
