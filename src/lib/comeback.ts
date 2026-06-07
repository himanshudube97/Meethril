import type { ComebackTier } from './comeback-messages'

function localDateString(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)  // "YYYY-MM-DD"
}

function daysBetweenLocalDates(a: string, b: string): number {
  // a, b: "YYYY-MM-DD" — treat as UTC-midnight, diff in days
  const aDate = new Date(`${a}T00:00:00Z`).getTime()
  const bDate = new Date(`${b}T00:00:00Z`).getTime()
  return Math.round((aDate - bDate) / 86_400_000)
}

export function gapDaysLocal(args: {
  now: Date
  lastEntryAt: Date | null
  tz: string
}): number {
  if (!args.lastEntryAt) return Infinity
  const today = localDateString(args.now, args.tz)
  const last = localDateString(args.lastEntryAt, args.tz)
  return Math.max(0, daysBetweenLocalDates(today, last))
}

export function tierFor(gapDays: number): ComebackTier | null {
  // No finite gap means the user has never journaled (lastEntryAt was null).
  // A "comeback" requires a prior visit to come back from, so show nothing.
  if (!Number.isFinite(gapDays)) return null
  if (gapDays <= 0) return null
  if (gapDays <= 2) return 'whisper'
  if (gapDays <= 7) return 'card'
  return 'modal'
}

export function shouldShowComeback(args: {
  now: Date
  lastComebackShownAt: Date | null
  tz: string
}): boolean {
  if (!args.lastComebackShownAt) return true
  const today = localDateString(args.now, args.tz)
  const lastShown = localDateString(args.lastComebackShownAt, args.tz)
  return today !== lastShown
}
