import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

// Per-message body length cap. Same on cold opens and replies, both sides.
export const MIN_MESSAGE_CHARS = 10
export const MAX_MESSAGE_CHARS = 200

// New cold-open notes per user per local-calendar-day.
export const DAILY_NEW_NOTE_LIMIT = 2

// Lifetimes (cleanup cron enforces).
export const UNMATCHED_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const ACTIVE_SILENCE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const UNWAVED_VANISH_LIFETIME_MS = 24 * 60 * 60 * 1000
export const WAVE_DECISION_WINDOW_MS = 24 * 60 * 60 * 1000

// Number of messages each side must send before wave is eligible.
export const WAVE_ELIGIBLE_PER_SIDE = 3

export type MessageValidationError = 'empty' | 'too_short' | 'too_long'

export function validateMessageContent(
  raw: string
): { ok: true; trimmed: string } | { ok: false; error: MessageValidationError } {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length === 0) return { ok: false, error: 'empty' }
  if (trimmed.length < MIN_MESSAGE_CHARS) return { ok: false, error: 'too_short' }
  if (trimmed.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'too_long' }
  return { ok: true, trimmed }
}

export function encryptServerTier(plaintext: string): string {
  return encrypt(plaintext)
}

export function decryptServerTier(ciphertext: string): string {
  return decrypt(ciphertext)
}

export function safeIanaTz(raw: string | null | undefined): string {
  const candidate = raw && raw.length > 0 ? raw : 'UTC'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate })
    return candidate
  } catch {
    return 'UTC'
  }
}

/**
 * Returns the count of cold-open notes the user has sent today in their local timezone.
 * Used to enforce DAILY_NEW_NOTE_LIMIT. Counts rows in stranger_threads with senderId=X
 * and createdAt's local date == today's local date. This replaces v1's single-row
 * lastStrangerNoteSentAt claim which only supported a 1/day limit.
 */
export async function countTodaysNewNotes(userId: string, tz: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*) AS c FROM stranger_threads
    WHERE "senderId" = ${userId}
      AND date_trunc('day', "createdAt" AT TIME ZONE ${tz})
          = date_trunc('day', now() AT TIME ZONE ${tz})
  `
  return Number(rows[0]?.c ?? 0)
}

/**
 * Cold-start engagement gate: a user must have written at least one journal entry
 * before they can send a stranger note.
 */
export async function hasWrittenJournalEntry(userId: string): Promise<boolean> {
  const count = await prisma.journalEntry.count({
    where: { userId },
  })
  return count > 0
}
