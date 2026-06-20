// src/lib/trial/seed.ts
//
// Mock content for /try so a visitor lands in a *lived-in* diary: a short
// Nainital trip told across a handful of past journals (for the shelf, memory,
// and flip-back reading) plus a few delivered letters waiting in the postbox.
// Regenerated fresh on every new /try session (the throwaway key changes), so
// it's all client-side — no DB, no migration, same on dev / staging / prod.
//
// Journals are seeded as PLAINTEXT with `e2eeIVs: null`: the decrypt layer
// passes those straight through for an unlocked E2EE user (same trick the real
// app's seed script uses). Letters are genuinely E2EE, so each is encrypted
// here with the live session key via the real self-letter payload builder.
//
// Photos are bundled trip images under /public/try-seed referenced by plain URL
// — usePhotoSrc returns a non-handle `url` as-is, so they render everywhere with
// no blob store or encryption. Songs use the self-contained iTunes-shaped string
// so the embed renders (title/artist/art) with no network call.

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

/** ISO timestamp for `n` days before now, parked at a calm 9am so it reads as a
 *  past day on both the shelf (month buckets) and the day-tab rail. */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** A self-contained iTunes-shaped song string (parseStoredSong renders it with
 *  no network — cover art is a bundled trip image; the preview is a no-op stub). */
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
    // Plaintext pass-through: no IVs ⇒ the decrypt layer returns the row as-is.
    e2eeIVs: null,
  }
}

const SEED_ENTRIES: JournalEntry[] = [
  // — the idea, the night before —
  entry({
    daysAgo: 30,
    song: song('Rivers and Roads', 'The Head and the Heart', 3),
    photos: [photo(3, 1)],
    text:
      "It started, like most good things, with a photo someone sent at midnight. ☕ Naini lake ringed in green " +
      "hills, a little town spilling down to the water, and the words \"we should just go.\" So we did. Booked it " +
      "before any of us could talk ourselves out of it.\n\n" +
      "Spent tonight digging the old hiking boots out of the back of the cupboard — the ones still wearing dried " +
      "mud from a trip three summers ago. 🥾 Funny how the smell of them brought the whole thing back: cold " +
      "mornings, bad instant coffee that tasted like the best thing ever because we were somewhere new.\n\n" +
      "There's a particular happiness in the night before a trip. Nothing's gone wrong yet. The hike hasn't been " +
      "hard, nobody's tired, the weather is still perfect in our heads. ✨ I want to hold onto this part too — " +
      "the wanting, the packing, the almost.\n\n" +
      "Going to sleep before I overthink it. The hills have been there ten thousand years. They'll wait one more " +
      "night for us. 🏔️",
  }),
  // — arrival, the lake —
  entry({
    daysAgo: 17,
    song: song('Home', 'Edward Sharpe & The Magnetic Zeros', 6),
    photos: [photo(6, 1)],
    text:
      "Eight hours of switchbacks and one very questionable roadside samosa later — we made it. 🚗 The moment the " +
      "road bent and the valley opened up, the whole car went quiet. Naini lake, sitting in the green like " +
      "something cupped in two hands. 💚\n\n" +
      "We didn't even unpack. Dropped the bags and walked straight down to the water as the sun went soft. 🌅 Took " +
      "one of the little wooden boats out — the kind that's been ferrying tired travellers for a hundred years — " +
      "and just drifted. The hills on either side turning green, then blue, then nearly black. Lights coming on " +
      "one by one. Boats scattered across the water like someone spilled a handful of them.\n\n" +
      "Nobody said much. We didn't need to. There's a tiredness that feels like being emptied out in a good way " +
      "— all the noise from back home finally quiet enough to hear the oars. 🌊\n\n" +
      "Note to self: always order the second cup of chai. ☕",
  }),
  // — the big hike (hero) —
  entry({
    daysAgo: 11,
    song: song('Holocene', 'Bon Iver', 1),
    photos: [photo(5, 1), photo(1, 2)],
    text:
      "Today was the day. 🥾 Up before the sun, the air sharp enough to wake you better than coffee. We started in " +
      "the pine forest where the light comes down in long gold bars and the whole floor is soft with needles. 🌲 " +
      "Every breath smelled like resin and wet earth. For the first hour nobody complained — too busy being happy.\n\n" +
      "Then it got steep. Of course it got steep. The kind of climb where you stop talking and just listen to " +
      "your own breathing and the crunch of the trail. My legs were begging by the halfway mark. Someone started " +
      "singing to keep us going and it was terrible and perfect. 🎶\n\n" +
      "And then the trees just… ended. We stepped onto the ridge and the world fell away on every side — range " +
      "after range of blue mountains stacked to the horizon, clouds sitting below us instead of above. ⛰️ I " +
      "actually laughed out loud. You climb for hours staring at your feet and then the sky hands you everything " +
      "at once.\n\n" +
      "We sat up there a long time. Passed around a bar of chocolate half-melted in someone's bag, watched a hawk " +
      "ride the wind without one flap. 🦅 Coming down, my knees hated me and I didn't care — I kept turning to " +
      "look back at the top, the way you do when you don't want to leave a place. Some days you earn. ✨",
  }),
  // — misty morning, slow day —
  entry({
    daysAgo: 6,
    song: song('The Night We Met', 'Lord Huron', 4),
    photos: [photo(4, 1), photo(2, 2)],
    text:
      "Woke up to the whole hillside wrapped in cloud. 🌫️ Couldn't see twenty feet — the pines just dissolved into " +
      "white. Everyone wanted to wait it out, but I pulled on a jacket and went walking anyway, and I'm so glad " +
      "I did.\n\n" +
      "The old stone path was slick and shining, and out of the mist came a man on a white horse, unhurried, like " +
      "something out of a story. 🐎 We nodded at each other and he vanished back into the fog. The whole walk felt " +
      "like being inside a held breath.\n\n" +
      "Later the sun burned it off and we climbed to the rock above the town — Tiffin Top, the locals call it. Sat " +
      "on the warm stone with the valley below and the lake a small bright coin in the middle of it. 🪨 Bought " +
      "roasted corn from a man who'd carried his little stove all the way up. Best thing I've eaten in months. 🌽\n\n" +
      "I keep noticing how slow time goes here. At home a day vanishes. Here a single morning holds a misty walk, " +
      "a horse out of a dream, a climb, and corn on a rock — and still has room left over. ✨",
  }),
  // — home again, the nostalgia —
  entry({
    daysAgo: 2,
    song: song('Landslide', 'Fleetwood Mac', 3),
    photos: [photo(1, 1)],
    text:
      "Back home two days now and the hills won't leave me alone. 🏔️ I keep catching the smell of pine where there " +
      "isn't any. My boots are by the door, muddy again, and this time I don't think I'll clean them.\n\n" +
      "It's strange how a place you knew for a week can leave a hole shaped exactly like itself. I reach for the " +
      "group chat, but everyone's scattered back into their own lives now — different cities, the trip already " +
      "turning into \"remember when.\" 💛\n\n" +
      "I've been looking at the photos more than I should. The lake at dusk. All of us squinting into the sun on " +
      "the ridge, sunburnt and grinning like idiots. The misty morning nobody else got up for. Already they feel " +
      "less like memory and more like a song I used to know.\n\n" +
      "But here's what I want to write down before the ordinary closes back over me: I came back lighter. The " +
      "mountains reminded me that most of what I worry about is very small and very temporary, and that the cure " +
      "is usually just to walk uphill until I forget my own name. 🌲\n\n" +
      "We've already started a new group chat. \"Next one?\" Yeah. Next one. ✨",
  }),
]

