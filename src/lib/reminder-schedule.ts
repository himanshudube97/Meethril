import { createHash } from 'crypto'

const DEFAULT_WINDOW_START_HOUR = 19  // 7pm
const SLOT_MINUTES = 15
const SLOTS_IN_WINDOW = 12  // 12 * 15 = 180 min = 3 hours = 7pm-10pm

export function defaultSlotForDay(userId: string, dateStr: string): number {
  const hash = createHash('sha256').update(`${userId}:${dateStr}`).digest('hex')
  const intVal = parseInt(hash.slice(0, 8), 16)
  return intVal % SLOTS_IN_WINDOW
}

export type TargetInput =
  | { mode: 'default'; userId: string; dateStr: string }
  | { mode: 'override'; time: string } // HH:MM

export function targetMinutesPastSeven(input: TargetInput): number {
  if (input.mode === 'default') {
    return defaultSlotForDay(input.userId, input.dateStr) * SLOT_MINUTES
  }
  // Strict HH:MM guard. A malformed reminderTime (empty string, "20:00:00",
  // garbage from a manual DB edit) previously produced NaN here which silently
  // disabled push notifications for that user forever — isCurrentWindowTarget
  // would compare NaN !== NaN and always return false.
  const match = /^(\d{2}):(\d{2})$/.exec(input.time)
  if (!match) return INVALID_TARGET
  const hh = Number(match[1])
  const mm = Number(match[2])
  return (hh - DEFAULT_WINDOW_START_HOUR) * 60 + mm
}

// Sentinel that no real wall-clock minute can match, so the cron silently
// skips users whose reminderTime is corrupted instead of firing at an
// unpredictable time. Outside any normal window comparison.
const INVALID_TARGET = -9999

export function isCurrentWindowTarget(args: {
  nowLocalISO: string  // local-wall-clock ISO, e.g. '2026-05-03T20:07:00'
  targetMinutesPastSeven: number
}): boolean {
  const m = args.nowLocalISO.match(/T(\d{2}):(\d{2})/)
  if (!m) return false
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  const minutesPastSeven = (hh - DEFAULT_WINDOW_START_HOUR) * 60 + mm

  // Slot boundaries: target lands in slot floor(target/15); now lands in slot floor(now/15)
  return Math.floor(minutesPastSeven / SLOT_MINUTES) ===
         Math.floor(args.targetMinutesPastSeven / SLOT_MINUTES)
}
