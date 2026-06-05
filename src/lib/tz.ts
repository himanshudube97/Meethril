export function localWallClockISO(now: Date, tz: string): string {
  // Build an ISO-like string representing the wall-clock time in the given TZ.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  // 'en-CA' gives YYYY-MM-DD and HH:MM:SS — but hour can be '24' for midnight in some impls
  const hh = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}`
}

export function localDateStr(now: Date, tz: string): string {
  return localWallClockISO(now, tz).slice(0, 10)
}

export function startOfLocalDayUTC(now: Date, tz: string): Date {
  const dateStr = localDateStr(now, tz)
  // Construct midnight in the user's TZ as a UTC instant.
  // Trick: parse "YYYY-MM-DDT00:00:00" as if it were UTC, then offset back by the TZ's offset at that instant.
  const naiveUtc = new Date(`${dateStr}T00:00:00Z`)
  const tzOffsetMinutes = (() => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    })
    const parts = fmt.formatToParts(naiveUtc)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+00:00'
    const m = offsetPart.match(/GMT([+-])(\d{2}):(\d{2})/)
    if (!m) return 0
    const sign = m[1] === '+' ? 1 : -1
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
  })()
  return new Date(naiveUtc.getTime() - tzOffsetMinutes * 60_000)
}
