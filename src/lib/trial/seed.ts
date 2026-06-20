// src/lib/trial/seed.ts
//
// Mock content for /try so a visitor lands in a *lived-in* diary: a 3-day
// Nainital trip on the three consecutive days before today (for the shelf,
// memory, and flip-back reading) plus delivered letters in the postbox.
// Regenerated fresh on every new /try session (the throwaway key changes), so
// it's all client-side — no DB, no migration, same on dev / staging / prod.
//
// Journals are seeded as PLAINTEXT with `e2eeIVs: null`: the decrypt layer
// passes those straight through for an unlocked E2EE user. Letters are E2EE, so
// each is encrypted here with the live session key via the real payload builder.
//
// Each journal is written long (lots of short paragraphs) so it FILLS both diary
// pages — htmlToSplitPlainText pours whole paragraphs onto the left until it's
// full (~21 lines), then the rest onto the right. Photos are bundled trip images
// referenced by plain URL; songs use the self-contained iTunes string.

import type { JournalEntry } from '@/store/journal'
import type { TrialLetter } from '@/store/trial'
import { buildSelfLetterPayload, type SelfLetterDraft } from '@/lib/letters/self-letter-client'

export interface TrialSeed {
  entries: JournalEntry[]
  letters: TrialLetter[]
  journalCount: number
  letterCount: number
}

const uid = () => `trial-${crypto.randomUUID()}`
const IMG = (n: number) => `/try-seed/nainital-${n}.jpg`

/** ISO timestamp for `n` days before now, parked at a calm 9am. */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** A self-contained iTunes-shaped song string (renders with no network). */
function song(title: string, artist: string, artImg: number): string {
  return JSON.stringify({ _h: 'itunes', id: `seed-${title}`, t: title, a: artist, art: IMG(artImg), p: '/try-seed/preview.mp3' })
}

type SeedPhoto = NonNullable<JournalEntry['photos']>[number]
function photo(img: number, position: 1 | 2): SeedPhoto {
  return { url: IMG(img), rotation: position === 1 ? 6 : -6, position, spread: 1 }
}

function entry(args: { daysAgo: number; text: string; song?: string; photos?: SeedPhoto[] }): JournalEntry {
  const createdAt = daysAgo(args.daysAgo)
  return {
    id: uid(),
    text: args.text,
    textPreview: args.text.replace(/<[^>]*>/g, '').replace(/\n+/g, ' ').slice(0, 80),
    createdAt,
    updatedAt: createdAt,
    song: args.song,
    tags: [],
    doodles: [],
    photos: args.photos ?? [],
    entryType: 'normal',
    e2eeIVs: null,
  }
}

// Paragraphs joined with a blank line. Kept short and punchy so the split fills
// each page tightly instead of leaving the next big block to spill early.
const P = (...paras: string[]) => paras.join('\n\n')

// Sized to the diary's real page capacity: the left page shows ~21 lines, the
// right page ~12 (photos + doodle eat its top and bottom). Both clip overflow,
// so each entry is kept to ~33 wrapped lines total — enough to FILL both pages
// without losing text off the bottom of the right.
const SEED_ENTRIES: JournalEntry[] = [
  // ── Day 3 of the trip — the last morning (most recent: yesterday) ──
  entry({
    daysAgo: 1,
    song: song('The Night We Met', 'Lord Huron', 4),
    photos: [photo(4, 1), photo(2, 2)],
    text: P(
      "Last full day. Nobody said it out loud, but we all packed a little slower this morning. 🎒",
      "Woke to the whole hillside wrapped in cloud — couldn't see twenty feet, the pines just dissolving into white. 🌫️",
      "Everyone wanted to wait it out. I pulled on a jacket and went walking anyway, and I'm so glad I did.",
      "Out of the mist came a man on a white horse, unhurried, like something out of a story. We nodded; he vanished back into the fog. 🐎",
      "By noon the sun burned it all off and we climbed Tiffin Top, the rock above the town — the lake a tiny bright coin far below. 🪨",
      "Bought roasted corn from a man who'd hauled his little stove all the way up the hill. Charred, lime, chilli, salt. I'll be dreaming about it for months. 🌽",
      "At home a day just vanishes. Here a single morning holds a misty walk, a horse out of a dream, a climb, and corn on a rock — and still has room left over. ⏳",
      "Tomorrow we drive back down to the noise — but I think I'm taking some of this quiet with me, folded up small behind the ribs. Next one already. 💛✨",
    ),
  }),
  // ── Day 2 of the trip — the big hike ──
  entry({
    daysAgo: 2,
    song: song('Holocene', 'Bon Iver', 1),
    photos: [photo(5, 1), photo(1, 2)],
    text: P(
      "Today was THE day. 🥾 Up before the sun, the air sharp enough to wake you better than coffee.",
      "Started in the pine forest — light in long gold bars, the floor soft with fallen needles, every breath all resin and rain. 🌲",
      "First hour: pure joy, and we were insufferable about how much we were \"connecting with nature.\" 😌",
      "Second hour the trail went vertical and the connecting-with-nature talk stopped rather abruptly. 😅",
      "A tiny tea shack near the top — a tarp, a kettle, a man who lives where the views are this good. Best cup of the whole trip. ☕",
      "Then the trees just ended. We stepped onto the ridge and the world fell away — blue ranges stacked to the horizon, clouds sitting below us instead of above. ⛰️",
      "I laughed out loud. You climb for hours staring at your own feet, and then the sky just hands you everything at once. 🦅",
      "Nobody checked the time. Just cold air and people I love, out of breath and grinning. Some days you earn — this was one of them. 💛✨",
    ),
  }),
  // ── Day 1 of the trip — arrival ──
  entry({
    daysAgo: 3,
    song: song('Home', 'Edward Sharpe & The Magnetic Zeros', 6),
    photos: [photo(3, 1), photo(6, 2)],
    text: P(
      "Day one. We made it. 🚗 Eight hours of switchbacks, two wrong turns, and a roadside samosa best left unexamined.",
      "Then the road bent, the valley opened — Naini lake, sitting in the green like something cupped in two hands. 💚",
      "The whole car went quiet. Even Rohit stopped talking, which I didn't know was physically possible. 😄",
      "We didn't even unpack — dropped the bags and ran down to the water like kids let out of school.",
      "Took an old wooden boat out. Our boatman has rowed this lake forty years and rowed us in a slow, bored circle while we lost our minds over the view. 🛶",
      "Hills going green, then blue, then nearly black. Lights flickering on one by one. Boats scattered like someone spilled a handful across the water. ✨",
      "Found a tea stall on the Mall Road after. Priya called it \"the best chai of her life.\" She might genuinely be right this time. ☕",
      "Still waiting for the itch to check my phone. It hasn't come. Tomorrow: the big hike. Tonight: more chai and absolutely zero plans. 💛",
    ),
  }),
]

