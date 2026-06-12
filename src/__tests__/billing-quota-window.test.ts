import { describe, it, expect, afterEach, vi } from 'vitest'
import { currentMonthlyWindow, dayOfMonthInTz } from '@/lib/billing/quota'

afterEach(() => {
  vi.useRealTimers()
})

describe('dayOfMonthInTz', () => {
  it('reads the day-of-month in the given tz', () => {
    // 2026-05-03T20:00Z is May 4 01:30 in IST.
    expect(dayOfMonthInTz(new Date('2026-05-03T20:00:00Z'), 'Asia/Kolkata')).toBe(4)
    expect(dayOfMonthInTz(new Date('2026-05-03T20:00:00Z'), 'UTC')).toBe(3)
  })
})

describe('currentMonthlyWindow — free anchor (day 1)', () => {
  it('spans the calendar month and resets on the 1st', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))
    const w = currentMonthlyWindow(1, 'UTC')
    expect(w.start.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('currentMonthlyWindow — non-UTC tz (regression guard for the utcInstant fix)', () => {
  it('anchors the free window to local IST midnight, not UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z')) // May 15 17:30 IST
    const w = currentMonthlyWindow(1, 'Asia/Kolkata')
    // May 1 00:00 IST == Apr 30 18:30 UTC; Jun 1 00:00 IST == May 31 18:30 UTC.
    expect(w.start.toISOString()).toBe('2026-04-30T18:30:00.000Z')
    expect(w.end.toISOString()).toBe('2026-05-31T18:30:00.000Z')
  })
})

describe('currentMonthlyWindow — paid anchor (billing day-of-month)', () => {
  it('window began last month when today is before the anchor day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    const w = currentMonthlyWindow(20, 'UTC') // anchor day 20, today is the 10th
    expect(w.start.toISOString()).toBe('2026-04-20T00:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-05-20T00:00:00.000Z')
  })

  it('window began this month when today is on/after the anchor day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'))
    const w = currentMonthlyWindow(20, 'UTC')
    expect(w.start.toISOString()).toBe('2026-05-20T00:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-06-20T00:00:00.000Z')
  })

  it('clamps a day-31 anchor to the last day of a short month (Feb)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'))
    const w = currentMonthlyWindow(31, 'UTC')
    // Jan window started on Jan 31; Feb has no 31 → clamps to Feb 28 (2026 non-leap).
    expect(w.start.toISOString()).toBe('2026-01-31T00:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-02-28T00:00:00.000Z')
  })
})
