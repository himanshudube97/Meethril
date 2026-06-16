import { describe, it, expect } from 'vitest'
import { computeMemoryStatus, REQUIRED_JOURNALS, REQUIRED_TOTAL } from '@/lib/memory/gate'

describe('computeMemoryStatus', () => {
  it('locked below both thresholds (real values)', () => {
    expect(computeMemoryStatus(3, 5, REQUIRED_JOURNALS, REQUIRED_TOTAL)).toBe('locked')
  })
  it('ready when journals meet the journal threshold', () => {
    expect(computeMemoryStatus(14, 14, REQUIRED_JOURNALS, REQUIRED_TOTAL)).toBe('ready')
  })
  it('ready when total meets the total threshold even if journals short', () => {
    expect(computeMemoryStatus(5, 20, REQUIRED_JOURNALS, REQUIRED_TOTAL)).toBe('ready')
  })
  it('trial thresholds (1/1) unlock with a single journal', () => {
    expect(computeMemoryStatus(1, 1, 1, 1)).toBe('ready')
    expect(computeMemoryStatus(0, 0, 1, 1)).toBe('locked')
  })
})
