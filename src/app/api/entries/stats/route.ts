import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

/**
 * Returns YYYY-MM-DD for a given UTC instant in the given IANA tz.
 * Mirrors the dayKey pattern used elsewhere on the server.
 */
function localDateKey(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
}

interface MonthStats {
  month: string // "2024-02"
  entryCount: number
  daysWithEntries: number
}

interface YearStats {
  year: number
  entryCount: number
  months: MonthStats[]
}

// GET - Fetch entry statistics for navigation and insights
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Group dates in the user's tz so a midnight-boundary entry counts toward
    // the right month/day on the shelf and in streak math, not the server's.
    const userTz = request.headers.get('x-user-tz') ?? 'UTC'

    // Only journal entries. Letters live in the `letters` table; legacy
    // letter/unsent_letter rows in this table shouldn't inflate shelf month
    // counts or streaks.
    const entries = await prisma.journalEntry.findMany({
      where: { userId: user.id, entryType: 'normal' },
      select: {
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (entries.length === 0) {
      return NextResponse.json({
        totalEntries: 0,
        years: [],
        firstEntryDate: null,
        lastEntryDate: null,
        currentStreak: 0,
        longestStreak: 0,
      })
    }

    // Group entries by year and month
    const yearMap = new Map<number, Map<string, { entries: typeof entries; days: Set<string> }>>()

    entries.forEach(entry => {
      const date = new Date(entry.createdAt)
      const ymd = localDateKey(date, userTz) // "YYYY-MM-DD"
      const year = parseInt(ymd.slice(0, 4))
      const month = ymd.slice(0, 7) // "YYYY-MM"
      const day = ymd

      if (!yearMap.has(year)) {
        yearMap.set(year, new Map())
      }
      const monthMap = yearMap.get(year)!

      if (!monthMap.has(month)) {
        monthMap.set(month, { entries: [], days: new Set() })
      }
      const monthData = monthMap.get(month)!
      monthData.entries.push(entry)
      monthData.days.add(day)
    })

    // Calculate year stats
    const years: YearStats[] = []

    yearMap.forEach((monthMap, year) => {
      const months: MonthStats[] = []
      let yearEntryCount = 0

      monthMap.forEach((data, month) => {
        const entryCount = data.entries.length
        months.push({
          month,
          entryCount,
          daysWithEntries: data.days.size,
        })
        yearEntryCount += entryCount
      })

      // Sort months in descending order
      months.sort((a, b) => b.month.localeCompare(a.month))

      years.push({
        year,
        entryCount: yearEntryCount,
        months,
      })
    })

    // Sort years in descending order
    years.sort((a, b) => b.year - a.year)

    // Calculate streaks. Dedupe by YYYY-MM-DD in the user's tz so a single
    // calendar day counts once even if it has multiple entries, and so a
    // midnight-boundary entry attributes to the right local day.
    const dayKeys = [...new Set(entries.map(e => localDateKey(new Date(e.createdAt), userTz)))]
      .sort()
      .reverse() // most-recent day first

    const dayKeyToTime = (key: string) => {
      const [y, m, d] = key.split('-').map(Number)
      return Date.UTC(y, m - 1, d) // arbitrary anchor; only diffs matter
    }
    const ONE_DAY = 24 * 60 * 60 * 1000

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 1

    if (dayKeys.length > 0) {
      const todayKey = localDateKey(new Date(), userTz)
      const yesterdayKey = localDateKey(new Date(Date.now() - ONE_DAY), userTz)

      if (dayKeys[0] === todayKey || dayKeys[0] === yesterdayKey) {
        currentStreak = 1
        for (let i = 1; i < dayKeys.length; i++) {
          const diff = (dayKeyToTime(dayKeys[i - 1]) - dayKeyToTime(dayKeys[i])) / ONE_DAY
          if (diff === 1) currentStreak++
          else break
        }
      }

      for (let i = 1; i < dayKeys.length; i++) {
        const diff = (dayKeyToTime(dayKeys[i - 1]) - dayKeyToTime(dayKeys[i])) / ONE_DAY
        if (diff === 1) {
          tempStreak++
        } else {
          longestStreak = Math.max(longestStreak, tempStreak)
          tempStreak = 1
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak)
    }

    return NextResponse.json({
      totalEntries: entries.length,
      years,
      firstEntryDate: entries[entries.length - 1].createdAt,
      lastEntryDate: entries[0].createdAt,
      currentStreak,
      longestStreak,
    })
  } catch (error) {
    console.error('Error fetching entry stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch entry stats' },
      { status: 500 }
    )
  }
}
