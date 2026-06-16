'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { JournalEntry } from '@/store/journal'

/** Per-feature cap: 5 journals, 5 letters, 5 scrapbook boards (each independent). */
export const TRIAL_LIMIT = 5

export type TrialFeature = 'journal' | 'letter' | 'scrapbook'

export interface TrialLetter {
  id: string
  type: 'self' | 'friend'
  /** E2EE ciphertext blob produced by the real compose flow (decrypts under the throwaway key). */
  contentCiphertext: string
  contentIVs: Record<string, string>
  recipientName: string | null
  recipientEmail: string | null
  createdAt: string
  /** Instant reveal in trial: always now (never a future week). */
  unlockDate: string | null
  isViewed: boolean
}

export interface TrialScrapbook {
  id: string
  title: string | null
  /** E2EE ciphertext of the items array. */
  items: string
  e2eeIVs: { items: string; title?: string }
  createdAt: string
  updatedAt: string
}

interface TrialState {
  version: number
  entries: JournalEntry[]
  letters: TrialLetter[]
  scrapbooks: TrialScrapbook[]
  journalCount: number
  letterCount: number
  scrapbookCount: number
  /** When a create is blocked by a cap, names the feature so the global modal can show. */
  signupPrompt: TrialFeature | null

  reset: () => void
  newestDate: () => string
  atLimit: (f: TrialFeature) => boolean
  promptSignup: (f: TrialFeature) => void
  dismissSignup: () => void

  createEntry: (draft: { text: string; song: string | null; photos?: JournalEntry['photos']; doodles?: JournalEntry['doodles']; e2eeIVs?: Record<string, string> | null; textPreview?: string }) => string
  updateEntry: (id: string, draft: { text: string; song: string | null; photos?: JournalEntry['photos']; doodles?: JournalEntry['doodles']; e2eeIVs?: Record<string, string> | null; textPreview?: string }) => void

  createLetter: (l: { type: 'self' | 'friend'; contentCiphertext: string; contentIVs: Record<string, string>; recipientName: string | null; recipientEmail: string | null }) => string
  revealLetter: (id: string) => void

  createScrapbook: (s: { items: string; e2eeIVs: { items: string; title?: string }; title?: string | null }) => string
  updateScrapbook: (id: string, s: { title?: string | null; items: string; e2eeIVs: { items: string; title?: string } }) => void
}

