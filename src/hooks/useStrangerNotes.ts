'use client'

import { useCallback, useEffect, useState } from 'react'

export interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

export interface InboxPayload {
  outgoing: InboxThread[]
  active: InboxThread[]
  penpals: InboxThread[]
  counters: { sent: number; received: number }
}

const TZ_HEADER = 'X-User-TZ'

function userTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set(TZ_HEADER, userTz())
  const res = await fetch(input, { ...init, headers, credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export function useStrangerNotes() {
  const [data, setData] = useState<InboxPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const inbox = await jsonFetch<InboxPayload>('/api/stranger-notes/inbox')
      setData(inbox)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // Focus-event refetch: tab visibility, window focus, manual pull.
  useEffect(() => {
    refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const sendNewNote = useCallback(
    async (content: string, country?: string, stateName?: string) => {
      await jsonFetch('/api/stranger-notes', {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName }),
      })
      await refresh()
    },
    [refresh]
  )

  const sendReply = useCallback(
    async (threadId: string, content: string, country?: string, stateName?: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName, encryptionTier: 'server' }),
      })
      await refresh()
    },
    [refresh]
  )

  const sendReplyEncrypted = useCallback(
    async (threadId: string, ciphertext: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ encryptionTier: 'thread', ciphertext }),
      })
      await refresh()
    },
    [refresh]
  )

  const skip = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/skip`, { method: 'POST' })
      await refresh()
    },
    [refresh]
  )

  const block = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/block`, { method: 'POST' })
      await refresh()
    },
    [refresh]
  )

  const waveOffered = useCallback(async (threadId: string) => {
    await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave-offered`, { method: 'POST' })
  }, [])

  const wave = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave`, { method: 'POST' })
      await refresh()
    },
    [refresh]
  )

  const endPenPal = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' })
      await refresh()
    },
    [refresh]
  )

  return {
    data,
    loading,
    error,
    refresh,
    sendNewNote,
    sendReply,
    sendReplyEncrypted,
    skip,
    block,
    waveOffered,
    wave,
    endPenPal,
  }
}
