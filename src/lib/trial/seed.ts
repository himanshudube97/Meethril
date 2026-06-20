// src/lib/trial/seed.ts
//
// Mock content for /try so a visitor lands in a *lived-in* diary: a 3-day
// Nainital trip on the three consecutive days before today, plus delivered
// letters in the postbox. All client-side, regenerated each /try session —
// no DB, no migration, same on dev / staging / prod.
//
// Journals seed as PLAINTEXT (`e2eeIVs: null`, decrypt layer passes them
// through). Letters are E2EE, encrypted here with the live session key.
//
// PAGE FILLING: the diary's left page shows ~20 lines and the right ~11 (photos
// + doodle eat the right's space); both clip overflow. The live editor measures
// the page break against the real font while you type and stores a marker —
// seeded text can't measure, and the character-count fallback guesses wrong and
// splits early (leaving a gap). So we embed the SAME `<!--page-break-->` marker
// ourselves to place each paragraph deliberately: a left group that fills the
// left page and a right group that fills the right, with longer flowing
// paragraphs so both pages read like a real, full diary entry.

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
// Matches PAGE_BREAK_MARKER in src/lib/text-utils.ts — htmlToSplitPlainText
// slices the stored text here instead of falling back to the char-count split.
const PAGE_BREAK = '<!--page-break-->'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function song(title: string, artist: string, artImg: number): string {
  return JSON.stringify({ _h: 'itunes', id: `seed-${title}`, t: title, a: artist, art: IMG(artImg), p: '/try-seed/preview.mp3' })
}

type SeedPhoto = NonNullable<JournalEntry['photos']>[number]
function photo(img: number, position: 1 | 2): SeedPhoto {
  return { url: IMG(img), rotation: position === 1 ? 6 : -6, position, spread: 1 }
}

/** left paragraphs · page break · right paragraphs */
function spread(left: string[], right: string[]): string {
  return left.join('\n\n') + PAGE_BREAK + right.join('\n\n')
}

