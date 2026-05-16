'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import { useThemeStore } from '@/store/theme'
import { JournalEntry } from '@/store/journal'
import { useProfileStore } from '@/store/profile'
import { useEntries, useEntryStats } from '@/hooks/useEntries'
import EntryCard from '@/components/EntryCard'
import EntryDetailModal from '@/components/EntryDetailModal'

interface GroupedEntries {
  date: Date
  entries: JournalEntry[]
}

export default function TimelinePage() {
  const { theme } = useThemeStore()
  const { profile, fetchProfile } = useProfileStore()
  const { stats, loading: statsLoading } = useEntryStats()

  // Fetch profile for nickname
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Navigation state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Modal state
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  // Fetch entries for selected month
  const {
    entries,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  } = useEntries({
    month: searchQuery ? undefined : selectedMonth,
    search: searchQuery || undefined,
    limit: 30,
  })


  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])

  // Group entries by date
  const groupedEntries = useCallback((): GroupedEntries[] => {
    const groups: { [key: string]: JournalEntry[] } = {}

    entries.forEach((entry) => {
      const dateKey = new Date(entry.createdAt).toDateString()
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(entry)
    })

    return Object.entries(groups).map(([dateStr, entries]) => ({
      date: new Date(dateStr),
      entries,
    }))
  }, [entries])


  // Format date label
  const formatDateLabel = (date: Date): string => {
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'EEEE, MMMM d')
  }

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Get available years and months from stats
  const availableYears = stats?.years.map(y => y.year) || [new Date().getFullYear()]
  const availableMonths = stats?.years.find(y => y.year === selectedYear)?.months || []

  // Month names for tabs
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]

  // Handle year change
  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    // Select the most recent month in that year
    const yearData = stats?.years.find(y => y.year === year)
    if (yearData && yearData.months.length > 0) {
      setSelectedMonth(yearData.months[0].month)
    } else {
      setSelectedMonth(`${year}-01`)
    }
  }

  // Handle month change
  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
    setSearchQuery('')
    setSearchInput('')
  }

  const groups = groupedEntries()

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header with search and filters */}
      <div className="mb-6">
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-2xl font-light text-center mb-6"
          style={{ color: theme.text.primary }}
        >
          {profile.nickname ? `${profile.nickname}'s story unfolds` : 'your story unfolds'}
        </motion.h1>

        {/* Stats bar */}
        {stats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center gap-6 mb-6 text-sm"
            style={{ color: theme.text.muted }}
          >
            <span>{stats.totalEntries} entries</span>
            <span>·</span>
            <span>{stats.currentStreak} day streak</span>
            {stats.longestStreak > stats.currentStreak && (
              <>
                <span>·</span>
                <span>best: {stats.longestStreak} days</span>
              </>
            )}
          </motion.div>
        )}

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex gap-2 mb-4"
        >
          <div
            className="flex-1 flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
            }}
          >
            <span style={{ color: theme.text.muted }}>🔍</span>
            <input
              type="text"
              placeholder="Search your entries..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: theme.text.primary }}
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('')
                  setSearchQuery('')
                }}
                className="text-sm"
                style={{ color: theme.text.muted }}
              >
                ✕
              </button>
            )}
          </div>

        </motion.div>

        {/* Year selector */}
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-center gap-2 mb-4"
          >
            {availableYears.map((year) => (
              <motion.button
                key={year}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleYearChange(year)}
                className="px-4 py-2 rounded-full text-sm"
                style={{
                  background: selectedYear === year
                    ? `${theme.accent.primary}30`
                    : 'transparent',
                  border: selectedYear === year
                    ? `1px solid ${theme.accent.primary}`
                    : `1px solid ${theme.glass.border}`,
                  color: selectedYear === year
                    ? theme.accent.primary
                    : theme.text.muted,
                }}
              >
                {year}
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Month tabs */}
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-1 p-1 rounded-full overflow-x-auto scrollbar-hide"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
            }}
          >
            {monthNames.map((name, index) => {
              const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
              const monthData = availableMonths.find(m => m.month === monthKey)
              const hasEntries = !!monthData
              const isSelected = selectedMonth === monthKey

              return (
                <button
                  key={monthKey}
                  onClick={() => hasEntries && handleMonthChange(monthKey)}
                  className="flex-1 min-w-[48px] py-2 px-1 rounded-full text-xs relative transition-all"
                  style={{
                    background: isSelected ? `${theme.accent.primary}30` : 'transparent',
                    color: hasEntries
                      ? isSelected
                        ? theme.accent.primary
                        : theme.text.primary
                      : theme.text.muted,
                    opacity: hasEntries ? 1 : 0.4,
                    cursor: hasEntries ? 'pointer' : 'default',
                  }}
                >
                  {name}
                </button>
              )
            })}
          </motion.div>
        )}

        {/* Search results indicator */}
        {searchQuery && (
          <div
            className="text-center py-2 px-4 rounded-full text-sm"
            style={{
              background: `${theme.accent.warm}20`,
              color: theme.text.primary,
            }}
          >
            Searching all entries for "{searchQuery}"
            {entries.length > 0 && ` · ${entries.length} result${entries.length === 1 ? '' : 's'}`}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12" style={{ color: theme.text.muted }}>
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Loading your entries...
          </motion.div>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="text-center py-12">
          <p style={{ color: theme.text.muted }}>
            {searchQuery
              ? `No entries found for "${searchQuery}"`
              : 'No entries this month. Start writing to see your timeline.'}
          </p>
        </div>
      )}

      {/* Entries list */}
      {!loading && entries.length > 0 && (
        <div className="space-y-8">
          {groups.map((group, groupIndex) => (
            <motion.div
              key={group.date.toISOString()}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.5 + Math.min(groupIndex * 0.15, 0.6),
                ease: [0.22, 1, 0.36, 1]
              }}
            >
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <div>
                  <h2 className="text-lg" style={{ color: theme.text.primary }}>
                    {formatDateLabel(group.date)}
                  </h2>
                  <p className="text-xs" style={{ color: theme.text.muted }}>
                    {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                  </p>
                </div>
              </div>

              {/* Entries for this date */}
              <div
                className="space-y-3 ml-4 border-l-2 pl-6"
                style={{ borderColor: theme.glass.border }}
              >
                {group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onClick={() => setSelectedEntryId(entry.id)}
                  />
                ))}
              </div>
            </motion.div>
          ))}

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="py-4">
            {loadingMore && (
              <div className="text-center" style={{ color: theme.text.muted }}>
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  Loading more...
                </motion.div>
              </div>
            )}
            {!hasMore && entries.length > 0 && (
              <p className="text-center text-sm" style={{ color: theme.text.muted }}>
                {searchQuery ? 'End of search results' : 'You\'ve reached the beginning'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Entry Detail Modal */}
      <EntryDetailModal
        entryId={selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
        onUpdated={refresh}
      />
    </div>
  )
}
