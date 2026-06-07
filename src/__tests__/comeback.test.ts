import { describe, it, expect } from 'vitest'
import { gapDaysLocal, tierFor, shouldShowComeback } from '@/lib/comeback'

describe('gapDaysLocal', () => {
  it('returns 0 when last entry was earlier today', () => {
    expect(gapDaysLocal({
      now: new Date('2026-05-03T20:00:00Z'),
      lastEntryAt: new Date('2026-05-03T08:00:00Z'),
      tz: 'UTC',
    })).toBe(0)
  })

  it('returns 1 for yesterday', () => {
    expect(gapDaysLocal({
      now: new Date('2026-05-03T20:00:00Z'),
      lastEntryAt: new Date('2026-05-02T20:00:00Z'),
      tz: 'UTC',
    })).toBe(1)
  })

  it('returns 23 for 23 calendar days ago', () => {
    expect(gapDaysLocal({
      now: new Date('2026-05-03T12:00:00Z'),
      lastEntryAt: new Date('2026-04-10T12:00:00Z'),
      tz: 'UTC',
    })).toBe(23)
  })

  it('uses local-calendar comparison, not 24-hour windows', () => {
    // 23:30 yesterday → 00:30 today is 1 calendar day in the same TZ
    expect(gapDaysLocal({
      now: new Date('2026-05-03T00:30:00Z'),
      lastEntryAt: new Date('2026-05-02T23:30:00Z'),
      tz: 'UTC',
    })).toBe(1)
  })

  it('returns Infinity when there is no last entry', () => {
    expect(gapDaysLocal({
      now: new Date(),
      lastEntryAt: null,
      tz: 'UTC',
    })).toBe(Infinity)
  })
})

describe('tierFor', () => {
  it('whisper for 1-2 days', () => {
    expect(tierFor(1)).toBe('whisper')
    expect(tierFor(2)).toBe('whisper')
  })
  it('card for 3-7 days', () => {
    expect(tierFor(3)).toBe('card')
    expect(tierFor(7)).toBe('card')
  })
  it('modal for 8+ days', () => {
    expect(tierFor(8)).toBe('modal')
    expect(tierFor(100)).toBe('modal')
  })
  it('null for 0 days (just journaled today)', () => {
    expect(tierFor(0)).toBeNull()
  })
  it('null for first-ever visit (Infinity) — never journaled, not a comeback', () => {
    expect(tierFor(Infinity)).toBeNull()
  })
})

describe('shouldShowComeback', () => {
  it('false when already shown today (local TZ)', () => {
    expect(shouldShowComeback({
      now: new Date('2026-05-03T20:00:00Z'),
      lastComebackShownAt: new Date('2026-05-03T08:00:00Z'),
      tz: 'UTC',
    })).toBe(false)
  })
  it('true when last shown was yesterday or earlier', () => {
    expect(shouldShowComeback({
      now: new Date('2026-05-03T20:00:00Z'),
      lastComebackShownAt: new Date('2026-05-02T23:00:00Z'),
      tz: 'UTC',
    })).toBe(true)
  })
  it('true when never shown', () => {
    expect(shouldShowComeback({
      now: new Date(),
      lastComebackShownAt: null,
      tz: 'UTC',
    })).toBe(true)
  })
})
