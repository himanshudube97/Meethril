// src/lib/trial/seed.ts
//
// Pre-written demo entries so memory/shelf look alive in the trial before the
// visitor has written much. Past-dated on distinct days. Plaintext (e2eeIVs
// null) — the throwaway-key decryptor passes these through unchanged.

import type { JournalEntry } from '@/store/journal'

const DEMO = [
  { daysAgo: 2,  song: null, text: 'The light came in sideways this morning and I just sat with my coffee. Nothing to fix today. That felt like enough.' },
  { daysAgo: 5,  song: null, text: 'Walked the long way home. The jasmine near the corner has opened. I kept the smell the whole way back.' },
  { daysAgo: 9,  song: null, text: 'Hard day. I told someone the truth and it landed badly. Writing it here so it stops looping in my head.' },
  { daysAgo: 14, song: null, text: 'A small win — I finished the thing I kept avoiding. Quietly proud. Bought myself the good bread to mark it.' },
  { daysAgo: 21, song: null, text: 'Rain all afternoon. Stayed in, read, let the day be soft. I forget how much I need days like this.' },
]

function isoAtNoon(now: Date, daysAgo: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

export function buildSeedEntries(now: Date): JournalEntry[] {
  return DEMO.map((e, i) => ({
    id: `seed-${i}`,
    text: e.text,
    textPreview: e.text.slice(0, 80),
    createdAt: isoAtNoon(now, e.daysAgo),
    updatedAt: isoAtNoon(now, e.daysAgo),
    song: e.song ?? undefined,
    tags: [],
    doodles: [],
    photos: [],
    entryType: 'normal',
    e2eeIVs: null,
  }))
}
