/**
 * Server-side helpers for the calendar-day lock + append-only diff check.
 *
 * The lock window is "the same calendar date as createdAt, in the user's
 * local timezone." We accept the IANA tz from the client; if it's missing or
 * invalid we fall back to UTC. Travelling across timezones gives the user a
 * slightly different window — that's an acceptable edge case.
 */

/**
 * Returns the UTC instant that corresponds to a YYYY-MM-DD wall-clock midnight
 * in the given IANA timezone. Used by the entries API to compute month/day
 * boundaries in the user's local time so that an entry written at "May 1 00:30
 * IST" lands in the May diary, not the April one (it would in UTC).
 *
 * Iterates twice to cover the rare case of a DST transition straddling the
 * boundary: first pass finds the offset at the naive UTC guess and shifts; the
 * second pass corrects if the new instant has a different offset.
 */
export function utcInstantForLocalDate(
  year: number,
  month0: number,
  day: number,
  tz: string = 'UTC',
): Date {
  let guess = Date.UTC(year, month0, day, 0, 0, 0, 0)
  for (let i = 0; i < 2; i++) {
    let parts: Record<string, string>
    try {
      parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
          .formatToParts(new Date(guess))
          .filter((p) => p.type !== 'literal')
          .map((p) => [p.type, p.value]),
      )
    } catch {
      return new Date(guess)
    }
    const localAsUTC = Date.UTC(
      parseInt(parts.year),
      parseInt(parts.month) - 1,
      parseInt(parts.day),
      parseInt(parts.hour) % 24,
      parseInt(parts.minute),
      parseInt(parts.second),
    )
    const offsetMs = localAsUTC - guess
    if (offsetMs === 0) break
    guess = guess - offsetMs
  }
  return new Date(guess)
}

/**
 * Returns today's date components (year, month0, day) in the given IANA tz.
 * Used to build a "today" UTC window when the server runs in a different tz
 * than the user.
 */
export function localDatePartsNow(tz: string = 'UTC'): { year: number; month0: number; day: number } {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, p.value]),
    )
    return {
      year: parseInt(parts.year),
      month0: parseInt(parts.month) - 1,
      day: parseInt(parts.day),
    }
  } catch {
    const now = new Date()
    return { year: now.getUTCFullYear(), month0: now.getUTCMonth(), day: now.getUTCDate() }
  }
}

function dayKey(date: Date, tz: string): string {
  // YYYY-MM-DD in the given tz. en-CA happens to format that way.
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

export interface EntryLockOpts {
  /** Entry kind. 'normal' (or undefined) → calendar-day lock applies. Anything
   *  else (letter, unsent_letter, ephemeral) → lock only when sealed.
   *  Note: JournalEntry no longer has an isSealed column — letter drafts are
   *  always unsealed (the JE draft is deleted when the Letter row is created).
   *  Pass isSealed: false (or omit) for letter drafts. */
  entryType?: string | null
  isSealed?: boolean | null
}

export function isEntryLocked(
  createdAt: Date | string,
  tz: string = 'UTC',
  opts?: EntryLockOpts,
): boolean {
  // Letters are time-locked by sealing, not by the calendar day. While a
  // letter draft is unsealed it stays fully editable across days; once sealed
  // it becomes immutable until delivery.
  if (opts?.entryType && opts.entryType !== 'normal') {
    return opts.isSealed === true
  }
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return dayKey(created, tz) !== dayKey(new Date(), tz)
}

export interface LockedDiffInput {
  oldText: string                  // already decrypted plain HTML
  newText?: string                 // candidate replacement (full replace)
  appendText?: string              // candidate append
  oldSong: string | null
  newSong?: string | null
  oldPhotos: { spread: number; position: number }[]
  newPhotoSlots?: { spread: number; position: number }[]
  oldDoodleSpreads: number[]
  newDoodleSpreads?: number[]
  oldStyle: unknown            // existing JournalEntry.style as stored (Prisma Json)
  newStyle?: unknown           // candidate replacement
}

export type DiffResult = { ok: true } | { ok: false; reason: string }

export function validateAppendOnlyDiff(input: LockedDiffInput): DiffResult {
  if (input.newStyle !== undefined) {
    // Stable JSON-string equality is good enough here because callers always
    // run candidate styles through `parseStyle` before saving, which assigns
    // keys in a fixed order (font, color, effect). One soft fragility: a
    // client that explicitly sends `color: null` ("Default") will compare
    // unequal to an existing record that simply omits `color`, even though
    // both mean the same thing. Both writers (POST + PUT) currently call
    // parseStyle on the way in, so the saved shape preserves whatever the
    // client first sent — keeping the comparison stable in practice. If a
    // future writer canonicalizes color presence differently, parse both
    // sides through parseStyle before comparison.
    const oldJson = JSON.stringify(input.oldStyle ?? null)
    const newJson = JSON.stringify(input.newStyle ?? null)
    if (oldJson !== newJson) {
      return { ok: false, reason: 'Entry style is locked after the day of writing' }
    }
  }
  if (input.newSong !== undefined && input.oldSong && input.newSong !== input.oldSong) {
    return { ok: false, reason: 'Song is locked once added' }
  }
  if (input.newText !== undefined && input.newText !== input.oldText) {
    return { ok: false, reason: 'Existing text is locked; only new lines can be added' }
  }
  if (input.newPhotoSlots) {
    for (const slot of input.newPhotoSlots) {
      const taken = input.oldPhotos.some(p => p.spread === slot.spread && p.position === slot.position)
      if (taken) return { ok: false, reason: 'A photo already exists in that slot' }
    }
  }
  if (input.newDoodleSpreads) {
    for (const s of input.newDoodleSpreads) {
      if (input.oldDoodleSpreads.includes(s)) {
        return { ok: false, reason: 'A doodle already exists for that spread' }
      }
    }
  }
  return { ok: true }
}
