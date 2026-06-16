'use client'

import { useCallback, useEffect, useState } from 'react'
import { useE2EE } from '@/hooks/useE2EE'
import { useE2EEStore } from '@/store/e2ee'
import { decryptSelfLetterContent } from '@/lib/letters/self-letter-client'
import { pickDailyItems } from '@/lib/memory/daily'
import { computeMemoryStatus, REQUIRED_JOURNALS, REQUIRED_TOTAL } from '@/lib/memory/gate'
import { useTryMode } from '@/components/try/TryModeProvider'
import type { JournalEntry } from '@/store/journal'

// Gate (issue #37): the memory page unlocks once you have at least
// REQUIRED_JOURNALS journal entries, OR REQUIRED_TOTAL entries total
// (journals + delivered letters). Until then it shows a locked, silhouette
// state with progress. The pure decision + thresholds live in @/lib/memory/gate;
// re-exported here so existing importers keep working.
export { REQUIRED_JOURNALS, REQUIRED_TOTAL } from '@/lib/memory/gate'
// How many memories surface per day. Fixed for the whole calendar day; a
// fresh set rotates in the next day (see lib/memory/daily.ts).
export const DAILY_MEMORY_COUNT = 5

export type MemoryStatus = 'loading' | 'locked' | 'ready' | 'error'

export interface MemoryProgress {
  journals: number
  total: number
  requiredJournals: number
  requiredTotal: number
}

export interface UseMemoriesResult {
  status: MemoryStatus
  progress: MemoryProgress
  /** The deterministic daily selection (journals + delivered letters). */
  items: JournalEntry[]
  reload: () => void
}

// Shape of a row from GET /api/letters/mine.
interface MineLetter {
  id: string
  text: string | null
  createdAt: string
  unlockDate: string | null
  isSealed: boolean
  recipientEmail: string | null
  e2eeIVs: Record<string, string> | null
  hasArrived: boolean | null
}

/**
 * A delivered self-letter is one that has arrived for the author to re-read
 * (its unlock date has passed and it isn't addressed to someone else). Those
 * are the letters that belong in "memories"; sealed/pending ones don't.
 */
function isDeliveredSelfLetter(l: MineLetter): boolean {
  return Boolean(l.hasArrived) && !l.recipientEmail
}

export function useMemories(): UseMemoriesResult {
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()
  const masterKey = useE2EEStore((s) => s.masterKey)

  const trial = useTryMode()
  const requiredJournals = trial ? 1 : REQUIRED_JOURNALS
  const requiredTotal = trial ? 1 : REQUIRED_TOTAL

  const [status, setStatus] = useState<MemoryStatus>('loading')
  const [items, setItems] = useState<JournalEntry[]>([])
  const [progress, setProgress] = useState<MemoryProgress>({
    journals: 0,
    total: 0,
    requiredJournals: REQUIRED_JOURNALS,
    requiredTotal: REQUIRED_TOTAL,
  })

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      // 1. Counts + raw journals + own letters, in parallel.
      const [statsRes, entriesRes, lettersRes] = await Promise.all([
        fetch('/api/entries/stats'),
        fetch('/api/entries?limit=50'),
        fetch('/api/letters/mine'),
      ])

      const statsData = statsRes.ok ? await statsRes.json() : {}
      const entriesData = entriesRes.ok ? await entriesRes.json() : { entries: [] }
      const lettersData = lettersRes.ok ? await lettersRes.json() : { letters: [] }

      // Journal count comes from stats (accurate beyond the 50-row fetch).
      const journalCount: number = typeof statsData.totalEntries === 'number'
        ? statsData.totalEntries
        : (entriesData.entries?.length ?? 0)

      const deliveredLetters: MineLetter[] = (lettersData.letters || []).filter(isDeliveredSelfLetter)
      const total = journalCount + deliveredLetters.length

      setProgress({
        journals: journalCount,
        total,
        requiredJournals,
        requiredTotal,
      })

      const gate = computeMemoryStatus(journalCount, total, requiredJournals, requiredTotal)
      if (gate === 'locked') {
        setItems([])
        setStatus('locked')
        return
      }

      // 2. Build the memory pool: decrypted journals + decrypted delivered
      //    self-letters (adapted to the JournalEntry shape the reader uses).
      const rawJournals = (entriesData.entries || []) as JournalEntry[]
      const journals = await decryptEntriesFromServer(rawJournals)

      let letterItems: JournalEntry[] = []
      if (masterKey) {
        const decrypted = await Promise.all(
          deliveredLetters.map(async (l): Promise<JournalEntry | null> => {
            if (!l.text || !l.e2eeIVs?.content) return null
            try {
              const content = await decryptSelfLetterContent({
                contentCiphertext: l.text,
                contentIVs: { content: l.e2eeIVs.content },
                masterKey,
              })
              return {
                id: l.id,
                text: content.text || '',
                createdAt: l.createdAt,
                updatedAt: l.createdAt,
                song: content.song || undefined,
                tags: [],
                doodles: [],
                photos: (content.photos || []).map((p) => ({
                  url: p.url ?? undefined,
                  encryptedRef: p.encryptedRef ?? undefined,
                  encryptedRefIV: p.encryptedRefIV ?? undefined,
                  rotation: p.rotation,
                  position: p.position,
                  spread: p.spread,
                })),
                entryType: 'letter',
              }
            } catch {
              // A letter we can't decrypt (legacy payload) just doesn't join
              // the pool — it still counted toward the gate above.
              return null
            }
          }),
        )
        letterItems = decrypted.filter((x): x is JournalEntry => x !== null)
      }

      const pool = [...journals, ...letterItems]
      // 3. Deterministic daily pick — constant all day, new set tomorrow.
      setItems(pickDailyItems(pool, DAILY_MEMORY_COUNT))
      setStatus('ready')
    } catch (err) {
      console.error('Failed to load memories:', err)
      setStatus('error')
    }
  }, [decryptEntriesFromServer, masterKey, requiredJournals, requiredTotal])

  useEffect(() => {
    load()
  }, [load, isE2EEReady])

  return { status, progress, items, reload: load }
}
