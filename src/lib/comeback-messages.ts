// Comeback moment copy. Tier-keyed. Modal lines may include {gapDays} placeholder.
// Author the rest of each pool over time; v1 ships with these starters.
export const COMEBACK_MESSAGES = {
  whisper: [
    'you\'re back.',
    'the page kept your spot.',
  ],
  card: [
    'a few days have passed. glad you\'re here.',
    'meethril missed you a little.',
  ],
  modal: [
    'it\'s been {gapDays} days. no judgment, just glad you\'re here.',
    'long time. take a breath. the page is open.',
  ],
} as const

export type ComebackTier = keyof typeof COMEBACK_MESSAGES

export function pickComebackLine(tier: ComebackTier, gapDays: number): string {
  const pool = COMEBACK_MESSAGES[tier]
  const line = pool[Math.floor(Math.random() * pool.length)]
  return line.replace('{gapDays}', String(gapDays))
}
