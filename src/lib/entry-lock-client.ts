/**
 * Client-side mirror of the server lock check. Compares the user's local
 * calendar day against createdAt's local calendar day. The server uses the
 * IANA tz the client sends, so as long as the client is honest about its
 * timezone, both sides agree.
 */
export function isEntryLocked(
  createdAt: Date | string,
  opts?: { entryType?: string | null; isSealed?: boolean | null },
): boolean {
  // Letters lock on seal, not on the day flip. Mirror server logic.
  if (opts?.entryType && opts.entryType !== 'normal') {
    return opts.isSealed === true
  }
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return created.toDateString() !== new Date().toDateString()
}

/**
 * Best-effort IANA timezone of the current browser. Sent on every save
 * request so the server enforces the same calendar-day boundary the UI does.
 */
export function getClientTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * "YYYY-MM" for a date in the user's *local* timezone. The entries API buckets
 * entries by local month (it reads X-User-TZ), so an entry written at "May 1
 * 00:30 IST" lives in the May diary even though its UTC createdAt is in April.
 * Any client-side month comparison must therefore use the local month, not a
 * raw UTC-string prefix, or boundary entries get mis-bucketed.
 */
export function localMonthKey(createdAt: Date | string): string {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  try {
    // en-CA formats as YYYY-MM-DD; slice to YYYY-MM.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: getClientTz(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(date)
      .slice(0, 7)
  } catch {
    return date.toISOString().slice(0, 7)
  }
}
