// src/components/shelf/ShelfScene.tsx
'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEntries, useEntryStats } from '@/hooks/useEntries'
import { localMonthKey } from '@/lib/entry-lock-client'
import ShelfHeader from './ShelfHeader'
import Shelf, { ShelfMonth } from './Shelf'
import WaxSealTag from './WaxSealTag'
import ShelfBookSpread from './ShelfBookSpread'

type Mode = 'shelf' | 'open'

function parseYear(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1900 && n <= 9999 ? n : fallback
}

function parseMonth(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n - 1 : null
}

function buildMonths(
  year: number,
  stats: ReturnType<typeof useEntryStats>['stats'],
): ShelfMonth[] {
  const yearStats = stats?.years.find((y) => y.year === year)
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const ms = yearStats?.months.find((m) => m.month === monthKey)
    return { monthIndex, entryCount: ms?.entryCount ?? 0 }
  })
}

export default function ShelfScene() {
  const router = useRouter()
  const search = useSearchParams()

  const { stats, loading: statsLoading } = useEntryStats()
  const currentYear = new Date().getFullYear()

  // Years to display: any year with entries + always show the current year
  // (so a brand-new user still gets an "in progress" shelf to write into).
  const displayYears = useMemo(() => {
    const set = new Set<number>([currentYear])
    if (stats) for (const y of stats.years) set.add(y.year)
    return [...set].sort((a, b) => b - a) // newest first
  }, [stats, currentYear])

  const fallback = displayYears[0] ?? currentYear
  const selectedYear = parseYear(search.get('year'), fallback)
  const selectedMonth = parseMonth(search.get('month'))
  const mode: Mode = selectedMonth === null ? 'shelf' : 'open'

  const monthsByYear = useMemo(() => {
    const map = new Map<number, ShelfMonth[]>()
    for (const y of displayYears) map.set(y, buildMonths(y, stats))
    return map
  }, [displayYears, stats])

  const entriesThisYear = useMemo(() => {
    const months = monthsByYear.get(currentYear) ?? []
    return months.reduce((sum, m) => sum + m.entryCount, 0)
  }, [monthsByYear, currentYear])
  const totalEntries = stats?.totalEntries ?? 0

  const setQuery = useCallback(
    (next: { year?: number; month?: number | null }) => {
      const params = new URLSearchParams(search.toString())
      if (next.year !== undefined) params.set('year', String(next.year))
      if (next.month === null) params.delete('month')
      else if (next.month !== undefined) params.set('month', String(next.month + 1))
      params.delete('open')
      const qs = params.toString()
      router.replace(qs ? `/shelf?${qs}` : '/shelf', { scroll: false })
    },
    [router, search],
  )

  const handleMonthClick = useCallback(
    (year: number, monthIndex: number) => setQuery({ year, month: monthIndex }),
    [setQuery],
  )
  const handleClose = useCallback(
    () => setQuery({ month: null }),
    [setQuery],
  )

  // Lazy-load entries for the open month only.
  const monthKey =
    selectedMonth !== null
      ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
      : undefined
  const { entries: monthEntries, loading: entriesLoading } = useEntries(
    mode === 'open' && monthKey
      ? { month: monthKey, includeDoodles: true }
      : { limit: 1 },
  )
  // Guard against showing the previous month's entries during a fast
  // month-switch: only mark the spread ready once the loaded entries actually
  // belong to the open month. Compare in the user's *local* month (matching how
  // the entries API buckets them) — a raw UTC-prefix check mis-rejects entries
  // written just after local midnight on the 1st, whose UTC createdAt is still
  // in the prior month, leaving the spread stuck on "turning to the page…".
  const spreadReady =
    !entriesLoading &&
    !!monthKey &&
    (monthEntries.length === 0 || localMonthKey(monthEntries[0].createdAt) === monthKey)

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <ShelfHeader
          selectedYear={currentYear}
          entriesThisYear={entriesThisYear}
          totalEntries={totalEntries}
        />

        {statsLoading ? (
          <p className="text-center text-sm opacity-50 py-16">opening the shelf…</p>
        ) : (
          <div className="pb-20">
            {displayYears.map((year, idx) => {
              const months = monthsByYear.get(year) ?? []
              const isCurrent = year === currentYear
              return (
                <div key={year}>
                  {/* Wax-seal tag hanging above each shelf. The first tag's
                      thread feels long (descending from the header); later
                      tags' threads are shorter — they hang from the shelf
                      directly above. */}
                  <div className="flex justify-center">
                    <WaxSealTag
                      year={year}
                      status={isCurrent ? 'in progress' : 'archive'}
                      threadLength={idx === 0 ? 28 : 40}
                    />
                  </div>
                  {/* Spacer between tag and the shelf below it */}
                  <div style={{ height: 36 }} />
                  <Shelf
                    year={year}
                    months={months}
                    onMonthClick={(m) => handleMonthClick(year, m)}
                    pulledMonthIndex={
                      mode !== 'shelf' && year === selectedYear ? selectedMonth : null
                    }
                  />
                  {/* Space below the shelf for the next tag's thread */}
                  {idx < displayYears.length - 1 && <div style={{ height: 80 }} />}
                </div>
              )
            })}
          </div>
        )}

        {mode === 'open' && selectedMonth !== null && (
          <ShelfBookSpread
            year={selectedYear}
            monthIndex={selectedMonth}
            entries={spreadReady ? monthEntries : null}
            onClose={handleClose}
          />
        )}
    </div>
  )
}