/** Two full "from past you" letters — emoji, a song, a photo each. Dated in the
 *  past and already delivered, so the postbox shows them unread. */
const SEED_LETTER_DRAFTS: Array<{ daysAgo: number; draft: SelfLetterDraft }> = [
  {
    daysAgo: 1,
    draft: {
      text: P(
        "Hey you 💛",
        "If you're reading this, some time has passed since the mountains. The sunburn's faded, the laundry's done, the trip has folded itself into a story you tell at dinners — usually the part about the corn. 🌽",
        "I wanted to reach across that gap while it's still bright in me.",
        "You were happy up there. Not the loud kind — the quiet kind. The kind that sits in your chest on a boat at dusk and doesn't ask for anything else. 🌅",
        "Remember the lake going from green to black. Remember laughing on the ridge with people who feel like home. Remember the misty morning you almost slept through and didn't.",
        "Remember, most of all, that the version of you up there — tired, windblown, grinning into the cold — is the real one. The desk version is just borrowing your time for a while. ⛰️",
        "So whatever's pressing on you as you read this: go outside. Find some trees. Walk uphill until your head goes quiet. Call the people from the ridge. ☎️",
        "The mountains are still there. They're always still there. And so, underneath all of it, are you.",
        "See you on the next trail. 🥾\n— past you, from a warm rock above Naini lake 🪨",
      ),
      song: song('Bookends', 'Simon & Garfunkel', 6),
      photos: [{ url: IMG(6), position: 1, spread: 1, rotation: 5 }],
    },
  },
  {
    daysAgo: 4,
    draft: {
      text: P(
        "A note from a few days ago 💌",
        "Hi. It's you, on a very good evening, thinking about you on a harder one. ☕",
        "Whatever you're turning over and over right now — picture the lake from the top of Tiffin Top. The boats so small you could hide them all under one thumb. 🚣",
        "That's about the size your worry will be too, once you've got a little height on it. Promise.",
        "So here's your assignment, from past you, with love and absolutely zero patience for your overthinking:",
        "Drink a full glass of water. Step outside and find the sky for one whole minute. Text the person you keep meaning to text — yes, that one. 🌙",
        "None of it is as heavy as it feels at midnight. You have carried heavier things than this and you are still standing.",
        "Keep going. Gently. We've got mountains left to climb. 🏔️\n— past you ✨",
      ),
      song: song('The Night We Met', 'Lord Huron', 2),
      photos: [{ url: IMG(2), position: 1, spread: 1, rotation: -5 }],
    },
  },
]

/**
 * Build the full trial seed. Letters are encrypted with the live session key,
 * so this is async. `journalCount`/`letterCount` are set so the per-feature caps
 * still leave room to create a couple more of each before the upgrade modal.
 */
export async function buildTrialSeed(masterKey: CryptoKey): Promise<TrialSeed> {
  const letters: TrialLetter[] = await Promise.all(
    SEED_LETTER_DRAFTS.map(async ({ daysAgo: d, draft }) => {
      const when = daysAgo(d)
      const payload = await buildSelfLetterPayload({
        draft,
        unlockDate: new Date(when), // already in the past ⇒ delivered/arrived
        masterKey,
      })
      return {
        id: uid(),
        type: 'self' as const,
        contentCiphertext: payload.contentCiphertext,
        contentIVs: payload.contentIVs,
        recipientName: null,
        recipientEmail: null,
        createdAt: when,
        unlockDate: when,
        isViewed: false,
      }
    })
  )

  return {
    entries: SEED_ENTRIES,
    letters,
    journalCount: 3,
    letterCount: 2,
  }
}
