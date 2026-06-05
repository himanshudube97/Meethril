'use client'

import { useCallback, useEffect, useState } from 'react'

export type ReminderTimeMode = 'default' | { time: string }  // 'default' = surprise me

export interface UseRemindersResult {
  pushSupported: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
  subscribe(): Promise<{ ok: boolean; error?: string }>
  unsubscribe(): Promise<void>
  setReminderTime(mode: ReminderTimeMode): Promise<void>
  refreshPermission(): void
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Std)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

async function setRemindersEnabled(enabled: boolean): Promise<void> {
  await fetch('/api/me/profile-flags', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ remindersEnabled: enabled }),
  }).catch(() => {})
}

export function useReminders(): UseRemindersResult {
  const pushSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  // Lazy init: read Notification.permission once at mount without re-rendering.
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    pushSupported ? Notification.permission : 'unsupported'
  )
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!pushSupported) return
    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (!cancelled) setSubscribed(Boolean(sub)) })
    return () => { cancelled = true }
  }, [pushSupported])

  // Auto-update when the user flips the browser's site-notification setting.
  useEffect(() => {
    if (!pushSupported || !('permissions' in navigator)) return
    let cancelled = false
    let status: PermissionStatus | null = null
    const handler = () => {
      if (status) setPermission(status.state as NotificationPermission)
    }
    navigator.permissions
      .query({ name: 'notifications' as PermissionName })
      .then((s) => {
        if (cancelled) return
        status = s
        s.addEventListener('change', handler)
        // Sync once, in case permission changed before the listener attached.
        setPermission(s.state as NotificationPermission)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      status?.removeEventListener('change', handler)
    }
  }, [pushSupported])

  const refreshPermission = useCallback(() => {
    if (pushSupported) setPermission(Notification.permission)
  }, [pushSupported])

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!pushSupported) return { ok: false, error: 'unsupported' }

    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== 'granted') return { ok: false, error: 'denied' }

    const reg = await navigator.serviceWorker.ready
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapid) return { ok: false, error: 'no-vapid-key' }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    })

    const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
        tz,
      }),
    })
    if (!res.ok) return { ok: false, error: 'server-error' }

    setSubscribed(true)
    await setRemindersEnabled(true)
    return { ok: true }
  }, [pushSupported])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!pushSupported) return
    // remindersEnabled is the desktop app's on/off signal — always clear it on
    // disable, even when no live PushSubscription exists in this browser.
    await setRemindersEnabled(false)
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) {
      setSubscribed(false)
      return
    }
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe()
    setSubscribed(false)
  }, [pushSupported])

  const setReminderTime = useCallback(async (mode: ReminderTimeMode) => {
    const reminderTime = mode === 'default' ? null : mode.time
    await fetch('/api/me/profile-flags', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reminderTime }),
    })
  }, [])

  return { pushSupported, permission, subscribed, subscribe, unsubscribe, setReminderTime, refreshPermission }
}
