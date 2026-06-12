import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  isEntryLocked,
  validateAppendOnlyDiff,
  utcInstantForLocalDate,
  localDatePartsNow,
  type LockedDiffInput,
} from '@/lib/entry-lock'

afterEach(() => {
  vi.useRealTimers()
})

describe('isEntryLocked — normal entries (calendar-day lock)', () => {
  it('is UNLOCKED on the same calendar day as createdAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T22:00:00Z'))
    expect(isEntryLocked('2026-05-03T01:00:00Z', 'UTC')).toBe(false)
  })

  it('is LOCKED once the calendar day flips', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-04T00:30:00Z'))
    expect(isEntryLocked('2026-05-03T23:30:00Z', 'UTC')).toBe(true)
  })

  it('uses the user tz, not UTC, for the day boundary', () => {
    // 2026-05-03T20:00Z is still May 4 01:30 in IST — but createdAt May 3 20:00Z
    // is May 4 01:30 IST too, so same IST day → unlocked.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T21:00:00Z')) // May 4 02:30 IST
    expect(isEntryLocked('2026-05-03T20:00:00Z', 'Asia/Kolkata')).toBe(false) // May 4 01:30 IST
  })
})

describe('isEntryLocked — letters (sealed lock, not calendar)', () => {
  it('an unsealed letter draft stays UNLOCKED across days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z')) // far future
    expect(isEntryLocked('2026-05-03T01:00:00Z', 'UTC', { entryType: 'letter', isSealed: false })).toBe(false)
  })

  it('a sealed letter is LOCKED', () => {
    expect(isEntryLocked('2026-05-03T01:00:00Z', 'UTC', { entryType: 'letter', isSealed: true })).toBe(true)
  })

  it('treats missing isSealed as unsealed → unlocked', () => {
    expect(isEntryLocked('2026-05-03T01:00:00Z', 'UTC', { entryType: 'unsent_letter' })).toBe(false)
  })
})

// Minimal base for the append-only diff: empty existing entry, no candidate changes.
function baseDiff(over: Partial<LockedDiffInput> = {}): LockedDiffInput {
  return {
    oldText: 'line one',
    oldSong: null,
    oldPhotos: [],
    oldDoodleSpreads: [],
    oldStyle: { font: 'serif', color: null, effect: null },
    ...over,
  }
}

describe('validateAppendOnlyDiff — text', () => {
  it('allows an unchanged candidate (no-op)', () => {
    expect(validateAppendOnlyDiff(baseDiff()).ok).toBe(true)
  })

  it('rejects overwriting existing text', () => {
    const r = validateAppendOnlyDiff(baseDiff({ newText: 'different content' }))
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ reason: expect.stringMatching(/locked/i) })
  })

  it('allows resubmitting identical text', () => {
    expect(validateAppendOnlyDiff(baseDiff({ newText: 'line one' })).ok).toBe(true)
  })
})

describe('validateAppendOnlyDiff — song', () => {
  it('rejects changing an existing song', () => {
    expect(validateAppendOnlyDiff(baseDiff({ oldSong: 'a', newSong: 'b' })).ok).toBe(false)
  })
  it('allows adding a song when none existed', () => {
    expect(validateAppendOnlyDiff(baseDiff({ oldSong: null, newSong: 'b' })).ok).toBe(true)
  })
})

describe('validateAppendOnlyDiff — photos', () => {
  it('rejects writing into an occupied slot', () => {
    const r = validateAppendOnlyDiff(
      baseDiff({
        oldPhotos: [{ spread: 0, position: 1 }],
        newPhotoSlots: [{ spread: 0, position: 1 }],
      }),
    )
    expect(r.ok).toBe(false)
  })
  it('allows filling an empty slot', () => {
    const r = validateAppendOnlyDiff(
      baseDiff({
        oldPhotos: [{ spread: 0, position: 1 }],
        newPhotoSlots: [{ spread: 0, position: 2 }],
      }),
    )
    expect(r.ok).toBe(true)
  })
})

describe('validateAppendOnlyDiff — doodles', () => {
  it('rejects a doodle on a spread that already has one', () => {
    expect(
      validateAppendOnlyDiff(baseDiff({ oldDoodleSpreads: [0], newDoodleSpreads: [0] })).ok,
    ).toBe(false)
  })
  it('allows a doodle on a fresh spread', () => {
    expect(
      validateAppendOnlyDiff(baseDiff({ oldDoodleSpreads: [0], newDoodleSpreads: [1] })).ok,
    ).toBe(true)
  })
})

describe('validateAppendOnlyDiff — style', () => {
  it('rejects a style change', () => {
    expect(
      validateAppendOnlyDiff(baseDiff({ newStyle: { font: 'mono', color: null, effect: null } })).ok,
    ).toBe(false)
  })
  it('allows an identical style', () => {
    expect(
      validateAppendOnlyDiff(baseDiff({ newStyle: { font: 'serif', color: null, effect: null } })).ok,
    ).toBe(true)
  })
})

describe('utcInstantForLocalDate', () => {
  it('maps a UTC wall-clock midnight to the same instant', () => {
    expect(utcInstantForLocalDate(2026, 4, 1, 'UTC').toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  it('offsets IST midnight back by 5h30 in UTC', () => {
    // May 1 00:00 IST == Apr 30 18:30 UTC. (Regression guard: a prior version of
    // the loop over-corrected non-UTC tz and returned Apr 30 13:00Z.)
    expect(utcInstantForLocalDate(2026, 4, 1, 'Asia/Kolkata').toISOString()).toBe(
      '2026-04-30T18:30:00.000Z',
    )
  })

  it('handles a DST spring-forward boundary (America/New_York)', () => {
    // 2026-03-08 02:00 EST → 03:00 EDT. Midnight Mar 8 in NY is still EST (UTC-5),
    // so 00:00 EDT-day maps to 05:00 UTC.
    expect(utcInstantForLocalDate(2026, 2, 8, 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    )
  })
})

describe('localDatePartsNow', () => {
  it('reads the current date in the given tz', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T20:00:00Z')) // May 4 01:30 IST
    expect(localDatePartsNow('Asia/Kolkata')).toEqual({ year: 2026, month0: 4, day: 4 })
    expect(localDatePartsNow('UTC')).toEqual({ year: 2026, month0: 4, day: 3 })
  })
})
