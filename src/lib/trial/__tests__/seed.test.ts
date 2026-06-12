import { describe, it, expect } from 'vitest'
import { buildSeedEntries } from '@/lib/trial/seed'

describe('buildSeedEntries', () => {
  it('returns past-dated entries newest-first within the given window', () => {
    const now = new Date('2026-06-12T10:00:00Z')
    const seeds = buildSeedEntries(now)
    expect(seeds.length).toBeGreaterThanOrEqual(3)
    for (const s of seeds) expect(new Date(s.createdAt).getTime()).toBeLessThan(now.getTime())
    const days = new Set(seeds.map(s => s.createdAt.slice(0, 10)))
    expect(days.size).toBe(seeds.length)
  })
  it('every seed has plaintext text and a stable id prefix', () => {
    const seeds = buildSeedEntries(new Date('2026-06-12T10:00:00Z'))
    for (const s of seeds) {
      expect(s.id.startsWith('seed-')).toBe(true)
      expect(s.text.length).toBeGreaterThan(0)
      expect(s.e2eeIVs).toBeNull()
    }
  })
})
