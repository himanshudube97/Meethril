// src/lib/trial/seed.ts
//
// Pre-written demo entries so memory/shelf look alive in the trial before the
// visitor has written much. Past-dated on distinct days. Plaintext (e2eeIVs
// null) — the throwaway-key decryptor passes these through unchanged.

import type { JournalEntry } from '@/store/journal'

// ~16 entries so the memory view unlocks (it gates at 14 journals) and the
// shelf looks lived-in. Distinct days, spread across recent weeks.
const DEMO = [
  { daysAgo: 2,  song: null, text: 'The light came in sideways this morning and I just sat with my coffee. Nothing to fix today. That felt like enough.' },
  { daysAgo: 4,  song: null, text: 'Tried the new tea. Too bitter, but I liked the ritual of it — the kettle, the waiting, the warm cup in both hands.' },
  { daysAgo: 6,  song: null, text: 'Walked the long way home. The jasmine near the corner has opened. I kept the smell the whole way back.' },
  { daysAgo: 9,  song: null, text: 'Hard day. I told someone the truth and it landed badly. Writing it here so it stops looping in my head.' },
  { daysAgo: 12, song: null, text: 'Called an old friend out of nowhere. We laughed about something from years ago. I forgot how easy it used to be.' },
  { daysAgo: 15, song: null, text: 'A small win — I finished the thing I kept avoiding. Quietly proud. Bought myself the good bread to mark it.' },
  { daysAgo: 18, song: null, text: 'Couldn\'t sleep. Sat by the window and watched the street go quiet. Sometimes the night feels like company.' },
  { daysAgo: 21, song: null, text: 'Rain all afternoon. Stayed in, read, let the day be soft. I forget how much I need days like this.' },
  { daysAgo: 24, song: null, text: 'Made soup from whatever was left in the fridge. It turned out better than it had any right to. Small magic.' },
  { daysAgo: 28, song: null, text: 'Saw the first proper sunset in weeks. Stood on the balcony until the colour drained out of the sky.' },
  { daysAgo: 32, song: null, text: 'Feeling stretched thin lately. Noting it here so future me knows this week was heavy, and that I got through it.' },
  { daysAgo: 37, song: null, text: 'A stranger held the door and wished me a good day like they meant it. Carried that small warmth for hours.' },
  { daysAgo: 42, song: null, text: 'Reorganised the bookshelf instead of doing real work. No regrets. The room feels like mine again.' },
  { daysAgo: 48, song: null, text: 'Long walk by the water. Didn\'t think about much. Came back lighter, the way I always do and always forget.' },
  { daysAgo: 55, song: null, text: 'Wrote a list of things I\'m grateful for and the pen kept going longer than I expected. Good sign.' },
  { daysAgo: 63, song: null, text: 'Started this little habit of noticing one good thing a day. Today it was the smell of rain on warm pavement.' },
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