function entry(args: { daysAgo: number; left: string[]; right: string[]; song?: string; photos?: SeedPhoto[] }): JournalEntry {
  const createdAt = daysAgo(args.daysAgo)
  const text = spread(args.left, args.right)
  return {
    id: uid(),
    text,
    textPreview: args.left[0].replace(/<[^>]*>/g, '').slice(0, 80),
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

const SEED_ENTRIES: JournalEntry[] = [
  // ── Day 3 — the last morning (yesterday) ──
  entry({
    daysAgo: 1,
    song: song('The Night We Met', 'Lord Huron', 4),
    photos: [photo(4, 1), photo(2, 2)],
    left: [
      "Last full day, and nobody said it out loud, but we all packed a little slower this morning. 🎒 I woke to the whole hillside wrapped in cloud — couldn't see twenty feet in any direction, the pines just dissolving into a soft white nothing. 🌫️",
      "Everyone else wanted to wait it out, but I pulled on a jacket and slipped out anyway, and I'm so glad I did. The old stone path was slick and shining, and out of the mist came a man on a white horse, completely unhurried, like something walking straight out of an old story. We nodded at each other. He vanished back into the fog. 🐎",
      "Sounds go strange in that kind of cloud — a dog barking somewhere far below, a temple bell I never managed to find, my own footsteps arriving a half-beat behind me. I wasn't lonely out there. If anything I felt held, tucked inside something larger and kinder than the usual noise. 🔔",
    ],
    right: [
      "By noon the sun had burned it all off, so we climbed up to Tiffin Top and sat on the warm stone with the whole valley below and the lake shrunk to a single bright coin. We bought roasted corn from a man who'd hauled his little coal stove the entire way up the hill, and charred with lime and chilli and salt it was, I swear, the best thing I've eaten in months. 🌽",
      "At home a day just vanishes and I can never say where it went. Here a single ordinary morning holds a misty walk, a horse out of a dream, a climb, and corn on a rock — and still has room left over. Tomorrow we drive back down into the noise, but I'm folding some of this quiet up and carrying it home behind the ribs. Next one already. 💛✨",
    ],
  }),
  // ── Day 2 — the big hike ──
  entry({
    daysAgo: 2,
    song: song('Holocene', 'Bon Iver', 1),
    photos: [photo(5, 1), photo(1, 2)],
    left: [
      "Today was THE day. 🥾 We were up before the sun, the air sharp enough to wake you better than any coffee, and we set off through the pine forest with the light coming down in long gold bars and the whole floor soft and quiet under fallen needles. 🌲",
      "The first hour was pure joy. Nobody complained about a single thing. We were, if I'm honest, completely insufferable about how deeply we were \"connecting with nature\" — right up until the second hour, when the trail turned vertical and all of that talk stopped rather abruptly. 😅",
      "It became the kind of climb where you stop talking entirely and just listen to your own breathing and the crunch of your boots on loose stone. Near the top we found a tiny tea shack — a tarp, a kettle, and a man who has simply chosen to live where the views are this good. Best cup of the whole trip. ☕",
    ],
    right: [
      "And then the trees just ended. We stepped out onto the ridge and the world dropped away on every side — range after range of blue mountains stacked all the way to the horizon, the clouds sitting below us for once instead of above. I actually laughed out loud. ⛰️",
      "You climb for hours staring at your own feet, and then without warning the sky just hands you everything at once. Nobody checked the time. There was no next thing to rush off to — only the cold clean air and the people I love, out of breath and grinning at each other like idiots. Some days you earn, and this was one of them. 💛✨",
    ],
  }),
  // ── Day 1 — arrival ──
  entry({
    daysAgo: 3,
    song: song('Home', 'Edward Sharpe & The Magnetic Zeros', 6),
    photos: [photo(3, 1), photo(6, 2)],
    left: [
      "Day one, and somehow we actually made it — eight hours of switchbacks, two genuinely wrong turns, and one roadside samosa that is best left unexamined. Then the road bent, the valley cracked open, and there it was: Naini lake, sitting in the green like something cupped carefully in two hands. 💚",
      "The whole car went quiet. Even Rohit stopped talking, which is a thing I did not previously believe was physically possible. 😄 We didn't even bother to unpack — we just dropped the bags at the guesthouse and ran straight down to the water like a pack of kids let out of school.",
      "We took one of the old wooden boats out, and our boatman, who has apparently been rowing this exact lake for forty years, rowed us in a slow and perfectly bored circle while the four of us quietly lost our minds over the view. The hills went green, then blue, then very nearly black. 🛶",
    ],
    right: [
      "Lights came on one by one along the shore, and the boats scattered across the water looked like someone had spilled a handful of them. Afterwards we found a tea stall up on the Mall Road and Priya declared it \"the best chai of her entire life\" — a thing she says roughly twice a year, but this time she might genuinely be right. ☕",
      "I keep waiting for the usual itch to check my phone, and it just hasn't come. Maybe I left it back in the city — the itch, I mean; the phone is sadly right here in my pocket. 📵 Tomorrow we attempt the big hike. Tonight there is only more chai and absolutely zero plans of any kind. 💛",
    ],
  }),
]

/** Two full "from past you" letters — flowing paragraphs, emoji, a song, a
 *  photo each. Dated in the past and delivered, so the postbox shows them. */
const SEED_LETTER_DRAFTS: Array<{ daysAgo: number; draft: SelfLetterDraft }> = [
  {
    daysAgo: 1,
    draft: {
      text: [
        "Hey you 💛",
        "If you're reading this, some time has passed since the mountains — the sunburn's long faded, the laundry's done, and the whole trip has quietly folded itself into a story you tell at dinners, usually the part about the corn. 🌽 I wanted to reach across that gap and remind you of a few things while they're still bright in me.",
        "You were happy up there. Not the loud kind of happy — the quiet kind, the kind that settles into your chest on a boat at dusk and doesn't ask for anything more. 🌅 Remember the lake going from green to black. Remember laughing yourself stupid on the ridge with people who feel like home. Remember the misty morning you very nearly slept through, and didn't.",
        "And remember, most of all, that the version of you up there — tired, windblown, grinning into the cold — is the real one. The version hunched over a desk is just borrowing your time for a little while. ⛰️",
        "So whatever happens to be pressing down on you as you read this: go outside. Find some trees. Walk uphill until your head finally goes quiet. Call the people from the ridge. The mountains are still standing exactly where you left them — they always are. And so, underneath all of it, are you.",
        "See you on the next trail. 🥾\n— past you, from a warm rock above Naini lake 🪨",
      ].join('\n\n'),
      song: song('Bookends', 'Simon & Garfunkel', 6),
      photos: [{ url: IMG(6), position: 1, spread: 1, rotation: 5 }],
    },
  },
  {
    daysAgo: 4,
    draft: {
      text: [
        "A note from a few days ago 💌",
        "Hi. It's you — on a very good evening, thinking about you on a harder one. ☕ I don't know exactly what's sitting heavy on you as you read this, but I know you, so I'm fairly sure something is.",
        "Here's the trick I keep relearning: picture the lake from the top of Tiffin Top, the way we saw it on the last morning. The boats so small you could hide every one of them under a single thumb. 🚣 Whatever you're turning over and over right now is about that size too, once you've got a little height on it. I promise.",
        "So here is your assignment, from past you, with love and absolutely zero patience for your overthinking: drink a full glass of water. Step outside and find the sky for one whole minute. Text the person you keep meaning to text — yes, that one. 🌙",
        "None of it is as heavy as it feels at midnight. You have carried far heavier things than this and you are still standing, still here, still reading. Keep going. Gently. We've got mountains left to climb. 🏔️\n— past you ✨",
      ].join('\n\n'),
      song: song('The Night We Met', 'Lord Huron', 2),
      photos: [{ url: IMG(2), position: 1, spread: 1, rotation: -5 }],
    },
  },
]

export async function buildTrialSeed(masterKey: CryptoKey): Promise<TrialSeed> {
  const letters: TrialLetter[] = await Promise.all(
    SEED_LETTER_DRAFTS.map(async ({ daysAgo: d, draft }) => {
      const when = daysAgo(d)
      const payload = await buildSelfLetterPayload({
        draft,
        unlockDate: new Date(when),
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
