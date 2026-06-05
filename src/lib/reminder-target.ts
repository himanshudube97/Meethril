import { targetMinutesPastSeven } from './reminder-schedule'

const WINDOW_START_HOUR = 19 // matches reminder-schedule's 7pm anchor

// Wall-clock "HH:MM" for the user's reminder target today.
// reminderTime is 'HH:MM' (override) or null (deterministic default slot).
export function targetTimeHHMM(args: { userId: string; dateStr: string; reminderTime: string | null }): string {
  // Guard malformed reminderTime: targetMinutesPastSeven returns a large
  // negative INVALID_TARGET sentinel for bad 'HH:MM', which would otherwise
  // produce a nonsense/negative wall-clock time below. Fall back to the
  // deterministic default slot instead.
  const validOverride = args.reminderTime && /^\d{2}:\d{2}$/.test(args.reminderTime)
    ? args.reminderTime
    : null

  const minsPastSeven = validOverride
    ? targetMinutesPastSeven({ mode: 'override', time: validOverride })
    : targetMinutesPastSeven({ mode: 'default', userId: args.userId, dateStr: args.dateStr })
  const totalMin = WINDOW_START_HOUR * 60 + minsPastSeven
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// True if nowLocalISO ('YYYY-MM-DDTHH:MM:..') is at/after target HH:MM today.
export function isAtOrAfterTarget(nowLocalISO: string, targetHHMM: string): boolean {
  const m = nowLocalISO.match(/T(\d{2}):(\d{2})/)
  if (!m) return false
  const nowMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const [th, tm] = targetHHMM.split(':').map(n => parseInt(n, 10))
  return nowMin >= th * 60 + tm
}
