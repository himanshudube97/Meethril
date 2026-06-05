import { isTauri } from './isTauri'

export async function enableDesktopReminders(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  // Ensure the server flag is set even though the webview can't web-push.
  await fetch('/api/me/profile-flags', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ remindersEnabled: true }),
  }).catch(() => {})
  const res = await fetch('/api/me/desktop-token', { method: 'POST' })
  if (!res.ok) throw new Error('Could not get desktop token')
  const { token } = await res.json()
  if (!token || typeof token !== 'string') throw new Error('Desktop token missing')
  await invoke('save_desktop_token', { token })
  await invoke('install_reminder_agent', { baseUrl: window.location.origin })
}

export async function disableDesktopReminders(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await fetch('/api/me/profile-flags', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ remindersEnabled: false }),
  }).catch(() => {})
  await invoke('remove_reminder_agent')
}
