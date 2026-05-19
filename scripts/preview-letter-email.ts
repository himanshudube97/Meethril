/**
 * Render the letter-delivery email with sample data and write the HTML to
 * stdout. Run via:
 *   docker compose exec app npx tsx scripts/preview-letter-email.ts > /tmp/hearth-letter-preview.html
 * Then open /tmp/hearth-letter-preview.html in a browser.
 */
import { generateLetterEmail } from '@/lib/email'

const sampleSong = JSON.stringify({
  _h: 'itunes',
  id: '1500401941',
  t: 'Blinding Lights',
  a: 'The Weeknd',
  // Picsum placeholder — real iTunes URLs follow the pattern
  // .../100x100bb.jpg and our highResArt helper swaps to .../240x240bb.jpg
  // at send time. For the demo we just want a guaranteed-loading image.
  art: 'https://picsum.photos/seed/blinding-lights/100/100',
  p: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview123/v4/.../mzaf_sample.plus.aac.p.m4a',
})

const html = generateLetterEmail({
  recipientName: 'himanshu',
  senderName: 'past me',
  letterContent:
    '<p>hey,</p><p>just sitting at the desk listening to the rain and wanted to write this down before i forgot. the way the lamps spilled over the wood, the music low, your handwriting on the corner of the postcard.</p><p>i hope you remember this evening when you read this. don’t lose it.</p>',
  letterLocation: 'mumbai',
  writtenAt: new Date('2026-05-19T19:30:00'),
  photos: [
    { url: 'https://picsum.photos/seed/hearth-letter-1/240/300', position: 0 },
    { url: 'https://picsum.photos/seed/hearth-letter-2/240/300', position: 1 },
  ],
  doodleDataUrl:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><path d="M10 60 Q40 10 70 40 T130 30 T190 50 T230 25" fill="none" stroke="%23e8945a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    ),
  songLink: sampleSong,
})

process.stdout.write(html)
