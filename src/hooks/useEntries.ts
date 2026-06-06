import { useState, useEffect, useCallback, useRef } from 'react'
import { JournalEntry } from '@/store/journal'
import { useE2EE } from './useE2EE'
import { getClientTz } from '@/lib/entry-lock-client'

interface Pagination {
  hasMore: boolean
  nextCursor: string | null
  limit: number
}

interface EntriesResponse {
  entries: JournalEntry[]
  pagination: Pagination
}

interface MonthStats {
  month: string
  entryCount: number
  daysWithEntries: number
}

interface YearStats {
  year: number
  entryCount: number
  months: MonthStats[]
}

interface StatsResponse {
  totalEntries: number
  years: YearStats[]
  firstEntryDate: string | null
  lastEntryDate: string | null
  currentStreak: number
  longestStreak: number
}

interface UseEntriesOptions {
  month?: string // "2024-02"
  year?: string
  search?: string
  today?: boolean
  limit?: number
  includeDoodles?: boolean
}

export function useEntries(options: UseEntriesOptions = {}) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<Pagination>({
    hasMore: false,
    nextCursor: null,
    limit: 20,
  })
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  const buildUrl = useCallback((cursor?: string) => {
    const params = new URLSearchParams()

    if (options.month) params.set('month', options.month)
    if (options.year) params.set('year', options.year)
    if (options.search) params.set('search', options.search)
    if (options.today) params.set('today', 'true')
    if (options.limit) params.set('limit', options.limit.toString())
    if (options.includeDoodles === false) params.set('includeDoodles', 'false')
    if (cursor) params.set('cursor', cursor)

    return `/api/entries?${params.toString()}`
  }, [options.month, options.year, options.search, options.today, options.limit, options.includeDoodles])

  // Monotonic counter + cursor ref. The counter discards stale responses so
  // a fast month-switch or search-keystroke never overwrites the live data
  // with results from a superseded request. Keeping the cursor in a ref means
  // fetchEntries identity no longer churns on every setPagination call (which
  // was thrashing the IntersectionObserver in the timeline route).
  const fetchCounterRef = useRef(0)
  const cursorRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    // Reset to true on mount, not just rely on the ref's initial value: React
    // StrictMode (dev) mounts → unmounts → remounts, and the simulated unmount's
    // cleanup sets this false. Without re-setting it true here, the ref stays
    // false for the component's whole life, so every resolved fetch bails before
    // setEntries/setLoading(false) — leaving views stuck on their loading state.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchEntries = useCallback(async (reset = true) => {
    const myCount = ++fetchCounterRef.current
    try {
      if (reset) {
        setLoading(true)
        setEntries([])
        cursorRef.current = null
      } else {
        setLoadingMore(true)
      }

      const cursor = reset ? undefined : cursorRef.current ?? undefined
      const res = await fetch(buildUrl(cursor), {
        headers: { 'X-User-TZ': getClientTz() },
      })

      if (!res.ok) {
        throw new Error('Failed to fetch entries')
      }

      const data: EntriesResponse = await res.json()

      // Decrypt E2EE entries client-side
      const decryptedEntries = await decryptEntriesFromServer(data.entries)

      // Drop stale responses: another fetch has been queued behind us.
      if (myCount !== fetchCounterRef.current || !mountedRef.current) return

      setEntries(prev => reset ? decryptedEntries : [...prev, ...decryptedEntries])
      setPagination(data.pagination)
      cursorRef.current = data.pagination.nextCursor
      setError(null)
    } catch (err) {
      if (myCount !== fetchCounterRef.current || !mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (myCount === fetchCounterRef.current && mountedRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [buildUrl, decryptEntriesFromServer])

  const loadMore = useCallback(() => {
    if (!loadingMore && pagination.hasMore) {
      fetchEntries(false)
    }
  }, [fetchEntries, loadingMore, pagination.hasMore])

  const refresh = useCallback(() => {
    fetchEntries(true)
  }, [fetchEntries])

  // Fetch when options change or E2EE state changes
  useEffect(() => {
    fetchEntries(true)
  }, [options.month, options.year, options.search, options.today, isE2EEReady])

  return {
    entries,
    loading,
    loadingMore,
    error,
    hasMore: pagination.hasMore,
    loadMore,
    refresh,
  }
}

export function useEntryStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/entries/stats', {
        headers: { 'X-User-TZ': getClientTz() },
      })

      if (!res.ok) {
        throw new Error('Failed to fetch stats')
      }

      const data: StatsResponse = await res.json()
      setStats(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  }
}

// Hook for fetching a single entry (for expanded view)
export function useEntry(id: string | null) {
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { decryptEntryFromServer, isE2EEReady } = useE2EE()

  useEffect(() => {
    if (!id) {
      setEntry(null)
      return
    }

    // Guard against id-change races: if `id` (or E2EE readiness) flips while
    // an old fetch is in flight, the old result must not overwrite the new.
    let cancelled = false

    const fetchEntry = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/entries/${id}`)

        if (!res.ok) {
          throw new Error('Failed to fetch entry')
        }

        const data = await res.json()
        // Decrypt E2EE entry client-side
        const decryptedEntry = await decryptEntryFromServer(data)
        if (cancelled) return
        setEntry(decryptedEntry)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchEntry()
    return () => {
      cancelled = true
    }
  }, [id, isE2EEReady, decryptEntryFromServer])

  return { entry, loading, error }
}