/** Cosy "from past you" letters, dated in the past and already delivered, so the
 *  postbox shows them unread and the visitor can break each seal. The first is a
 *  richer, song-and-photo letter; the others are short notes. */
const SEED_LETTER_DRAFTS: Array<{ daysAgo: number; draft: SelfLetterDraft }> = [
  {
    daysAgo: 1,
    draft: {
      text:
        "Hey you 💛\n\n" +
        "If you're reading this, some time has passed since the mountains — enough that the sunburn's gone and the " +
        "laundry's done and the trip has folded itself into a story you tell. I wanted to reach across that gap " +
        "while it's still fresh in me.\n\n" +
        "You were happy there. Not the loud kind — the quiet kind, the kind that sits in your chest on a boat at " +
        "dusk and doesn't need anything else. 🌅 Remember the lake going from green to black. Remember laughing on " +
        "the ridge with people who felt like home. Remember that the version of you up there — tired, windblown, " +
        "grinning — is the real one. The desk one is just borrowing your time.\n\n" +
        "So whatever's pressing on you as you read this: go outside. Find some trees. Walk uphill until your head " +
        "goes quiet. The mountains are still there. They're always still there. And so, underneath everything, " +
        "are you. ⛰️\n\n" +
        "See you on the next trail.\n— past you, from a rock above Naini lake 🪨",
      song: song('Bookends', 'Simon & Garfunkel', 6),
      photos: [{ url: IMG(6), position: 1, spread: 1, rotation: 5 }],
    },
  },
  {
    daysAgo: 8,
    draft: {
      text:
        "A note from a week ago 💌\n\n" +
        "The thing you're stressing about right now? Picture the lake. Picture the little boats. From far enough " +
        "away it'll look about that size. Go drink some water, look at the sky for a minute, text someone you " +
        "miss. ✨",
    },
  },
  {
    daysAgo: 20,
    draft: {
      text:
        "Writing this on a good day so you have it on a harder one. 🌻\n\n" +
        "You are doing better than the voice in your head says — proof is that you kept showing up long enough to " +
        "read this. Be gentle with yourself tonight. We've still got mountains left to climb. 🏔️\n— past you",
    },
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
