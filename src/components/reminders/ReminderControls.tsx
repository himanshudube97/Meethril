'use client'

import { useEffect, useState } from 'react'
import { useReminders } from '@/hooks/useReminders'
import { useThemeStore } from '@/store/theme'
import { isTauri } from '@/lib/desktop/isTauri'
import { enableDesktopReminders, disableDesktopReminders } from '@/lib/desktop/reminders'

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
}

export default function ReminderControls() {
  const { theme } = useThemeStore()
  const { pushSupported, permission, subscribed, subscribe, unsubscribe, setReminderTime, refreshPermission } = useReminders()
  const [reminderTime, setReminderTimeLocal] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [testing, setTesting] = useState(false)
  // Desktop (Tauri) reminders are driven by a launchd agent, not web push.
  const desktop = isTauri()
  const [desktopEnabled, setDesktopEnabled] = useState(false)
  const [desktopBusy, setDesktopBusy] = useState(false)

  useEffect(() => {
    fetch('/api/me/profile-flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile?.reminderTime) setReminderTimeLocal(data.profile.reminderTime)
        if (desktop) {
          const on = Boolean(data?.profile?.remindersEnabled)
          setDesktopEnabled(on)
          // Self-heal: re-mint token + re-install agent on launch (idempotent),
          // so it survives reboots/reinstalls and picks up token refreshes.
          if (on) enableDesktopReminders().catch(() => {})
        }
      })
    fetch('/api/me/reminder-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPaused(Boolean(data?.paused)))
  }, [desktop])

  const heading = (
    <h2 className="font-serif text-xl" style={{ color: theme.text.primary }}>
      Gentle reminders
    </h2>
  )

  async function handleTime(value: string) {
    const time = value || null
    setReminderTimeLocal(time)
    await setReminderTime(time === null ? 'default' : { time })
  }

  // Desktop app: the webview can't web-push, so render a launchd-backed toggle
  // instead of the push UI (which is gated on pushSupported === false here).
  if (desktop) {
    return (
      <section id="reminders" className="space-y-4">
        {heading}
        {!desktopEnabled && (
          <button
            onClick={async () => {
              setDesktopBusy(true)
              try {
                await enableDesktopReminders()
                setDesktopEnabled(true)
              } catch {
                alert('Could not enable reminders. Please try again.')
              } finally {
                setDesktopBusy(false)
              }
            }}
            disabled={desktopBusy}
            className="px-4 py-2 rounded-xl text-base font-medium"
            style={{ background: theme.accent.primary, color: '#fff', opacity: desktopBusy ? 0.6 : 1 }}
          >
            {desktopBusy ? 'Enabling...' : 'Enable nightly reminders'}
          </button>
        )}

        {desktopEnabled && (
          <>
            <div className="space-y-2">
              <label className="block text-base" style={{ color: theme.text.secondary }}>
                When should we ping you?
              </label>
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={() => handleTime('')}
                  className="px-3 py-1.5 rounded-lg text-base"
                  style={
                    reminderTime === null
                      ? { background: theme.accent.primary, color: '#fff' }
                      : {
                          background: theme.glass.bg,
                          border: `1px solid ${theme.glass.border}`,
                          color: theme.text.secondary,
                        }
                  }
                >
                  Surprise me (7–10pm)
                </button>
                <span style={{ color: theme.text.muted }}>or</span>
                <input
                  type="time"
                  value={reminderTime ?? ''}
                  onChange={(e) => handleTime(e.target.value)}
                  className="px-2 py-1 rounded-lg text-base bg-transparent"
                  style={{ border: `1px solid ${theme.glass.border}`, color: theme.text.primary }}
                />
              </div>
            </div>
            <button
              onClick={async () => {
                setDesktopBusy(true)
                try {
                  await disableDesktopReminders()
                  setDesktopEnabled(false)
                } finally {
                  setDesktopBusy(false)
                }
              }}
              disabled={desktopBusy}
              className="px-3 py-1.5 rounded-lg text-base"
              style={{ color: theme.text.muted, opacity: desktopBusy ? 0.6 : 1 }}
            >
              Turn off
            </button>
          </>
        )}
      </section>
    )
  }

  if (!pushSupported) {
    if (isIosSafari()) {
      return (
        <section id="reminders" className="space-y-2">
          {heading}
          <p className="text-base" style={{ color: theme.text.secondary }}>
            To get reminders on iPhone, install Hearth as a PWA: tap Share → Add to Home Screen,
            then open Hearth from your home screen and try again.
          </p>
        </section>
      )
    }
    return (
      <section id="reminders" className="space-y-2">
        {heading}
        <p className="text-base" style={{ color: theme.text.secondary }}>
          Your browser doesn&apos;t support push notifications.
        </p>
      </section>
    )
  }

  async function handleEnable() {
    const result = await subscribe()
    if (!result.ok && result.error === 'denied') {
      alert('Notifications are blocked. Open your browser settings → Site settings to allow notifications for Hearth.')
    }
  }

  return (
    <section id="reminders" className="space-y-4">
      {heading}

      {!subscribed && permission !== 'denied' && (
        <button
          onClick={handleEnable}
          className="px-4 py-2 rounded-xl text-base font-medium"
          style={{ background: theme.accent.primary, color: '#fff' }}
        >
          Enable nightly reminders
        </button>
      )}

      {!subscribed && permission === 'denied' && (
        <div className="space-y-3">
          <p className="text-base" style={{ color: theme.text.secondary }}>
            Notifications are blocked for Hearth in your browser.
          </p>
          <details className="text-sm" style={{ color: theme.text.muted }}>
            <summary className="cursor-pointer select-none" style={{ color: theme.text.secondary }}>
              How to re-enable
            </summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1 leading-relaxed">
              <li>Click the lock / settings icon in your browser&apos;s address bar.</li>
              <li>Find <strong>Notifications</strong> and switch it to <strong>Allow</strong>.</li>
              <li>Come back here and click the button below.</li>
            </ol>
            <p className="mt-2 italic">
              On iPhone: install Hearth as a PWA (Share → Add to Home Screen), open it from the home screen, and grant notifications there.
            </p>
          </details>
          <button
            onClick={refreshPermission}
            className="px-3 py-1.5 rounded-lg text-base"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              color: theme.text.secondary,
            }}
          >
            I&apos;ve allowed it — try again
          </button>
        </div>
      )}

      {subscribed && (
        <>
          {paused && (
            <p className="text-base italic" style={{ color: theme.text.secondary }}>
              Reminders are currently paused (no entries written for a week). Re-enable below to start again.
            </p>
          )}
          <div className="space-y-2">
            <label className="block text-base" style={{ color: theme.text.secondary }}>
              When should we ping you?
            </label>
            <div className="flex gap-2 items-center flex-wrap">
              <button
                onClick={() => handleTime('')}
                className="px-3 py-1.5 rounded-lg text-base"
                style={
                  reminderTime === null
                    ? { background: theme.accent.primary, color: '#fff' }
                    : {
                        background: theme.glass.bg,
                        border: `1px solid ${theme.glass.border}`,
                        color: theme.text.secondary,
                      }
                }
              >
                Surprise me (7–10pm)
              </button>
              <span style={{ color: theme.text.muted }}>or</span>
              <input
                type="time"
                value={reminderTime ?? ''}
                onChange={(e) => handleTime(e.target.value)}
                className="px-2 py-1 rounded-lg text-base bg-transparent"
                style={{
                  border: `1px solid ${theme.glass.border}`,
                  color: theme.text.primary,
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                setTesting(true)
                try {
                  const res = await fetch('/api/push/test', { method: 'POST' })
                  if (!res.ok) alert('Test failed — check the console.')
                } finally {
                  setTesting(false)
                }
              }}
              disabled={testing}
              className="px-3 py-1.5 rounded-lg text-base"
              style={{
                background: theme.glass.bg,
                border: `1px solid ${theme.glass.border}`,
                color: theme.text.secondary,
                opacity: testing ? 0.6 : 1,
              }}
            >
              {testing ? 'Sending...' : 'Send a test reminder'}
            </button>
            <button
              onClick={unsubscribe}
              className="px-3 py-1.5 rounded-lg text-base"
              style={{ color: theme.text.muted }}
            >
              Turn off
            </button>
          </div>
        </>
      )}
    </section>
  )
}
