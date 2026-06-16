// Pure memory-unlock decision, extracted from useMemories so it can be unit-tested
// and so /try can lower the thresholds without duplicating the logic.

export const REQUIRED_JOURNALS = 14
export const REQUIRED_TOTAL = 20

export type MemoryGateStatus = 'locked' | 'ready'

/** Unlocked if journals reach the journal threshold OR total reaches the total threshold. */
export function computeMemoryStatus(
  journalCount: number,
  total: number,
  requiredJournals: number,
  requiredTotal: number,
): MemoryGateStatus {
  return journalCount >= requiredJournals || total >= requiredTotal ? 'ready' : 'locked'
}
