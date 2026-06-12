import { describe, it, expect } from 'vitest'
import {
  FREE_LIMITS,
  PAID_LIMITS,
  MONTHLY_LIMIT_KEY,
  limitsFor,
  type QuotaFeature,
} from '@/lib/billing/limits'

describe('limitsFor', () => {
  it('returns the free table for free users', () => {
    expect(limitsFor(false)).toBe(FREE_LIMITS)
  })
  it('returns the paid table for paid users', () => {
    expect(limitsFor(true)).toBe(PAID_LIMITS)
  })
})

describe('limit tables', () => {
  it('paid limits are >= free limits for every feature', () => {
    for (const k of Object.keys(FREE_LIMITS) as (keyof typeof FREE_LIMITS)[]) {
      expect(PAID_LIMITS[k]).toBeGreaterThanOrEqual(FREE_LIMITS[k])
    }
  })
  it('paid journals are unlimited (only the 1/day rule caps them)', () => {
    expect(PAID_LIMITS.journalPerMonth).toBe(Infinity)
    expect(Number.isFinite(FREE_LIMITS.journalPerMonth)).toBe(true)
  })
})

describe('MONTHLY_LIMIT_KEY', () => {
  it('maps every quota feature to an existing PlanLimits field', () => {
    const features: QuotaFeature[] = ['journal', 'scrapbook', 'letterSelf', 'letterFriend']
    for (const f of features) {
      const key = MONTHLY_LIMIT_KEY[f]
      expect(FREE_LIMITS).toHaveProperty(key)
      expect(typeof FREE_LIMITS[key]).toBe('number')
    }
  })
})
