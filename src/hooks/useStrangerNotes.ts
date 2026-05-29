// src/hooks/useStrangerNotes.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  messageCount: number
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

export type StrangerFilter = 'all' | 'penpals' | 'strangers' | 'sent'

interface InboxPage {
  threads: InboxThread[]
  nextCursor: string | null
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
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [counters, setCounters] = useState<{ sent: number; received: number }>({ sent: 0, received: 0 })
  const [filter, setFilterState] = useState<StrangerFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tracks the filter of the most recent first-page load, so loadMore/refresh stay coherent.
  const filterRef = useRef<StrangerFilter>('all')

  const loadFirstPage = useCallback(async (f: StrangerFilter) => {
    setLoading(true)
    setError(null)
    filterRef.current = f
    try {
      const page = await jsonFetch<InboxPage>(`/api/stranger-notes/inbox?filter=${f}`)
      setThreads(page.threads)
      setNextCursor(page.nextCursor)
      setCounters(page.counters)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadFirstPage(filterRef.current)
  }, [loadFirstPage])

  const setFilter = useCallback(
    (f: StrangerFilter) => {
      setFilterState(f)
      loadFirstPage(f)
    },
    [loadFirstPage],
  )

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await jsonFetch<InboxPage>(
        `/api/stranger-notes/inbox?filter=${filterRef.current}&cursor=${encodeURIComponent(nextCursor)}`,
      )
      setThreads((prev) => [...prev, ...page.threads])
      setNextCursor(page.nextCursor)
    } catch {
      // keep what we have; user can retry
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

  useEffect(() => {
    loadFirstPage('all')
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
    }
  }, [loadFirstPage, refresh])

  const sendNewNote = useCallback(
    async (content: string, country?: string, stateName?: string) => {
      await jsonFetch('/api/stranger-notes', {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName }),
      })
      await refresh()
    },
    [refresh],
  )

  const sendReply = useCallback(
    async (threadId: string, content: string, country?: string, stateName?: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName, encryptionTier: 'server' }),
      })
      await refresh()
    },
    [refresh],
  )

  const sendReplyEncrypted = useCallback(
    async (threadId: string, ciphertext: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ encryptionTier: 'thread', ciphertext }),
      })
      await refresh()
    },
    [refresh],
  )

  const skip = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/skip`, { method: 'POST' })
      await refresh()
    },
    [refresh],
  )

  const block = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/block`, { method: 'POST' })
      await refresh()
    },
    [refresh],
  )

  const waveOffered = useCallback(async (threadId: string) => {
    await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave-offered`, { method: 'POST' })
  }, [])

  const wave = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave`, { method: 'POST' })
      await refresh()
    },
    [refresh],
  )

  const endPenPal = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' })
      await refresh()
    },
    [refresh],
  )

  return {
    threads,
    nextCursor,
    counters,
    filter,
    setFilter,
    loadMore,
    loading,
    loadingMore,
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
