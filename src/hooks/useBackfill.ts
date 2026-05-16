'use client'
import { useCallback } from 'react'

/**
 * Legacy backfill hook — no-op since Phase 5b dropped the server-encryption
 * path. All entries and scrapbooks are E2EE from creation; there is nothing
 * to migrate. The consumers (SetupModal, E2EEProvider, BackfillRetryPanel)
 * remain in the codebase but the operations never trigger network requests.
 */
export function useBackfill() {
  const runBackfill = useCallback(async () => {
    // No-op: backfill-batch endpoints removed; all data is E2EE from creation.
  }, [])

  const retryFailedIds = useCallback(async () => {
    // No-op.
  }, [])

  return { runBackfill, retryFailedIds }
}
