// src/lib/trial/seed.ts
//
// Mock content for /try so a visitor lands in a *lived-in* diary: a handful of
// past journals (for the shelf, memory, and flip-back reading) and a few
// already-delivered letters waiting in the postbox. Regenerated fresh on every
// new /try session (the throwaway key changes), so it's all client-side — no
// DB, no migration, works the same on dev / staging / production.
//
// Journals are seeded as PLAINTEXT with `e2eeIVs: null`: the decrypt layer
// passes those straight through for an unlocked E2EE user (same trick the real
// app's seed script uses). Letters are genuinely E2EE, so each is encrypted
// here with the live session key via the real self-letter payload builder.
//
// Photos are bundled SVGs under /public/try-seed and referenced by plain URL —
// usePhotoSrc returns a non-handle `url` as-is, so they render everywhere with
// no blob store or encryption. Swap them for real images by replacing the files.

import type { JournalEntry } from '@/store/journal'
import type { TrialLetter } from '@/store/trial'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'

export interface TrialSeed {
  entries: JournalEntry[]
  letters: TrialLetter[]
  journalCount: number
  letterCount: number
}

const id = () => `trial-${crypto.randomUUID()}`

/** ISO timestamp for `n` days before now, parked at a calm 9am so it reads as a
 *  past day on both the shelf (month buckets) and the day-tab rail. */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** A self-contained iTunes-shaped song string (parseStoredSong renders it with
 *  no network — cover art is a bundled asset; the preview is a no-op stub). */
function song(title: string, artist: string, art: string): string {
  return JSON.stringify({ _h: 'itunes', id: `seed-${title}`, t: title, a: artist, art, p: '/try-seed/preview.mp3' })
}

function photo(url: string, position: 1 | 2): NonNullable<JournalEntry['photos']>[number] {
  return { url, rotation: position === 1 ? 6 : -6, position, spread: 1 }
}

function entry(args: {
  daysAgo: number
  text: string
  song?: string
  photos?: JournalEntry['photos']
}): JournalEntry {
  const createdAt = daysAgo(args.daysAgo)
  return {
    id: id(),
    text: args.text,
    textPreview: args.text.replace(/<[^>]*>/g, '').slice(0, 80),
    createdAt,
    updatedAt: createdAt,
    song: args.song,
    tags: [],
    doodles: [],
    photos: args.photos ?? [],
    entryType: 'normal',
    // Plaintext pass-through: no IVs ⇒ the decrypt layer returns the row as-is.
    e2eeIVs: null,
  }
}

const SEED_ENTRIES: JournalEntry[] = [
  entry({
    daysAgo: 2,
    text:
      "Slow morning. Coffee on the sill while the street woke up, and for once I didn't reach for my phone. " +
      "The light came in gold and I just sat in it. Small thing, but it felt like enough.",
    song: song('Holocene', 'Bon Iver', '/try-seed/photo-2.svg'),
    photos: [photo('/try-seed/photo-1.svg', 1)],
  }),
  entry({
    daysAgo: 6,
    text:
      "Walked the long way home by the water. The sky did that thing where it can't decide between blue and " +
      "navy, and the first lights were coming on across the harbour. I felt very small and very okay about it.",
    photos: [photo('/try-seed/photo-2.svg', 1)],
  }),
  entry({
    daysAgo: 11,
    text:
      "Hard day, honestly. But I made the soup my mum used to make and called an old friend, and the two of " +
      "those together patched something up. Writing it down so future me remembers the patch held.",
    song: song('Re: Stacks', 'Bon Iver', '/try-seed/photo-1.svg'),
  }),
  entry({
    daysAgo: 17,
    text:
      "Took the afternoon off and went up into the green. No signal, no plan. Sat under the trees until my " +
      "thoughts got quiet enough to hear. I keep forgetting this is free and always there.",
    photos: [photo('/try-seed/photo-3.svg', 1)],
  }),
  entry({
    daysAgo: 30,
    text:
      "First entry of a new little habit. Not sure what I want this to be yet — maybe just a place to be honest " +
      "without anyone watching. Starting anyway. That's the whole trick, isn't it: starting anyway.",
  }),
]

/** Cosy "from past you" letters, dated in the past and already delivered, so the
 *  postbox shows them as unread and the visitor can break each seal. */
const SEED_LETTER_DRAFTS: Array<{ daysAgo: number; text: string }> = [
  {
    daysAgo: 1,
    text:
      "Hey, you. If you're reading this, you made it to another quiet evening — that counts for more than you " +
      "give it credit for. Be gentle with yourself tonight. The hard part you were dreading? You'll handle it, " +
      "the way you always quietly do. — past you",
  },
  {
    daysAgo: 8,
    text:
      "A reminder from a week ago: the thing you're worried about right now probably won't matter by the time " +
      "this reaches you. Most of them don't. Go drink some water and look at the sky for a minute.",
  },
  {
    daysAgo: 20,
    text:
      "Writing this on a good day so you have it on a harder one. You are doing better than the voice in your " +
      "head says. Proof: you kept showing up long enough to read this. Keep going. I'm rooting for us.",
  },
]

/**
 * Build the full trial seed. Letters are encrypted with the live session key,
 * so this is async. `journalCount`/`letterCount` are deliberately set BELOW the
 * number seeded so the per-feature caps still leave room to create ~2 more of
 * each before the upgrade modal appears.
 */
export async function buildTrialSeed(masterKey: CryptoKey): Promise<TrialSeed> {
  const letters: TrialLetter[] = await Promise.all(
    SEED_LETTER_DRAFTS.map(async (d) => {
      const when = daysAgo(d.daysAgo)
      const payload = await buildSelfLetterPayload({
        draft: { text: d.text },
        unlockDate: new Date(when), // already in the past ⇒ delivered/arrived
        masterKey,
      })
      return {
        id: id(),
        type: 'self' as const,
        contentCiphertext: payload.contentCiphertext,
        contentIVs: payload.contentIVs,
        recipientName: null,
        recipientEmail: null,
        createdAt: when,
        unlockDate: when,
        isViewed: false, // unread ⇒ shows in the postbox
      }
    })
  )

  return {
    entries: SEED_ENTRIES,
    letters,
    // Seeded count < items shown, so the visitor can still write ~2 journals and
    // ~2 letters before hitting the trial cap of 5.
    journalCount: 3,
    letterCount: 3,
  }
}
