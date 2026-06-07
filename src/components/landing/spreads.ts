export type Spread = {
  n: string
  title: string
  blurb: string
  bullets: string[]
  /** Short label for the right-page media slot (until real screenshots land). */
  media: string
  /** Handwritten margin annotation — a personal-voice line in the page margin. */
  annotation: string
  /** A "stamped date" that appears in the top-right of the left page. */
  stamp: string
}

export const SPREADS: Spread[] = [
  {
    n: 'I',
    title: 'The page that listens',
    blurb:
      'Words, doodles, a song, a photo — left exactly where you set them down. No streaks, no judgement.',
    bullets: ['Free-form text & sketches', 'Photos and songs', 'Auto-saved & encrypted'],
    media: 'A blank page, becoming yours',
    annotation: 'started this Tuesday',
    stamp: 'kept · 09 / 04',
  },
  {
    n: 'II',
    title: 'Small things, kept',
    blurb:
      'A scrapbook for photographs, scraps, and quiet keepsakes — drag them anywhere, tilt them, let them overlap.',
    bullets: ['Drag, tilt & overlap', 'Photos, songs & scraps', 'Arrange it however you like'],
    media: 'Tiny moments, held still',
    annotation: 'every scrap matters',
    stamp: 'pinned · 03 / 12',
  },
  {
    n: 'III',
    title: 'Letters that wait',
    blurb:
      "Write to your future self, or to a friend — sealed until the day you choose. Or send a note to a stranger you'll never meet, who may write back.",
    bullets: ['To your future self', 'To a friend, wax-sealed', 'To a stranger — who may reply'],
    media: 'Sealed. Waiting.',
    annotation: 'for next year, maybe',
    stamp: 'sealed · 11 / 21',
  },
  {
    n: 'IV',
    title: 'A shelf of your years',
    blurb:
      'Every month becomes a little book on your shelf. Pull one down, open the cover, and turn the pages of who you were.',
    bullets: ['A book for every month', 'Flip back through your days', 'Years lined up, spine by spine'],
    media: 'Pull a book from the shelf',
    annotation: 'who was I in march?',
    stamp: 'shelved · MMXXV',
  },
  {
    n: 'V',
    title: 'Where memory grows',
    blurb:
      'Your entries gather into a scene you can wander — a constellation, a garden in bloom, a harbour at dusk. Your year, made visible.',
    bullets: ['Stars · a constellation', 'Garden · a year in bloom', 'A scene for every theme'],
    media: 'Your year, drawn in light',
    annotation: 'look up tonight',
    stamp: 'mapped · 12 / 31',
  },
  {
    n: 'VI',
    title: 'Yours, encrypted',
    blurb:
      "End-to-end encrypted. Even we can't read it — locked with a key only you know, with a recovery key just in case.",
    bullets: ['End-to-end encrypted', 'Your private daily key', 'A recovery key, just in case'],
    media: 'Locked. Only your key opens it.',
    annotation: 'even from us',
    stamp: 'sealed · key only',
  },
  {
    n: 'VII',
    title: 'A house with many windows',
    blurb:
      'Six hand-tuned weathers — rose, sage, ocean, sunset and more. Tap a swatch and feel the whole diary change around you.',
    bullets: ['Six hand-tuned palettes', 'Ambient particles, off-able', 'A mood for every season'],
    media: 'Tap a window. Feel the weather change.',
    annotation: 'pick your weather',
    stamp: 'lit · six moods',
  },
  {
    n: 'VIII',
    title: 'On your desk, too',
    blurb:
      'Add Meethril to your desktop straight from the browser — a quiet little app on your dock. Nothing to download, nothing to update.',
    bullets: ['Installs from your browser', 'Lives on your dock', 'Always up to date'],
    media: 'Add it to your dock',
    annotation: 'kept on your desk',
    stamp: 'desktop · always on',
  },
]
