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
  const [filter, setFilterState] = useState<StrangerFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tracks the filter of the most recent first-page load, so loadMore/refresh stay coherent.
  const filterRef = useRef<StrangerFilter>('all')
  // Monotonic load id: a newer first-page load invalidates any in-flight
  // first-page OR loadMore response, so a fast filter switch can't append /
  // overwrite with stale data.
  const reqIdRef = useRef(0)

  const loadFirstPage = useCallback(async (f: StrangerFilter) => {
    const myReq = ++reqIdRef.current
    setLoading(true)
    setError(null)
    setNextCursor(null) // drop the previous filter's cursor immediately
    filterRef.current = f
    try {
      const page = await jsonFetch<InboxPage>(`/api/stranger-notes/inbox?filter=${f}`)
      if (myReq !== reqIdRef.current) return
      setThreads(page.threads)
      setNextCursor(page.nextCursor)
    } catch (e) {
      if (myReq !== reqIdRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      if (myReq === reqIdRef.current) setLoading(false)
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
    const myReq = reqIdRef.current
    setLoadingMore(true)
    try {
      const page = await jsonFetch<InboxPage>(
        `/api/stranger-notes/inbox?filter=${filterRef.current}&cursor=${encodeURIComponent(nextCursor)}`,
      )
      // A filter switch (loadFirstPage) since we started invalidates this append.
      if (myReq !== reqIdRef.current) return
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