const nextId = () => `trial-${crypto.randomUUID()}`

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      version: 2,
      entries: [],
      letters: [],
      scrapbooks: [],
      journalCount: 0,
      letterCount: 0,
      scrapbookCount: 0,
      signupPrompt: null,

      reset: () => {
        // No seed — the visitor's own writing fills the scenes. Empty = real empty states.
        set({ version: 2, entries: [], letters: [], scrapbooks: [], journalCount: 0, letterCount: 0, scrapbookCount: 0, signupPrompt: null })
      },

      newestDate: () => {
        const es = get().entries
        if (es.length === 0) return new Date().toISOString()
        return es.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
      },

      atLimit: (f) => {
        const s = get()
        if (f === 'journal') return s.journalCount >= TRIAL_LIMIT
        if (f === 'letter') return s.letterCount >= TRIAL_LIMIT
        return s.scrapbookCount >= TRIAL_LIMIT
      },

      promptSignup: (f) => set({ signupPrompt: f }),
      dismissSignup: () => set({ signupPrompt: null }),

      createEntry: (draft) => {
        const id = nextId()
        const usedDays = new Set(get().entries.map(e => e.createdAt.slice(0, 10)))
        const candidate = new Date()
        candidate.setHours(12, 0, 0, 0)
        while (usedDays.has(candidate.toISOString().slice(0, 10))) {
          candidate.setDate(candidate.getDate() - 1)
        }
        const createdAt = candidate.toISOString()
        const textPreview = draft.e2eeIVs
          ? undefined
          : draft.textPreview ?? draft.text.replace(/<[^>]*>/g, '').slice(0, 80)
        const entry: JournalEntry = {
          id,
          text: draft.text,
          textPreview,
          createdAt,
          updatedAt: createdAt,
          song: draft.song ?? undefined,
          tags: [],
          doodles: draft.doodles ?? [],
          photos: draft.photos ?? [],
          entryType: 'normal',
          e2eeIVs: draft.e2eeIVs ?? null,
        }
        set(s => ({ entries: [entry, ...s.entries], journalCount: s.journalCount + 1 }))
        return id
      },

      updateEntry: (id, draft) => {
        set(s => ({
          entries: s.entries.map(e =>
            e.id === id
              ? {
                  ...e,
                  text: draft.text,
                  textPreview: draft.e2eeIVs
                    ? undefined
                    : draft.textPreview ?? draft.text.replace(/<[^>]*>/g, '').slice(0, 80),
                  song: draft.song ?? undefined,
                  photos: draft.photos ?? e.photos,
                  doodles: draft.doodles ?? e.doodles,
                  updatedAt: new Date().toISOString(),
                  e2eeIVs: draft.e2eeIVs ?? e.e2eeIVs,
                }
              : e
          ),
        }))
      },

      createLetter: (l) => {
        const id = nextId()
        const now = new Date().toISOString()
        set(s => ({
          letters: [
            {
              id,
              type: l.type,
              contentCiphertext: l.contentCiphertext,
              contentIVs: l.contentIVs,
              recipientName: l.recipientName,
              recipientEmail: l.recipientEmail,
              createdAt: now,
              unlockDate: now, // instant reveal — no 1-week wait in trial
              isViewed: false,
            },
            ...s.letters,
          ],
          letterCount: s.letterCount + 1,
        }))
        return id
      },

      revealLetter: (id) => {
        set(s => ({ letters: s.letters.map(l => (l.id === id ? { ...l, isViewed: true } : l)) }))
      },

      createScrapbook: (sb) => {
        const id = nextId()
        const now = new Date().toISOString()
        set(s => ({
          scrapbooks: [
            { id, title: sb.title ?? null, items: sb.items, e2eeIVs: sb.e2eeIVs, createdAt: now, updatedAt: now },
            ...s.scrapbooks,
          ],
          scrapbookCount: s.scrapbookCount + 1,
        }))
        return id
      },

      updateScrapbook: (id, sb) => {
        set(s => ({
          scrapbooks: s.scrapbooks.map(x =>
            x.id === id
              ? { ...x, title: sb.title ?? x.title, items: sb.items, e2eeIVs: sb.e2eeIVs, updatedAt: new Date().toISOString() }
              : x
          ),
        }))
      },
    }),
    {
      name: 'meethril-trial',
      version: 2,
      storage: createJSONStorage(() =>
        typeof sessionStorage !== 'undefined' ? sessionStorage : (undefined as unknown as Storage)
      ),
      // Trial data is throwaway. A session that started on an older shape (e.g.
      // v1's `entryCount`/plaintext letters, before a mid-session code deploy)
      // would otherwise rehydrate stale fields and let the per-feature caps be
      // bypassed (journalCount missing → atLimit always false). Start clean on
      // any version mismatch instead of carrying the old slice forward.
      migrate: (_persisted, version) => {
        if (version !== 2) {
          return { version: 2, entries: [], letters: [], scrapbooks: [], journalCount: 0, letterCount: 0, scrapbookCount: 0 } as unknown as TrialState
        }
        return _persisted as TrialState
      },
      partialize: (s) => ({
        version: s.version,
        entries: s.entries,
        letters: s.letters,
        scrapbooks: s.scrapbooks,
        journalCount: s.journalCount,
        letterCount: s.letterCount,
        scrapbookCount: s.scrapbookCount,
      }),
    },
  ),
)
