'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { JournalEntry } from '@/store/journal'
import { buildSeedEntries } from '@/lib/trial/seed'

export const TRIAL_ENTRY_LIMIT = 5

export interface TrialLetter {
  id: string
  text: string
  recipientName: string | null
  createdAt: string
  unlockDate: string | null
  isViewed: boolean
}

interface TrialState {
  version: number
  entries: JournalEntry[]
  letters: TrialLetter[]
  entryCount: number
  reset: (now?: Date) => void
  newestDate: () => string
  createEntry: (draft: { text: string; song: string | null; photos?: JournalEntry['photos']; doodles?: JournalEntry['doodles'] }) => string
  updateEntry: (id: string, draft: { text: string; song: string | null; photos?: JournalEntry['photos']; doodles?: JournalEntry['doodles'] }) => void
  createLetter: (l: { text: string; recipientName: string | null }) => string
  revealLetter: (id: string) => void
  atWall: () => boolean
}

let seq = 0
const nextId = () => `trial-${seq++}`

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      version: 1,
      entries: [],
      letters: [],
      entryCount: 0,

      reset: (now = new Date()) => {
        seq = 0
        set({ version: 1, entries: buildSeedEntries(now), letters: [], entryCount: 0 })
      },

      newestDate: () => {
        const es = get().entries
        if (es.length === 0) return new Date().toISOString()
        return es.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
      },

      createEntry: (draft) => {
        const id = nextId()
        const d = new Date(get().newestDate())
        d.setDate(d.getDate() - 1)
        const createdAt = d.toISOString()
        const entry: JournalEntry = {
          id,
          text: draft.text,
          textPreview: draft.text.replace(/<[^>]*>/g, '').slice(0, 80),
          createdAt,
          updatedAt: createdAt,
          song: draft.song ?? undefined,
          tags: [],
          doodles: draft.doodles ?? [],
          photos: draft.photos ?? [],
          entryType: 'normal',
          e2eeIVs: null,
        }
        set(s => ({ entries: [entry, ...s.entries], entryCount: s.entryCount + 1 }))
        return id
      },

      updateEntry: (id, draft) => {
        set(s => ({
          entries: s.entries.map(e =>
            e.id === id
              ? {
                  ...e,
                  text: draft.text,
                  song: draft.song ?? undefined,
                  photos: draft.photos ?? e.photos,
                  doodles: draft.doodles ?? e.doodles,
                  updatedAt: new Date().toISOString(),
                }
              : e
          ),
        }))
      },

      createLetter: (l) => {
        const id = nextId()
        set(s => ({
          letters: [
            {
              id,
              text: l.text,
              recipientName: l.recipientName,
              createdAt: new Date().toISOString(),
              unlockDate: null,
              isViewed: false,
            },
            ...s.letters,
          ],
        }))
        return id
      },

      revealLetter: (id) => {
        set(s => ({ letters: s.letters.map(l => (l.id === id ? { ...l, isViewed: true } : l)) }))
      },

      atWall: () => get().entryCount >= TRIAL_ENTRY_LIMIT,
    }),
    {
      name: 'meethril-trial',
      storage: createJSONStorage(() =>
        typeof sessionStorage !== 'undefined' ? sessionStorage : (undefined as unknown as Storage)
      ),
      partialize: (s) => ({
        version: s.version,
        entries: s.entries,
        letters: s.letters,
        entryCount: s.entryCount,
      }),
    },
  ),
)
