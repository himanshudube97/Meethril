/**
 * Dev-only test-data dump for journal entries.
 *
 * Targets a single E2EE-enabled user and writes PLAINTEXT journal rows
 * (e2eeIVs = null). The client decryptor skips fields with no IV and leaves
 * the plaintext untouched (see src/lib/e2ee/draft-encryptor.ts decryptEntry +
 * src/hooks/useE2EE.ts), so these render correctly without a master key.
 *
 * Matches the real write path:
 *   - text       → HTML paragraphs (<p>…</p>), like the TipTap editor stores
 *   - textPreview → tags stripped, first 150 chars + '…' (createTextPreview)
 *   - song       → bare URL (parseStoredSong → kind:'url' → SongEmbed)
 *   - style      → { font?: 'caveat' | 'patrick-hand' }
 *
 * Run:  docker compose exec app npx tsx prisma/seed-journals.ts
 * Additive only — never deletes existing rows.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TARGET_EMAIL = process.env.SEED_EMAIL || 'e2ee@gmail.com'

// ---- helpers that mirror the real write path -------------------------------

function plainTextToHtml(text: string): string {
  if (!text.trim()) return ''
  return '<p>' + text.replace(/\n/g, '</p><p>') + '</p>'
}

function createTextPreview(html: string, max = 150): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length <= max ? text : text.slice(0, max).trim() + '…'
}

// A few real, well-known YouTube URLs so SongEmbed actually renders an embed.
const SONGS = [
  'https://www.youtube.com/watch?v=lYBUbBu4W08', // Tum Hi Ho
  'https://www.youtube.com/watch?v=hoNb6HuNmU0', // Kun Faya Kun
  'https://www.youtube.com/watch?v=sxLn8D_8Mas', // Iktara
  'https://www.youtube.com/watch?v=Ynp3D2bMA2o', // Agar Tum Saath Ho
  'https://www.youtube.com/watch?v=K9Cu1nXR_Wc', // Phir Le Aya Dil
  'https://www.youtube.com/watch?v= rzRG2s-Tld8'.replace(' ', ''), // Channa Mereya
  'https://www.youtube.com/watch?v=jHNNMj5bNQw', // Tum Se Hi
]

type SeedEntry = {
  text: string
  tags: string[]
  song?: string
  font?: 'patrick-hand'
}

// ---- full-length entries (the headline of this dump) -----------------------
// Each is multi-paragraph, ~700–1150 plain chars (MAX_CHARS is 1200), so they
// fill a whole spread.
const longEntries: SeedEntry[] = [
  {
    text: `I keep coming back to this idea that I'm running out of time, and I can't tell if it's true or just a story my anxiety likes to tell at night.\n\nToday I did the math. If I'm lucky, I have maybe fifty more summers. Fifty. That sounds like a lot until you realize how few of them I actually remember from the last decade. They blur together — work, deadlines, the same three restaurants, scrolling until my thumb aches.\n\nBut then I went for a walk this evening, no phone, and the air had that specific warmth that only exists in the first week of real summer. A kid was learning to ride a bike and kept falling and laughing. An old couple shared a single ice cream. And for about twenty minutes I wasn't running out of anything. I had everything I needed and it was free.\n\nMaybe the trick isn't to add more summers. Maybe it's to actually be inside the one I'm in.`,
    tags: ['reflection', 'time', 'summer'],
    song: SONGS[3],
  },
  {
    text: `Long call with Papa tonight. We don't talk much usually — it's always Ma who calls and he hovers in the background asking "khana khaya?" But today Ma was out, so it was just us, and something cracked open.\n\nHe told me about when he first moved to the city at nineteen. How he slept four to a room, how he sent almost everything home, how for two years he didn't buy himself a single new shirt. He said it so plainly, like he was reading a grocery list, and I sat there with my throat tight.\n\nI've spent so long thinking of him as just… my father. The man who was tired at dinner. The man who didn't understand my career. But tonight he was nineteen and scared and brave and I never knew that version existed.\n\nI'm going to call him more. Not for them. For me. There are whole lives inside the people we think we already know.`,
    tags: ['family', 'father', 'gratitude'],
    font: 'patrick-hand',
  },
  {
    text: `Burnout isn't dramatic. That's what nobody tells you. It doesn't arrive with a collapse. It arrives as a slow greying of everything.\n\nI noticed it today when a colleague got genuinely excited about a feature shipping and I felt… nothing. Not jealousy, not joy, just a flat acknowledgement, like reading a weather report for a city I'll never visit.\n\nI used to love this work. I remember staying up until 3am because I couldn't stop, not because I had to. Now I count the minutes. I've become very good at appearing engaged. I nod at the right times. I say "totally" and "makes sense." Inside I'm somewhere far away, looking at my own life through frosted glass.\n\nI don't think I need a vacation. A vacation is a pause. I think I need to change the thing I come back to. That's a much scarier thought, so I'll probably ignore it for another six months. But I wrote it down. That counts for something.`,
    tags: ['work', 'burnout', 'honesty'],
  },
  {
    text: `Cleaned out my closet today and found the box. You know the one — everyone has it. Ticket stubs, a dried flower, birthday cards from people I no longer speak to, a friendship band that's basically dust now.\n\nThere was a note from a friend who died three years ago. Just a silly note, passed in some lecture, about how the professor's tie looked like a dead fish. I laughed and then I cried in the way you cry when you're alone and don't have to manage anyone else's discomfort.\n\nGrief is strange. It doesn't shrink. You just build a bigger life around it, and most days the proportions feel okay, and then a shoebox ambushes you on a Sunday afternoon.\n\nI kept the note. Put it back in the box. Some things you carry not because they're light but because putting them down would be a second goodbye, and one was already too many.`,
    tags: ['grief', 'memories', 'friendship'],
    song: SONGS[4],
  },
  {
    text: `I think I've been confusing being busy with being alive.\n\nThis whole month I've optimized everything. Meal-prepped. Time-blocked. Listened to podcasts at 1.5x while doing dishes so even the dishes were "productive." I treated my own life like a sprint to be finished efficiently.\n\nAnd then today the wifi went out for three hours and I had no plan. I made tea. I sat by the window. I watched a pigeon build a frankly terrible nest on the ledge across the street, dropping more twigs than it placed. I didn't earn anything. I didn't grow. I just existed, and it was the best I've felt in weeks.\n\nMaybe rest isn't the reward for finishing the work. Maybe it's the soil the rest of life grows out of, and I've been trying to grow a garden on concrete and wondering why nothing blooms.`,
    tags: ['rest', 'reflection', 'slow-living'],
  },
  {
    text: `Had the kind of fight with a friend today where you both say true things in cruel ways and then can't take them back.\n\nThe worst part is they were partly right. They said I disappear when people need me, that I'm great at celebrating and useless at the hard parts. I wanted to defend myself but I just stood there because some accusations land so squarely that argument feels obscene.\n\nI've been thinking about it all evening. I do disappear. Other people's pain makes me feel helpless, and helpless makes me feel useless, and useless makes me leave before I can be found wanting. It's not noble. It's not even really about them. It's me protecting myself and calling it "giving space."\n\nI texted them. Just: "You were right. I'm sorry. I want to be better at this." No defense. Sat with how vulnerable that felt. They haven't replied yet. That's fair.`,
    tags: ['friendship', 'conflict', 'growth'],
    font: 'patrick-hand',
  },
  {
    text: `Today marks one year sober from the thing I never named here. I'll name it now, just once, to myself: comparison. Not alcohol, not a substance. The endless, grinding habit of measuring my insides against everyone else's outsides.\n\nA year ago I deleted the apps that fed it. Not all social media — just the ones that had become slot machines of other people's highlight reels. The first month was genuinely hard. I'd reach for my phone like a phantom limb. I felt cut off, like I was missing some essential broadcast everyone else could hear.\n\nBut slowly the volume came down. I started noticing my own life again. My actual friends, not the curated avatars of strangers. My small wins stopped feeling small just because someone, somewhere, had a bigger one.\n\nI'm not cured. I relapse in supermarket queues and waiting rooms. But a year. That's real. I'm proud of me, and I almost never say that.`,
    tags: ['growth', 'digital-detox', 'milestone'],
  },
  {
    text: `It rained the whole day and I let myself do nothing about it.\n\nThere's a particular guilt I carry on grey days, like the weather is a test of my discipline and staying in bed is failing it. But today I just surrendered. Read most of a novel. Made dal from scratch and let it simmer for an hour I didn't really need to. Watched the rain bead and race down the glass like it used to fascinate me as a kid.\n\nI keep waiting to feel ready for my life — ready to be calm, ready to be kind to myself, ready to stop performing. As if readiness is a destination I'll arrive at if I just work hard enough. But maybe readiness is a decision you make on an ordinary wet Tuesday, with dal on the stove and nowhere to be.\n\nI decided. Just for today. Tomorrow I might forget. But today I was gentle, and the rain didn't judge me for it.`,
    tags: ['rain', 'rest', 'self-compassion'],
    song: SONGS[2],
  },
  {
    text: `I met someone at a friend's dinner who asked me, completely sincerely, "What do you do for joy?" and I genuinely could not answer.\n\nI listed things I'm supposed to enjoy. I described hobbies I used to have in the past tense. I talked about work I'm proud of. But joy — present tense, this week, an actual thing I do because it lights me up — I had nothing.\n\nIt's haunted me all night. When did I outsource my joy to achievement? When did "fun" become another box to optimize? I used to draw. Badly, happily. I used to sing in the shower without checking if anyone could hear. I used to dance in my kitchen.\n\nThe person who did those things is still in here somewhere, I think. Buried under deadlines and the relentless project of becoming impressive. I want to dig them out. So: tomorrow I'm buying cheap paints and making something ugly and showing no one. That's the whole plan. It might be the most important thing I do all month.`,
    tags: ['joy', 'reflection', 'creativity'],
  },
  {
    text: `My grandmother used to say that you should plant trees whose shade you'll never sit in. I thought it was just a nice saying until today.\n\nI helped a junior at work all afternoon — really helped, the slow patient kind, not the "here let me just do it" kind. I explained the same thing three different ways until it clicked. I watched them get it, watched the small light come on, and felt something I haven't felt from my own promotions in years.\n\nI think we've been sold a lie that fulfillment comes from climbing. But every genuinely good day I can remember lately involved making someone else's path a little easier. The shade I'll never sit in.\n\nMaybe that's what she meant. That a life spent only on yourself is a life lived in full sun, exposed and exhausting. And the people who plant trees for strangers are the ones who learn to rest.`,
    tags: ['mentoring', 'wisdom', 'work'],
    font: 'patrick-hand',
    song: SONGS[1],
  },
  {
    text: `I've started taking the long way home. Same destination, ten extra minutes, completely different life.\n\nThe short way is efficient and dead — a grey underpass, a road that hates pedestrians, the back of a mall. The long way goes past a tiny park where old men play chess and argue about it, a bakery that vents warm bread-smell onto the street at exactly the hour I pass, a wall a kid has been slowly covering in chalk constellations.\n\nFor years I took the short way because I was "saving time." Saving it for what? To get home and scroll? The ten minutes I saved were never reinvested in anything. They just evaporated.\n\nNow I spend them. On bread-smell and chess and chalk stars. It's such a small rebellion against the part of me that treats every minute like it has to justify itself. But I get home softer. And softer is worth ten minutes.`,
    tags: ['city', 'walk', 'slow-living'],
  },
  {
    text: `Tonight I couldn't sleep so I made a list of everyone who has been kind to me and never knew the difference it made.\n\nThe teacher who told me, once, offhandedly, that I had something. I clung to that sentence through years of feeling I had nothing. She probably forgot it the same day.\n\nThe stranger on the train who saw me crying and didn't say a word — just wordlessly offered half their packet of biscuits and went back to their book. I was nineteen and falling apart and that packet of biscuits is one of the kindest things anyone has ever done for me.\n\nThe friend who sat with me in a hospital corridor at 4am and didn't try to fix anything, just stayed.\n\nI don't think we ever really know which of our small moments become load-bearing walls in someone else's life. Which means I should be more careful, and more generous, with my small moments too. You never know which biscuit someone will remember at 2am, twenty years later.`,
    tags: ['kindness', 'gratitude', 'memories'],
    song: SONGS[6],
  },
  {
    text: `I turned thirty-something today and spent the morning bracing for a crisis that never came.\n\nI'd built it up — the dread, the inventory of everything I haven't achieved, the comparison to where I "should" be. But I woke up, and the light was nice, and a few people who love me reached out, and the dread just… didn't show. Like it knocked, found me unafraid, and left.\n\nI think the secret nobody tells you about getting older is that some of the noise genuinely quiets down. I care so much less about being impressive now. I'd rather be kind than clever. I'd rather have one real conversation than a hundred admirers. The frantic need to prove myself that ran my twenties has loosened its grip, finger by finger.\n\nI'm not where I thought I'd be. I'm somewhere I didn't have the imagination to plan for, and a lot of it is better. Happy birthday to me. I think I'm finally on my own side.`,
    tags: ['birthday', 'reflection', 'aging'],
  },
  {
    text: `There's a particular loneliness to being surrounded by people and feeling unseen, and I had a full dose of it today.\n\nTeam lunch. Everyone laughing, in-jokes flying, and me on the edge of it all, smiling at the right moments, contributing nothing essential. Not excluded exactly — just not missed if I weren't there. I came home and sat in the quiet and the quiet, oddly, felt less lonely than the lunch.\n\nI've been wondering if the problem is them or me. Probably me. I keep myself careful and curated, even with people I see every day. I share opinions, never wounds. I'm "easy to be around" and impossible to actually know. So of course I feel unseen. I've made myself hard to see.\n\nIntimacy is a risk I keep declining and then mourning. I want to be known but I won't pay the price of being known, which is letting someone see the unflattering parts. I don't have a solution tonight. Just the naming of it. Sometimes that's the first foothold.`,
    tags: ['loneliness', 'reflection', 'connection'],
    font: 'patrick-hand',
  },
  {
    text: `Went back to my hometown for the weekend and discovered you can't, actually. Go back.\n\nThe streets are the same width but somehow smaller. The shop where I bought sweets is a phone repair place now. The field where we played is half a parking lot. My old room is a study with my mother's sewing machine where my bed used to be, and that's fine, that's right, but it landed in my chest like a small loss.\n\nThe strangest part: everyone treats me like the person I was at eighteen. The aunties ask the same questions. The neighbours tell the same stories about me. For two days I was a character in a play about my own past, performing a self I outgrew a decade ago.\n\nHome isn't a place you return to. It's a moment in time, and time only moves one direction. The town I'm homesick for doesn't exist anymore except in me. Maybe that's why I carry it so carefully. I'm the last place it still lives.`,
    tags: ['home', 'nostalgia', 'family'],
    song: SONGS[0],
  },
]

// ---- medium entries --------------------------------------------------------
const mediumEntries: SeedEntry[] = [
  {
    text: `Had a long conversation with an old friend today. We talked about how different life is from what we imagined five years ago. Neither of us is where we thought we'd be, but maybe that's okay. Plans change. People change. The important thing is we're still figuring it out, still showing up for each other across all the distance and the years.`,
    tags: ['friendship', 'reflection'],
  },
  {
    text: `Work has been draining lately. Not the work itself, but the constant context switching. By evening my brain feels like overcooked noodles. Need to find a better way to protect my focus time. Maybe wake up earlier and steal an hour before the world starts pulling at me? Not sure I have it in me, but the current pace isn't sustainable either.`,
    tags: ['work', 'productivity'],
  },
  {
    text: `The neighborhood stray cat visited again. I've started keeping food out for her. She doesn't let me pet her yet, but she sits closer now, just out of reach, watching me with those careful eyes. Progress measured in inches. There's a whole philosophy in earning the trust of something that has every reason not to give it.`,
    tags: ['animals', 'small-joys'],
    font: 'patrick-hand',
  },
  {
    text: `Tried meditation again. Lasted about four minutes before my mind wandered to that embarrassing thing I said three years ago. Classic. But four minutes is more than zero minutes, and apparently the noticing-that-you've-wandered is the actual exercise, not the staying-blank. So maybe I did it right by doing it wrong. Will try again tomorrow.`,
    tags: ['meditation', 'health'],
  },
  {
    text: `Festival season is starting and the whole city feels different — more alive, more colorful, more forgiving somehow. Even the traffic seems tolerable when there are lights strung over every street. I love this time of year, the way it gives everyone permission to be a little softer, a little more generous, a little more like the people we mean to be.`,
    tags: ['festival', 'city', 'joy'],
    song: SONGS[5],
  },
  {
    text: `Finished a book I'd been putting off for months. The ending wasn't what I expected, and I sat with the closed cover for a while feeling oddly bereft, the way you do when characters you've lived with simply stop. Real life doesn't wrap up neatly either, so maybe the unsatisfying ending was the most honest thing about it.`,
    tags: ['reading', 'reflection'],
  },
  {
    text: `Someone at work appreciated my effort today. Publicly. It shouldn't matter this much, but it does, and I've stopped pretending otherwise. Recognition is a strange currency — you tell yourself you don't need it, right up until you get it and feel your shoulders drop two inches. We're social creatures. Being seen is a real hunger, not a weakness.`,
    tags: ['work', 'gratitude'],
  },
  {
    text: `My grandfather used to say the best things in life are free — sunlight, fresh air, laughter. I rolled my eyes at it as a kid. But sitting on the balcony tonight, watching the sky go from gold to bruise-purple, phone left inside on purpose, I think I finally understand. We complicate happiness. It's simpler and quieter than we make it.`,
    tags: ['gratitude', 'wisdom', 'evening'],
    font: 'patrick-hand',
  },
  {
    text: `Rough week. Multiple deadlines, barely any sleep, and then my laptop crashed and ate two hours of work. I should be more upset than I am, but I've hit that strange plateau of exhaustion where everything becomes absurdly funny. Laughed at myself for a solid twenty minutes. Either it's a healthy coping mechanism or I'm quietly losing it. Either way, weekend's here.`,
    tags: ['work', 'stress', 'weekend'],
  },
  {
    text: `Someone asked me where I see myself in five years and I had to physically stop myself from laughing. Five years ago I had no idea I'd be here, in this city, this job, this version of myself. Life doesn't follow the script. I gave the polished answer about growth and learning, but the honest answer is: I don't know, and I've made a fragile peace with not knowing.`,
    tags: ['future', 'reflection', 'uncertainty'],
  },
  {
    text: `Made chai the way Nani used to — the long way, crushing the ginger and cardamom by hand, letting it boil over almost but not quite. Got it nearly right. There was a specific smell in her kitchen that I've been chasing my whole adult life and never quite catch. Maybe the missing ingredient is just being eight years old and certain that everyone you love will live forever.`,
    tags: ['family', 'cooking', 'memories'],
    song: SONGS[0],
  },
  {
    text: `First rain of the season tonight. That smell — petrichor, wet earth, the dust finally settling — hit me the second I opened the window and something in my chest unclenched. I stood there getting my sleeve wet for ten minutes, grinning like an idiot. Some joys are completely free and arrive without warning and ask nothing of you except that you notice.`,
    tags: ['monsoon', 'rain', 'joy'],
    font: 'patrick-hand',
  },
]

// ---- short entries (timeline texture) --------------------------------------
const shortEntries: SeedEntry[] = [
  { text: `Quiet morning. Coffee tastes better when you're not rushing it.`, tags: ['morning', 'gratitude'] },
  { text: `Didn't sleep well. Head feels heavy and the day feels uphill.`, tags: ['sleep'] },
  { text: `Finally killed the bug that's been haunting me for three days. Small wins, but I'll take them.`, tags: ['work', 'coding'] },
  { text: `Rain outside. Perfect excuse to do absolutely nothing and feel zero guilt about it.`, tags: ['weather'] },
  { text: `Ma called. She sounded genuinely happy today and it made my whole evening lighter.`, tags: ['family'] },
  { text: `Skipped the gym. Not feeling it. Tomorrow, maybe. Or not. Being a person is hard.`, tags: ['health'] },
  { text: `Overthinking again at 2am. Need to find the off switch for this brain.`, tags: ['night', 'reflection'] },
  { text: `Good chai, good book, good rain. Some evenings just hand themselves to you.`, tags: ['evening', 'reading'] },
  { text: `Felt invisible at work today. Spoke twice, heard zero times.`, tags: ['work'] },
  { text: `Walked in the park. The trees don't care about my deadlines and it was deeply reassuring.`, tags: ['nature', 'walk'] },
  { text: `Cooked dinner from scratch and didn't burn it. Felt absurdly proud.`, tags: ['cooking'] },
  { text: `Laughed so hard today I can't even remember why. Those are the good ones.`, tags: ['happiness'] },
  { text: `Just existing today. No achievements, no disasters. That's enough. That's allowed.`, tags: [] },
  { text: `Watched the sunset from the balcony. Orange bleeding into purple into navy.`, tags: ['nature', 'evening'] },
  { text: `Sometimes silence is the loudest thing in the room.`, tags: ['reflection'] },
  { text: `Craving home food in a way that isn't really about food at all.`, tags: ['home', 'food'] },
  { text: `Productive day, for once. Wrote it down so I'd believe it later.`, tags: ['work'] },
  { text: `Power cut tonight. Lit candles. Suddenly the whole evening felt like childhood.`, tags: ['nostalgia', 'home'] },
  { text: `Made a stranger smile in a queue today. Carried it around like a small warm coal.`, tags: ['kindness', 'small-joys'] },
  { text: `Re-read some old entries. I've grown. Slowly, messily, unevenly — but grown.`, tags: ['reflection', 'growth'] },
  { text: `The wifi died so I read an actual paper book. Revolutionary. Will report back.`, tags: ['reading', 'humor'] },
  { text: `Therapy today. Cried a little. Walked out feeling like I'd set down a heavy bag.`, tags: ['mental-health', 'healing'] },
  { text: `Full moon tonight. Stood on the terrace until the city noise faded under it.`, tags: ['night', 'nature'] },
  { text: `Got the call. I got it. I actually got it. Reading this back to remember the feeling.`, tags: ['career', 'celebration'] },
  { text: `First day, new role. Imposter syndrome at full volume. Everyone seems so capable.`, tags: ['work', 'new-beginnings'] },
  { text: `Three months in and I'm starting to feel like I might actually belong here.`, tags: ['work', 'growth'] },
  { text: `Booked tickets home. The countdown is the best part. Already lighter.`, tags: ['home', 'family'] },
  { text: `Back from home and the apartment feels two sizes too big and too quiet.`, tags: ['home', 'loneliness'] },
  { text: `Long walk after dinner. The city is softer at night, like it finally exhales.`, tags: ['night', 'walk'] },
  { text: `Better today. Sleep helped. Sunlight helped. Lowering the bar helped most.`, tags: ['recovery', 'health'] },
  { text: `Grateful for: hot water, a body that mostly works, people who check in. The basics.`, tags: ['gratitude'] },
  { text: `Watched kids play in the park, that unfiltered kind of joy. We unlearn it somewhere.`, tags: ['joy', 'childhood'] },
  { text: `Found an old playlist. Every single song is a small time machine.`, tags: ['music', 'nostalgia'], song: SONGS[6] },
  { text: `Anxious about tomorrow. Writing here to slow my heart down. It's working, a little.`, tags: ['anxiety', 'writing'] },
  { text: `Tomorrow came and went and was completely fine. The worry is always worse than the thing.`, tags: ['anxiety', 'relief'] },
  { text: `New city, everything unfamiliar, and that's exactly the point of being here.`, tags: ['travel', 'adventure'] },
  { text: `Deleted the apps for a week. Day one and I'm already reaching for a phantom phone.`, tags: ['digital-detox'] },
  { text: `Sunday spent doing nothing remotely productive. Easily the best day of the week.`, tags: ['weekend', 'rest'] },
  { text: `Helped a junior debug something today and realized how far I've come without noticing.`, tags: ['work', 'mentoring'] },
  { text: `Winter mornings have their own particular silence. Everything just moves slower.`, tags: ['winter', 'morning'] },
]

// ---- date distribution -----------------------------------------------------
// Spread entries over ~14 months, clustered (some weeks dense, some empty), with
// a handful in the last few days so "recent" / "today" views populate. Returns
// sorted ascending so createdAt order matches insertion order.
function buildDates(count: number): Date[] {
  const out: Date[] = []
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  // A few very recent entries (today, yesterday, this week).
  const recentOffsets = [0, 0, 1, 2, 4, 6, 9]
  for (const off of recentOffsets) {
    if (out.length >= count) break
    out.push(new Date(now - off * day))
  }

  // The rest scattered across the prior ~14 months, in loose clusters so the
  // calendar has busy stretches and quiet ones rather than a uniform smear.
  let cursorDaysAgo = 12
  while (out.length < count) {
    // gap before next cluster: 1–18 days
    cursorDaysAgo += 1 + Math.floor(Math.random() * 18)
    if (cursorDaysAgo > 430) cursorDaysAgo = 14 + Math.floor(Math.random() * 30)
    const clusterSize = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < clusterSize && out.length < count; i++) {
      const within = cursorDaysAgo - i // consecutive-ish days in a cluster
      out.push(new Date(now - within * day))
    }
  }

  // Give each a believable time-of-day (mostly evenings/late night, some morning).
  for (const d of out) {
    const hourPool = [7, 8, 9, 22, 23, 21, 20, 23, 0, 1, 14, 18, 19, 22]
    d.setHours(hourPool[Math.floor(Math.random() * hourPool.length)])
    d.setMinutes(Math.floor(Math.random() * 60))
    d.setSeconds(Math.floor(Math.random() * 60))
  }

  return out.sort((a, b) => a.getTime() - b.getTime())
}

async function main() {
  console.log(`🌱 Seeding journal entries for ${TARGET_EMAIL}...\n`)

  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } })
  if (!user) {
    console.error(`✗ User ${TARGET_EMAIL} not found. Aborting (no user creation in this script).`)
    process.exit(1)
  }
  console.log(`User: ${user.id} (e2eeEnabled=${user.e2eeEnabled})`)

  // Build the corpus: all long + all medium + all short, then a second pass of
  // longs/mediums so full-length entries dominate the dump (the headline ask).
  const corpus: SeedEntry[] = [
    ...longEntries,
    ...longEntries, // duplicate the long-form set so there are plenty of them
    ...mediumEntries,
    ...shortEntries,
  ]

  const dates = buildDates(corpus.length)

  const rows = corpus.map((entry, i) => {
    const html = plainTextToHtml(entry.text)
    return {
      text: html,
      textPreview: createTextPreview(html),
      tags: entry.tags,
      entryType: 'normal',
      song: entry.song ?? null,
      style: entry.font ? { font: entry.font } : undefined,
      spreads: 1,
      e2eeIVs: undefined, // plaintext passthrough — no IV map
      userId: user.id,
      createdAt: dates[i],
      updatedAt: dates[i],
    }
  })

  await prisma.journalEntry.createMany({ data: rows })

  const total = await prisma.journalEntry.count({ where: { userId: user.id } })
  console.log(`\n✓ Inserted ${rows.length} entries`)
  console.log(`  Long: ${longEntries.length * 2}, Medium: ${mediumEntries.length}, Short: ${shortEntries.length}`)
  console.log(`  Date range: ${dates[0].toDateString()} → ${dates[dates.length - 1].toDateString()}`)
  console.log(`  Total entries now on account: ${total}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
